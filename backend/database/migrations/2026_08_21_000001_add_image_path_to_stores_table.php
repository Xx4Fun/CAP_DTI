<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('stores') && !Schema::hasColumn('stores', 'image_path')) {
            Schema::table('stores', function (Blueprint $table) {
                $table->string('image_path')->nullable()->after('address');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('stores') && Schema::hasColumn('stores', 'image_path')) {
            Schema::table('stores', function (Blueprint $table) {
                $table->dropColumn('image_path');
            });
        }
    }
};
