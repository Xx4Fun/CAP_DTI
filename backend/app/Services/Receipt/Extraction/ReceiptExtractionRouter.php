<?php

namespace App\Services\Receipt\Extraction;

use App\Models\ConsumerReport;

/**
 * Decides which extraction path a report takes. Routes are evaluated in order; a report that is not eligible for the
 * external provider takes the local Tesseract path (labelled with the reason), while provider misconfiguration fails.
 */
class ReceiptExtractionRouter
{
    public const GEMINI = 'gemini';

    public const TESSERACT = 'tesseract';

    /** @return array{provider: string, route: string} */
    public function route(ConsumerReport $report): array
    {
        if ($report->capture_mode !== 'guided_photos_v1') {
            return ['provider' => self::TESSERACT, 'route' => 'legacy_mode'];
        }
        if (config('services.receipt_extraction.provider') !== self::GEMINI) {
            return ['provider' => self::TESSERACT, 'route' => 'provider_flag'];
        }
        if (! in_array((string) $report->privacy_notice_version, (array) config('services.receipt_extraction.consent_versions', []), true)) {
            return ['provider' => self::TESSERACT, 'route' => 'consent_gate'];
        }
        if (! $this->approvedForEnvironment()) {
            return ['provider' => self::TESSERACT, 'route' => 'approval_gate'];
        }
        if (! self::isUsableKey((string) config('services.gemini.key'))) {
            throw new ExtractionFailedException(ReceiptFailureCodes::GEMINI_NOT_CONFIGURED, ['provider' => self::GEMINI]);
        }

        return ['provider' => self::GEMINI, 'route' => 'primary'];
    }

    /**
     * A key must be printable ASCII without whitespace once trimmed; anything else (e.g. a pasted trailing newline) is
     * a configuration error, never sent as a header, because HTTP client errors can echo header values.
     */
    public static function isUsableKey(string $key): bool
    {
        return preg_match('/^[\x21-\x7E]+$/', trim($key)) === 1;
    }

    /** A paid project: submitted content is not used for product improvement. Required for real customer receipts. */
    public const ATTESTATION_PAID = 'paid';

    /**
     * A free-tier demonstration: Google may use submitted content for product improvement and humans may review it,
     * so only receipts belonging to the project team may be captured. Never valid for a real customer's receipt.
     */
    public const ATTESTATION_FREE_TIER_DEMO = 'free_tier_demo';

    /** The recorded attestation, or null when none was made (the value is a human claim the code cannot verify). */
    public static function billingAttestation(): ?string
    {
        $attestation = config('services.gemini.billing_attested');

        return in_array($attestation, [self::ATTESTATION_PAID, self::ATTESTATION_FREE_TIER_DEMO], true) ? $attestation : null;
    }

    public static function isFreeTierDemo(): bool
    {
        return self::billingAttestation() === self::ATTESTATION_FREE_TIER_DEMO;
    }

    /**
     * Outside local development and tests, receipts may only reach the provider after DTI/DPO approval and a billing
     * attestation. `free_tier_demo` is accepted so a demonstration does not have to claim a paid plan it does not have;
     * it is recorded with every extraction and surfaced by the preflight and monitoring commands.
     */
    private function approvedForEnvironment(): bool
    {
        if (app()->environment(['local', 'testing'])) {
            return true;
        }

        return (bool) config('services.receipt_extraction.production_approved')
            && self::billingAttestation() !== null;
    }
}
