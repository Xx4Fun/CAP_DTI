<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'must_change_password')) {
            Schema::table('users', function (Blueprint $table) {
                $table->boolean('must_change_password')->default(false)->after('is_active');
            });
        }

        if (! Schema::hasTable('field_offline_leases')) {
            Schema::create('field_offline_leases', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamp('expires_at')->index();
                $table->timestamp('revoked_at')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('monitoring_records')) {
            Schema::create('monitoring_records', function (Blueprint $table) {
                $table->id();
                $table->uuid('client_uuid')->unique();
                $table->foreignId('officer_user_id')->constrained('users')->restrictOnDelete();
                $table->foreignId('store_id')->constrained('stores')->restrictOnDelete();
                $table->uuid('offline_lease_id')->nullable();
                $table->string('status')->default('accepted')->index();
                $table->timestamp('started_at');
                $table->timestamp('finalized_at')->index();
                $table->timestamp('received_at');
                $table->decimal('latitude', 10, 7);
                $table->decimal('longitude', 10, 7);
                $table->decimal('location_accuracy_meters', 8, 2);
                $table->timestamp('location_captured_at');
                $table->string('representative_name');
                $table->string('representative_title')->nullable();
                $table->string('officer_signature_disk');
                $table->text('officer_signature_path');
                $table->string('officer_signature_sha256', 64);
                $table->string('representative_signature_disk');
                $table->text('representative_signature_path');
                $table->string('representative_signature_sha256', 64);
                $table->string('sync_source')->default('online');
                $table->string('client_version')->nullable();
                $table->timestamps();

                $table->foreign('offline_lease_id')->references('id')->on('field_offline_leases')->nullOnDelete();
                $table->index(['officer_user_id', 'finalized_at']);
                $table->index(['store_id', 'finalized_at']);
            });
        }

        if (! Schema::hasTable('monitoring_record_items')) {
            Schema::create('monitoring_record_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('monitoring_record_id')->constrained('monitoring_records')->cascadeOnDelete();
                $table->foreignId('srp_id')->constrained('srp_bulletins')->restrictOnDelete();
                $table->decimal('recorded_price', 10, 2);
                $table->decimal('baseline_price', 10, 2);
                $table->decimal('previous_price', 10, 2)->nullable();
                $table->decimal('variance_percent', 9, 2)->nullable();
                $table->boolean('is_anomaly')->default(false)->index();
                $table->timestamps();

                $table->unique(['monitoring_record_id', 'srp_id']);
            });
        }

        Schema::table('temporal_inspections', function (Blueprint $table) {
            if (! Schema::hasColumn('temporal_inspections', 'monitoring_record_id')) {
                $table->foreignId('monitoring_record_id')->nullable()->constrained('monitoring_records')->nullOnDelete();
            }
            if (! Schema::hasColumn('temporal_inspections', 'monitoring_record_item_id')) {
                $table->foreignId('monitoring_record_item_id')->nullable()->unique()->constrained('monitoring_record_items')->nullOnDelete();
            }
            if (! Schema::hasColumn('temporal_inspections', 'officer_user_id')) {
                $table->foreignId('officer_user_id')->nullable()->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('temporal_inspections', function (Blueprint $table) {
            foreach (['monitoring_record_item_id', 'monitoring_record_id', 'officer_user_id'] as $column) {
                if (Schema::hasColumn('temporal_inspections', $column)) {
                    $table->dropConstrainedForeignId($column);
                }
            }
        });
        Schema::dropIfExists('monitoring_record_items');
        Schema::dropIfExists('monitoring_records');
        Schema::dropIfExists('field_offline_leases');
        if (Schema::hasColumn('users', 'must_change_password')) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn('must_change_password'));
        }
    }
};
