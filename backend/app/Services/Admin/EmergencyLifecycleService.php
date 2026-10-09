<?php

namespace App\Services\Admin;

use App\Models\RegulatoryEmergency;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

class EmergencyLifecycleService
{
    public function __construct(private AuditTrailService $audit) {}

    public function dateExpired(RegulatoryEmergency $emergency): bool
    {
        return $emergency->ends_on && $emergency->ends_on->toDateString() < now('Asia/Manila')->toDateString();
    }

    public function lockHeld(RegulatoryEmergency $emergency): bool
    {
        // Either unique constraint can reserve activation, including legacy rows missing the scope key.
        return $emergency->status === 'active' || $emergency->active_scope_key !== null;
    }

    public function requireUnexpiredDates(RegulatoryEmergency $emergency): void
    {
        if ($this->dateExpired($emergency)) {
            throw new HttpResponseException(response()->json([
                'status' => 'EMERGENCY_DATE_EXPIRED',
                'message' => 'Cannot activate this expired declaration. Its end date is '.$emergency->ends_on->toDateString().' (Asia/Manila). Prepare a declaration with the correct effective dates.',
            ], 422));
        }
    }

    public function canReleaseExpiredLock(RegulatoryEmergency $emergency): bool
    {
        return in_array($emergency->status, ['active', 'ended'], true)
            && $this->dateExpired($emergency) && $this->lockHeld($emergency);
    }

    public function flags(RegulatoryEmergency $emergency): array
    {
        return [
            'activation_lock_held' => $this->lockHeld($emergency),
            'can_release_expired_lock' => $this->canReleaseExpiredLock($emergency),
        ];
    }

    /** Caller holds the preparation advisory lock and the declaration row lock within its transaction. */
    public function releaseExpiredLock(RegulatoryEmergency $emergency, Request $request, string $mode): void
    {
        abort_unless($this->canReleaseExpiredLock($emergency), 409, 'Only an expired declaration retaining an activation lock can be recovered.');
        $previous = $emergency->status;
        $previousKey = $emergency->active_scope_key;
        // Natural expiry keeps the original inclusive date boundary, not a new manual cutoff.
        $emergency->update(['status' => 'ended', 'active_scope_key' => null]);
        $this->audit->recordOrFail($request, 'emergency.expired_lock_released', $emergency, [
            'declaration_reference' => $emergency->declaration_reference,
            'previous_status' => $previous,
            'previous_active_scope_key' => $previousKey,
            'original_ends_on' => $emergency->ends_on->toDateString(),
            'recovery_mode' => $mode,
        ]);
    }

    /** Serialized with activation/ending; unrelated malformed locks remain blockers for explicit investigation. */
    public function recoverExpiredLocksAndFindBlocker(Request $request): ?RegulatoryEmergency
    {
        $records = RegulatoryEmergency::query()
            ->where(fn ($query) => $query->where('status', 'active')->orWhereNotNull('active_scope_key'))
            ->orderBy('id')->lockForUpdate()->get();
        foreach ($records as $record) {
            if (! $this->canReleaseExpiredLock($record)) {
                return $record;
            }
        }
        foreach ($records as $record) {
            $this->releaseExpiredLock($record, $request, 'automatic');
        }

        return null;
    }
}
