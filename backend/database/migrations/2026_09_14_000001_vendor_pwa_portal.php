<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('legal_notices', function (Blueprint $table) {
            if (! Schema::hasColumn('legal_notices', 'response_reason_category')) $table->string('response_reason_category')->nullable();
            if (! Schema::hasColumn('legal_notices', 'response_certified_at')) $table->timestamp('response_certified_at')->nullable();
        });

        Schema::table('legal_notice_attachments', function (Blueprint $table) {
            if (! Schema::hasColumn('legal_notice_attachments', 'category')) $table->string('category')->nullable();
        });

        // Vendors now sign in through the vendor PWA with a scoped token; legacy '*' tokens from /api/login are revoked.
        DB::table('personal_access_tokens')
            ->where('tokenable_type', (new User)->getMorphClass())
            ->whereIn('tokenable_id', DB::table('users')->where('role', 'vendor')->select('id'))
            ->where('name', '!=', 'vendor-portal-pwa')
            ->delete();
    }

    public function down(): void
    {
        Schema::table('legal_notice_attachments', function (Blueprint $table) {
            if (Schema::hasColumn('legal_notice_attachments', 'category')) $table->dropColumn('category');
        });
        Schema::table('legal_notices', function (Blueprint $table) {
            foreach (['response_reason_category', 'response_certified_at'] as $column) {
                if (Schema::hasColumn('legal_notices', $column)) $table->dropColumn($column);
            }
        });
    }
};
