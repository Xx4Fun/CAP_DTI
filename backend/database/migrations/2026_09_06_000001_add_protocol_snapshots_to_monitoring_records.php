<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('monitoring_records', function (Blueprint $table) {
            $table->string('protocol_mode')->nullable()->after('client_version');
            $table->string('protocol_reference')->nullable()->after('protocol_mode');
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_records', fn (Blueprint $table) => $table->dropColumn([
            'protocol_mode', 'protocol_reference',
        ]));
    }
};
