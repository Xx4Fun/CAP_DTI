<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Closing or cancelling a notice recorded only a timestamp, so "explanation accepted", "violation confirmed"
 * and "escalated" were indistinguishable. The outcome and DTI's stated reason are kept on the notice; the
 * per-item determinations go to regulatory_findings.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('legal_notices', function (Blueprint $table) {
            $table->string('outcome', 30)->nullable()->after('cancelled_at');
            $table->text('outcome_reason')->nullable()->after('outcome');
        });
    }

    public function down(): void
    {
        Schema::table('legal_notices', function (Blueprint $table) {
            $table->dropColumn(['outcome', 'outcome_reason']);
        });
    }
};
