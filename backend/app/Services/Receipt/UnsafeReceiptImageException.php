<?php

namespace App\Services\Receipt;

use InvalidArgumentException;

/** A receipt image whose declared dimensions are too large to decode safely. */
class UnsafeReceiptImageException extends InvalidArgumentException
{
    public function __construct(public readonly int $width, public readonly int $height)
    {
        parent::__construct("Receipt image dimensions {$width}x{$height} exceed the safe decoding limit.");
    }
}
