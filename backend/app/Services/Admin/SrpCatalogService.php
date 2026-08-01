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
