<?php

namespace App\Services\Admin;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class AuditTrailService
{
    private const BLOCKED_KEYS = ['token', 'raw_token', 'password', 'image_vault_path', 'pdf_file_path'];

    public function record(Request $request, string $action, Model|string $subject, array $metadata = []): ?AuditEvent
    {
        return $this->recordAs($request, $request->user(), $action, $subject, $metadata);
    }

    public function recordOrFail(
        Request $request,
        string $action,
        Model|string $subject,
        array $metadata = [],
        string $message = 'Audit trail is unavailable. This audited operation cannot be completed safely.'
    ): AuditEvent {
        $event = $this->record($request, $action, $subject, $metadata);
        if (! $event) {
            throw new HttpResponseException(response()->json([
                'status' => 'AUDIT_TRAIL_UNAVAILABLE',
                'message' => $message,
            ], 503));
        }

        return $event;
    }

    public function recordAs(
        Request $request,
        ?User $actor,
        string $action,
        Model|string $subject,
        array $metadata = []
    ): ?AuditEvent {
        foreach (self::BLOCKED_KEYS as $key) unset($metadata[$key]);

        if (! $this->available()) {
            $this->logUnavailable($action, $actor, $subject);
            return null;
        }

        try {
            return AuditEvent::create([
                'actor_id' => $actor?->id,
                'action' => $action,
                'subject_type' => $subject instanceof Model ? $subject->getMorphClass() : $subject,
                'subject_id' => $subject instanceof Model ? $subject->getKey() : null,
                'metadata' => $metadata,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        } catch (QueryException) {
            $this->logUnavailable($action, $actor, $subject);
            return null;
        }
    }

    public function available(): bool
    {
        try {
            return Schema::hasTable('audit_events');
        } catch (QueryException) {
            return false;
        }
    }

    public function sanitizedMetadata(?array $metadata): array
    {
        $metadata ??= [];
        foreach (self::BLOCKED_KEYS as $key) unset($metadata[$key]);
        return $metadata;
    }

    private function logUnavailable(string $action, ?User $actor, Model|string $subject): void
    {
        Log::error('Audit trail persistence is unavailable.', [
            'action' => $action,
            'actor_id' => $actor?->id,
            'subject_type' => $subject instanceof Model ? $subject->getMorphClass() : $subject,
            'subject_id' => $subject instanceof Model ? $subject->getKey() : null,
        ]);
    }
}
