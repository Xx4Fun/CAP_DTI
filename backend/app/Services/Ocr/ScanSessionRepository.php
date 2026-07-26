<?php

namespace App\Services\Ocr;

use Illuminate\Support\Facades\Cache;

class ScanSessionRepository
{
    private const DEFAULT_TTL_SECONDS = 900;
    private const CACHE_PREFIX = 'scan_session:';

    public function __construct(
        private readonly int $ttlSeconds = self::DEFAULT_TTL_SECONDS
    ) {}

    /**
     * Store a scan session in cache.
     *
     * @param string $scanId
     * @param array $data
     * @return bool
     */
    public function put(string $scanId, array $data): bool
    {
        $now = time();
        $expiresAt = $now + $this->ttlSeconds;

        $sessionData = [
            'scan_id' => (string) ($data['scan_id'] ?? $scanId),
            'scan_uuid' => (string) ($data['scan_uuid'] ?? ''),
            'store_id' => (int) ($data['store_id'] ?? 0),
            'ocr_status' => (string) ($data['ocr_status'] ?? ''),
            'allowed_candidate_product_ids' => $this->normalizeIdArray($data['allowed_candidate_product_ids'] ?? []),
            'manual_product_ids' => $this->normalizeIdArray($data['manual_product_ids'] ?? []),
            'detected_price_centavos' => isset($data['detected_price_centavos']) ? (int) $data['detected_price_centavos'] : null,
            'detected_price_string' => isset($data['detected_price_string']) ? (string) $data['detected_price_string'] : null,
            'detected_price_source' => isset($data['detected_price_source']) ? (string) $data['detected_price_source'] : null,
            'product_source' => (string) ($data['product_source'] ?? 'OCR'),
            'created_at' => (int) ($data['created_at'] ?? $now),
            'expires_at' => (int) ($data['expires_at'] ?? $expiresAt),
            'consumed_state' => (bool) ($data['consumed_state'] ?? false),
            'correlation_id' => (string) ($data['correlation_id'] ?? ''),
        ];

        return Cache::put($this->cacheKey($scanId), $sessionData, $this->ttlSeconds);
    }

    /**
     * Retrieve a scan session from cache.
     *
     * @param string $scanId
     * @return array|null
     */
    public function get(string $scanId): ?array
    {
        $data = Cache::get($this->cacheKey($scanId));

        if (!is_array($data)) {
            return null;
        }

        if (isset($data['expires_at']) && $data['expires_at'] < time()) {
            $this->forget($scanId);
            return null;
        }

        return $data;
    }

    /**
     * Mark a scan session as consumed.
     *
     * @param string $scanId
     * @return bool
     */
    public function consume(string $scanId): bool
    {
        $session = $this->get($scanId);

        if ($session === null) {
            return false;
        }

        $session['consumed_state'] = true;

        $remainingTtl = max(1, $session['expires_at'] - time());

        return Cache::put($this->cacheKey($scanId), $session, $remainingTtl);
    }

    /**
     * Remove a scan session from cache.
     *
     * @param string $scanId
     * @return bool
     */
    public function forget(string $scanId): bool
    {
        return Cache::forget($this->cacheKey($scanId));
    }

    /**
     * Add a manual product ID to manual_product_ids array while leaving allowed_candidate_product_ids untouched.
     *
     * @param string $scanId
     * @param int $productId
     * @return bool
     */
    public function addManualProductId(string $scanId, int $productId): bool
    {
        $session = $this->get($scanId);

        if ($session === null) {
            return false;
        }

        $manualIds = $session['manual_product_ids'] ?? [];
        $manualIds[] = $productId;

        $session['manual_product_ids'] = $this->normalizeIdArray($manualIds);
        $session['product_source'] = 'MANUAL_SEARCH';

        $remainingTtl = max(1, $session['expires_at'] - time());

        return Cache::put($this->cacheKey($scanId), $session, $remainingTtl);
    }

    private function cacheKey(string $scanId): string
    {
        return self::CACHE_PREFIX . $scanId;
    }

    private function normalizeIdArray(array $ids): array
    {
        $integers = array_map('intval', $ids);
        $unique = array_unique($integers);
        return array_values($unique);
    }
}
