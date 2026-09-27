<?php

namespace App\Services\Admin;

use App\Models\SrpBulletin;
use App\Models\User;
use App\Services\FieldNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SrpImportService
{
    public function __construct(private readonly AuditTrailService $audit, private readonly FieldNotificationService $notifications) {}

    public function preview(array $payload): array
    {
        $date = data_get($payload, 'metadata.effective_date');
        $source = data_get($payload, 'metadata.source_reference');
        $items = $payload['items'] ?? [];
        if (!$date || !strtotime($date)) throw ValidationException::withMessages(['metadata.effective_date' => ['A valid metadata effective date is required.']]);
        if (!$source) throw ValidationException::withMessages(['metadata.source_reference' => ['An authoritative source reference is required.']]);
        if (!is_array($items) || $items === []) throw ValidationException::withMessages(['items' => ['At least one SRP item is required.']]);

        $rows = collect($items)->map(function ($item) use ($date, $source) {
            if (!isset($item['item_name'], $item['srp']) || !is_numeric($item['srp']) ||
                (float) $item['srp'] <= 0 || !preg_match('/^\d+(\.\d{1,2})?$/', (string) $item['srp'])) {
                throw ValidationException::withMessages(['items' => ['Every item requires a name and positive SRP in centavos.']]);
            }
            $key = Str::slug(trim($item['item_name'].' '.($item['unit'] ?? '')));
            return [
                'commodity_key' => $key, 'commodity_name' => $item['item_name'],
                'image_path' => $item['image_path'] ?? null,
                'category' => $item['category'] ?? null, 'unit' => $item['unit'] ?? null,
                'regulatory_classification' => $item['regulatory_classification'] ?? null,
                'baseline_price' => (float) $item['srp'], 'effective_date' => $date,
                'source_reference' => $source, 'is_active' => true,
                'price_freeze_applicable' => (bool) ($item['price_freeze_applicable'] ?? false),
                'price_freeze_treatment' => $item['price_freeze_treatment'] ?? null,
            ];
        })->values();

        $seen = [];
        $duplicates = $rows->filter(function ($row) use (&$seen, $date) {
            $key = $row['commodity_key'];
            if (isset($seen[$key])) return true;
            $seen[$key] = true;
            return SrpBulletin::where('commodity_key', $key)->whereDate('effective_date', $date)->exists();
        })->count();
        return ['rows' => $rows->all(), 'insert_count' => $rows->count() - $duplicates, 'duplicate_count' => $duplicates, 'effective_date' => $date, 'source_reference' => $source];
    }

    public function import(array $payload, User $actor, Request $request): array
    {
        $preview = $this->preview($payload);
        $inserted = DB::transaction(function () use ($preview, $actor, $request) {
            $count = 0;
            foreach ($preview['rows'] as $row) {
                if (SrpBulletin::where('commodity_key', $row['commodity_key'])->whereDate('effective_date', $row['effective_date'])->exists()) continue;
                SrpBulletin::create($row + ['created_by' => $actor->id]);
                $count++;
            }
            $this->audit->recordOrFail($request, 'srp.imported', 'srp_import', [
                'inserted' => $count,
                'effective_date' => $preview['effective_date'],
                'source_reference' => $preview['source_reference'],
            ]);
            if ($count > 0) {
                $this->notifications->broadcast('srp_published', [
                    'effective_date' => $preview['effective_date'], 'item_count' => $count,
                ]);
            }
            return $count;
        });
        return $preview + ['inserted' => $inserted];
    }
}
