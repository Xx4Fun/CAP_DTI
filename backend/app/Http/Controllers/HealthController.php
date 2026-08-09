<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function ready(): JsonResponse
    {
        try {
            DB::selectOne('select 1');

            return response()->json([
                'status' => 'ready',
                'checks' => [
                    'app' => 'ok',
                    'database' => 'ok',
                ],
                'checked_at' => now()->toIso8601String(),
            ])->header('Cache-Control', 'no-store, private');
        } catch (Throwable) {
            return response()->json([
                'status' => 'not_ready',
                'checks' => [
                    'app' => 'ok',
                    'database' => 'error',
                ],
                'checked_at' => now()->toIso8601String(),
            ], 503)->header('Cache-Control', 'no-store, private');
        }
    }
}
