<?php

namespace App\Services\Receipt;

use App\Models\WebPushSubscription;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use RuntimeException;

class ReceiptPushSender
{
    public function send(WebPushSubscription $storedSubscription, array $payload): array
    {
        $configuration = config('services.receipt_push');
        if (! ($configuration['enabled'] ?? false)) {
            return ['success' => false, 'expired' => false, 'skipped' => true, 'reason' => 'disabled'];
        }

        foreach (['subject', 'public_key', 'private_key'] as $key) {
            if (empty($configuration[$key])) {
                throw new RuntimeException("Receipt Web Push {$key} is not configured.");
            }
        }

        $webPush = new WebPush([
            'VAPID' => [
                'subject' => $configuration['subject'],
                'publicKey' => $configuration['public_key'],
                'privateKey' => $configuration['private_key'],
            ],
        ]);
        $webPush->queueNotification(
            Subscription::create($storedSubscription->subscription_json),
            json_encode($payload, JSON_THROW_ON_ERROR),
            ['TTL' => 3600, 'urgency' => 'normal'],
        );

        foreach ($webPush->flush() as $report) {
            return [
                'success' => $report->isSuccess(),
                'expired' => $report->isSubscriptionExpired(),
                'skipped' => false,
                'reason' => $report->getReason(),
            ];
        }

        return ['success' => false, 'expired' => false, 'skipped' => false, 'reason' => 'No delivery report returned.'];
    }
}
