<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('capture_sessions', function (Blueprint $table) {
            $table->string('capture_mode')->default('single_image_v1')->after('store_id');
            $table->string('processing_status')->default('open')->after('capture_mode');
        });
    }

    public function down(): void
    {
        Schema::table('capture_sessions', function (Blueprint $table) {
            $table->dropColumn(['capture_mode', 'processing_status']);
        });
    }
};
