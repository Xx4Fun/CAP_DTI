<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        $columns = [
            'category' => fn (Blueprint $table) => $table->string('category')->nullable()->after('commodity_name'),
            'unit' => fn (Blueprint $table) => $table->string('unit')->nullable()->after('category'),
            'regulatory_classification' => fn (Blueprint $table) => $table->string('regulatory_classification')->nullable()->after('unit'),
            'price_freeze_applicable' => fn (Blueprint $table) => $table->boolean('price_freeze_applicable')->default(false)->after('is_active'),
            'price_freeze_treatment' => fn (Blueprint $table) => $table->text('price_freeze_treatment')->nullable()->after('price_freeze_applicable'),
        ];

        foreach ($columns as $name => $definition) {
            if (! Schema::hasColumn('srp_bulletins', $name)) {
                Schema::table('srp_bulletins', $definition);
            }
        }
    }

    public function down(): void
    {
        $columns = collect([
            'category',
            'unit',
            'regulatory_classification',
            'price_freeze_applicable',
            'price_freeze_treatment',
        ])->filter(fn (string $column) => Schema::hasColumn('srp_bulletins', $column))->all();

        if ($columns !== []) {
            Schema::table('srp_bulletins', fn (Blueprint $table) => $table->dropColumn($columns));
        }
    }
};