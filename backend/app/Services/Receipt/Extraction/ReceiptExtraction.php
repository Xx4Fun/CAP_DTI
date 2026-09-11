<?php

namespace App\Services\Receipt\Extraction;

/** An engine-neutral structured receipt extraction plus non-sensitive engine metadata. */
final class ReceiptExtraction
{
    /**
     * @param  array<string, mixed>  $payload  Decoded structured output matching ReceiptExtractionSchema.
     * @param  array<string, mixed>  $engine  provider, model, usage, duration_ms, frame_count, settings.
     */
    public function __construct(public readonly array $payload, public readonly array $engine) {}
}
