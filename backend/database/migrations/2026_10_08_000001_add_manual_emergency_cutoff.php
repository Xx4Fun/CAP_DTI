<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('regulatory_emergencies', fn (Blueprint $table) => $table->dateTime('ended_at', 6)->nullable());
    }

    public function down(): void
    {
        Schema::table('regulatory_emergencies', fn (Blueprint $table) => $table->dropColumn('ended_at'));
    }
};
