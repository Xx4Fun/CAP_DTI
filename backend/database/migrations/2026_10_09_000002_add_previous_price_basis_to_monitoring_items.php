<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_record_items', function (Blueprint $table) {
            $table->decimal('previous_price_variance_percent', 9, 2)->nullable()->after('variance_percent');
            $table->boolean('is_previous_price_spike')->default(false)->index()->after('is_anomaly');
            // Which rule the review flag rests on: standard_srp, emergency_ceiling or previous_price_spike.
            $table->string('finding_basis')->nullable()->index()->after('is_previous_price_spike');
        });

        // Rows accepted before the second basis existed were flagged against their captured reference only.
        DB::table('monitoring_record_items')->where('is_anomaly', true)
            ->update(['finding_basis' => DB::raw('reference_type')]);
    }

    public function down(): void
    {
        Schema::table('monitoring_record_items', fn (Blueprint $table) => $table->dropColumn([
            'previous_price_variance_percent', 'is_previous_price_spike', 'finding_basis',
        ]));
    }
};
