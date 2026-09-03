<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('field_verification_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consumer_report_id')->unique()->constrained('consumer_reports')->restrictOnDelete();
            $table->foreignId('store_id')->constrained('stores')->restrictOnDelete();
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('claimed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('status', ['open', 'claimed', 'completed', 'cancelled'])->default('open')->index();
            $table->text('reason');
            $table->json('context_json');
            $table->timestamp('requested_at');
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
        });

        $activeEmergencyCount = DB::table('regulatory_emergencies')->where('status', 'active')->count();
        if ($activeEmergencyCount > 1) {
            throw new \RuntimeException('Cannot add the systemwide emergency constraint while multiple active emergencies exist. Resolve the conflicting records first.');
        }
        Schema::table('regulatory_emergencies', function (Blueprint $table) {
            $table->string('active_scope_key')->nullable()->unique();
        });
        if ($activeEmergencyCount === 1) {
            DB::table('regulatory_emergencies')->where('status', 'active')->update(['active_scope_key' => 'systemwide']);
        }
        DB::statement("CREATE UNIQUE INDEX regulatory_emergencies_one_active ON regulatory_emergencies (status) WHERE status = 'active'");

        Schema::table('monitoring_records', function (Blueprint $table) {
            $table->foreignId('field_verification_request_id')->nullable()->unique()
                ->constrained('field_verification_requests')->restrictOnDelete();
        });

        Schema::table('monitoring_record_items', function (Blueprint $table) {
            $table->string('reference_status')->nullable();
            $table->string('reference_type')->nullable();
            $table->string('reference_label')->nullable();
            $table->decimal('reference_value', 10, 2)->nullable();
            $table->string('reference_source')->nullable();
            $table->date('reference_effective_date')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_record_items', fn (Blueprint $table) => $table->dropColumn([
            'reference_status', 'reference_type', 'reference_label', 'reference_value',
            'reference_source', 'reference_effective_date',
        ]));
        Schema::table('monitoring_records', fn (Blueprint $table) => $table->dropConstrainedForeignId('field_verification_request_id'));
        DB::statement('DROP INDEX IF EXISTS regulatory_emergencies_one_active');
        Schema::table('regulatory_emergencies', function (Blueprint $table) {
            $table->dropUnique(['active_scope_key']);
            $table->dropColumn('active_scope_key');
        });
        Schema::drop('field_verification_requests');
        Schema::drop('notifications');
    }
};
