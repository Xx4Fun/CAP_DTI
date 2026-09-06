<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('legal_notices', function (Blueprint $table) {
            $table->foreignId('monitoring_record_id')->nullable()->after('store_id')->constrained('monitoring_records')->restrictOnDelete();
            $table->foreignId('preceding_notice_id')->nullable()->after('monitoring_record_id')->constrained('legal_notices')->nullOnDelete();
            $table->foreignId('prepared_by')->nullable()->after('notice_type')->constrained('users')->nullOnDelete();
            $table->foreignId('issued_by')->nullable()->after('prepared_by')->constrained('users')->nullOnDelete();
            $table->string('control_number')->nullable()->unique();
            $table->string('policy_version')->nullable();
            $table->json('source_snapshot')->nullable();
            $table->json('draft_payload')->nullable();
            $table->text('internal_justification')->nullable();
            $table->string('pdf_disk')->nullable();
            $table->string('pdf_sha256', 64)->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->string('intended_delivery_method')->nullable();
            $table->string('delivery_state')->default('not_recorded');
            $table->json('delivery_details')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->text('response_text')->nullable();
            $table->timestamp('response_received_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('pdf_file_path')->nullable()->change();
            $table->timestamp('due_date_timestamp')->nullable()->change();
            $table->index(['monitoring_record_id', 'status']);
        });

        Schema::create('legal_notice_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('legal_notice_id')->constrained('legal_notices')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind');
            $table->string('disk');
            $table->text('path');
            $table->string('original_name');
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');
            $table->string('sha256', 64);
            $table->timestamps();
        });

        DB::table('legal_notices')->whereNotNull('pdf_file_path')->whereNull('pdf_disk')->update(['pdf_disk' => 'public']);
        DB::table('legal_notices')->where('status', 'rebutted')->update(['status' => 'response_received', 'response_received_at' => DB::raw('updated_at')]);
        DB::table('legal_notices')->where('status', 'issued')->whereNull('issued_at')->update(['issued_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_notice_attachments');
        Schema::table('legal_notices', function (Blueprint $table) {
            $table->dropForeign(['monitoring_record_id']);
            $table->dropForeign(['preceding_notice_id']);
            $table->dropForeign(['prepared_by']);
            $table->dropForeign(['issued_by']);
            $table->dropIndex(['monitoring_record_id', 'status']);
            $table->dropUnique(['control_number']);
            $table->dropColumn([
                'monitoring_record_id', 'preceding_notice_id', 'prepared_by', 'issued_by', 'control_number',
                'policy_version', 'source_snapshot', 'draft_payload', 'internal_justification', 'pdf_disk',
                'pdf_sha256', 'issued_at', 'intended_delivery_method', 'delivery_state', 'delivery_details',
                'delivered_at', 'response_text', 'response_received_at', 'closed_at', 'cancelled_at',
            ]);
        });
    }
};
