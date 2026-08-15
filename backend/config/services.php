<?php

return [

    'receipt_capture' => [
        'enabled' => env('RECEIPT_CONTINUOUS_CAPTURE_ENABLED', false),
        'abandoned_retention_hours' => (int) env('RECEIPT_ABANDONED_CAPTURE_HOURS', 24),
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
