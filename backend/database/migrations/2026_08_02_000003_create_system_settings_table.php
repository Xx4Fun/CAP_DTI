<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('system_settings')) {
            Schema::create('system_settings', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->text('value')->nullable();
                $table->string('label')->nullable();
                $table->string('category')->default('regulatory')->index();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });

            // Insert default regulatory system settings
            DB::table('system_settings')->insert([
                ['key' => 'anomaly_threshold_percent', 'value' => '10.00', 'label' => 'Price Anomaly Threshold (%)', 'category' => 'regulatory', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'gis_default_lat', 'value' => '10.7431', 'label' => 'Default Map Latitude', 'category' => 'gis', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'gis_default_lng', 'value' => '121.9427', 'label' => 'Default Map Longitude', 'category' => 'gis', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'gis_default_zoom', 'value' => '14', 'label' => 'Default Map Zoom Level', 'category' => 'gis', 'created_at' => now(), 'updated_at' => now()],
                ['key' => 'loi_rebuttal_hours', 'value' => '48', 'label' => 'LOI Rebuttal Expiration Window (Hours)', 'category' => 'legal', 'created_at' => now(), 'updated_at' => now()],
            ]);
        }

        if (!Schema::hasColumn('users', 'preferences')) {
            Schema::table('users', function (Blueprint $table) {
                $table->json('preferences')->nullable()->after('role');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'preferences')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('preferences');
            });
        }
        Schema::dropIfExists('system_settings');
    }
};
