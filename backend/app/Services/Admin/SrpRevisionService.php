<?php

namespace App\Services\Admin;

use App\Models\SrpBulletin;
use App\Models\User;
use App\Services\FieldNotificationService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SrpRevisionService
{
    public function __construct(
        private readonly SrpCatalogService $catalog,
        private readonly AuditTrailService $audit,
        private readonly FieldNotificationService $notifications
    ) {}

    public function preview(SrpBulletin $original, array $data): array
    {
        $this->requireAvailable();
        $proposed = $this->proposedAttributes($original, $data);
        $this->ensureNoConflict($original, $proposed);

        $changedFields = collect($proposed)
            ->filter(fn ($value, $field) => $this->comparable($original->{$field}) !== $this->comparable($value))
            ->keys()
            ->values()
            ->all();

        return [
            'original' => $original,
            'proposed' => $proposed,
            'changed_fields' => $changedFields,
            'becomes_public_on' => $proposed['effective_date'],
            'historical_resolution_preserved' => true,
        ];
    }

    public function create(
        SrpBulletin $original,
        array $data,
        User $actor,
        Request $request
    ): SrpBulletin {
        $preview = $this->preview($original, $data);

        return DB::transaction(function () use ($original, $preview, $data, $actor, $request) {
            $revision = SrpBulletin::create($preview['proposed'] + ['created_by' => $actor->id]);
            $this->audit->recordOrFail($request, 'srp.revision_created', $revision, [
                'original_id' => $original->id,
                'changed_fields' => $preview['changed_fields'],
                'effective_date' => $revision->effective_date?->toDateString(),
                'source_reference' => $revision->source_reference,
                'change_reason' => $data['change_reason'],
            ]);
            $this->notifications->broadcast('srp_revised', ['srp_id' => $revision->id, 'effective_date' => $revision->effective_date?->toDateString()]);

            return $revision;
        });
    }

    private function proposedAttributes(SrpBulletin $original, array $data): array
    {
        return [
            'commodity_name' => $data['commodity_name'],
            'image_path' => $data['image_path'] ?? $original->image_path,
            'category' => $data['category'] ?? $original->category,
            'unit' => $data['unit'] ?? $original->unit,
            'regulatory_classification' => $data['regulatory_classification'] ?? $original->regulatory_classification,
            'baseline_price' => (float) $data['baseline_price'],
            'effective_date' => $data['effective_date'],
            'source_reference' => $data['source_reference'],
            'commodity_key' => $original->commodity_key,
            'is_active' => true,
            'price_freeze_applicable' => (bool) $original->price_freeze_applicable,
            'price_freeze_treatment' => $original->price_freeze_treatment,
        ];
    }

    private function ensureNoConflict(SrpBulletin $original, array $proposed): void
    {
        $exists = SrpBulletin::query()
            ->whereKeyNot($original->id)
            ->where('commodity_key', $proposed['commodity_key'])
            ->whereDate('effective_date', $proposed['effective_date'])
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'effective_date' => ['A version for this commodity and effective date already exists.'],
            ]);
        }
    }

    private function requireAvailable(): void
    {
        if (! $this->catalog->capabilities()['can_publish']) {
            throw new HttpResponseException($this->unavailableResponse());
        }
    }

    private function unavailableResponse()
    {
        return response()->json([
            'status' => 'SRP_VERSIONING_UNAVAILABLE',
            'message' => 'SRP publication is unavailable until the approved versioning and audit schema is ready.',
        ], 503);
    }

    private function comparable(mixed $value): string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        return (string) $value;
    }
}
