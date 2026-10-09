<?php

// Standalone integration check; deliberately refuses every database except this disposable local cluster.
// Run from the repository root: php backend/tests/Integration/EmergencyActivationConcurrency.php
use App\Models\AuditEvent;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\User;
use App\Services\Admin\EmergencyApcPreparationService;
use Carbon\Carbon;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

$repo = dirname(__DIR__, 3);
$cluster = $repo.'/scratch/emergency-activation-recovery/postgres/data';
if (file_exists($repo.'/backend/bootstrap/cache/config.php')) {
    throw new RuntimeException('Refusing cached application configuration.');
}
$database = 'price_watch_emergency_recovery_test';
$settings = ['APP_ENV' => 'testing', 'APP_KEY' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync', 'MAIL_MAILER' => 'array',
    'PULSE_ENABLED' => 'false', 'TELESCOPE_ENABLED' => 'false', 'NIGHTWATCH_ENABLED' => 'false',
    'DB_CONNECTION' => 'pgsql', 'DB_HOST' => '127.0.0.1', 'DB_PORT' => '55439', 'DB_DATABASE' => $database,
    'DB_USERNAME' => 'postgres', 'DB_PASSWORD' => '', 'DB_SSLMODE' => 'disable', 'DB_URL' => ''];
foreach ($settings as $key => $value) {
    putenv($key.'='.$value);
    $_ENV[$key] = $_SERVER[$key] = $value;
}
require $repo.'/backend/vendor/autoload.php';
$server = new PDO('pgsql:host=127.0.0.1;port=55439;dbname=postgres;sslmode=disable', 'postgres', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$actualCluster = $server->query('show data_directory')->fetchColumn();
if (strtolower(str_replace('\\', '/', realpath($cluster) ?: 'missing')) !== strtolower(str_replace('\\', '/', $actualCluster))) {
    throw new RuntimeException('Refusing PostgreSQL outside the disposable scratch cluster.');
}
$worker = ($argv[1] ?? '') === '--worker';
if (! $worker) {
    if ($server->query("select count(*) from pg_database where datname = '$database'")->fetchColumn()) {
        throw new RuntimeException('Test database already exists; refusing to overwrite it.');
    }
    $server->exec('CREATE DATABASE '.$database);
}
$app = require $repo.'/backend/bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap();
Http::preventStrayRequests();
Carbon::setTestNow('2026-10-09T04:00:00Z');
DB::statement("SET statement_timeout = '20s'");

function http(string $path, array $body): array
{
    global $app;
    $request = Request::create('/api/admin/emergencies'.$path, 'POST', [], [], [],
        ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], json_encode($body));
    $response = $app->make(HttpKernel::class)->handle($request);

    return ['http_status' => $response->getStatusCode(), 'body' => json_decode($response->getContent(), true)];
}

if ($worker) {
    Sanctum::actingAs(User::findOrFail((int) $argv[2]));
    echo "READY\n";
    fflush(STDOUT);
    fgets(STDIN);
    $result = http('/'.$argv[3].'/activate', ['confirmed' => true, 'preparation_hash' => $argv[4]]);
    echo json_encode(['http_status' => $result['http_status'], 'status' => $result['body']['status'] ?? $result['body']['data']['status'] ?? null,
        'message' => $result['body']['message'] ?? null])."\n";
    exit;
}

