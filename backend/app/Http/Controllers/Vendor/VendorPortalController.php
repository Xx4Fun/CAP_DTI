<?php

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\LegalNotice;
use App\Models\RegulatoryEmergency;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringPeriod;
use Illuminate\Http\Request;

class VendorPortalController extends Controller
{
    use ResolvesVendor;

    private const DEFAULT_PREFERENCES = [
        'sms_enabled' => false, 'sms_mobile_number' => '', 'email_enabled' => true, 'email_address' => '',
        'alert_on_loi' => true, 'alert_on_sco' => true, 'alert_deadline_24h' => true,
        'alert_price_freeze' => true, 'alert_srp_bulletin' => false,
    ];

    public function overview(Request $request)
    {
        $user = $this->vendorUser($request);
        $stores = Store::query()->where('vendor_user_id', $user->id)->with('latestMonitoringRecord')->orderBy('store_name')->get();
        $open = LegalNotice::query()->visibleToVendor($user)
            ->whereIn('status', ['issued', 'response_received'])->get(['store_id', 'notice_type'])->groupBy('store_id');
        $unread = StoreMessage::query()->where('vendor_user_id', $user->id)->where('sender_side', 'dti')->whereNull('read_at')
            ->whereIn('store_id', $stores->pluck('id'))->selectRaw('store_id, count(*) as total')->groupBy('store_id')->pluck('total', 'store_id');
        $emergency = MonitoringPeriod::effectiveEmergency(now('Asia/Manila'));

        return response()->json(['data' => [
            'user' => $user->only(['id', 'name', 'email']),
            'stores' => $stores->map(function (Store $store) use ($open, $unread) {
                $types = collect($open->get($store->id, []))->pluck('notice_type');
                return [
                    ...$store->only(['id', 'store_name', 'address', 'dti_sec_number', 'recidivism_index', 'image_path']),
                    'last_inspected_at' => $store->latestMonitoringRecord?->finalized_at?->toIso8601String(),
                    'compliance_status' => $types->contains('SCO') ? 'SHOW_CAUSE_ISSUED' : ($types->contains('LOI') ? 'UNDER_INQUIRY' : 'IN_GOOD_STANDING'),
                    'open_notice_count' => $types->count(),
                    'unread_messages' => (int) ($unread[$store->id] ?? 0),
                ];
            })->values(),
            'emergency' => $emergency ? [
                'declaration_reference' => $emergency->declaration_reference, 'location' => $emergency->location,
                'starts_on' => $emergency->starts_on?->toDateString(), 'ends_on' => $emergency->ends_on?->toDateString(),
            ] : null,
        ]]);
    }

    public function srp(Request $request, FieldReferenceResolver $references)
    {
        $this->vendorUser($request);
        // One Manila instant for selection, resolution, and protocol so a bulletin effective "today" in Manila resolves the same day.
        $at = now('Asia/Manila');
        $bulletins = SrpBulletin::query()->where('is_active', true)
            ->whereDate('effective_date', '<=', $at->toDateString())
            ->orderBy('commodity_key')->latest('effective_date')->latest('id')->get()
            ->unique(fn ($bulletin) => $bulletin->commodity_key ?: 'id:'.$bulletin->id)
            ->sortBy('commodity_name')->values();

        return response()->json(['data' => [
            'protocol' => $references->protocolAt($at),
            'items' => $bulletins->map(fn (SrpBulletin $bulletin) => [
                // commodity_key stays stable across SRP revisions (each revision is a new bulletin id).
                ...$bulletin->only(['id', 'commodity_key', 'commodity_name', 'category', 'unit', 'regulatory_classification']),
                'covered_by_price_freeze' => (bool) $bulletin->price_freeze_applicable,
                'reference' => $references->resolve($bulletin, $at),
            ])->values(),
        ]]);
    }

    public function advisories(Request $request)
    {
        $this->vendorUser($request);
        $today = now('Asia/Manila');
        $date = $today->toDateString();

        $emergencies = RegulatoryEmergency::query()->whereIn('status', ['active', 'ended'])->whereNotNull('confirmed_at')
            ->where(fn ($query) => $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today->copy()->subDays(90)->toDateString()))
            ->orderByDesc('starts_on')->get()
            ->map(function (RegulatoryEmergency $emergency) use ($date) {
                // Same inclusive Manila-date rule as MonitoringPeriod::effectiveEmergency (confirmed and status already filtered above).
                $state = $emergency->starts_on && $emergency->starts_on->toDateString() > $date
                    ? 'scheduled'
                    : ($emergency->ends_on && $emergency->ends_on->toDateString() < $date ? 'ended' : 'in_effect');

                return [
                    'id' => 'emergency-'.$emergency->id, 'category' => 'PRICE_FREEZE',
                    'title' => 'Price freeze — '.$emergency->location, 'reference' => $emergency->declaration_reference,
                    'published_date' => $emergency->starts_on?->toDateString(), 'ends_on' => $emergency->ends_on?->toDateString(),
                    'state' => $state, 'is_active' => $state === 'in_effect',
                    'affected_areas' => [$emergency->location], 'items' => [],
                ];
            });

        $bulletins = SrpBulletin::query()
            ->whereDate('effective_date', '>=', $today->copy()->subDays(30)->toDateString())
            ->whereDate('effective_date', '<=', $date)
            ->orderByDesc('effective_date')->get()
            ->groupBy(fn (SrpBulletin $bulletin) => $bulletin->source_reference ?: 'effective:'.$bulletin->effective_date->toDateString())
            ->map(fn ($group, $key) => [
                'id' => 'srp-'.md5($key), 'category' => 'SRP_UPDATE',
                'title' => 'SRP update — '.$group->count().' commodit'.($group->count() === 1 ? 'y' : 'ies'),
                'reference' => $group->first()->source_reference, 'published_date' => $group->first()->effective_date->toDateString(),
                'ends_on' => null, 'state' => 'in_effect', 'is_active' => true, 'affected_areas' => [],
                'items' => $group->map(fn ($bulletin) => ['commodity_name' => $bulletin->commodity_name, 'unit' => $bulletin->unit, 'baseline_price' => $bulletin->baseline_price])->values(),
            ])->values();

        return response()->json(['data' => $emergencies->concat($bulletins)->sortByDesc('published_date')->values()]);
    }

    public function preferences(Request $request)
    {
        $user = $this->vendorUser($request);

        return response()->json(['data' => array_merge(self::DEFAULT_PREFERENCES, ['email_address' => $user->email], $user->preferences['vendor_notifications'] ?? [])]);
    }

    public function updatePreferences(Request $request)
    {
        $user = $this->vendorUser($request);
        $data = $request->validate([
            'sms_enabled' => ['required', 'boolean'], 'email_enabled' => ['required', 'boolean'],
            'sms_mobile_number' => ['nullable', 'required_if:sms_enabled,true', 'regex:/^09\d{9}$/'],
            'email_address' => ['nullable', 'required_if:email_enabled,true', 'email', 'max:255'],
            'alert_on_loi' => ['required', 'boolean'], 'alert_on_sco' => ['required', 'boolean'], 'alert_deadline_24h' => ['required', 'boolean'],
            'alert_price_freeze' => ['required', 'boolean'], 'alert_srp_bulletin' => ['required', 'boolean'],
        ]);
        $data['sms_mobile_number'] ??= '';
        $data['email_address'] ??= '';
        $user->preferences = array_merge($user->preferences ?? [], ['vendor_notifications' => $data]);
        $user->save();

        return response()->json(['data' => $data]);
    }
}
