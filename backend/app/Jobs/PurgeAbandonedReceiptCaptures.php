<?php

namespace App\Jobs;

use App\Models\CaptureSession;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PurgeAbandonedReceiptCaptures implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $retentionHours = 24) {}

    public function handle(): void
    {
        $deletedSessions = 0;
        CaptureSession::query()
            ->where('is_used', false)
            ->where('expires_at', '<=', now()->subHours(max(1, $this->retentionHours)))
            ->with('evidenceBundle.assets')
            ->chunkById(50, function ($sessions) use (&$deletedSessions) {
                foreach ($sessions as $session) {
                    foreach ($session->evidenceBundle?->assets ?? [] as $asset) {
                        Storage::disk($asset->disk)->delete($asset->path);
                    }
                    $session->delete();
                    $deletedSessions++;
                }
            });

        if ($deletedSessions > 0) {
            Log::info('Purged abandoned receipt captures.', [
                'deleted_sessions' => $deletedSessions,
                'retention_hours' => $this->retentionHours,
            ]);
        }
    }
}
