<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ReceiptRuntimeContractTest extends TestCase
{
    #[Test]
    public function production_container_runs_receipt_media_queue_and_scheduler_dependencies(): void
    {
        $dockerfile = file_get_contents(base_path('Dockerfile'));
        $supervisor = file_get_contents(base_path('docker/supervisord.conf'));
        $nginx = file_get_contents(base_path('docker/nginx.conf'));
        $receiptUploadsIni = file_get_contents(base_path('docker/receipt-uploads.ini'));

        $this->assertStringContainsString('ffmpeg', $dockerfile);
        $this->assertStringContainsString('queue:work', $supervisor);
        $this->assertStringContainsString('receipt-processing,notifications,default', $supervisor);
        $this->assertStringContainsString('--timeout=420', $supervisor);
        $this->assertGreaterThan(360, (int) config('queue.connections.database.retry_after'));
        $this->assertStringContainsString('schedule:work', $supervisor);
        $this->assertStringContainsString('client_max_body_size 30M', $nginx);
        $this->assertSame("upload_max_filesize=26M\npost_max_size=28M", trim($receiptUploadsIni));
        $this->assertStringContainsString(
            'COPY docker/receipt-uploads.ini $PHP_INI_DIR/conf.d/receipt-uploads.ini',
            $dockerfile,
        );
    }
}
