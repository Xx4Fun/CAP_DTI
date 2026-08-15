<?php

namespace Tests\Unit;

use Tests\TestCase;

class ReceiptEvidenceFilesystemConfigTest extends TestCase
{
    public function test_s3_receipt_evidence_disk_does_not_prefix_keys_with_a_local_path(): void
    {
        $disk = $this->loadReceiptEvidenceDiskForDriver('s3');

        $this->assertSame('s3', $disk['driver']);
        $this->assertNull($disk['root']);
    }

    public function test_local_receipt_evidence_disk_keeps_its_private_storage_root(): void
    {
        $disk = $this->loadReceiptEvidenceDiskForDriver('local');

        $this->assertSame('local', $disk['driver']);
        $this->assertSame(storage_path('app/private/receipt-evidence'), $disk['root']);
    }

    /**
     * @return array<string, mixed>
     */
    private function loadReceiptEvidenceDiskForDriver(string $driver): array
    {
        $key = 'RECEIPT_EVIDENCE_DRIVER';
        $originalEnvironment = $_ENV[$key] ?? null;
        $originalServer = $_SERVER[$key] ?? null;
        $originalProcess = getenv($key);

        try {
            putenv("{$key}={$driver}");
            $_ENV[$key] = $driver;
            $_SERVER[$key] = $driver;

            $filesystems = require config_path('filesystems.php');

            return $filesystems['disks']['receipt_evidence'];
        } finally {
            $this->restoreEnvironmentValue($key, $originalEnvironment, $_ENV);
            $this->restoreEnvironmentValue($key, $originalServer, $_SERVER);

            if ($originalProcess === false) {
                putenv($key);
            } else {
                putenv("{$key}={$originalProcess}");
            }
        }
    }

    /**
     * @param  array<string, mixed>  $environment
     */
    private function restoreEnvironmentValue(string $key, ?string $original, array &$environment): void
    {
        if ($original === null) {
            unset($environment[$key]);

            return;
        }

        $environment[$key] = $original;
    }
}
