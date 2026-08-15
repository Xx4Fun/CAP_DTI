<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('web_push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->char('endpoint_hash', 64)->unique();
            $table->text('subscription_json');
            $table->text('user_agent')->nullable();
            $table->timestamp('permission_granted_at');
            $table->timestamp('last_success_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('consumer_report_push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consumer_report_id')->constrained('consumer_reports')->cascadeOnDelete();
            $table->foreignId('web_push_subscription_id')->constrained('web_push_subscriptions')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['consumer_report_id', 'web_push_subscription_id'], 'report_push_subscription_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consumer_report_push_subscriptions');
        Schema::dropIfExists('web_push_subscriptions');
    }
};
