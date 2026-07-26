<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        $hasIsActive = Schema::hasColumn('stores', 'is_active');
        $hasIsVerified = Schema::hasColumn('stores', 'is_verified');

        if (!$hasIsActive || !$hasIsVerified) {
            Schema::table('stores', function (Blueprint $table) use ($hasIsActive, $hasIsVerified) {
                if (!$hasIsActive) {
                    $table->boolean('is_active')->default(true);
                }
                if (!$hasIsVerified) {
                    $table->boolean('is_verified')->default(true);
                }
            });
        }
    }

    public function down(): void
    {
        $hasIsActive = Schema::hasColumn('stores', 'is_active');
        $hasIsVerified = Schema::hasColumn('stores', 'is_verified');

        if ($hasIsActive || $hasIsVerified) {
            Schema::table('stores', function (Blueprint $table) use ($hasIsActive, $hasIsVerified) {
                if ($hasIsActive) {
                    $table->dropColumn('is_active');
                }
                if ($hasIsVerified) {
                    $table->dropColumn('is_verified');
                }
            });
        }
    }
};
