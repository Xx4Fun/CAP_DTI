<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receipt_evidence_bundles', function (Blueprint $table) {
            $table->id();
            $table->uuid('evidence_uuid')->unique();
            $table->foreignId('capture_session_id')->unique()->constrained('capture_sessions')->cascadeOnDelete();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->string('capture_mode');
            $table->string('processing_status')->default('collecting');
            $table->unsignedSmallInteger('processing_attempts')->default(0);
            $table->json('processing_result_json')->nullable();
            $table->timestamp('processing_started_at')->nullable();
            $table->timestamp('processing_completed_at')->nullable();
            $table->string('failure_code')->nullable();
            $table->timestamps();

            $table->index(['processing_status', 'created_at']);
        });

        Schema::create('receipt_evidence_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receipt_evidence_bundle_id')->constrained('receipt_evidence_bundles')->cascadeOnDelete();
            $table->string('kind');
            $table->unsignedSmallInteger('sequence')->default(0);
            $table->string('disk');
            $table->text('path');
            $table->string('original_filename')->nullable();
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');
            $table->char('sha256', 64);
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->unique(['receipt_evidence_bundle_id', 'kind', 'sequence'], 'receipt_asset_kind_sequence_unique');
            $table->index('sha256');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receipt_evidence_assets');
        Schema::dropIfExists('receipt_evidence_bundles');
    }
};
