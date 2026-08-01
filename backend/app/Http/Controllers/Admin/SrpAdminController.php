<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SrpBulletin;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\SensitiveActionGuard;
use App\Services\Admin\SrpCatalogService;
use App\Services\Admin\SrpImportService;
use App\Services\Admin\TemporalSrpResolver;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

class SrpAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());

        return response()->json([
            'data' => SrpBulletin::query()
                ->orderBy('commodity_name')
                ->orderByDesc('effective_date')
                ->paginate(100),
        ]);
    }

    public function preview(
        Request $request,
        AdminAuthorizationService $auth,
        SrpImportService $service,
        SrpCatalogService $catalog
    ) {
        $auth->requireManager($request->user());
        $this->requireVersioning($catalog);

        return response()->json(['data' => $service->preview($request->all())]);
    }

    public function import(
        Request $request,
        AdminAuthorizationService $auth,
        SrpImportService $service,
        SensitiveActionGuard $guard,
        SrpCatalogService $catalog
    ) {
        $auth->requireManager($request->user());
        $this->requireVersioning($catalog);
        $guard->requireRecentReauthentication($request);

        return response()->json([
            'data' => $service->import($request->all(), $request->user(), $request),
        ], 201);
    }

    public function resolve(
        Request $request,
        AdminAuthorizationService $auth,
        TemporalSrpResolver $resolver,
        SrpCatalogService $catalog
    ) {
        $auth->requireManager($request->user());
        $this->requireVersioning($catalog);
        $data = $request->validate([
            'commodity_key' => 'required|string',
            'observed_at' => 'required|date',
        ]);

        return response()->json([
            'data' => $resolver->resolve($data['commodity_key'], $data['observed_at']),
        ]);
    }

    public function uploadImage(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());

        $request->validate([
            'image' => 'required|image|mimes:webp,jpeg,png,jpg|max:2048',
        ]);

        $path = $request->file('image')->store('commodity_images', 'public');

        return response()->json([
            'data' => [
                'image_path' => $path,
                'url' => asset('storage/' . $path),
            ],
        ], 201);
    }

    private function requireVersioning(SrpCatalogService $catalog): void
    {
        if ($catalog->capabilities()['can_publish']) {
            return;
        }

        throw new HttpResponseException(response()->json([
            'status' => 'SRP_VERSIONING_UNAVAILABLE',
            'message' => 'SRP publication is unavailable until the approved versioning and audit schema is ready.',
        ], 503));
    }
}
