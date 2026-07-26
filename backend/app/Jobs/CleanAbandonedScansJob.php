<?php

namespace App\Jobs;

use App\Services\Ocr\ShelfTagImagePreprocessor;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class CleanAbandonedScansJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct(
        public int $retentionMinutes = 30
    ) {}

    /**
     * Execute the job to purge temporary scan vault files older than retention limit.
     */
    public function handle(): void
    {
        $vaultDir = ShelfTagImagePreprocessor::VAULT_DIRECTORY;
        $disk = Storage::disk('local');

        if (!$disk->exists($vaultDir)) {
            return;
        }

        $files = $disk->files($vaultDir);
        $now = time();
        $retentionSeconds = max(0, $this->retentionMinutes * 60);
        $deletedCount = 0;

        foreach ($files as $file) {
            $lastModified = $disk->lastModified($file);
            if (($now - $lastModified) >= $retentionSeconds) {
                if ($disk->delete($file)) {
                    $deletedCount++;
                }
            }
        }

        if ($deletedCount > 0) {
            Log::info("Cleaned abandoned scan vault files.", [
                'deleted_count' => $deletedCount,
                'retention_minutes' => $this->retentionMinutes,
            ]);
        }
    }
}
