<?php

namespace App\Services;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/** Reservation and acceptance must run in the same transaction as the business write and audit. */
class VendorSubmissionReceipt
{
    public static function fingerprint(array $content, array $files, array $categories = []): string
    {
        $normalize = fn ($value) => is_string($value) ? trim(str_replace(["\r\n", "\r"], "\n", $value)) : $value;
        $attachments = [];
        foreach (array_values($files) as $index => $file) {
            $attachments[] = [$file->getClientOriginalName(), $categories[$index] ?? null, hash_file('sha256', $file->getRealPath())];
        }
        return hash('sha256', json_encode([array_map($normalize, $content), $attachments], JSON_THROW_ON_ERROR));
    }

    public static function reserve(int $vendor, ?string $uuid, string $operation, int $target, string $hash): ?int
    {
        if (! $uuid) return null;
        // A concurrent insertion of the same UUID waits for the first transaction to commit/roll back.
        DB::table('vendor_submission_receipts')->insertOrIgnore([
            'vendor_user_id' => $vendor, 'client_uuid' => $uuid, 'operation' => $operation,
            'target_id' => $target, 'payload_hash' => $hash,
        ]);
        $receipt = DB::table('vendor_submission_receipts')->where('vendor_user_id', $vendor)->where('client_uuid', $uuid)->lockForUpdate()->first();
        if (! $receipt || $receipt->operation !== $operation || (int) $receipt->target_id !== $target || ! hash_equals($receipt->payload_hash, $hash)) {
            throw new HttpResponseException(response()->json([
                'status' => 'IDEMPOTENCY_CONFLICT', 'message' => 'This submission identifier was already used for different content or a different target.',
            ], 409));
        }
        return $receipt->result_id ? (int) $receipt->result_id : null;
    }

    public static function accept(int $vendor, ?string $uuid, int $result): void
    {
        if ($uuid) DB::table('vendor_submission_receipts')->where('vendor_user_id', $vendor)->where('client_uuid', $uuid)
            ->update(['result_id' => $result, 'accepted_at' => now()]);
    }
}
