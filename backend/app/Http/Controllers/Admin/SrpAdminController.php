<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SrpBulletin;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\SrpImportService;
use App\Services\Admin\TemporalSrpResolver;
use App\Services\Admin\SensitiveActionGuard;
use Illuminate\Http\Request;

class SrpAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => SrpBulletin::query()->orderBy('commodity_name')->orderByDesc('effective_date')->paginate(100)]);
    }
    public function preview(Request $request, AdminAuthorizationService $auth, SrpImportService $service)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => $service->preview($request->all())]);
    }
    public function import(Request $request, AdminAuthorizationService $auth, SrpImportService $service, SensitiveActionGuard $guard)
    {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);
        return response()->json(['data' => $service->import($request->all(), $request->user(), $request)], 201);
    }
    public function resolve(Request $request, AdminAuthorizationService $auth, TemporalSrpResolver $resolver)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['commodity_key' => 'required|string', 'observed_at' => 'required|date']);
        return response()->json(['data' => $resolver->resolve($data['commodity_key'], $data['observed_at'])]);
    }
}
