<?php

return [

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
        'temp_directory' => env('TESSERACT_TEMP_DIRECTORY', storage_path('app/private/scan_vault')),
    ],

];
