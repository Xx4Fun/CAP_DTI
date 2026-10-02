<?php

namespace App\Services\Admin;

use App\Models\SrpBulletin;
use Illuminate\Contracts\Pagination\LengthAwarePaginator as LengthAwarePaginatorContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

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
        $id = $filters['id'] ?? null;
        if ($id !== null) {
            $search = '';
            $category = '';
        }
        $today = now('Asia/Manila')->toDateString();

        if ($view === 'history') {
            $query = SrpBulletin::query();
            if ($id !== null) $query->whereKey($id);
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
                ->whereDate('effective_date', '>', $today);
            if ($id !== null) $query->whereKey($id);
            $this->applySearch($query, $search);
            $this->applyCategory($query, $category);

            return $query
                ->orderBy('effective_date')
                ->orderBy('commodity_name')
                ->paginate($perPage, ['*'], 'page', $page)
                ->withQueryString();
        }

        $records = $this->currentRecords($search, $category);
        if ($id !== null) {
            $records = $records->filter(fn (SrpBulletin $record) => $record->id === (int) $id)->values();
        }
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
            ->whereDate('effective_date', '<=', now('Asia/Manila')->toDateString())
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

        $matches = $this->currentRecords()
            ->map(function (SrpBulletin $record) use ($normalizedQuery) {
                $titleMatch = $this->identityPhraseScore(
                    $normalizedQuery,
                    $this->normalizeIdentity($this->conciseTitle($record->commodity_name))
                );
                $aliasMatches = $record->aliases
                    ->map(fn ($alias) => $this->identityPhraseScore(
                        $normalizedQuery,
                        $this->normalizeIdentity((string) $alias->alias_name)
                    ))
                    ->filter()
                    ->map(fn (array $match) => [min(100.0, $match[0] + 1.0), $match[1]]);
                $allMatches = $aliasMatches->push($titleMatch)->filter();
                $record->setAttribute('identity_match_score', (float) ($allMatches->max(fn (array $match) => $match[0]) ?? 0.0));
                $record->setAttribute('match_quality', $allMatches->contains(fn (array $match) => $match[1]) ? 'exact' : 'similar');

                return $record;
            })
            ->filter(fn (SrpBulletin $record) => (float) $record->identity_match_score > 0);

        // Typo guesses are only a fallback: when anything matches as typed, show just those.
        if ($matches->contains(fn (SrpBulletin $record) => $record->match_quality === 'exact')) {
            $matches = $matches->filter(fn (SrpBulletin $record) => $record->match_quality === 'exact');
        }

        return $matches
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

    /**
     * @return array{0: float, 1: bool}|null Score, and whether it matched as typed (no typo tolerance needed).
     */
    private function identityPhraseScore(string $query, string $candidate): ?array
    {
        if ($candidate === '') {
            return null;
        }
        if ($query === $candidate) {
            return [100.0, true];
        }
        if (str_starts_with($candidate, $query)) {
            return [92.0, true];
        }
        if (strlen($query) >= 4 && str_contains($candidate, $query)) {
            return [88.0, true];
        }

        $candidateTokens = explode(' ', $candidate);
        $tokenScores = [];
        $asTyped = true;
        foreach (explode(' ', $query) as $queryToken) {
            $best = 0.0;
            $tokenAsTyped = false;
            foreach ($candidateTokens as $candidateToken) {
                if ($queryToken === $candidateToken) {
                    $best = 1.0;
                    $tokenAsTyped = true;
                    break;
                }

                $shorter = min(strlen($queryToken), strlen($candidateToken));
                if ($shorter >= 3 && (str_starts_with($queryToken, $candidateToken) || str_starts_with($candidateToken, $queryToken))) {
                    $best = max($best, 0.95);
                    $tokenAsTyped = true;
                    continue;
                }

                // Short words are too close to each other (milo/milk, salt/malt) to tolerate typos safely.
                if ($shorter >= 5) {
                    $longer = max(strlen($queryToken), strlen($candidateToken));
                    $best = max($best, 1 - (levenshtein($queryToken, $candidateToken) / $longer));
                }
            }

            if ($best < 0.7) {
                return null;
            }
            $asTyped = $asTyped && $tokenAsTyped;
            $tokenScores[] = $best;
        }

        return [70.0 + ((array_sum($tokenScores) / count($tokenScores)) * 20.0), $asTyped];
    }

    /**
     * Resolver for a revision's photo: its own, else the newest photo of the same commodity — same key, else
     * identical name + unit + category from keyless history. A keyed row never lends its photo by name: a renamed
     * lineage keeps its key, so a name match there would be another commodity.
     *
     * @return \Closure(SrpBulletin): ?string
     */
    public function imageResolver(): \Closure
    {
        $identity = fn (SrpBulletin $row) => json_encode([$row->commodity_name, $row->unit, $row->category]);
        $withImages = SrpBulletin::query()
            ->whereNotNull('image_path')
            ->where('image_path', '!=', '')
            ->orderBy('id')
            ->get(['commodity_key', 'commodity_name', 'unit', 'category', 'image_path']);
        $byKey = $withImages->filter(fn (SrpBulletin $row) => filled($row->commodity_key))->pluck('image_path', 'commodity_key')->all();
        $byIdentity = $withImages->filter(fn (SrpBulletin $row) => blank($row->commodity_key))
            ->mapWithKeys(fn (SrpBulletin $row) => [$identity($row) => $row->image_path])->all();

        return fn (SrpBulletin $record): ?string => $record->image_path
            ?: (filled($record->commodity_key) ? ($byKey[$record->commodity_key] ?? null) : null)
            ?: ($byIdentity[$identity($record)] ?? null);
    }

    public function lineageKey(SrpBulletin $record): string
    {
        return (string) ($record->commodity_key
            ?: Str::slug(trim($record->commodity_name.' '.($record->unit ?? ''))));
    }

    /**
     * Name + unit identifies a commodity, except where DTI lists one brand and size in several categories
     * (Argentina 150g corned beef vs meat loaf). The category is then appended, and the lineage that
     * already owns the plain key keeps it.
     *
     * @param  array<string, ?string>  $claimed  keys already assigned in the same batch => their category
     * @param  array<int, int>  $exceptIds  rows of the lineage being renamed
     */
    public function commodityKey(string $name, ?string $unit, ?string $category, array $claimed = [], array $exceptIds = []): string
    {
        $base = Str::slug(trim($name.' '.($unit ?? '')));
        $norm = fn (?string $value) => strtolower(trim((string) $value));
        $suffixed = $base.'-'.Str::slug((string) $category);
        // An existing category lineage keeps its key even if the plain key's owner was renamed since.
        if ($norm($category) !== '') {
            $suffixedOwners = SrpBulletin::where('commodity_key', $suffixed)->whereNotIn('id', $exceptIds)->pluck('category');
            if ($suffixedOwners->isNotEmpty() || array_key_exists($suffixed, $claimed)) {
                if ($suffixedOwners->push($claimed[$suffixed] ?? $category)->contains(fn (?string $owner) => $norm($owner) !== $norm($category))) {
                    throw ValidationException::withMessages([
                        'commodity_key' => ["SRP identity {$suffixed} already belongs to a different commodity."],
                    ]);
                }

                return $suffixed;
            }
        }
        $owners = SrpBulletin::where('commodity_key', $base)->whereNotIn('id', $exceptIds)->pluck('category')->all();
        if (array_key_exists($base, $claimed)) {
            $owners[] = $claimed[$base];
        }
        // Owners without a category predate category identities; only categorised owners can conflict.
        $known = array_filter($owners, fn (?string $owner) => $norm($owner) !== '');
        $taken = $norm($category) !== '' && $known !== [] && ! collect($known)->contains(fn (?string $owner) => $norm($owner) === $norm($category));

        return $taken ? $suffixed : $base;
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
