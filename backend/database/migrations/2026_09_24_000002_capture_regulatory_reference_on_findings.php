<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A finding previously cited only an SRP bulletin id. During a declared price freeze the authoritative
 * reference is a RegulatoryPriceRecord (APC / frozen ceiling), which the table could not record at all,
 * so an emergency-era determination looked identical to an ordinary one.
 *
 * These columns capture the whole resolved reference at decision time. srp_bulletin_id stays populated
 * under both reference types because it carries commodity identity that TemporalAnalyticsService reads
 * findings back through; reference_source_id identifies the row actually cited.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('regulatory_findings', function (Blueprint $table) {
            $table->string('reference_type')->nullable()->after('srp_bulletin_id');
            $table->unsignedBigInteger('reference_source_id')->nullable()->after('reference_type');
            $table->decimal('reference_value', 10, 2)->nullable()->after('reference_source_id');
            $table->date('reference_effective_date')->nullable()->after('reference_value');
            $table->string('reference_label')->nullable()->after('reference_effective_date');
            $table->string('reference_source')->nullable()->after('reference_label');
            $table->string('reference_version')->nullable()->after('reference_source');
        });
    }

    public function down(): void
    {
        Schema::table('regulatory_findings', function (Blueprint $table) {
            $table->dropColumn([
                'reference_type',
                'reference_source_id',
                'reference_value',
                'reference_effective_date',
                'reference_label',
                'reference_source',
                'reference_version',
            ]);
        });
    }
};
