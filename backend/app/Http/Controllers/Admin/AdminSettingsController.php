<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AdminSettingsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $systemSettings = SystemSetting::query()->pluck('value', 'key')->all();

        // Defaults if database table not populated
        $defaults = [
            'anomaly_threshold_percent' => '10.00',
            'gis_default_lat' => '10.7431',
            'gis_default_lng' => '121.9427',
            'gis_default_zoom' => '14',
            'loi_rebuttal_hours' => '48',
        ];

        $mergedSystem = array_merge($defaults, $systemSettings);

        $defaultUserPreferences = [
            'notify_anomalies' => true,
            'notify_receipts' => true,
            'notify_loi_expiry' => true,
            'ui_density' => 'comfortable',
            'inactivity_timeout_minutes' => 15,
        ];

        $userPreferences = array_merge($defaultUserPreferences, $user->preferences ?? []);

        return response()->json([
            'profile' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
            'preferences' => $userPreferences,
            'system' => $mergedSystem,
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user->id)],
            'current_password' => 'nullable|required_with:new_password|string',
            'new_password' => 'nullable|string|min:12',
        ]);

        if (!empty($validated['new_password'])) {
            if (!Hash::check($validated['current_password'], $user->password)) {
                return response()->json([
                    'message' => 'The provided current password does not match our records.',
                    'errors' => ['current_password' => ['Incorrect current password.']],
                ], 422);
            }
            $user->password = Hash::make($validated['new_password']);
        }

        $user->name = $validated['name'];
        $user->email = $validated['email'];
        $user->save();

        return response()->json([
            'message' => 'Profile updated successfully.',
            'profile' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
        ]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'notify_anomalies' => 'boolean',
            'notify_receipts' => 'boolean',
            'notify_loi_expiry' => 'boolean',
            'ui_density' => 'required|string|in:comfortable,compact',
            'inactivity_timeout_minutes' => 'required|integer|in:5,10,15,30,60',
        ]);

        $user->preferences = array_merge($user->preferences ?? [], $validated);
        $user->save();

        return response()->json([
            'message' => 'Preferences saved successfully.',
            'preferences' => $user->preferences,
        ]);
    }

    public function updateSystem(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'super_admin') {
            return response()->json(['message' => 'Unauthorized. Super Admin access required.'], 403);
        }

        $validated = $request->validate([
            'anomaly_threshold_percent' => 'required|numeric|min:0|max:100',
            'gis_default_lat' => 'required|numeric|between:-90,90',
            'gis_default_lng' => 'required|numeric|between:-180,180',
            'gis_default_zoom' => 'required|integer|between:1,20',
            'loi_rebuttal_hours' => 'required|integer|between:1,168',
        ]);

        foreach ($validated as $key => $value) {
            SystemSetting::query()->updateOrCreate(
                ['key' => $key],
                [
                    'value' => (string) $value,
                    'updated_by' => $user->id,
                ]
            );
        }

        return response()->json([
            'message' => 'System configuration updated successfully.',
            'system' => SystemSetting::query()->pluck('value', 'key')->all(),
        ]);
    }
}
