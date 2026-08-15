<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consumer_reports', function (Blueprint $table) {
            $table->foreignId('receipt_evidence_bundle_id')->nullable()->unique()->after('capture_session_id')
                ->constrained('receipt_evidence_bundles')->nullOnDelete();
            $table->string('capture_mode')->default('single_image_v1')->after('receipt_evidence_bundle_id');
            $table->string('processing_status')->nullable()->after('capture_mode');
            $table->string('resume_token_hash')->nullable()->unique()->after('tracking_token_hash');
            $table->string('evidence_disk')->nullable()->after('image_vault_path');
            $table->unsignedSmallInteger('evidence_version')->default(1)->after('evidence_disk');
            $table->timestamp('submitted_at')->nullable()->after('status');
            $table->timestamp('consumer_confirmed_at')->nullable()->after('submitted_at');
            $table->string('image_hash')->nullable()->change();
            $table->string('image_vault_path')->nullable()->change();
        });

        Schema::create('consumer_report_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consumer_report_id')->constrained('consumer_reports')->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence');
            $table->text('raw_text')->nullable();
            $table->string('item_name')->nullable();
            $table->decimal('quantity', 10, 3)->nullable();
            $table->string('unit')->nullable();
            $table->decimal('observed_price', 12, 2)->nullable();
            $table->decimal('ocr_confidence', 5, 4)->nullable();
            $table->foreignId('srp_id')->nullable()->constrained('srp_bulletins')->nullOnDelete();
            $table->json('consumer_correction_json')->nullable();
            $table->boolean('consumer_confirmed')->default(false);
            $table->timestamps();

            $table->unique(['consumer_report_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consumer_report_items');
        Schema::table('consumer_reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('receipt_evidence_bundle_id');
            $table->dropColumn([
                'capture_mode',
                'processing_status',
                'resume_token_hash',
                'evidence_disk',
                'evidence_version',
                'submitted_at',
                'consumer_confirmed_at',
            ]);
            $table->string('image_hash')->nullable(false)->change();
            $table->string('image_vault_path')->nullable(false)->change();
        });
    }
};
