<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendor_submission_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_user_id')->constrained('users')->restrictOnDelete();
            $table->uuid('client_uuid');
            $table->string('operation', 32);
            $table->unsignedBigInteger('target_id');
            $table->char('payload_hash', 64);
            $table->unsignedBigInteger('result_id')->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->unique(['vendor_user_id', 'client_uuid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_submission_receipts');
    }
};
