<?php

use App\Jobs\CleanAbandonedScansJob;
use App\Jobs\PurgeAbandonedReceiptCaptures;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::job(new CleanAbandonedScansJob)->hourly();
Schedule::job(new PurgeAbandonedReceiptCaptures((int) config('services.receipt_capture.abandoned_retention_hours', 24)))->hourly();
