<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('srp_bulletins', function (Blueprint $table) {
            $table->string('category')->nullable()->after('commodity_name');
            $table->string('unit')->nullable()->after('category');
            $table->string('regulatory_classification')->nullable()->after('unit');
            $table->boolean('price_freeze_applicable')->default(false)->after('is_active');
            $table->text('price_freeze_treatment')->nullable()->after('price_freeze_applicable');
        });
    }

    public function down(): void
    {
        Schema::table('srp_bulletins', function (Blueprint $table) {
            $table->dropColumn([
                'category',
                'unit',
                'regulatory_classification',
                'price_freeze_applicable',
                'price_freeze_treatment',
            ]);
        });
    }
};
