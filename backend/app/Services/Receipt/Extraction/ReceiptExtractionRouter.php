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
        if (trim((string) config('services.gemini.key')) === '') {
            throw new ExtractionFailedException(ReceiptFailureCodes::GEMINI_NOT_CONFIGURED, ['provider' => self::GEMINI]);
        }

        return ['provider' => self::GEMINI, 'route' => 'primary'];
    }

    /**
     * Outside local development and tests, real receipts may only reach the provider after DTI/DPO approval and a
     * billing attestation (paid projects do not use submitted content for product improvement).
     */
    private function approvedForEnvironment(): bool
    {
        if (app()->environment(['local', 'testing'])) {
            return true;
        }

        return (bool) config('services.receipt_extraction.production_approved')
            && config('services.gemini.billing_attested') === 'paid';
    }
}
