<?php

namespace App\Services\Receipt\Extraction;

use RuntimeException;

/**
 * A non-transient extraction failure (invalid output, rejected request, configuration, caps).
 * The message is only the failure code; response bodies and credentials are never included.
 */
class ExtractionFailedException extends RuntimeException
{
    public function __construct(public readonly string $failureCode, public readonly array $engine = [])
    {
        parent::__construct($failureCode);
    }
}
