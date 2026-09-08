<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('field_verification_requests', function (Blueprint $table) {
            $table->foreignId('consumer_report_id')->nullable()->change();
            $table->string('source_type')->default('complaint')->after('consumer_report_id');
        });
    }

    public function down(): void
    {
        if (DB::table('field_verification_requests')->whereNull('consumer_report_id')->exists()) {
            throw new RuntimeException('Remove supervisor-directed requests before rolling back this migration.');
        }

        Schema::table('field_verification_requests', function (Blueprint $table) {
            $table->dropColumn('source_type');
            $table->foreignId('consumer_report_id')->nullable(false)->change();
        });
    }
};
