<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('current_representative_name')->nullable();
            $table->string('current_representative_title')->nullable();
            $table->timestamp('current_representative_updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', fn (Blueprint $table) => $table->dropColumn([
            'current_representative_name', 'current_representative_title', 'current_representative_updated_at',
        ]));
    }
};
