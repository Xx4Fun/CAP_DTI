<?php

namespace Tests\Feature;

use App\Models\LegalNotice;
use App\Models\LegalNoticeAttachment;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDraftImmutabilityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        $this->admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
        $this->store = Store::create(['store_name' => 'Evidence Store', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121]);
        Sanctum::actingAs($this->admin);
    }

    public function test_issued_notice_rejects_draft_edits_and_evidence_changes(): void
    {
        $notice = $this->notice('issued');
        $attachment = $this->supplemental($notice);

        $this->patchJson("/api/admin/legal-notices/{$notice->id}", ['reason' => 'Changed after issue'])->assertStatus(409);
        $this->post("/api/admin/legal-notices/{$notice->id}/attachments", ['file' => UploadedFile::fake()->create('late.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertStatus(409);
        $this->deleteJson("/api/admin/legal-notices/{$notice->id}/attachments/{$attachment->id}")->assertStatus(409);

        $this->assertSame('Original reason', $notice->fresh()->draft_payload['reason']);
        $this->assertSame(1, LegalNoticeAttachment::count());
        $this->assertSame([$attachment->path], Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
    }

    public function test_draft_evidence_can_still_be_added_saved_and_removed(): void
    {
        $notice = $this->notice('draft');

        $this->patchJson("/api/admin/legal-notices/{$notice->id}", ['reason' => 'Prices above price ceiling'])->assertOk();
        $added = $this->post("/api/admin/legal-notices/{$notice->id}/attachments", ['file' => UploadedFile::fake()->create('support.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertCreated()->json('data');
        $this->assertSame(LegalNotice::DOCUMENT_DISK, $added['disk'] ?? LegalNotice::DOCUMENT_DISK);
        Storage::disk(LegalNotice::DOCUMENT_DISK)->assertExists(LegalNoticeAttachment::findOrFail($added['id'])->path);

        $this->deleteJson("/api/admin/legal-notices/{$notice->id}/attachments/{$added['id']}")->assertNoContent();

        $this->assertSame('Prices above price ceiling', $notice->fresh()->draft_payload['reason']);
        $this->assertSame(0, LegalNoticeAttachment::count());
        $this->assertSame([], Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
    }

    private function notice(string $status): LegalNotice
    {
        return LegalNotice::create([
            'store_id' => $this->store->id, 'notice_type' => 'LOI', 'status' => $status, 'prepared_by' => $this->admin->id,
            'issued_at' => $status === 'issued' ? now() : null, 'delivery_state' => 'not_recorded',
            'source_snapshot' => ['items' => []], 'draft_payload' => ['reason' => 'Original reason'],
        ]);
    }

    private function supplemental(LegalNotice $notice): LegalNoticeAttachment
    {
        $path = "legal-notices/{$notice->id}/supplemental/evidence.pdf";
        Storage::disk(LegalNotice::DOCUMENT_DISK)->put($path, 'evidence');

        return $notice->attachments()->create([
            'uploaded_by' => $this->admin->id, 'kind' => 'supplemental', 'disk' => LegalNotice::DOCUMENT_DISK, 'path' => $path,
            'original_name' => 'evidence.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 8, 'sha256' => str_repeat('c', 64),
        ]);
    }
}
