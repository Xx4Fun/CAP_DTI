<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class AdminSrpManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'srp-evaluator@dti.test',
            'password' => 'secret-password',
            'role' => 'dti_evaluator',
        ]);

        Sanctum::actingAs($this->admin);
    }

    public function test_admin_srp_list_supports_search_filters_and_laravel_pagination_metadata(): void
    {
        foreach ([
            ['Premium Rice', 'Rice', 'premium-rice-1kg'],
            ['Regular Rice', 'Rice', 'regular-rice-1kg'],
            ['Brown Rice', 'Rice', 'brown-rice-1kg'],
            ['Canned Tuna', 'Canned Goods', 'canned-tuna-155g'],
        ] as [$name, $category, $key]) {
            SrpBulletin::create([
                'commodity_name' => $name,
                'category' => $category,
                'unit' => '1kg',
                'commodity_key' => $key,
                'baseline_price' => 50,
                'effective_date' => '2026-05-11',
                'source_reference' => 'DTI-SRP-2026-05',
                'is_active' => true,
            ]);
        }

        $this->getJson('/api/admin/srp?view=history&query=rice&category=Rice&per_page=2&page=2')
            ->assertOk()
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.per_page', 2)
            ->assertJsonPath('data.total', 3)
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('capabilities.can_publish', true);
    }

    public function test_revision_preview_and_creation_append_a_new_version_without_overwriting_history(): void
    {
        $original = SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 48,
            'effective_date' => '2026-05-11',
            'source_reference' => 'DTI-SRP-2026-05',
            'is_active' => true,
        ]);

        $payload = [
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 50.25,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-2026-08',
            'change_reason' => 'Approved August bulletin.',
        ];

        $this->postJson("/api/admin/srp/{$original->id}/revisions/preview", $payload)
            ->assertOk()
            ->assertJsonPath('data.original.id', $original->id)
            ->assertJsonPath('data.proposed.baseline_price', 50.25)
            ->assertJsonPath('data.becomes_public_on', '2026-08-01');

        $response = $this->postJson("/api/admin/srp/{$original->id}/revisions", $payload)
            ->assertCreated()
            ->assertJsonPath('data.commodity_key', 'premium-rice-1kg')
            ->assertJsonPath('data.baseline_price', 50.25);

        $original->refresh();
        $this->assertSame(48.0, $original->baseline_price);
        $this->assertNotSame($original->id, $response->json('data.id'));
        $this->assertDatabaseHas('audit_events', [
            'action' => 'srp.revision_created',
            'subject_id' => $response->json('data.id'),
        ]);
    }

    public function test_srp_revision_fails_closed_when_audit_storage_is_unavailable(): void
    {
        $original = SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'unit' => '1kg',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 48,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        Schema::drop('audit_events');

        $this->postJson("/api/admin/srp/{$original->id}/revisions", [
            'commodity_name' => 'Premium Rice',
            'unit' => '1kg',
            'baseline_price' => 50.25,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-2026-08',
            'change_reason' => 'Approved August bulletin.',
        ])
            ->assertStatus(503)
            ->assertJsonPath('status', 'SRP_VERSIONING_UNAVAILABLE');

        $this->assertSame(1, SrpBulletin::count());
    }

    public function test_public_catalog_publishes_only_the_date_correct_version_and_hides_internal_fields(): void
    {
        Carbon::setTestNow('2026-07-30 12:00:00');

        SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 48,
            'effective_date' => '2026-05-11',
            'source_reference' => 'DTI-SRP-2026-05',
            'created_by' => $this->admin->id,
            'is_active' => true,
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 50.25,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-2026-08',
            'created_by' => $this->admin->id,
            'is_active' => true,
        ]);

        $this->getJson('/api/public/commodities?query=rice')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.baseline_price', 48)
            ->assertJsonMissingPath('data.0.created_by')
            ->assertJsonMissingPath('data.0.source_reference')
            ->assertJsonMissingPath('data.0.commodity_key');

        Carbon::setTestNow('2026-08-02 12:00:00');

        $this->getJson('/api/public/commodities?query=rice')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.baseline_price', 50.25)
            ->assertJsonPath('data.0.effective_date', '2026-08-01');
    }
}
