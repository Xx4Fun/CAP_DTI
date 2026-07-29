<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SrpBulletin;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\SensitiveActionGuard;
use App\Services\Admin\SrpCatalogService;
use App\Services\Admin\SrpRevisionService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SrpManagementController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth, SrpCatalogService $catalog)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'query' => 'sometimes|nullable|string|max:255',
            'view' => ['sometimes', Rule::in(['current', 'scheduled', 'history'])],
            'category' => 'sometimes|nullable|string|max:255',
            'page' => 'sometimes|integer|min:1',
            'per_page' => 'sometimes|integer|min:1|max:100',
        ]);

        return response()->json([
            'data' => $catalog->paginate($filters),
            'capabilities' => $catalog->capabilities(),
        ]);
    }

    public function previewRevision(
        Request $request,
        SrpBulletin $srp,
        AdminAuthorizationService $auth,
        SrpRevisionService $service
    ) {
        $auth->requireManager($request->user());

        return response()->json([
            'data' => $service->preview($srp, $this->validateRevision($request, $srp)),
        ]);
    }

    public function storeRevision(
        Request $request,
        SrpBulletin $srp,
        AdminAuthorizationService $auth,
        SrpRevisionService $service,
        SensitiveActionGuard $guard
    ) {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);

        $revision = $service->create(
            $srp,
            $this->validateRevision($request, $srp),
            $request->user(),
            $request
        );

        return response()->json(['data' => $revision], 201);
    }

    private function validateRevision(Request $request, SrpBulletin $srp): array
    {
        return $request->validate([
            'commodity_name' => 'required|string|max:255',
            'category' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:255',
            'regulatory_classification' => 'nullable|string|max:255',
            'baseline_price' => 'required|numeric|min:0',
            'effective_date' => 'required|date|after:'.$srp->effective_date->toDateString(),
            'source_reference' => 'required|string|max:255',
            'change_reason' => 'required|string|max:2000',
        ]);
    }
}
