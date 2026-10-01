<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LegalNotice;
use App\Models\SystemSetting;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\LegalSignatoryService;
use App\Services\Admin\SensitiveActionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Settings › Legal Signatories: who signs LOIs and SCOs, and their e-signature image. Any DTI admin (evaluator or Super Admin) may change it. */
class LegalSignatoryController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth, LegalSignatoryService $signatories)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => collect(LegalSignatoryService::TYPES)->mapWithKeys(fn ($type) => [$type => $this->summary($type, $signatories)])]);
    }

    public function update(Request $request, string $type, LegalSignatoryService $signatories, SensitiveActionGuard $guard, AuditTrailService $audit)
    {
        $type = $this->authorizeChange($request, $type, $guard);
        $data = $request->validate(['name' => ['required', 'string', 'max:80'], 'office' => ['required', 'string', 'max:80']]);
        DB::transaction(function () use ($request, $type, $data, $signatories, $audit) {
            $before = $signatories->forType($type);
            $signatories->put($type, 'name', trim($data['name']), $request->user()->id);
            $signatories->put($type, 'office', trim($data['office']), $request->user()->id);
            $audit->recordOrFail($request, 'legal.signatory_updated', "legal-signatory:$type", ['type' => $type, 'from' => $before['name'], 'to' => trim($data['name']), 'office' => trim($data['office'])]);
        });
        return response()->json(['data' => $this->summary($type, $signatories)]);
    }

    public function uploadSignature(Request $request, string $type, LegalSignatoryService $signatories, SensitiveActionGuard $guard, AuditTrailService $audit)
    {
        $type = $this->authorizeChange($request, $type, $guard);
        $request->validate(['signature' => ['required', 'file', 'mimes:png,jpeg', 'max:1024', Rule::dimensions()->maxWidth(2400)->maxHeight(1200)]]);
        $file = $request->file('signature');
        $path = $file->storeAs('legal-signatures', "$type-".Str::uuid().'.'.$file->extension(), LegalNotice::DOCUMENT_DISK);
        abort_unless($path, 503, 'Private document storage is unavailable.');
        $previous = $signatories->forType($type)['image_path'];
        try {
            DB::transaction(function () use ($request, $type, $file, $path, $signatories, $audit) {
                $hash = hash_file('sha256', $file->getRealPath());
                $signatories->put($type, 'image', $path, $request->user()->id);
                $signatories->put($type, 'image_sha256', $hash, $request->user()->id);
                $audit->recordOrFail($request, 'legal.signature_uploaded', "legal-signatory:$type", ['type' => $type, 'sha256' => $hash]);
            });
        } catch (\Throwable $error) { Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($path); throw $error; }
        // Issued PDFs embed the image bytes, so replacing the file never changes an issued notice.
        if ($previous) Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($previous);
        return response()->json(['data' => $this->summary($type, $signatories)]);
    }

    public function removeSignature(Request $request, string $type, LegalSignatoryService $signatories, SensitiveActionGuard $guard, AuditTrailService $audit)
    {
        $type = $this->authorizeChange($request, $type, $guard);
        $previous = $signatories->forType($type)['image_path'];
        DB::transaction(function () use ($request, $type, $audit) {
            SystemSetting::query()->whereIn('key', ["legal_signatory_{$type}_image", "legal_signatory_{$type}_image_sha256"])->delete();
            $audit->recordOrFail($request, 'legal.signature_removed', "legal-signatory:$type", ['type' => $type]);
        });
        if ($previous) Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($previous);
        return response()->json(['data' => $this->summary($type, $signatories)]);
    }

    /** The image itself, so Settings and the issuing evaluator can see exactly what will be stamped. */
    public function signature(Request $request, string $type, AdminAuthorizationService $auth, LegalSignatoryService $signatories)
    {
        $auth->requireManager($request->user());
        $signatory = $signatories->forType($this->type($type));
        abort_unless($signatory['image_path'], 404);
        return Storage::disk(LegalNotice::DOCUMENT_DISK)->response($signatory['image_path'], "$type-signature", ['Cache-Control' => 'no-store']);
    }

    private function authorizeChange(Request $request, string $type, SensitiveActionGuard $guard): string
    {
        // No Super Admin account exists in this deployment, so DTI evaluators manage signatories; the password re-check and audit trail still apply.
        abort_unless($request->user() && app(AdminAuthorizationService::class)->canManage($request->user()), 403, 'Only DTI staff can change legal signatories.');
        $guard->requireRecentReauthentication($request);
        return $this->type($type);
    }

    private function type(string $type): string
    {
        $type = strtoupper($type);
        abort_unless(in_array($type, LegalSignatoryService::TYPES, true), 404);
        return $type;
    }

    private function summary(string $type, LegalSignatoryService $signatories): array
    {
        $signatory = $signatories->forType($type);
        $updated = SystemSetting::query()->where('key', 'like', "legal_signatory_{$type}_%")->with('updater:id,name')->latest('updated_at')->first();
        return [
            'name' => $signatory['name'], 'office' => $signatory['office'], 'source' => $signatory['source'],
            'has_signature' => (bool) $signatory['image_path'],
            'updated_at' => $updated?->updated_at?->toIso8601String(), 'updated_by' => $updated?->updater?->name,
        ];
    }
}
