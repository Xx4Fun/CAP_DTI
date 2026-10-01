<?php

namespace App\Services\Admin;

use App\Models\LegalNotice;
use App\Models\SystemSetting;
use Illuminate\Support\Facades\Storage;

/**
 * Who signs each notice type. Names, positions, and the e-signature image are kept in system_settings by a
 * DTI admin; the legal_policy config (and its env signatory names) is the fallback.
 */
class LegalSignatoryService
{
    public const TYPES = ['LOI', 'SCO'];

    public function forType(string $type): array
    {
        $type = strtoupper($type);
        $settings = SystemSetting::query()->where('key', 'like', "legal_signatory_{$type}_%")->pluck('value', 'key');
        $fallback = config("legal_policy.rules.$type.signatory") ?? [];
        $image = $settings["legal_signatory_{$type}_image"] ?? null;

        return [
            'name' => filled($settings["legal_signatory_{$type}_name"] ?? null) ? $settings["legal_signatory_{$type}_name"] : ($fallback['name'] ?? null),
            'office' => filled($settings["legal_signatory_{$type}_office"] ?? null) ? $settings["legal_signatory_{$type}_office"] : ($fallback['office'] ?? null),
            'source' => filled($settings["legal_signatory_{$type}_name"] ?? null) ? 'settings' : 'environment',
            'image_path' => $image && Storage::disk(LegalNotice::DOCUMENT_DISK)->exists($image) ? $image : null,
            'image_sha256' => $settings["legal_signatory_{$type}_image_sha256"] ?? null,
        ];
    }

    /** Base64 data URI of the signature image, for embedding in a PDF. */
    public function imageDataUri(array $signatory): ?string
    {
        if (! $signatory['image_path']) return null;
        $disk = Storage::disk(LegalNotice::DOCUMENT_DISK);
        return 'data:'.($disk->mimeType($signatory['image_path']) ?: 'image/png').';base64,'.base64_encode($disk->get($signatory['image_path']));
    }

    public function put(string $type, string $field, ?string $value, int $userId): void
    {
        SystemSetting::query()->updateOrCreate(
            ['key' => 'legal_signatory_'.strtoupper($type).'_'.$field],
            ['value' => $value, 'category' => 'legal', 'label' => strtoupper($type).' signatory '.str_replace('_', ' ', $field), 'updated_by' => $userId],
        );
    }
}
