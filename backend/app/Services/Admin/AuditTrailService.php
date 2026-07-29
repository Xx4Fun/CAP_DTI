<?php

namespace App\Services\Admin;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditTrailService
{
    private const BLOCKED_KEYS = ['token', 'raw_token', 'password', 'image_vault_path', 'pdf_file_path'];

    public function record(Request $request, string $action, Model|string $subject, array $metadata = []): AuditEvent
    {
        return $this->recordAs($request, $request->user(), $action, $subject, $metadata);
    }

    public function recordAs(
        Request $request,
        ?User $actor,
        string $action,
        Model|string $subject,
        array $metadata = []
    ): AuditEvent {
        foreach (self::BLOCKED_KEYS as $key) unset($metadata[$key]);

        return AuditEvent::create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'subject_type' => $subject instanceof Model ? $subject->getMorphClass() : $subject,
            'subject_id' => $subject instanceof Model ? $subject->getKey() : null,
            'metadata' => $metadata,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
    }

    public function sanitizedMetadata(?array $metadata): array
    {
        $metadata ??= [];
        foreach (self::BLOCKED_KEYS as $key) unset($metadata[$key]);
        return $metadata;
    }
}
