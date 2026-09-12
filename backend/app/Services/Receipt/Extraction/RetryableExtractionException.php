<?php

namespace App\Services\Receipt\Extraction;

use RuntimeException;

/**
 * A transient extraction failure (timeout, rate limit, provider outage) that the queue may retry.
 * The message is only the failure code; response bodies and credentials are never included.
 */
class RetryableExtractionException extends RuntimeException
{
    public function __construct(public readonly string $failureCode, public readonly array $engine = [])
    {
        parent::__construct($failureCode);
    }
}
