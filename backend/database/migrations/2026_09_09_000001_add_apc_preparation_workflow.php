<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('regulatory_emergencies', function (Blueprint $table) {
            $table->timestampTz('source_week_starts_at')->nullable();
            $table->timestampTz('source_week_ends_at')->nullable();
            $table->string('preparation_hash', 64)->nullable();
            $table->timestampTz('prepared_at')->nullable();
            $table->foreignId('prepared_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('regulatory_price_candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('regulatory_emergency_id')->constrained('regulatory_emergencies')->cascadeOnDelete();
            $table->string('commodity_key');
            $table->decimal('minimum_price', 10, 2);
            $table->decimal('maximum_price', 10, 2);
            $table->decimal('observed_average_price', 10, 2);
            $table->decimal('computed_apc_price', 10, 2);
            $table->unsignedInteger('observation_count');
            $table->unsignedInteger('establishment_count');
            $table->json('source_item_ids');
            $table->string('dataset_hash', 64);
            $table->timestamps();
            $table->unique(['regulatory_emergency_id', 'commodity_key'], 'regulatory_candidate_emergency_commodity_unique');
        });

        Schema::table('regulatory_price_records', function (Blueprint $table) {
            $table->foreignId('source_candidate_id')->nullable()->constrained('regulatory_price_candidates')->nullOnDelete();
        });

        Schema::table('monitoring_record_items', function (Blueprint $table) {
            $table->unsignedBigInteger('reference_source_id')->nullable();
            $table->string('reference_version', 64)->nullable();
        });

        Schema::table('field_offline_leases', function (Blueprint $table) {
            $table->boolean('requires_reference_snapshot')->default(false);
        });

        DB::statement('DROP INDEX IF EXISTS regulatory_emergencies_one_active');
        DB::statement("CREATE UNIQUE INDEX regulatory_emergencies_one_active ON regulatory_emergencies ((CASE WHEN status = 'active' THEN 1 ELSE NULL END))");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS regulatory_emergencies_one_active');
        Schema::table('field_offline_leases', fn (Blueprint $table) => $table->dropColumn('requires_reference_snapshot'));
        Schema::table('monitoring_record_items', fn (Blueprint $table) => $table->dropColumn(['reference_source_id', 'reference_version']));
        Schema::table('regulatory_price_records', fn (Blueprint $table) => $table->dropConstrainedForeignId('source_candidate_id'));
        Schema::dropIfExists('regulatory_price_candidates');
        Schema::table('regulatory_emergencies', function (Blueprint $table) {
            $table->dropConstrainedForeignId('prepared_by');
            $table->dropColumn(['source_week_starts_at', 'source_week_ends_at', 'preparation_hash', 'prepared_at']);
        });
        DB::statement("CREATE UNIQUE INDEX regulatory_emergencies_one_active ON regulatory_emergencies (status) WHERE status = 'active'");
    }
};
