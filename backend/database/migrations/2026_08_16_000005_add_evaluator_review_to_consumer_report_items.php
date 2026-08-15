<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consumer_report_items', function (Blueprint $table) {
            $table->json('evaluator_decision_json')->nullable()->after('consumer_confirmed');
            $table->foreignId('reviewed_by')->nullable()->after('evaluator_decision_json')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
        });
    }

    public function down(): void
    {
        Schema::table('consumer_report_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['evaluator_decision_json', 'reviewed_at']);
        });
    }
};
