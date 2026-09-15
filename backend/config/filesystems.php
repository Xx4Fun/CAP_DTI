<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    'commodity_images_disk' => env('COMMODITY_IMAGE_DISK', 'public'),

    'receipt_evidence_disk' => env('RECEIPT_EVIDENCE_DISK', 'receipt_evidence'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

        'receipt_evidence' => [
            'driver' => env('RECEIPT_EVIDENCE_DRIVER', 'local'),
            'root' => env('RECEIPT_EVIDENCE_DRIVER', 'local') === 'local'
                ? storage_path('app/private/receipt-evidence')
                : null,
            'key' => env('RECEIPT_EVIDENCE_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID')),
            'secret' => env('RECEIPT_EVIDENCE_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY')),
            'region' => env('RECEIPT_EVIDENCE_REGION', env('AWS_DEFAULT_REGION')),
            'bucket' => env('RECEIPT_EVIDENCE_BUCKET', 'receipt-evidence'),
            'endpoint' => env('RECEIPT_EVIDENCE_ENDPOINT', env('AWS_ENDPOINT')),
            'use_path_style_endpoint' => env('RECEIPT_EVIDENCE_USE_PATH_STYLE', true),
            'visibility' => 'private',
            'throw' => true,
        ],

        // Official legal notice PDFs and vendor/admin attachments. Falls back to the receipt evidence S3 settings.
        'legal_documents' => [
            'driver' => env('LEGAL_DOCUMENTS_DRIVER', 'local'),
            'root' => env('LEGAL_DOCUMENTS_DRIVER', 'local') === 'local'
                ? storage_path('app/private/legal-documents')
                : null,
            'key' => env('LEGAL_DOCUMENTS_ACCESS_KEY_ID', env('RECEIPT_EVIDENCE_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID'))),
            'secret' => env('LEGAL_DOCUMENTS_SECRET_ACCESS_KEY', env('RECEIPT_EVIDENCE_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY'))),
            'region' => env('LEGAL_DOCUMENTS_REGION', env('RECEIPT_EVIDENCE_REGION', env('AWS_DEFAULT_REGION'))),
            'bucket' => env('LEGAL_DOCUMENTS_BUCKET', env('RECEIPT_EVIDENCE_BUCKET', 'receipt-evidence')),
            'endpoint' => env('LEGAL_DOCUMENTS_ENDPOINT', env('RECEIPT_EVIDENCE_ENDPOINT', env('AWS_ENDPOINT'))),
            'use_path_style_endpoint' => env('LEGAL_DOCUMENTS_USE_PATH_STYLE', env('RECEIPT_EVIDENCE_USE_PATH_STYLE', true)),
            'visibility' => 'private',
            // Legal notice writers check the boolean result and answer 503; failures are still reported to the log.
            // Throwing here would bypass that 503 and let a failed cleanup delete mask the original error.
            'throw' => false,
            'report' => true,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
