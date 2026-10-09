<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('store_messages', function (Blueprint $table) {
            $table->timestamp('edited_at')->nullable();
            // A deleted message stays as a row: both sides keep a placeholder, and the original remains on record.
            $table->timestamp('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('store_messages', function (Blueprint $table) {
            $table->dropColumn(['edited_at', 'deleted_at']);
        });
    }
};
