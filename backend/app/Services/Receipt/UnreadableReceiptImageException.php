<?php

namespace App\Services\Receipt;

use RuntimeException;

/** A stored receipt frame that cannot be decoded as an image (corrupt or truncated evidence). */
class UnreadableReceiptImageException extends RuntimeException
{
    public function __construct(public readonly int $sequence, ?\Throwable $previous = null)
    {
        parent::__construct("Receipt frame {$sequence} could not be decoded.", 0, $previous);
    }
}
