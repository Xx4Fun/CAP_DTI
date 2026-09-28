<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class StoreMessage extends Model
{
    /** Chat attachments share the private legal-documents disk; limits differ from the formal-response ones. */
    public const ATTACHMENT_MIMES = 'pdf,jpeg,png,webp';
    public const ATTACHMENT_MAX_KB = 5120;
    public const BODY_MAX = 2000;

    protected $fillable = [
        'store_id', 'vendor_user_id', 'sender_id', 'sender_side', 'body', 'attachment_disk', 'attachment_path',
        'attachment_name', 'attachment_mime', 'attachment_size', 'attachment_sha256', 'read_at',
    ];

    protected $hidden = ['attachment_disk', 'attachment_path'];

    protected $casts = ['read_at' => 'datetime', 'attachment_size' => 'integer'];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function sender(): BelongsTo { return $this->belongsTo(User::class, 'sender_id'); }
    public function vendor(): BelongsTo { return $this->belongsTo(User::class, 'vendor_user_id'); }

    public const PAGE = 100;

    /**
     * One page of a thread, oldest first: the latest page, or the page before `before_id`. Only messages from the
     * other side that are actually returned are marked read.
     */
    public static function page($query, ?int $beforeId, string $otherSide): array
    {
        $rows = (clone $query)->when($beforeId, fn ($q) => $q->where('id', '<', $beforeId))
            ->orderByDesc('id')->limit(self::PAGE + 1)->get();
        $hasMore = $rows->count() > self::PAGE;
        $rows = $rows->take(self::PAGE)->reverse()->values();
        $unread = $rows->where('sender_side', $otherSide)->whereNull('read_at')->pluck('id');
        if ($unread->isNotEmpty()) {
            $now = now();
            static::whereIn('id', $unread)->update(['read_at' => $now]);
            foreach ($rows as $message) {
                if ($unread->contains($message->id)) $message->read_at = $now;
            }
        }
        return [$rows, $hasMore];
    }

    public static function rules(): array
    {
        return [
            'body' => ['nullable', 'string', 'max:'.self::BODY_MAX, 'required_without:attachment'],
            'attachment' => ['nullable', 'file', 'mimes:'.self::ATTACHMENT_MIMES, 'max:'.self::ATTACHMENT_MAX_KB],
        ];
    }

    /** Stores an upload on the private disk; the caller deletes the path again if its transaction fails. */
    public static function storeUpload(?UploadedFile $file, int $storeId): array
    {
        if (! $file) return [];
        $path = $file->storeAs("store-messages/$storeId", Str::uuid().'.'.$file->extension(), LegalNotice::DOCUMENT_DISK);
        abort_unless($path, 503, 'Private attachment storage is unavailable.');
        return [
            'attachment_disk' => LegalNotice::DOCUMENT_DISK, 'attachment_path' => $path, 'attachment_name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'attachment_mime' => $file->getMimeType(), 'attachment_size' => $file->getSize(), 'attachment_sha256' => hash_file('sha256', $file->getRealPath()),
        ];
    }

    public function attachmentResponse()
    {
        abort_unless($this->attachment_path && Storage::disk($this->attachment_disk)->exists($this->attachment_path), 404);
        // Images preview inline; anything else downloads so the browser never renders it as a page.
        $inline = in_array($this->attachment_mime, ['image/jpeg', 'image/png', 'image/webp'], true);
        return Storage::disk($this->attachment_disk)->response($this->attachment_path, $this->attachment_name,
            ['Content-Type' => $this->attachment_mime, 'X-Content-Type-Options' => 'nosniff'], $inline ? 'inline' : 'attachment');
    }

    public function toThreadArray(): array
    {
        return [
            'id' => $this->id, 'sender_side' => $this->sender_side, 'sender_name' => $this->sender?->name,
            'vendor_user_id' => $this->vendor_user_id, 'body' => $this->body, 'read_at' => $this->read_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'attachment' => $this->attachment_path ? ['name' => $this->attachment_name, 'mime' => $this->attachment_mime, 'size' => $this->attachment_size] : null,
        ];
    }
}
