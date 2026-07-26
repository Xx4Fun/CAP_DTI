<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'vendor_user_id')) $table->foreignId('vendor_user_id')->nullable()->constrained('users')->nullOnDelete();
            if (!Schema::hasColumn('stores', 'is_active')) $table->boolean('is_active')->default(true);
            if (!Schema::hasColumn('stores', 'is_verified')) $table->boolean('is_verified')->default(false);
            if (!Schema::hasColumn('stores', 'is_public')) $table->boolean('is_public')->default(true);
            if (!Schema::hasColumn('stores', 'verified_at')) $table->timestamp('verified_at')->nullable();
            if (!Schema::hasColumn('stores', 'verified_by')) $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('srp_bulletins', function (Blueprint $table) {
            if (!Schema::hasColumn('srp_bulletins', 'commodity_key')) $table->string('commodity_key')->nullable()->index();
            if (!Schema::hasColumn('srp_bulletins', 'source_reference')) $table->string('source_reference')->nullable();
            if (!Schema::hasColumn('srp_bulletins', 'created_by')) $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('temporal_inspections', function (Blueprint $table) {
            if (!Schema::hasColumn('temporal_inspections', 'validation_status')) $table->string('validation_status')->default('pending')->index();
            if (!Schema::hasColumn('temporal_inspections', 'validated_at')) $table->timestamp('validated_at')->nullable();
            if (!Schema::hasColumn('temporal_inspections', 'validated_by')) $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('vendor_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('email')->index();
            $table->string('token_hash', 64)->unique();
            $table->string('status')->default('pending')->index();
            $table->timestamp('expires_at');
            $table->foreignId('invited_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
        });

        Schema::create('regulatory_findings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('srp_bulletin_id')->nullable()->constrained('srp_bulletins')->nullOnDelete();
            $table->string('source_type');
            $table->unsignedBigInteger('source_id');
            $table->decimal('observed_price', 10, 2)->nullable();
            $table->timestamp('observed_at')->nullable();
            $table->string('decision')->index();
            $table->text('reason')->nullable();
            $table->foreignId('decided_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('decided_at');
            $table->timestamps();
            $table->unique(['source_type', 'source_id']);
        });

        Schema::create('regulatory_emergencies', function (Blueprint $table) {
            $table->id();
            $table->string('location');
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->string('declaration_reference');
            $table->string('status')->default('draft')->index();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('responsible_admin_id')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('regulatory_price_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('regulatory_emergency_id')->constrained('regulatory_emergencies')->cascadeOnDelete();
            $table->string('commodity_key')->index();
            $table->string('price_type');
            $table->decimal('authoritative_price', 10, 2);
            $table->date('effective_from');
            $table->date('effective_until')->nullable();
            $table->string('location');
            $table->string('declaration_reference');
            $table->string('source_reference');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action')->index();
            $table->string('subject_type');
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
        Schema::dropIfExists('regulatory_price_records');
        Schema::dropIfExists('regulatory_emergencies');
        Schema::dropIfExists('regulatory_findings');
        Schema::dropIfExists('vendor_invitations');
    }
};
