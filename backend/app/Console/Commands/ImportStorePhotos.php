<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\Admin\AuditTrailService;
use App\Services\CommodityImageStorage;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use LogicException;
use Throwable;

class ImportStorePhotos extends Command
{
    protected $signature = 'stores:import-photos {--apply : Upload and attach the four supplied establishment photos}';
    protected $description = 'Preview or import the four establishment photos without changing store metadata';

    private const PHOTOS = [
        'CPT Mart- Antique Branch' => 'cptmart.jpg',
        'HARO MART' => 'haromart.jpg',
        'Puregold Price Club Incorporated' => 'puregold.jpg',
        'Unitop General Merchandise' => 'unitop.jpg',
    ];

    public function handle(CommodityImageStorage $images, AuditTrailService $audit): int
    {
        try {
            $disk = Storage::disk(config('filesystems.commodity_images_disk', 'public'));
            $stores = Store::whereIn('store_name', array_keys(self::PHOTOS))->get();
            $photos = [];
            foreach (self::PHOTOS as $name => $file) {
                $key = 'store_images/'.$file;
                $this->checkStore($stores->where('store_name', $name), $name, $key);
                $source = database_path('seeders/store-source-images/'.$file);
                if (! is_file($source)) throw new LogicException('Missing source photo: '.$file);
                Validator::make(['image' => new UploadedFile($source, $file, 'image/jpeg', null, true)], [
                    'image' => 'required|image|mimes:jpeg,jpg|max:2048',
                ])->validate();
                $bytes = file_get_contents($source);
                if ($bytes === false) throw new LogicException('Cannot read source photo: '.$file);
                $hash = hash('sha256', $bytes);
                $exists = $disk->exists($key);
                if ($exists && hash('sha256', $disk->get($key) ?? '') !== $hash) {
                    throw new LogicException('Conflicting stored object: '.$key);
                }
                $url = $images->publicUrl($key);
                if (! $url || ! filter_var($url, FILTER_VALIDATE_URL)
                    || ! in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'], true)
                    || (app()->environment('production') && in_array(parse_url($url, PHP_URL_HOST), ['localhost', '127.0.0.1'], true))) {
                    throw new LogicException('The image disk must provide a public absolute URL.');
                }
                $photos[$name] = compact('key', 'bytes', 'hash', 'exists');
            }

            $this->table(['Establishment', 'Object key', 'Storage'], collect($photos)->map(
                fn ($photo, $name) => [$name, $photo['key'], $photo['exists'] ? 'Identical object exists' : 'Upload needed'],
            )->values()->all());
            if (! $this->option('apply')) {
                $this->info('Preview only. No files or records changed. Use --apply to import.');
                return self::SUCCESS;
            }

            foreach ($photos as $photo) {
                // shortcut: this importer owns these fixed keys; use conditional writes before adding other concurrent writers.
                if (! $disk->exists($photo['key']) && ! $disk->put($photo['key'], $photo['bytes'], ['ContentType' => 'image/jpeg'])) {
                    throw new LogicException('Photo upload failed: '.$photo['key']);
                }
                if (hash('sha256', $disk->get($photo['key']) ?? '') !== $photo['hash']) {
                    throw new LogicException('Photo upload verification failed: '.$photo['key']);
                }
            }

            $changed = DB::transaction(function () use ($photos, $audit) {
                $stores = Store::whereIn('store_name', array_keys(self::PHOTOS))->orderBy('id')->lockForUpdate()->get();
                $request = Request::create('/console/stores-import-photos');
                $changed = 0;
                foreach ($photos as $name => $photo) {
                    $store = $this->checkStore($stores->where('store_name', $name), $name, $photo['key']);
                    if ($store->getRawOriginal('image_path') === $photo['key']) continue;
                    $store->update(['image_path' => $photo['key']]);
                    $audit->recordOrFail($request, 'store.photo_imported', $store, [
                        'previous_image_path' => null, 'image_path' => $photo['key'], 'sha256' => $photo['hash'],
                    ]);
                    $changed++;
                }
                return $changed;
            });
            $this->info('Applied. '.$changed.' establishment photos attached; all four storage objects verified.');
            return self::SUCCESS;
        } catch (ValidationException $exception) {
            $this->error(implode(' ', $exception->validator->errors()->all()));
        } catch (LogicException $exception) {
            $this->error($exception->getMessage());
        } catch (Throwable $exception) {
            report($exception);
            $this->error('Store photo import failed. Check the application log for the storage or audit failure.');
        }
        // Uploaded public photos can remain after failure; keep them for a verified retry instead of deleting shared objects.
        $this->warn('No photo assignments were committed. Any uploaded objects will be checked and reused on retry.');
        return self::FAILURE;
    }

    private function checkStore(Collection $matches, string $name, string $key): Store
    {
        if ($matches->count() !== 1) throw new LogicException('Expected exactly one establishment named '.$name.'.');
        $store = $matches->first();
        $current = $store->getRawOriginal('image_path');
        if ($current !== null && $current !== $key) throw new LogicException('Existing photo conflicts for '.$name.'.');
        return $store;
    }
}
