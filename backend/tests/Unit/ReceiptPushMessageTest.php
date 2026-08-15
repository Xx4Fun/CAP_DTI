<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptPushMessage;
use PHPUnit\Framework\TestCase;

class ReceiptPushMessageTest extends TestCase
{
    public function test_ready_message_contains_only_safe_resume_routing_information(): void
    {
        $message = (new ReceiptPushMessage)->forStatus('REP-20260816-SAFE', 'Ready for confirmation');
        $encoded = json_encode($message);

        $this->assertSame('Your receipt is ready to review', $message['title']);
        $this->assertSame('/reports/REP-20260816-SAFE/review', $message['data']['url']);
        $this->assertSame('receipt-REP-20260816-SAFE-ready', $message['tag']);
        $this->assertStringNotContainsString('token', strtolower($encoded));
        $this->assertStringNotContainsString('observed_price', strtolower($encoded));
        $this->assertStringNotContainsString('trk_', strtolower($encoded));
        $this->assertStringNotContainsString('rsm_', strtolower($encoded));
        $this->assertArrayNotHasKey('receipt', $message);
    }

    public function test_recapture_message_routes_to_the_processing_screen(): void
    {
        $message = (new ReceiptPushMessage)->forStatus('REP-20260816-RETRY', 'Needs recapture');

        $this->assertSame('Please scan your receipt again', $message['title']);
        $this->assertSame('/reports/REP-20260816-RETRY/processing', $message['data']['url']);
    }
}
