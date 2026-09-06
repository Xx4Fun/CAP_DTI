<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\LegalPolicyService;
use Illuminate\Http\Request;

class LegalDraftController extends Controller
{
    public function dispatch(Request $request, AdminAuthorizationService $auth, LegalPolicyService $policy, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $availability = $policy->availability();
        $audit->record($request, 'legal.dispatch_blocked', 'legal_notice', ['status' => $availability['status']]);
        return response()->json($availability, 422);
    }
    public function preview(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'monitoring_record_id' => ['required', 'integer', 'exists:monitoring_records,id'],
            'monitoring_record_item_id' => ['required', 'integer', 'exists:monitoring_record_items,id'],
            'notice_type' => ['required', 'in:LOI,SCO'],
        ]);
        $record = MonitoringRecord::with('store:id,store_name')->findOrFail($data['monitoring_record_id']);
        $item = MonitoringRecordItem::with('bulletin:id,commodity_name')
            ->whereKey($data['monitoring_record_item_id'])
            ->where('monitoring_record_id', $record->id)
            ->where('is_anomaly', true)
            ->where('reference_status', 'available')
            ->whereNotNull('reference_value')
            ->firstOrFail();
        $audit->record($request, 'legal.draft_previewed', 'legal_draft', [
            'monitoring_record_id' => $record->id,
            'monitoring_record_item_id' => $item->id,
            'notice_type' => $data['notice_type'],
        ]);
        return response()->view('notices.draft-preview', [
            'noticeType' => $data['notice_type'],
            'storeName' => $record->store->store_name,
            'commodityName' => $item->bulletin?->commodity_name ?? 'SRP #'.$item->srp_id,
            'observedPrice' => number_format($item->recorded_price, 2),
            'regulatoryPrice' => number_format($item->reference_value, 2),
            'referenceLabel' => $item->reference_label,
            'referenceSource' => $item->reference_source,
            'referenceEffectiveDate' => $item->reference_effective_date?->toDateString(),
        ]);
    }
}
