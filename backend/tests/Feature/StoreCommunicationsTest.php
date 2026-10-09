<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\LegalNotice;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StoreCommunicationsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $vendor;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        $this->admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $this->vendor = User::create(['name' => 'Vendor A', 'email' => 'a@vendor.test', 'password' => 'password', 'role' => 'vendor']);
        $this->store = Store::create(['store_name' => 'Linked Store', 'address' => 'San Jose, Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $this->vendor->id]);
    }

    public function test_dti_and_vendor_exchange_messages_with_read_state(): void
    {
        $first = $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", ['body' => 'Please confirm your rice price.'])
            ->assertCreated()->assertJsonPath('data.sender_side', 'dti')->json('data.id');
        $this->assertDatabaseHas('store_messages', ['id' => $first, 'vendor_user_id' => $this->vendor->id, 'read_at' => null]);

        $this->asVendor($this->vendor)->getJson('/api/vendor/overview')->assertJsonPath('data.stores.0.unread_messages', 1);
        $this->asVendor($this->vendor)->getJson("/api/vendor/conversations/{$this->store->id}")
            ->assertOk()->assertJsonCount(1, 'data.messages')->assertJsonPath('data.messages.0.sender_name', 'DTI');
        $this->assertNotNull(StoreMessage::find($first)->read_at);
        $this->asVendor($this->vendor)->getJson('/api/vendor/overview')->assertJsonPath('data.stores.0.unread_messages', 0);

        $reply = $this->asVendor($this->vendor)->postJson("/api/vendor/conversations/{$this->store->id}/messages", ['body' => 'Our supplier raised prices.'])
            ->assertCreated()->json('data.id');
        $this->asAdmin()->getJson('/api/admin/conversations')->assertJsonPath('data.data.0.unread_count', 1)
            ->assertJsonPath('data.data.0.last_message.preview', 'Our supplier raised prices.');

        // A poll returns the latest page whole, so DTI sees its earlier message flip to read.
        $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}")
            ->assertOk()->assertJsonCount(2, 'data.messages')->assertJsonPath('data.messages.1.id', $reply)
            ->assertJsonPath('data.messages.0.id', $first)->assertJsonPath('data.messages.0.read_at', fn ($value) => $value !== null);
        $this->assertNotNull(StoreMessage::find($reply)->read_at);
    }

    public function test_vendor_cannot_read_or_write_another_vendors_store(): void
    {
        $other = User::create(['name' => 'Vendor B', 'email' => 'b@vendor.test', 'password' => 'password', 'role' => 'vendor']);
        $this->asVendor($other)->getJson("/api/vendor/conversations/{$this->store->id}")->assertForbidden()->assertJsonPath('status', 'STORE_ACCESS_DENIED');
        $this->asVendor($other)->postJson("/api/vendor/conversations/{$this->store->id}/messages", ['body' => 'hello'])->assertForbidden();
        $this->assertSame(0, StoreMessage::count());
    }

    public function test_relinked_vendor_sees_none_of_the_previous_vendors_messages_or_notices(): void
    {
        $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", ['body' => 'Private to vendor A'])->assertCreated();
        $notice = LegalNotice::create([
            'store_id' => $this->store->id, 'vendor_user_id' => $this->vendor->id, 'notice_type' => 'LOI', 'status' => 'closed',
            'issued_at' => now()->subDays(3), 'closed_at' => now(), 'response_text' => 'Vendor A private explanation',
            'deadline_rules' => LegalNoticeTest::DEADLINE_RULES,
        ]);

        $replacement = User::create(['name' => 'Vendor B', 'email' => 'b@vendor.test', 'password' => 'password', 'role' => 'vendor']);
        $this->store->forceFill(['vendor_user_id' => $replacement->id])->save();

        $this->asVendor($replacement)->getJson("/api/vendor/conversations/{$this->store->id}")
            ->assertOk()->assertJsonCount(0, 'data.messages')->assertJsonCount(0, 'data.notices');
        $this->asVendor($replacement)->getJson('/api/vendor/notices')->assertOk()->assertJsonCount(0);
        $this->asVendor($replacement)->getJson("/api/vendor/notices/{$notice->id}")->assertForbidden();
        $this->asVendor($replacement)->getJson("/api/vendor/notices/{$notice->id}/document")->assertForbidden();
        $this->asVendor($replacement)->getJson('/api/vendor/overview')->assertJsonPath('data.stores.0.open_notice_count', 0);

        // DTI keeps the full history, labelled by the vendor each message was exchanged with.
        $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}")
            ->assertJsonCount(1, 'data.messages')->assertJsonPath('data.messages.0.vendor_user_id', $this->vendor->id);
    }

    public function test_unlinked_store_with_history_stays_listed_but_cannot_be_messaged(): void
    {
        $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", ['body' => 'Before unlink'])->assertCreated();
        $this->store->forceFill(['vendor_user_id' => null])->save();
        Store::create(['store_name' => 'Never Linked', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121]);

        $this->asAdmin()->getJson('/api/admin/conversations')->assertOk()
            ->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.linked', false);
        $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", ['body' => 'After unlink'])->assertUnprocessable();
        $this->assertSame(1, StoreMessage::count());
    }

    public function test_attachments_are_private_type_checked_and_scoped_to_the_audience(): void
    {
        $id = $this->asVendor($this->vendor)->post("/api/vendor/conversations/{$this->store->id}/messages",
            ['attachment' => UploadedFile::fake()->image('shelf.png')], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $message = StoreMessage::findOrFail($id);
        Storage::disk(LegalNotice::DOCUMENT_DISK)->assertExists($message->attachment_path);
        $this->assertSame('shelf.png', $message->attachment_name);

        $this->asAdmin()->get("/api/admin/conversations/{$this->store->id}/messages/$id/attachment")->assertOk();
        $this->asVendor($this->vendor)->get("/api/vendor/conversations/{$this->store->id}/messages/$id/attachment")->assertOk();
        $this->assertDatabaseHas('audit_events', ['action' => 'store.message_attachment_accessed', 'subject_id' => $id]);

        $other = User::create(['name' => 'Vendor B', 'email' => 'b@vendor.test', 'password' => 'password', 'role' => 'vendor']);
        $this->asVendor($other)->get("/api/vendor/conversations/{$this->store->id}/messages/$id/attachment")->assertForbidden();

        $this->asAdmin()->post("/api/admin/conversations/{$this->store->id}/messages",
            ['attachment' => UploadedFile::fake()->create('script.svg', 2, 'image/svg+xml')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", [])->assertUnprocessable();
        $this->assertSame(1, StoreMessage::count());
    }

    public function test_message_posting_is_throttled(): void
    {
        for ($i = 0; $i < 30; $i++) {
            $this->asVendor($this->vendor)->postJson("/api/vendor/conversations/{$this->store->id}/messages", ['body' => "m$i"])->assertCreated();
        }
        $this->asVendor($this->vendor)->postJson("/api/vendor/conversations/{$this->store->id}/messages", ['body' => 'one too many'])->assertStatus(429);
    }

    public function test_history_pages_backwards_and_only_returned_messages_are_marked_read(): void
    {
        foreach (range(1, 105) as $i) {
            StoreMessage::create(['store_id' => $this->store->id, 'vendor_user_id' => $this->vendor->id, 'sender_id' => $this->vendor->id, 'sender_side' => 'vendor', 'body' => "m$i"]);
        }
        $latest = $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}")
            ->assertJsonCount(100, 'data.messages')->assertJsonPath('data.has_more', true)->assertJsonPath('data.messages.0.body', 'm6');
        $this->assertSame(5, StoreMessage::whereNull('read_at')->count());

        $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}?before_id=".$latest->json('data.messages.0.id'))
            ->assertJsonCount(5, 'data.messages')->assertJsonPath('data.has_more', false)->assertJsonPath('data.messages.0.body', 'm1');
        $this->assertSame(0, StoreMessage::whereNull('read_at')->count());
    }

    public function test_admin_thread_names_the_vendor_each_message_was_exchanged_with(): void
    {
        $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", ['body' => 'Hello'])->assertCreated();
        $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}")->assertJsonPath('data.messages.0.vendor_name', 'Vendor A');
    }

    public function test_vendor_edits_and_deletes_only_their_own_messages(): void
    {
        $base = "/api/vendor/conversations/{$this->store->id}/messages";
        $own = $this->asVendor($this->vendor)->postJson($base, ['body' => 'Rice is 52 per kilo.'])->assertCreated()->json('data.id');
        $dti = $this->asAdmin()->postJson("/api/admin/conversations/{$this->store->id}/messages", ['body' => 'Noted.'])->assertCreated()->json('data.id');

        $this->asVendor($this->vendor)->patchJson("$base/$own", ['body' => 'Rice is 50 per kilo.'])
            ->assertOk()->assertJsonPath('data.body', 'Rice is 50 per kilo.')->assertJsonPath('data.edited_at', fn ($value) => $value !== null);
        $this->assertSame('Rice is 52 per kilo.', \App\Models\AuditEvent::where('action', 'vendor.message_edited')->where('subject_id', $own)->firstOrFail()->metadata['previous_body']);
        $this->asVendor($this->vendor)->patchJson("$base/$own", ['body' => ''])->assertUnprocessable();

        $this->asVendor($this->vendor)->patchJson("$base/$dti", ['body' => 'Rewritten'])->assertNotFound();
        $this->asVendor($this->vendor)->deleteJson("$base/$dti")->assertNotFound();
        $other = User::create(['name' => 'Vendor B', 'email' => 'b@vendor.test', 'password' => 'password', 'role' => 'vendor']);
        $this->asVendor($other)->deleteJson("$base/$own")->assertForbidden();

        $this->asVendor($this->vendor)->deleteJson("$base/$own")
            ->assertOk()->assertJsonPath('data.body', null)->assertJsonPath('data.deleted_at', fn ($value) => $value !== null);
        $this->assertDatabaseHas('audit_events', ['action' => 'vendor.message_deleted', 'subject_id' => $own]);
        // The row and its text stay on record; both sides only ever receive the placeholder.
        $this->assertSame('Rice is 50 per kilo.', StoreMessage::findOrFail($own)->body);
        $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}")->assertJsonPath('data.messages.0.body', null)
            ->assertJsonPath('data.messages.0.deleted_at', fn ($value) => $value !== null)->assertJsonPath('data.messages.1.body', 'Noted.');
        $this->asVendor($this->vendor)->patchJson("$base/$own", ['body' => 'Back again'])->assertNotFound();
        $this->asVendor($this->vendor)->deleteJson("$base/$own")->assertNotFound();
    }

    public function test_deleted_message_hides_its_attachment_and_list_preview(): void
    {
        $base = "/api/vendor/conversations/{$this->store->id}/messages";
        $id = $this->asVendor($this->vendor)->post($base, ['attachment' => UploadedFile::fake()->image('shelf.png')], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->asVendor($this->vendor)->deleteJson("$base/$id")->assertOk()->assertJsonPath('data.attachment', null);

        Storage::disk(LegalNotice::DOCUMENT_DISK)->assertExists(StoreMessage::findOrFail($id)->attachment_path);
        $this->asVendor($this->vendor)->get("$base/$id/attachment")->assertNotFound();
        $this->asAdmin()->get("/api/admin/conversations/{$this->store->id}/messages/$id/attachment")->assertNotFound();
        $this->asAdmin()->getJson('/api/admin/conversations')->assertJsonPath('data.data.0.last_message.preview', 'Message deleted');
    }

    public function test_dti_staff_edit_and_delete_only_the_messages_they_sent(): void
    {
        $base = "/api/admin/conversations/{$this->store->id}/messages";
        $own = $this->asAdmin()->postJson($base, ['body' => 'Reply by Friday.'])->assertCreated()->assertJsonPath('data.can_modify', true)->json('data.id');
        $vendor = $this->asVendor($this->vendor)->postJson("/api/vendor/conversations/{$this->store->id}/messages", ['body' => 'Understood.'])->assertCreated()->json('data.id');
        $colleague = User::create(['name' => 'Second Evaluator', 'email' => 'eval2@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);

        $this->asAdmin()->getJson("/api/admin/conversations/{$this->store->id}")
            ->assertJsonPath('data.messages.0.can_modify', true)->assertJsonPath('data.messages.1.can_modify', false);
        $this->app['auth']->forgetGuards();
        $this->actingAs($colleague, 'sanctum')->getJson("/api/admin/conversations/{$this->store->id}")->assertJsonPath('data.messages.0.can_modify', false);
        $this->actingAs($colleague, 'sanctum')->patchJson("$base/$own", ['body' => 'Rewritten'])->assertNotFound();
        $this->actingAs($colleague, 'sanctum')->deleteJson("$base/$own")->assertNotFound();

        $this->asAdmin()->patchJson("$base/$vendor", ['body' => 'Rewritten'])->assertNotFound();
        $this->asAdmin()->deleteJson("$base/$vendor")->assertNotFound();

        $this->asAdmin()->patchJson("$base/$own", ['body' => 'Reply by Monday.'])
            ->assertOk()->assertJsonPath('data.body', 'Reply by Monday.')->assertJsonPath('data.edited_at', fn ($value) => $value !== null);
        $this->assertSame('Reply by Friday.', \App\Models\AuditEvent::where('action', 'store.message_edited')->where('subject_id', $own)->firstOrFail()->metadata['previous_body']);

        $this->asAdmin()->deleteJson("$base/$own")->assertOk()->assertJsonPath('data.body', null)->assertJsonPath('data.can_modify', false);
        $this->assertDatabaseHas('audit_events', ['action' => 'store.message_deleted', 'subject_id' => $own]);
        $this->assertSame('Reply by Monday.', StoreMessage::findOrFail($own)->body);
        // The vendor receives the placeholder, never the removed text.
        $this->asVendor($this->vendor)->getJson("/api/vendor/conversations/{$this->store->id}")
            ->assertJsonPath('data.messages.0.body', null)->assertJsonPath('data.messages.0.deleted_at', fn ($value) => $value !== null);
    }

    private function asAdmin(): static
    {
        $this->app['auth']->forgetGuards();
        return $this->actingAs($this->admin, 'sanctum');
    }

    private function asVendor(User $user): static
    {
        $this->app['auth']->forgetGuards();
        return $this->withToken($user->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken);
    }
}
