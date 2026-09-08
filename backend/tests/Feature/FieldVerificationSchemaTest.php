<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class FieldVerificationSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_field_verification_and_notification_schema_is_available_without_breaking_existing_records(): void
    {
        $this->assertTrue(Schema::hasTable('notifications'));
        $this->assertTrue(Schema::hasTable('field_verification_requests'));
        $this->assertTrue(Schema::hasColumns('field_verification_requests', [
            'consumer_report_id', 'store_id', 'requested_by', 'claimed_by', 'source_type', 'status',
            'reason', 'context_json', 'requested_at', 'claimed_at', 'released_at',
            'completed_at', 'cancelled_at',
        ]));
        $this->assertTrue(Schema::hasColumn('monitoring_records', 'field_verification_request_id'));
        $this->assertTrue(Schema::hasColumns('monitoring_record_items', [
            'reference_status', 'reference_type', 'reference_label', 'reference_value',
            'reference_source', 'reference_effective_date',
        ]));
    }
}
