<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SrpBulletin;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\SensitiveActionGuard;
use App\Services\Admin\SrpCatalogService;
use App\Services\Admin\SrpRevisionService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
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

    public function store(
        Request $request,
        AdminAuthorizationService $auth,
        SensitiveActionGuard $guard,
        AuditTrailService $audit
    ) {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);

        $data = $request->validate([
            'commodity_name' => 'required|string|max:255',
            'unit' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:255',
            'regulatory_classification' => 'nullable|string|max:255',
            'baseline_price' => 'required|numeric|min:0',
            'effective_date' => 'required|date',
            'source_reference' => 'required|string|max:255',
            'image_path' => 'nullable|string|max:255',
        ]);

        $commodityKey = Str::slug(trim($data['commodity_name'].' '.($data['unit'] ?? '')));

        $bulletin = SrpBulletin::create([
            'commodity_key' => $commodityKey,
            'commodity_name' => $data['commodity_name'],
            'image_path' => $data['image_path'] ?? null,
            'category' => $data['category'] ?? null,
            'unit' => $data['unit'] ?? null,
            'regulatory_classification' => $data['regulatory_classification'] ?? null,
            'baseline_price' => (float) $data['baseline_price'],
            'effective_date' => $data['effective_date'],
            'source_reference' => $data['source_reference'],
            'is_active' => true,
            'created_by' => $request->user()->id,
        ]);

        $audit->record($request, 'srp.created', $bulletin, [
            'commodity_name' => $bulletin->commodity_name,
            'baseline_price' => $bulletin->baseline_price,
            'effective_date' => $bulletin->effective_date?->toDateString(),
        ]);

        return response()->json(['data' => $bulletin], 201);
    }

    public function updateMetadata(
        Request $request,
        SrpBulletin $srp,
        AdminAuthorizationService $auth,
        SensitiveActionGuard $guard,
        AuditTrailService $audit
    ) {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);

        $data = $request->validate([
            'commodity_name' => 'required|string|max:255',
            'unit' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:255',
            'regulatory_classification' => 'nullable|string|max:255',
            'image_path' => 'nullable|string|max:255',
        ]);

        $commodityKey = Str::slug(trim($data['commodity_name'].' '.($data['unit'] ?? '')));

        $srp->update([
            'commodity_key' => $commodityKey,
            'commodity_name' => $data['commodity_name'],
            'unit' => $data['unit'] ?? null,
            'category' => $data['category'] ?? null,
            'regulatory_classification' => $data['regulatory_classification'] ?? null,
            'image_path' => $data['image_path'] ?? $srp->image_path,
        ]);

        $audit->record($request, 'srp.metadata_updated', $srp, [
            'commodity_name' => $srp->commodity_name,
        ]);

        return response()->json(['data' => $srp]);
    }

    public function batchRevisions(
        Request $request,
        AdminAuthorizationService $auth,
        SrpRevisionService $revisionService,
        SensitiveActionGuard $guard,
        AuditTrailService $audit
    ) {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);

        $data = $request->validate([
            'effective_date' => 'required|date',
            'source_reference' => 'required|string|max:255',
            'change_reason' => 'required|string|max:2000',
            'updates' => 'required|array|min:1',
            'updates.*.id' => 'required|integer|exists:srp_bulletins,id',
            'updates.*.baseline_price' => 'required|numeric|min:0',
        ]);

        $created = [];
        \Illuminate\Support\Facades\DB::transaction(function () use ($data, $request, $revisionService, &$created) {
            foreach ($data['updates'] as $update) {
                $original = SrpBulletin::findOrFail($update['id']);

                $payload = [
                    'commodity_name' => $original->commodity_name,
                    'image_path' => $original->image_path,
                    'category' => $original->category,
                    'unit' => $original->unit,
                    'regulatory_classification' => $original->regulatory_classification,
                    'baseline_price' => (float) $update['baseline_price'],
                    'effective_date' => $data['effective_date'],
                    'source_reference' => $data['source_reference'],
                    'change_reason' => $data['change_reason'],
                ];

                $revision = $revisionService->create($original, $payload, $request->user(), $request);
                $created[] = $revision;
            }
        });

        $audit->record($request, 'srp.batch_revisions_created', 'srp_batch', [
            'count' => count($created),
            'effective_date' => $data['effective_date'],
            'source_reference' => $data['source_reference'],
        ]);

        return response()->json([
            'data' => [
                'updated_count' => count($created),
                'effective_date' => $data['effective_date'],
            ],
        ], 201);
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
            'image_path' => 'nullable|string|max:255',
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
