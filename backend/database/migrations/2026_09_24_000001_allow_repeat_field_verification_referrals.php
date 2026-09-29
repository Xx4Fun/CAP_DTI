<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A consumer report may be referred for field verification more than once: an admin can cancel a
 * referral made in error, and a completed verification can be followed by a later one. The original
 * schema allowed only one referral per report for its whole lifetime, so the controller guard could
 * not be relaxed without failing at insert.
 *
 * The real invariant is narrower: at most one *active* (open or claimed) referral per report. That is
 * enforced here by a partial unique index, so the database still rejects a concurrent second active
 * request even if an application guard is bypassed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('field_verification_requests', function (Blueprint $table) {
            $table->dropUnique('field_verification_requests_consumer_report_id_unique');
            $table->index(['consumer_report_id', 'status']);
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX field_verification_requests_one_active_per_report
            ON field_verification_requests (consumer_report_id)
            WHERE consumer_report_id IS NOT NULL AND status IN ('open', 'claimed')
        SQL);
    }

    public function down(): void
    {
        $duplicates = DB::table('field_verification_requests')
            ->whereNotNull('consumer_report_id')
            ->groupBy('consumer_report_id')
            ->havingRaw('count(*) > 1')
            ->exists();

        if ($duplicates) {
            throw new RuntimeException(
                'Reports with more than one field verification request exist. Resolve them before restoring the one-referral-per-report constraint.'
            );
        }

        DB::statement('DROP INDEX IF EXISTS field_verification_requests_one_active_per_report');

        Schema::table('field_verification_requests', function (Blueprint $table) {
            $table->dropIndex(['consumer_report_id', 'status']);
            $table->unique('consumer_report_id');
        });
    }
};
