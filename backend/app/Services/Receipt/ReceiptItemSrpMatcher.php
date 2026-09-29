<?php

namespace App\Services\Receipt;

use App\Models\ConsumerReport;
use App\Models\ConsumerReportItem;
use App\Services\Ocr\ShelfTagAutoResolver;
use App\Services\Ocr\ShelfTagProductMatcher;

/**
 * Matches extracted receipt lines to SRP bulletins.
 *
 * consumer_report_items.srp_id existed from the start but nothing ever wrote it, so every item
 * reached the DTI evaluator unmatched and every commodity key had to be typed by hand. The scoring
 * already existed for shelf-tag scanning; this wires the same matcher to receipts.
 *
 * A match is a suggestion, never a determination. Only a clearly strong candidate is accepted
 * automatically; anything weaker leaves srp_id null and records the ranked candidates so the panel
 * can offer them. Nothing here writes a RegulatoryFinding or decides a violation.
 */
class ReceiptItemSrpMatcher
{
    /** Candidates kept per item. Enough to offer alternatives without bloating the row. */
    private const MAX_CANDIDATES = 5;

    public function __construct(
        private readonly ShelfTagProductMatcher $matcher,
        private readonly ShelfTagAutoResolver $resolver,
    ) {
    }

    /**
     * Match every item on a report, persisting srp_id (when confident) and the candidate list.
     *
     * @return int How many items were matched automatically.
     */
    public function matchReport(ConsumerReport $report): int
    {
        $matched = 0;

        foreach ($report->items()->get() as $item) {
            if ($this->matchItem($item)) {
                $matched++;
            }
        }

        return $matched;
    }

    /**
     * @return bool Whether this item was auto-matched to a bulletin.
     */
    public function matchItem(ConsumerReportItem $item): bool
    {
        $candidates = $this->candidatesFor($item);
        $autoMatched = $this->resolver->isClearStrongMatch($candidates);

        $item->forceFill([
            'srp_id' => $autoMatched ? (int) $candidates[0]['id'] : null,
            'srp_match_json' => $candidates === [] ? null : [
                'auto_matched' => $autoMatched,
                'matched_at' => now()->toIso8601String(),
                'query' => $this->queryTextFor($item),
                'candidates' => $candidates,
            ],
        ])->save();

        return $autoMatched;
    }

    /**
     * Ranked bulletin candidates for one item, best first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function candidatesFor(ConsumerReportItem $item): array
    {
        $query = $this->queryTextFor($item);

        if ($query === '') {
            return [];
        }

        return $this->matcher->matchCandidates(
            $query,
            // Receipt lines rarely state a package size of their own; the unit column is the best hint.
            $item->unit ? (string) $item->unit : null,
            ['limit' => self::MAX_CANDIDATES],
        );
    }

    /**
     * The text to match on. item_name is the extractor's cleaned reading; raw_text is the original
     * line, which keeps abbreviations and size suffixes the cleaner may have dropped.
     */
    private function queryTextFor(ConsumerReportItem $item): string
    {
        $name = trim((string) ($item->item_name ?? ''));
        $raw = trim((string) ($item->raw_text ?? ''));

        if ($name !== '' && $raw !== '' && stripos($raw, $name) === false) {
            return $name.' '.$raw;
        }

        return $name !== '' ? $name : $raw;
    }
}
