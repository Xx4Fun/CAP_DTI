<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\EmergencyPriceResolver;
use Illuminate\Http\Request;

class EmergencyAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => RegulatoryEmergency::latest()->get()]);
    }
    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'location' => 'required|string', 'starts_on' => 'required|date', 'ends_on' => 'nullable|date|after_or_equal:starts_on',
            'declaration_reference' => 'required|string', 'confirmed' => 'required|accepted',
        ]);
        $emergency = RegulatoryEmergency::create([
            'location' => $data['location'], 'starts_on' => $data['starts_on'], 'ends_on' => $data['ends_on'] ?? null,
            'declaration_reference' => $data['declaration_reference'], 'status' => 'active',
            'confirmed_at' => now(), 'responsible_admin_id' => $request->user()->id,
        ]);
        $audit->record($request, 'emergency.confirmed', $emergency, ['declaration_reference' => $emergency->declaration_reference, 'location' => $emergency->location]);
        return response()->json(['data' => $emergency], 201);
    }
    public function update(Request $request, RegulatoryEmergency $emergency, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'status' => 'required|in:ended,cancelled',
            'ends_on' => 'nullable|required_if:status,ended|date|after_or_equal:'.$emergency->starts_on->toDateString(),
            'confirmed' => 'required|accepted',
        ]);
        $previous = $emergency->status;
        $emergency->update([
            'status' => $data['status'],
            'ends_on' => $data['ends_on'] ?? now()->toDateString(),
        ]);
        $audit->record($request, 'emergency.status_changed', $emergency, [
            'previous_status' => $previous,
            'status' => $emergency->status,
            'ends_on' => $emergency->ends_on?->toDateString(),
        ]);
        return response()->json(['data' => $emergency->fresh()]);
    }
    public function storePrice(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'regulatory_emergency_id' => 'required|exists:regulatory_emergencies,id', 'commodity_key' => 'required|string',
            'price_type' => 'required|in:PRICE_FREEZE,APC', 'authoritative_price' => 'required|numeric|min:0',
            'effective_from' => 'required|date', 'effective_until' => 'nullable|date|after_or_equal:effective_from',
            'location' => 'sometimes|string', 'declaration_reference' => 'sometimes|string', 'source_reference' => 'required|string',
        ]);
        $emergency = RegulatoryEmergency::findOrFail($data['regulatory_emergency_id']);
        abort_unless($emergency->status === 'active', 422, 'Regulatory emergency is not active.');
        $effectiveFrom = \Illuminate\Support\Carbon::parse($data['effective_from']);
        $effectiveUntil = isset($data['effective_until']) ? \Illuminate\Support\Carbon::parse($data['effective_until']) : null;
        if ($effectiveFrom->lt($emergency->starts_on)
            || ($emergency->ends_on && $effectiveFrom->gt($emergency->ends_on))
            || ($emergency->ends_on && $effectiveUntil && $effectiveUntil->gt($emergency->ends_on))) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'effective_from' => ['Emergency price dates must remain within the declaration dates.'],
            ]);
        }
        $data['location'] = $emergency->location;
        $data['declaration_reference'] = $emergency->declaration_reference;
        $record = RegulatoryPriceRecord::create($data + ['created_by' => $request->user()->id]);
        $audit->record($request, 'emergency_price.created', $record, ['price_type' => $record->price_type, 'source_reference' => $record->source_reference]);
        return response()->json(['data' => $record], 201);
    }
    public function resolve(Request $request, AdminAuthorizationService $auth, EmergencyPriceResolver $resolver)
    {
        abort_unless($auth->canViewAnalytics($request->user()), 403);
        $data = $request->validate(['commodity_key' => 'required|string', 'location' => 'required|string', 'observed_at' => 'required|date']);
        return response()->json($resolver->resolve($data['commodity_key'], $data['location'], $data['observed_at']));
    }
}
