<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'is_active')) {
                $table->boolean('is_active')->default(true);
            }
            if (!Schema::hasColumn('stores', 'is_verified')) {
                $table->boolean('is_verified')->default(true);
            }
        });

    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (Schema::hasColumn('stores', 'is_active')) {
                $table->dropColumn('is_active');
            }
            if (Schema::hasColumn('stores', 'is_verified')) {
                $table->dropColumn('is_verified');
            }
        });
    }
};
