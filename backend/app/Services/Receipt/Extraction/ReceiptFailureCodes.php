<?php

namespace App\Services\Receipt\Extraction;

/**
 * Single source of truth for receipt processing failure codes: whether a customer retry can help,
 * whether a fresh capture is the only way forward, and the public message shown for each.
 */
final class ReceiptFailureCodes
{
    public const EVIDENCE_INTEGRITY_FAILED = 'EVIDENCE_INTEGRITY_FAILED';

    public const GEMINI_TIMEOUT = 'GEMINI_TIMEOUT';

    public const GEMINI_RATE_LIMITED = 'GEMINI_RATE_LIMITED';

    public const GEMINI_UNAVAILABLE = 'GEMINI_UNAVAILABLE';

    public const GEMINI_REJECTED = 'GEMINI_REJECTED';

    public const GEMINI_AUTH = 'GEMINI_AUTH';

    public const GEMINI_NOT_CONFIGURED = 'GEMINI_NOT_CONFIGURED';

    public const EXTRACTION_INVALID = 'EXTRACTION_INVALID';

    public const EXTRACTION_BUDGET_EXHAUSTED = 'EXTRACTION_BUDGET_EXHAUSTED';

    /** Paid-call cap reached for this evidence attempt; a fresh capture starts a new attempt. */
    public const EXTRACTION_ATTEMPT_CAP = 'EXTRACTION_ATTEMPT_CAP';

    /** Paid-call cap reached for the whole report across every attempt; DTI follows up manually. */
    public const EXTRACTION_REPORT_CAP = 'EXTRACTION_REPORT_CAP';

    public const EXTRACTION_TOO_LARGE = 'EXTRACTION_TOO_LARGE';

    public const JOB_TIMEOUT = 'JOB_TIMEOUT';

    public const PROCESSING_FAILED = 'PROCESSING_FAILED';

    /** Failures where only a fresh capture (restart) can recover the report. */
    private const RESTART_ONLY = [self::EVIDENCE_INTEGRITY_FAILED, self::EXTRACTION_ATTEMPT_CAP, self::EXTRACTION_TOO_LARGE];

    /** Failures that need an operator fix; the customer cannot resolve them. */
    private const OPERATOR_ONLY = [self::GEMINI_NOT_CONFIGURED, self::GEMINI_AUTH, self::EXTRACTION_REPORT_CAP];

    public static function isRestartOnly(?string $code): bool
    {
        return in_array($code, self::RESTART_ONLY, true);
    }

    public static function isRetryable(?string $code): bool
    {
        return ! self::isRestartOnly($code) && ! in_array($code, self::OPERATOR_ONLY, true);
    }

    public static function canUseGeminiFallback(?string $code): bool
    {
        return in_array($code, [self::GEMINI_TIMEOUT, self::GEMINI_RATE_LIMITED, self::GEMINI_UNAVAILABLE], true);
    }

    /** Public, non-technical explanation for failures that are not a plain "try again". */
    public static function publicReason(?string $code): ?string
    {
        return match ($code) {
            self::GEMINI_TIMEOUT => 'Receipt processing took too long. Your photos are saved; retry processing or try again later.',
            self::GEMINI_UNAVAILABLE, self::GEMINI_RATE_LIMITED => 'Receipt processing is temporarily busy. Your photos are saved; try again later.',
            self::EVIDENCE_INTEGRITY_FAILED => 'The stored receipt photos failed an integrity check, so they cannot be processed again. Capture the receipt again from the start.',
            self::EXTRACTION_ATTEMPT_CAP => 'This receipt could not be processed after several attempts. Capture the receipt again from the start.',
            self::EXTRACTION_TOO_LARGE => 'The receipt photos are too large to process together. Capture the receipt again with fewer, closer sections.',
            self::EXTRACTION_BUDGET_EXHAUSTED => 'Receipt processing is busy right now. Your receipt is saved; try again later.',
            self::GEMINI_NOT_CONFIGURED, self::GEMINI_AUTH => 'Receipt processing is temporarily unavailable. Your receipt is saved and DTI will follow up.',
            self::EXTRACTION_REPORT_CAP => 'This receipt could not be processed automatically. Your receipt is saved and DTI will review it.',
            default => null,
        };
    }

    /** Status-history message recorded when processing fails with this code. */
    public static function historyMessage(?string $code): string
    {
        return match ($code) {
            self::EVIDENCE_INTEGRITY_FAILED => 'The stored receipt photos failed an integrity check and cannot be processed again. Capture the receipt again.',
            default => self::publicReason($code) ?? 'Receipt processing could not be completed. Please try again.',
        };
    }
}
