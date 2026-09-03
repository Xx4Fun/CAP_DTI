<?php

namespace App\Services;

use App\Models\User;
use App\Notifications\FieldEventNotification;
use Illuminate\Support\Facades\Notification;

class FieldNotificationService
{
    public function broadcast(string $event, array $payload = []): void
    {
        Notification::send(
            User::query()->where('role', 'field_officer')->where('is_active', true)->get(),
            new FieldEventNotification($event, $payload)
        );
    }

    public function send(User $officer, string $event, array $payload = []): void
    {
        $officer->notify(new FieldEventNotification($event, $payload));
    }
}
