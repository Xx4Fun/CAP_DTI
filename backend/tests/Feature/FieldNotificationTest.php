<?php

namespace Tests\Feature;

use App\Models\ConsumerReport;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldNotificationTest extends TestCase
{
    use RefreshDatabase;

    private function officer(string $email, bool $active = true): User
    {
        return User::create([
            'name' => $email, 'email' => $email, 'password' => 'secure-password',
            'role' => 'field_officer', 'is_active' => $active,
        ]);
    }

    private function admin(): User
    {
        return User::create([
            'name' => 'Notification Admin', 'email' => 'notification-admin@dti.test',
            'password' => 'password', 'role' => 'dti_evaluator',
        ]);
    }

    private function store(): Store
    {
        return Store::create([
            'dti_sec_number' => 'NOTIFY-STORE', 'store_name' => 'Notify Store',
            'owner_name' => 'Owner', 'latitude' => 10.7, 'longitude' => 122.0,
            'address' => 'Antique', 'is_active' => true,
        ]);
    }

    private function insertNotification(User $officer, string $event): string
    {
        $id = (string) Str::uuid();
        DB::table('notifications')->insert([
            'id' => $id, 'type' => 'App\\Notifications\\FieldEventNotification',
            'notifiable_type' => User::class, 'notifiable_id' => $officer->id,
            'data' => json_encode(['event' => $event, 'payload' => []]),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }

    public function test_field_notification_list_and_read_actions_are_scoped_to_the_current_officer(): void
    {
        $officer = $this->officer('notification-one@dti.test');
        $other = $this->officer('notification-two@dti.test');
        $ownOne = $this->insertNotification($officer, 'one');
        $ownTwo = $this->insertNotification($officer, 'two');
        foreach (range(3, 12) as $number) $this->insertNotification($officer, 'event-'.$number);
        $otherId = $this->insertNotification($other, 'private-other');
        Sanctum::actingAs($officer->fresh(), ['field-monitoring']);

        $this->getJson('/api/field/notifications?per_page=10')->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.total', 12)
            ->assertJsonPath('unread_count', 12);
        $this->postJson("/api/field/notifications/{$otherId}/read")->assertNotFound();
        $this->postJson("/api/field/notifications/{$ownOne}/read")
            ->assertOk()->assertJsonPath('data.read_at', fn ($value) => $value !== null);
        $this->assertDatabaseMissing('notifications', ['id' => $ownOne, 'read_at' => null]);

        $this->postJson('/api/field/notifications/read-all')->assertOk()->assertJsonPath('data.unread_count', 0);
        $this->assertDatabaseMissing('notifications', ['id' => $ownTwo, 'read_at' => null]);
        $this->assertDatabaseHas('notifications', ['id' => $otherId, 'read_at' => null]);
        $this->getJson('/api/field/notifications?per_page=10')->assertOk()->assertJsonPath('unread_count', 0);
    }

    public function test_admin_regulatory_events_broadcast_only_to_active_field_officers(): void
    {
        $active = $this->officer('notification-active@dti.test');
        $inactive = $this->officer('notification-inactive@dti.test', false);
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $store = $this->store();
        $report = ConsumerReport::create([
            'report_reference' => 'NOTIFY-REPORT', 'tracking_token_hash' => hash('sha256', 'token'),
            'submission_uuid' => 'notify-submission', 'store_id' => $store->id,
            'status' => 'Under initial evaluation',
        ]);

        $this->postJson("/api/admin/reports/{$report->id}/verification-request", ['reason' => 'Visit required.', 'field_officer_id' => $active->id])
            ->assertCreated();
        $this->assertSame('verification_assigned', $active->fresh()->notifications()->latest()->first()?->data['event'] ?? null);
        $this->assertSame(0, $inactive->notifications()->count());

        $srpId = $this->postJson('/api/admin/srp', [
            'commodity_name' => 'Rice', 'unit' => 'kg', 'baseline_price' => 50,
            'effective_date' => '2026-08-01', 'source_reference' => 'SRP-2026-08',
        ])->assertCreated()->json('data.id');
        $this->assertDatabaseHas('notifications', ['notifiable_id' => $active->id]);
        $this->assertTrue($active->fresh()->notifications->contains(fn ($notification) => $notification->data['event'] === 'srp_published'));

        $this->postJson("/api/admin/srp/{$srpId}/revisions", [
            'commodity_name' => 'Rice', 'unit' => 'kg', 'baseline_price' => 52,
            'effective_date' => '2026-09-01', 'source_reference' => 'SRP-2026-09',
            'change_reason' => 'Approved revision.',
        ])->assertCreated();
        $this->assertTrue($active->fresh()->notifications->contains(fn ($notification) => $notification->data['event'] === 'srp_revised'));

        $emergencyId = $this->postJson('/api/admin/emergencies', [
            'location' => 'Display metadata', 'starts_on' => '2026-08-01',
            'declaration_reference' => 'DECL-NOTIFY', 'confirmed' => true,
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/admin/emergency-prices', [
            'regulatory_emergency_id' => $emergencyId, 'commodity_key' => 'rice-kg',
            'price_type' => 'APC', 'authoritative_price' => 49, 'effective_from' => '2026-08-01',
            'source_reference' => 'APC-NOTIFY',
        ])->assertCreated();
        $this->patchJson("/api/admin/emergencies/{$emergencyId}", [
            'status' => 'ended', 'ends_on' => '2026-08-31', 'confirmed' => true,
        ])->assertOk();

        $events = $active->fresh()->notifications->pluck('data')->pluck('event');
        $this->assertTrue($events->contains('emergency_activated'));
        $this->assertTrue($events->contains('emergency_price_created'));
        $this->assertTrue($events->contains('emergency_ended'));

        $cancelId = $this->postJson('/api/admin/emergencies', [
            'location' => 'Display metadata', 'starts_on' => '2026-09-01',
            'declaration_reference' => 'DECL-CANCEL', 'confirmed' => true,
        ])->assertCreated()->json('data.id');
        $this->patchJson("/api/admin/emergencies/{$cancelId}", [
            'status' => 'cancelled', 'confirmed' => true,
        ])->assertOk();
        $this->assertTrue($active->fresh()->notifications->contains(fn ($notification) => $notification->data['event'] === 'emergency_cancelled'));
    }
}
