<?php

namespace App\Console\Commands;

use App\Models\ConsumerReport;
use App\Services\Receipt\ReceiptItemSrpMatcher;
use Illuminate\Console\Command;

/**
 * Backfills SRP matches for reports captured before automatic matching existed.
 *
 * Matching only: this writes srp_id and srp_match_json and nothing else. It never creates or changes
 * a RegulatoryFinding, never alters a report's status, and is safe to re-run.
 */
class MatchReceiptItemsToSrp extends Command
{
    protected $signature = 'receipts:match-srp
        {--report= : Limit to one report reference}
        {--only-unmatched : Skip items that already have a match recorded}
        {--dry-run : Report what would change without writing}';

    protected $description = 'Match extracted receipt items to SRP bulletins (suggestions only, never findings)';

    public function handle(ReceiptItemSrpMatcher $matcher): int
    {
        $query = ConsumerReport::query()->whereHas('items');

        if ($reference = $this->option('report')) {
            $query->where('report_reference', $reference);
        }

        $total = $query->count();

        if ($total === 0) {
            $this->info('No reports with extracted items.');

            return self::SUCCESS;
        }

        $this->info(($this->option('dry-run') ? 'Inspecting ' : 'Matching ').$total.' report(s).');
        $bar = $this->output->createProgressBar($total);
        $items = 0;
        $auto = 0;

        $query->with('items')->chunkById(50, function ($reports) use ($matcher, $bar, &$items, &$auto) {
            foreach ($reports as $report) {
                foreach ($report->items as $item) {
                    if ($this->option('only-unmatched') && ($item->srp_id !== null || $item->srp_match_json !== null)) {
                        continue;
                    }

                    $items++;

                    if ($this->option('dry-run')) {
                        $candidates = $matcher->candidatesFor($item);
                        $auto += $candidates !== [] && app(\App\Services\Ocr\ShelfTagAutoResolver::class)->isClearStrongMatch($candidates) ? 1 : 0;

                        continue;
                    }

                    $auto += $matcher->matchItem($item) ? 1 : 0;
                }
                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);
        $this->info(sprintf(
            '%s %d item(s); %d matched automatically, %d left for an evaluator to choose.',
            $this->option('dry-run') ? 'Would process' : 'Processed',
            $items,
            $auto,
            $items - $auto,
        ));

        return self::SUCCESS;
    }
}
