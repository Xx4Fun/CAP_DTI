<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class FieldEventNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly string $event, public readonly array $payload = []) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return ['event' => $this->event, 'payload' => $this->payload];
    }
}
