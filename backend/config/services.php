<?php

return [

    'receipt_capture' => [
        'enabled' => env('RECEIPT_CONTINUOUS_CAPTURE_ENABLED', false),
        'abandoned_retention_hours' => (int) env('RECEIPT_ABANDONED_CAPTURE_HOURS', 24),
    ],

    // Receipt extraction provider. 'tesseract' is the safe default in every environment;
    // Gemini is only used for reports that also pass the consent and approval gates.
    'receipt_extraction' => [
        'provider' => env('RECEIPT_EXTRACTION_PROVIDER', 'tesseract'),
        'consent_versions' => array_values(array_filter(array_map('trim', explode(',', (string) env('RECEIPT_EXTRACTION_CONSENT_VERSIONS', ''))))),
        'production_approved' => (bool) env('RECEIPT_EXTRACTION_PRODUCTION_APPROVED', false),
        // Paid calls per evidence attempt (a fresh capture starts a new attempt) and per report across attempts.
        'max_calls_per_attempt' => (int) env('RECEIPT_EXTRACTION_MAX_CALLS_PER_ATTEMPT', 6),
        'max_calls_per_report' => (int) env('RECEIPT_EXTRACTION_MAX_CALLS_PER_REPORT', 18),
        'daily_call_limit' => (int) env('RECEIPT_EXTRACTION_DAILY_CALL_LIMIT', 200),
        'daily_token_limit' => (int) env('RECEIPT_EXTRACTION_DAILY_TOKEN_LIMIT', 3000000),
        'max_request_bytes' => (int) env('RECEIPT_EXTRACTION_MAX_REQUEST_BYTES', 18 * 1024 * 1024),
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-3.8-flash'),
        'fallback_model' => env('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash-lite'),
        'endpoint' => env('GEMINI_ENDPOINT', 'https://generativelanguage.googleapis.com/v1beta/interactions'),
        'thinking_level' => env('GEMINI_THINKING_LEVEL', 'low'),
        // Per-image resolution sent with each receipt section: low, medium, high, or ultra_high (Phase 1a probe).
        'image_resolution' => env('GEMINI_IMAGE_RESOLUTION', 'high'),
        'timeout_seconds' => (int) env('GEMINI_TIMEOUT_SECONDS', 90),
        // Optional CA bundle for local development machines without system CA configuration; TLS is always verified.
        'ca_bundle' => env('GEMINI_CA_BUNDLE'),
        // Procedural gate: set to 'paid' only once the key belongs to a billing-enabled project.
        'billing_attested' => env('GEMINI_BILLING_ATTESTED'),
    ],

    'ffmpeg' => [
        'path' => env('FFMPEG_PATH', 'ffmpeg'),
    ],

    'ffprobe' => [
        'path' => env('FFPROBE_PATH', 'ffprobe'),
    ],

    'receipt_push' => [
        'enabled' => env('RECEIPT_WEB_PUSH_ENABLED', false),
        'subject' => env('VAPID_SUBJECT'),
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'tesseract' => [
        'receipt_pass_timeout_seconds' => (int) env('TESSERACT_RECEIPT_PASS_TIMEOUT_SECONDS', 60),
        'receipt_processing_budget_seconds' => (int) env('TESSERACT_RECEIPT_PROCESSING_BUDGET_SECONDS', 300),
        'path' => env('TESSERACT_PATH'),
        'language' => env('TESSERACT_LANGUAGE', 'eng'),
        'timeout_seconds' => (int) env('TESSERACT_TIMEOUT_SECONDS', 15),
        'page_segmentation_mode' => (int) env('TESSERACT_PSM', 11),
        'shelf_tag_pass_timeout_seconds' => (int) env('TESSERACT_SHELF_TAG_PASS_TIMEOUT_SECONDS', 3),
        'shelf_tag_primary_psm' => (int) env('TESSERACT_SHELF_TAG_PRIMARY_PSM', 6),
        'shelf_tag_fallback_psm' => (int) env('TESSERACT_SHELF_TAG_FALLBACK_PSM', 11),
        'shelf_tag_minimum_confidence' => (int) env('TESSERACT_SHELF_TAG_MINIMUM_CONFIDENCE', 30),
        'temp_directory' => env('TESSERACT_TEMP_DIRECTORY', storage_path('app/private/scan_vault')),
    ],

];
