<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('capture_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('session_uuid')->unique();
            $table->foreignId('store_id')->nullable()->constrained('stores')->onDelete('set null');
            $table->string('token_hash')->unique();
            $table->timestamp('expires_at');
            $table->boolean('is_used')->default(false);
            $table->timestamps();

            $table->index('expires_at');
        });

        Schema::create('consumer_reports', function (Blueprint $table) {
            $table->id();
            $table->string('report_reference')->unique(); // e.g., REP-20260722-A8F2
            $table->string('tracking_token_hash')->unique();
            $table->foreignId('store_id')->nullable()->constrained('stores')->onDelete('set null');
            $table->string('submission_uuid')->unique(); // Idempotency key
            $table->foreignId('capture_session_id')->nullable()->constrained('capture_sessions')->onDelete('set null');
            $table->string('image_hash');
            $table->string('image_vault_path');
            $table->string('redacted_image_path')->nullable();
            $table->json('raw_ocr_json')->nullable();
            $table->json('consumer_confirmed_json')->nullable();
            $table->json('evaluator_confirmed_json')->nullable();
            $table->string('status')->default('Submitted'); // Submitted, Under initial evaluation, Referred for field verification, Under regulatory review, Resolved, Closed
            $table->string('privacy_notice_version')->default('1.0');
            $table->string('user_ip')->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->index('report_reference');
            $table->index('store_id');
            $table->index('status');
        });

        Schema::create('report_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consumer_report_id')->constrained('consumer_reports')->onDelete('cascade');
            $table->string('previous_status')->nullable();
            $table->string('new_status');
            $table->string('public_message');
            $table->text('internal_notes')->nullable();
            $table->string('actor_type')->default('system'); // system, dti_evaluator, field_officer
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->timestamps();

            $table->index('consumer_report_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_status_histories');
        Schema::dropIfExists('consumer_reports');
        Schema::dropIfExists('capture_sessions');
    }
};
