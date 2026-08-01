<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('srp_bulletins', 'image_path')) {
            Schema::table('srp_bulletins', function (Blueprint $table) {
                $table->string('image_path')->nullable()->after('commodity_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('srp_bulletins', 'image_path')) {
            Schema::table('srp_bulletins', function (Blueprint $table) {
                $table->dropColumn('image_path');
            });
        }
    }
};
