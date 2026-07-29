<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiErrorSanitizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unhandled_database_errors_never_expose_sql_or_connection_details(): void
    {
        Route::get('/api/_test/database-failure', function () {
            return DB::table('private_missing_table')->first();
        });

        $response = $this->getJson('/api/_test/database-failure');

        $response->assertStatus(500)
            ->assertExactJson([
                'status' => 'INTERNAL_SERVER_ERROR',
                'message' => 'The request could not be completed.',
            ]);
        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
        $this->assertStringNotContainsString('private_missing_table', $response->getContent());
        $this->assertStringNotContainsString('Connection:', $response->getContent());
    }

    public function test_other_unhandled_api_errors_never_expose_internal_messages_or_paths(): void
    {
        Route::get('/api/_test/internal-failure', function () {
            throw new \RuntimeException('Private storage path: C:\\secrets\\receipt-vault');
        });

        $response = $this->getJson('/api/_test/internal-failure');

        $response->assertStatus(500)
            ->assertExactJson([
                'status' => 'INTERNAL_SERVER_ERROR',
                'message' => 'The request could not be completed.',
            ]);
        $this->assertStringNotContainsString('receipt-vault', $response->getContent());
        $this->assertStringNotContainsString('C:\\secrets', $response->getContent());
    }

    public function test_audit_endpoint_reports_a_safe_explicit_unavailable_state_when_table_is_missing(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        Sanctum::actingAs($admin);
        Schema::drop('audit_events');

        $this->getJson('/api/admin/audit-events')
            ->assertStatus(503)
            ->assertExactJson([
                'status' => 'AUDIT_TRAIL_UNAVAILABLE',
                'message' => 'Audit storage is not available. Apply the approved Admin migration before using audited workflows.',
            ]);
    }
}
