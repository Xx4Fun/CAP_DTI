<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipt_evidence_bundles', function (Blueprint $table) {
            $table->foreignId('consumer_report_id')->nullable()->after('capture_session_id')
                ->constrained('consumer_reports')->nullOnDelete();
            $table->unsignedSmallInteger('attempt_number')->default(1)->after('capture_mode');
            $table->unique(['consumer_report_id', 'attempt_number'], 'receipt_bundle_report_attempt_unique');
        });

        DB::table('consumer_reports')
            ->whereNotNull('receipt_evidence_bundle_id')
            ->orderBy('id')
            ->each(function ($report) {
                DB::table('receipt_evidence_bundles')
                    ->where('id', $report->receipt_evidence_bundle_id)
                    ->update(['consumer_report_id' => $report->id, 'attempt_number' => 1]);
            });
    }

    public function down(): void
    {
        Schema::table('receipt_evidence_bundles', function (Blueprint $table) {
            $table->dropUnique('receipt_bundle_report_attempt_unique');
            $table->dropConstrainedForeignId('consumer_report_id');
            $table->dropColumn('attempt_number');
        });
    }
};

