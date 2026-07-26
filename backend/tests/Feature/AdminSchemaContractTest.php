<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use LogicException;
use Tests\TestCase;

class AdminSchemaContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_regulatory_schema_is_additive_and_available(): void
    {
        $this->assertTrue(Schema::hasColumns('stores', [
            'vendor_user_id',
            'is_active',
            'is_verified',
            'is_public',
            'verified_at',
            'verified_by',
        ]));
        $this->assertTrue(Schema::hasColumns('srp_bulletins', [
            'commodity_key',
            'source_reference',
            'created_by',
        ]));
        $this->assertTrue(Schema::hasColumns('temporal_inspections', [
            'validation_status',
            'validated_at',
            'validated_by',
        ]));

        foreach ([
            'vendor_invitations',
            'regulatory_findings',
            'regulatory_emergencies',
            'regulatory_price_records',
            'audit_events',
        ] as $table) {
            $this->assertTrue(Schema::hasTable($table), "Missing {$table}");
        }
    }

    public function test_audit_events_are_append_only(): void
    {
        $event = AuditEvent::create([
            'action' => 'store.created',
            'subject_type' => 'store',
            'subject_id' => 7,
            'metadata' => ['safe' => true],
        ]);

        $this->expectException(LogicException::class);
        $event->update(['action' => 'store.changed']);
    }
}