$processes = [];
try {
    Artisan::call('migrate', ['--force' => true]);
    $admin = User::factory()->create(['role' => 'dti_evaluator']);
    Sanctum::actingAs($admin);
    SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg', 'baseline_price' => 50,
        'effective_date' => '2026-01-01', 'is_active' => true, 'price_freeze_applicable' => true]);
    $old = RegulatoryEmergency::create(['location' => 'San Jose de Buenavista, Antique', 'declaration_reference' => 'EXPIRED',
        'starts_on' => '2026-10-07', 'ends_on' => '2026-10-08', 'status' => 'active', 'active_scope_key' => 'systemwide',
        'confirmed_at' => '2026-10-07 00:00:00', 'responsible_admin_id' => $admin->id]);
    RegulatoryPriceRecord::create(['regulatory_emergency_id' => $old->id, 'commodity_key' => 'rice', 'price_type' => 'APC',
        'authoritative_price' => 45, 'effective_from' => '2026-10-07', 'effective_until' => '2026-10-08',
        'location' => $old->location, 'declaration_reference' => 'EXPIRED', 'source_reference' => 'Original', 'created_by' => $admin->id]);
    $drafts = [];
    foreach (['COMPETING-A', 'COMPETING-B'] as $reference) {
        $result = http('', ['location' => $old->location, 'declaration_reference' => $reference,
            'starts_on' => '2026-10-09', 'ends_on' => '2026-10-10']);
        if ($result['http_status'] !== 201) {
            throw new RuntimeException('Draft preparation failed: '.json_encode($result));
        }
        $drafts[] = $result['body']['data'];
    }
    DB::beginTransaction();
    EmergencyApcPreparationService::lock();
    foreach ($drafts as $draft) {
        $process = proc_open([PHP_BINARY, __FILE__, '--worker', (string) $admin->id, (string) $draft['id'], $draft['preparation_hash']],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $repo, null, ['bypass_shell' => true]);
        if (! is_resource($process)) {
            throw new RuntimeException('Could not launch activation worker.');
        }
        $processes[] = [$process, $pipes];
        if (trim(fgets($pipes[1])) !== 'READY') {
            throw new RuntimeException('Worker failed to initialize: '.stream_get_contents($pipes[2]));
        }
    }
    foreach ($processes as [, $pipes]) {
        fwrite($pipes[0], "go\n");
        fflush($pipes[0]);
    }
    $waiting = 0;
    $deadline = microtime(true) + 10;
    do {
        DB::select('SELECT pg_stat_clear_snapshot()');
        $waiting = (int) DB::selectOne("select count(*) as total from pg_stat_activity where datname = ? and wait_event_type = 'Lock' and query like '%pg_advisory_xact_lock%'", [$database])->total;
        if ($waiting === 2) {
            break;
        }
        usleep(50000);
    } while (microtime(true) < $deadline);
    if ($waiting !== 2) {
        DB::rollBack();
        $diagnostics = [];
        foreach ($processes as [, $pipes]) {
            $diagnostics[] = stream_get_contents($pipes[1]).stream_get_contents($pipes[2]);
        }
        throw new RuntimeException('Did not observe both activation transactions waiting on the advisory lock: '.json_encode($diagnostics));
    }
    DB::commit();
    $results = [];
    foreach ($processes as [$process, $pipes]) {
        fclose($pipes[0]);
        $results[] = json_decode(trim(stream_get_contents($pipes[1])), true, flags: JSON_THROW_ON_ERROR);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        if (proc_close($process) !== 0) {
            throw new RuntimeException('Activation worker failed: '.$stderr);
        }
    }
    $processes = [];
    $statuses = array_column($results, 'http_status');
    sort($statuses);
    $counts = ['active' => RegulatoryEmergency::where('status', 'active')->count(),
        'official_prices' => RegulatoryPriceRecord::count(),
        'confirmation_audits' => AuditEvent::where('action', 'emergency.confirmed')->count(),
        'recovery_audits' => AuditEvent::where('action', 'emergency.expired_lock_released')->count()];
    if ($statuses !== [200, 409] || $counts !== ['active' => 1, 'official_prices' => 2, 'confirmation_audits' => 1, 'recovery_audits' => 1]
        || $old->fresh()->status !== 'ended' || $old->fresh()->active_scope_key !== null) {
        throw new RuntimeException('Concurrency invariants failed: '.json_encode([$results, $counts]));
    }
    echo json_encode(['postgres_concurrency' => 'passed', 'overlapping_waiters' => $waiting, 'responses' => $results, 'counts' => $counts])."\n";
} finally {
    if (DB::transactionLevel()) {
        DB::rollBack();
    }
    foreach ($processes as [$process, $pipes]) {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            if (is_resource($pipe)) {
                fclose($pipe);
            }
        }
        proc_close($process);
    }
    DB::disconnect();
    // Only the database created by this invocation, on the verified disposable cluster, is removed.
    $server->exec('DROP DATABASE '.$database.' WITH (FORCE)');
}
