<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        $collision = DB::table('srp_bulletins')
            ->whereNotNull('commodity_key')
            ->select('commodity_key', 'effective_date')
            ->groupBy('commodity_key', 'effective_date')
            ->havingRaw('COUNT(*) > 1')
            ->first();

        if ($collision) {
            throw new RuntimeException('Existing SRP versions share a commodity key and effective date. Review them before applying the unique index.');
        }

        Schema::table('srp_bulletins', function (Blueprint $table) {
            $table->unique(['commodity_key', 'effective_date'], 'srp_bulletins_key_effective_unique');
        });
    }

    public function down(): void
    {
        Schema::table('srp_bulletins', function (Blueprint $table) {
            $table->dropUnique('srp_bulletins_key_effective_unique');
        });
    }
};
