<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
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
        $audit->record($request, 'legal.draft_previewed', 'legal_draft');
        return response()->view('notices.draft-preview', [
            'storeName' => 'Sample Store', 'commodityName' => 'Sample regulated commodity',
            'observedPrice' => '00.00', 'regulatoryPrice' => '00.00',
        ]);
    }
}
