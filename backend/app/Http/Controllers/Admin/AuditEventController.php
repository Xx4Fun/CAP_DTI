<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;

class AuditEventController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $authorization, AuditTrailService $audit)
    {
        $authorization->requireManager($request->user());

        $events = AuditEvent::query()->latest('id')->limit(200)->get()->map(fn (AuditEvent $event) => [
            'id' => $event->id,
            'actor_id' => $event->actor_id,
            'action' => $event->action,
            'subject_type' => $event->subject_type,
            'subject_id' => $event->subject_id,
            'metadata' => $audit->sanitizedMetadata($event->metadata),
            'created_at' => $event->created_at,
        ]);

        return response()->json(['data' => $events]);
    }
}
