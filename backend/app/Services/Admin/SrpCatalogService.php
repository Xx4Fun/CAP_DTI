<?php

namespace App\Services\Admin;

use App\Models\SrpBulletin;
use Illuminate\Contracts\Pagination\LengthAwarePaginator as LengthAwarePaginatorContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class SrpCatalogService
{
    private const VERSIONING_COLUMNS = ['commodity_key', 'source_reference', 'created_by'];

    public function capabilities(): array
    {
        $columnsAvailable = Schema::hasColumns('srp_bulletins', self::VERSIONING_COLUMNS);
        $auditAvailable = Schema::hasTable('audit_events');

        return [
            'can_publish' => $columnsAvailable && $auditAvailable,
            'status' => $columnsAvailable && $auditAvailable ? 'AVAILABLE' : 'SRP_VERSIONING_UNAVAILABLE',
        ];
    }

    public function paginate(array $filters): LengthAwarePaginatorContract
    {
        $view = $filters['view'] ?? 'history';
        $perPage = min(1000, max(1, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $search = trim((string) ($filters['query'] ?? ''));
        $category = trim((string) ($filters['category'] ?? ''));

        if ($view === 'history') {
            $query = SrpBulletin::query();
            $this->applySearch($query, $search);
            $this->applyCategory($query, $category);

            return $query
                ->orderBy('commodity_name')
                ->orderByDesc('effective_date')
                ->orderByDesc('id')
                ->paginate($perPage, ['*'], 'page', $page)
                ->withQueryString();
        }

        if ($view === 'scheduled') {
            $query = SrpBulletin::query()
                ->where('is_active', true)
                ->whereDate('effective_date', '>', now()->toDateString());
            $this->applySearch($query, $search);
            $this->applyCategory($query, $category);

            return $query
                ->orderBy('effective_date')
                ->orderBy('commodity_name')
                ->paginate($perPage, ['*'], 'page', $page)
                ->withQueryString();
        }

        $records = $this->currentRecords($search, $category);
        $items = $records->forPage($page, $perPage)->values();

        return new LengthAwarePaginator(
            $items,
            $records->count(),
            $perPage,
            $page,
            ['path' => request()->url(), 'query' => request()->query()]
        );
    }

    public function currentRecords(string $search = '', string $category = ''): Collection
    {
        $records = SrpBulletin::query()
            ->with('aliases')
            ->where('is_active', true)
            ->whereDate('effective_date', '<=', now()->toDateString())
            ->orderByDesc('effective_date')
            ->orderByDesc('id')
            ->get()
            ->unique(fn (SrpBulletin $record) => $this->lineageKey($record))
            ->values();

        if ($search !== '') {
            $needle = Str::lower($search);
            $records = $records->filter(function (SrpBulletin $record) use ($needle) {
                return collect([
                    $record->commodity_name,
                    $record->category,
                    $record->unit,
                    $record->regulatory_classification,
                    $record->source_reference,
                    ...$record->aliases->pluck('alias_name')->all(),
                ])->filter()->contains(
                    fn ($value) => Str::contains(Str::lower((string) $value), $needle)
                );
            });
        }

        if ($category !== '') {
            $needle = Str::lower($category);
            $records = $records->filter(
                fn (SrpBulletin $record) => Str::contains(Str::lower((string) $record->category), $needle)
            );
        }

        return $records
            ->sortBy([
                ['regulatory_classification', 'asc'],
                ['category', 'asc'],
                ['commodity_name', 'asc'],
            ])
            ->values();
    }

    public function currentIdentityMatches(string $search, int $limit = 5): Collection
    {
        $normalizedQuery = $this->normalizeIdentity($search);
        if ($normalizedQuery === '') {
            return collect();
        }

        return $this->currentRecords()
            ->map(function (SrpBulletin $record) use ($normalizedQuery) {
                $titleScore = $this->identityPhraseScore(
                    $normalizedQuery,
                    $this->normalizeIdentity($this->conciseTitle($record->commodity_name))
                );
                $aliasScore = $record->aliases
                    ->map(fn ($alias) => $this->identityPhraseScore(
                        $normalizedQuery,
                        $this->normalizeIdentity((string) $alias->alias_name)
                    ))
                    ->filter(fn ($score) => $score !== null)
                    ->map(fn ($score) => min(100.0, $score + 1.0))
                    ->max();
                $record->setAttribute('identity_match_score', max(
                    $titleScore ?? 0.0,
                    $aliasScore ?? 0.0
                ));

                return $record;
            })
            ->filter(fn (SrpBulletin $record) => (float) $record->identity_match_score > 0)
            ->sort(function (SrpBulletin $left, SrpBulletin $right) {
                $scoreOrder = (float) $right->identity_match_score <=> (float) $left->identity_match_score;

                return $scoreOrder !== 0
                    ? $scoreOrder
                    : strcasecmp($left->commodity_name, $right->commodity_name);
            })
            ->take(min(5, max(1, $limit)))
            ->each->offsetUnset('identity_match_score')
            ->values();
    }

    private function conciseTitle(string $commodityName): string
    {
        $segments = preg_split('/\s+-\s+/', trim($commodityName)) ?: [];

        return trim((string) (end($segments) ?: $commodityName));
    }

    private function normalizeIdentity(string $value): string
    {
        $normalized = preg_replace('/[^a-z0-9]+/', ' ', Str::lower(Str::ascii($value))) ?? '';

        return trim(preg_replace('/\s+/', ' ', $normalized) ?? '');
    }

    private function identityPhraseScore(string $query, string $candidate): ?float
    {
        if ($candidate === '') {
            return null;
        }
        if ($query === $candidate) {
            return 100.0;
        }
        if (str_starts_with($candidate, $query)) {
            return 92.0;
        }
        if (strlen($query) >= 4 && str_contains($candidate, $query)) {
            return 88.0;
        }

        $candidateTokens = explode(' ', $candidate);
        $tokenScores = [];
        foreach (explode(' ', $query) as $queryToken) {
            $best = 0.0;
            foreach ($candidateTokens as $candidateToken) {
                if ($queryToken === $candidateToken) {
                    $best = 1.0;
                    break;
                }

                $shorter = min(strlen($queryToken), strlen($candidateToken));
                if ($shorter >= 3 && (str_starts_with($queryToken, $candidateToken) || str_starts_with($candidateToken, $queryToken))) {
                    $best = max($best, 0.95);
                    continue;
                }

                if (strlen($queryToken) >= 4 && strlen($candidateToken) >= 4) {
                    $longer = max(strlen($queryToken), strlen($candidateToken));
                    $best = max($best, 1 - (levenshtein($queryToken, $candidateToken) / $longer));
                }
            }

            if ($best < 0.7) {
                return null;
            }
            $tokenScores[] = $best;
        }

        return 70.0 + ((array_sum($tokenScores) / count($tokenScores)) * 20.0);
    }

    private function lineageKey(SrpBulletin $record): string
    {
        return (string) ($record->commodity_key
            ?: Str::slug(trim($record->commodity_name.' '.($record->unit ?? ''))));
    }

    private function applySearch(Builder $query, string $search): void
    {
        if ($search === '') {
            return;
        }

        $term = '%'.Str::lower($search).'%';
        $hasSourceReference = Schema::hasColumn('srp_bulletins', 'source_reference');

        $query->where(function (Builder $query) use ($term, $hasSourceReference) {
            $query
                ->whereRaw('LOWER(commodity_name) LIKE ?', [$term])
                ->orWhereRaw('LOWER(category) LIKE ?', [$term])
                ->orWhereRaw('LOWER(unit) LIKE ?', [$term])
                ->orWhereRaw('LOWER(regulatory_classification) LIKE ?', [$term]);

            if ($hasSourceReference) {
                $query->orWhereRaw('LOWER(source_reference) LIKE ?', [$term]);
            }
        });
    }

    private function applyCategory(Builder $query, string $category): void
    {
        if ($category !== '') {
            $term = '%'.Str::lower($category).'%';
            $query->whereRaw('LOWER(category) LIKE ?', [$term]);
        }
    }
}
