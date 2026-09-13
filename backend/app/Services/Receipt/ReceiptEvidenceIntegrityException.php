<?php

namespace App\Services\Receipt;

use RuntimeException;

/** Stored receipt evidence whose bytes no longer match the server-recorded SHA-256 (docs/DECISIONS.md). */
class ReceiptEvidenceIntegrityException extends RuntimeException
{
    public function __construct(public readonly string $kind, public readonly int $sequence)
    {
        parent::__construct("Receipt evidence {$kind} {$sequence} failed its integrity check.");
    }
}
