<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('store_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            // The vendor this message was exchanged with. A vendor only ever reads rows addressed to them,
            // so a store re-linked to another vendor never exposes the previous vendor's thread.
            $table->foreignId('vendor_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('sender_id')->constrained('users')->restrictOnDelete();
            $table->string('sender_side', 10);
            $table->text('body')->nullable();
            $table->string('attachment_disk')->nullable();
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->string('attachment_mime')->nullable();
            $table->unsignedInteger('attachment_size')->nullable();
            $table->string('attachment_sha256', 64)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['store_id', 'id']);
        });

        Schema::table('legal_notices', function (Blueprint $table) {
            // Audience: the vendor the notice was issued to. Null for every notice issued before this change,
            // which keeps those notices out of the portal (offline handling) instead of guessing a recipient.
            $table->foreignId('vendor_user_id')->nullable()->constrained('users')->nullOnDelete();
            // Response-period rules frozen at issue, so a deadline never depends on the policy in force later.
            $table->json('deadline_rules')->nullable();
            // How the formal response arrived: the portal wizard, or email/paper recorded by DTI.
            $table->string('response_channel', 10)->nullable();
            // Who signed, and whether (and which) e-signature image was stamped on the issued PDF.
            $table->json('signatory_snapshot')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('legal_notices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('vendor_user_id');
            $table->dropColumn(['deadline_rules', 'response_channel', 'signatory_snapshot']);
        });
        Schema::dropIfExists('store_messages');
    }
};
