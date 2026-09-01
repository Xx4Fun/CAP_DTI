<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('dti_sec_number')->nullable()->change();
            $table->string('owner_name')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('dti_sec_number')->nullable(false)->change();
            $table->string('owner_name')->nullable(false)->change();
        });
    }
};
