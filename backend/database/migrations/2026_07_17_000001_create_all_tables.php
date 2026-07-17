<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('role'); // super_admin, dti_evaluator, field_officer, vendor, consumer
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });

        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->string('dti_sec_number')->unique();
            $table->string('store_name');
            $table->string('owner_name');
            $table->decimal('latitude', 10, 8);
            $table->decimal('longitude', 11, 8);
            $table->text('address');
            $table->integer('recidivism_index')->default(0);
            $table->timestamps();
        });

        Schema::create('srp_bulletins', function (Blueprint $table) {
            $table->id();
            $table->string('commodity_name');
            $table->decimal('baseline_price', 8, 2);
            $table->date('effective_date');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('item_aliases', function (Blueprint $table) {
            $table->id();
            $table->string('alias_name')->unique();
            $table->foreignId('srp_bulletin_id')->constrained('srp_bulletins')->onDelete('cascade');
            $table->timestamps();

            // Indexes
            $table->index('srp_bulletin_id');
        });

        Schema::create('temporal_inspections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->onDelete('cascade');
            $table->foreignId('srp_id')->constrained('srp_bulletins')->onDelete('cascade');
            $table->decimal('recorded_price', 8, 2);
            $table->boolean('is_flagged');
            $table->timestamp('inspection_timestamp');
            $table->timestamp('sync_timestamp')->useCurrent();
            $table->text('officer_signature')->nullable();
            $table->text('vendor_signature')->nullable();
            $table->timestamps();

            // Indexes
            $table->index('store_id');
            $table->index('srp_id');
            $table->index(['store_id', 'inspection_timestamp']);
            $table->unique(['store_id', 'srp_id', 'inspection_timestamp'], 'inspections_store_srp_time_unique');
        });

        Schema::create('citizen_tips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained('stores')->onDelete('set null');
            $table->json('extracted_text_json');
            $table->string('image_hash_path');
            $table->string('status')->default('pending');
            $table->timestamps();

            // Indexes
            $table->index('store_id');
            $table->index('status');
        });

        Schema::create('legal_notices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->onDelete('cascade');
            $table->string('notice_type'); // LOI, SCO
            $table->string('pdf_file_path');
            $table->string('status')->default('issued');
            $table->timestamp('due_date_timestamp');
            $table->timestamps();

            // Indexes
            $table->index('store_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_notices');
        Schema::dropIfExists('citizen_tips');
        Schema::dropIfExists('temporal_inspections');
        Schema::dropIfExists('item_aliases');
        Schema::dropIfExists('srp_bulletins');
        Schema::dropIfExists('stores');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
