<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\Store;
use Illuminate\Database\Seeder;

class OfficialEstablishmentSeeder extends Seeder
{
    public function run(): void
    {
        $legacy = Store::query()->where('store_name', 'Super Metro San Jose')->first();
        if ($legacy && ($legacy->is_active || $legacy->is_public)) {
            $legacy->update(['is_active' => false, 'is_public' => false]);
            $this->audit($legacy);
        }

        foreach ($this->stores() as $attributes) {
            $store = match ($attributes['store_name']) {
                'Gaisano Grand Mall' => Store::query()->where('store_name', 'like', 'Gaisano Grand%')->first(),
                'Robinsons Supermarket Corp.' => Store::query()->where('store_name', 'like', 'Robinsons%')->first(),
                default => Store::query()->where('store_name', $attributes['store_name'])->first(),
            };
            $changes = array_merge(['recidivism_index' => 0, 'is_active' => true, 'is_verified' => true, 'is_public' => true], $attributes);

            if (!$store) {
                $store = Store::create($changes);
                $this->audit($store);
            } elseif ($store->fill($changes)->isDirty()) {
                $store->save();
                $this->audit($store);
            }
        }
    }

    private function audit(Store $store): void
    {
        AuditEvent::create(['action' => 'store.official_list_seeded', 'subject_type' => Store::class, 'subject_id' => $store->id]);
    }

    private function stores(): array
    {
        return [
            ['store_name' => 'Robinsons Supermarket Corp.', 'dti_sec_number' => null, 'owner_name' => 'Robinsons Supermarket Corporation', 'address' => 'San Angel', 'latitude' => 10.73578, 'longitude' => 121.95191, 'image_path' => 'store_images/robinsons.webp'],
            ['store_name' => 'Gaisano Grand Mall', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Bagumbayan Bridge', 'latitude' => 10.74329, 'longitude' => 121.94845, 'image_path' => 'store_images/gaisano-grand.webp'],
            ['store_name' => 'Puregold Price Club Incorporated', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'T.A. Fornier Street, San Jose de Buenavista, Antique', 'latitude' => 10.7465, 'longitude' => 121.9425, 'image_path' => null],
            ['store_name' => "Licanda's Retail Chain Branch 2 (Licandas OPC 1)", 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Gov. Villavert St. San Jose, Antique', 'latitude' => 10.7445, 'longitude' => 121.9415, 'image_path' => 'store_images/licandas-branch-2.webp'],
            ['store_name' => 'Merrymart Consumer Corp.', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'City Mall, San Jose Antique', 'latitude' => 10.7435, 'longitude' => 121.9411, 'image_path' => 'store_images/merrymart.webp'],
            ['store_name' => 'Antique City Square', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias A. Fornier Street, San Jose, Antique', 'latitude' => 10.7455, 'longitude' => 121.943, 'image_path' => null],
            ['store_name' => 'Unitop General Merchandise', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias A. Fornier Street, San Jose, Antique', 'latitude' => 10.746, 'longitude' => 121.9428, 'image_path' => null],
            ['store_name' => 'HARO MART', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Funda-Dalipe, San Jose Antique', 'latitude' => 10.7635, 'longitude' => 121.9315, 'image_path' => null],
            ['store_name' => 'CPT Mart- Antique Branch', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias Fornier St., San Jose, Antique', 'latitude' => 10.747, 'longitude' => 121.9422, 'image_path' => null],
            ['store_name' => "Licanda's Retail Chain Branch 1", 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Funda-Dalipe, San Jose Antique', 'latitude' => 10.7642, 'longitude' => 121.931, 'image_path' => 'store_images/licandas-branch-1.webp'],
        ];
    }
}
