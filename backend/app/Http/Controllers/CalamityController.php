<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class CalamityController extends Controller
{
    public function show()
    {
        $status = Cache::get('state_of_calamity', false);
        return response()->json([
            'state_of_calamity' => $status
        ]);
    }

    public function toggle(Request $request)
    {
        $request->validate([
            'state' => 'required|boolean',
        ]);

        Cache::put('state_of_calamity', $request->state);

        return response()->json([
            'message' => 'State of Calamity setting updated.',
            'state_of_calamity' => $request->state
        ]);
    }
}
