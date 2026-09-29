<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * consumer_report_items.srp_id already existed but nothing ever wrote it, so every receipt item
 * reached the evaluator unmatched. Automatic matching now populates it when a candidate is clearly
 * strong, and records the ranked candidate list here when it is not, so the panel can offer choices
 * instead of an empty field.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consumer_report_items', function (Blueprint $table) {
            $table->json('srp_match_json')->nullable()->after('srp_id');
        });
    }

    public function down(): void
    {
        Schema::table('consumer_report_items', function (Blueprint $table) {
            $table->dropColumn('srp_match_json');
        });
    }
};
