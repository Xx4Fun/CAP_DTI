<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Store photos move from per-app bundled files to the public image bucket (docs/plans/image-urls/PLAN.md).
 * The photos must already be uploaded under store_images/ before this runs in an environment.
 * Rollback is only valid together with reverting the code that removed the bundled /stores/ files.
 */
return new class extends Migration
{
    private const PHOTOS = ['gaisano-grand', 'licandas-branch-1', 'licandas-branch-2', 'merrymart', 'robinsons'];

    public function up(): void
    {
        foreach (self::PHOTOS as $photo) {
            DB::table('stores')->where('image_path', "/stores/{$photo}.webp")->update(['image_path' => "store_images/{$photo}.webp"]);
        }
        // The generic facade is a client placeholder, not a photo of the store.
        DB::table('stores')->where('image_path', '/stores/store.webp')->update(['image_path' => null]);
    }

    public function down(): void
    {
        // Null is left alone: migrated placeholders cannot be told apart from stores that never had a photo.
        foreach (self::PHOTOS as $photo) {
            DB::table('stores')->where('image_path', "store_images/{$photo}.webp")->update(['image_path' => "/stores/{$photo}.webp"]);
        }
    }
};
