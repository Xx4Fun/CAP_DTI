<?php

namespace App\Services\Receipt;

class ReceiptPushMessage
{
    public function forStatus(string $reference, string $status): array
    {
        return match ($status) {
            'Ready for confirmation' => [
                'title' => 'Your receipt is ready to review',
                'body' => 'Open PRICE-Watch to confirm the detected items before the report is sent to DTI.',
                'tag' => "receipt-{$reference}-ready",
                'data' => ['url' => "/reports/{$reference}/review"],
            ],
            'Needs recapture' => [
                'title' => 'Please scan your receipt again',
                'body' => 'We could not verify the capture as one continuous receipt. Open PRICE-Watch for guidance.',
                'tag' => "receipt-{$reference}-recapture",
                'data' => ['url' => "/reports/{$reference}/processing"],
            ],
            default => [
                'title' => 'Receipt processing needs attention',
                'body' => 'Open PRICE-Watch and check Recent Reports for the next step.',
                'tag' => "receipt-{$reference}-failed",
                'data' => ['url' => "/reports/{$reference}/processing"],
            ],
        };
    }
}
