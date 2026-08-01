<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration {
    public function up(): void
    {
        $records = DB::table('srp_bulletins')->get();

        foreach ($records as $record) {
            if (empty($record->category) || empty($record->commodity_name)) {
                continue;
            }

            $prefix = $record->category . ' - ';
            if (Str::startsWith($record->commodity_name, $prefix)) {
                $cleanName = Str::after($record->commodity_name, $prefix);

                // Update srp_bulletins
                DB::table('srp_bulletins')
                    ->where('id', $record->id)
                    ->update(['commodity_name' => $cleanName]);

                // Delete old prefixed item alias to avoid unique constraint violations
                $oldAliasUpper = strtoupper($record->commodity_name);
                DB::table('item_aliases')
                    ->where('srp_bulletin_id', $record->id)
                    ->where('alias_name', $oldAliasUpper)
                    ->delete();
            }
        }
    }

    public function down(): void
    {
        $records = DB::table('srp_bulletins')->get();

        foreach ($records as $record) {
            if (empty($record->category) || empty($record->commodity_name)) {
                continue;
            }

            $prefix = $record->category . ' - ';
            if (!Str::startsWith($record->commodity_name, $prefix)) {
                $restoredName = $prefix . $record->commodity_name;

                DB::table('srp_bulletins')
                    ->where('id', $record->id)
                    ->update(['commodity_name' => $restoredName]);

                $restoredAliasUpper = strtoupper($restoredName);
                DB::table('item_aliases')->insertOrIgnore([
                    'srp_bulletin_id' => $record->id,
                    'alias_name' => $restoredAliasUpper,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }
};
