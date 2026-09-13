<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consumer_report_items', function (Blueprint $table) {
            $table->decimal('unit_price', 12, 2)->nullable()->after('observed_price');
            $table->decimal('line_total', 12, 2)->nullable()->after('unit_price');
            $table->json('uncertain_fields')->nullable()->after('line_total');
            $table->unsignedSmallInteger('section')->nullable()->after('uncertain_fields');
            $table->unsignedSmallInteger('possible_duplicate_of')->nullable()->after('section');
        });

        Schema::table('receipt_evidence_bundles', function (Blueprint $table) {
            // Paid extraction calls, counted separately from processing_attempts (job runs).
            $table->unsignedSmallInteger('extraction_calls')->default(0)->after('processing_attempts');
            $table->timestamp('extraction_attempted_at')->nullable()->after('extraction_calls');
        });
    }

    public function down(): void
    {
        Schema::table('receipt_evidence_bundles', function (Blueprint $table) {
            $table->dropColumn(['extraction_calls', 'extraction_attempted_at']);
        });

        Schema::table('consumer_report_items', function (Blueprint $table) {
            $table->dropColumn(['unit_price', 'line_total', 'uncertain_fields', 'section', 'possible_duplicate_of']);
        });
    }
};
