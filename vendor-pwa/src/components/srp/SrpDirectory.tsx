import React, { useMemo, useState } from 'react';
import { Search, AlertTriangle, RotateCw } from 'lucide-react';
import type { SrpCatalog, SrpItem } from '../../app/types';
import { analyzeReference, formatPeso } from '../../app/rules';

interface SrpDirectoryProps {
  catalog: SrpCatalog | null;
  stale?: boolean;
  error: string;
  onRetry: () => void;
}

const PAGE_SIZE = 10;

// SRP revisions create new bulletin ids, so rows are keyed by the commodity, not the row id.
const keyOf = (item: SrpItem) => item.commodity_key ?? `id:${item.id}`;
const hasReference = (item: SrpItem) => item.reference.status === 'available' && item.reference.value !== null;

export const SrpDirectory: React.FC<SrpDirectoryProps> = ({ catalog, error, onRetry, stale }) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [classificationFilter, setClassificationFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const items = useMemo(() => catalog?.items ?? [], [catalog]);
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category).filter((value): value is string => !!value))), [items]);
  const classifications = useMemo(() => Array.from(new Set(items.map((item) => item.regulatory_classification).filter((value): value is string => !!value))), [items]);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (classificationFilter !== 'ALL' && item.regulatory_classification !== classificationFilter) return false;
    const query = search.trim().toLowerCase();
    return !query || item.commodity_name.toLowerCase().includes(query) || (item.category ?? '').toLowerCase().includes(query);
  }), [items, categoryFilter, classificationFilter, search]);

  if (error && !catalog) {
    return (
      <div className="v-card portal-status" role="alert">
        <AlertTriangle size={32} color="var(--danger-color)" style={{ margin: '0 auto 10px' }} />
        <p>{error}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: '12px' }}><RotateCw size={14} /><span>Retry</span></button>
      </div>
    );
  }
  if (!catalog) return <div className="v-card portal-status" role="status">Loading price references…</div>;

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  // Clamped, so a refresh that shortens the list never leaves the table on a page that no longer exists.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  return (
    <div className="srp-directory-view">
      {(stale || error) && <p role="status">Saved price references — current regulatory data is unavailable. {error} <button type="button" onClick={onRetry}>Refresh</button></p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginBottom: '14px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '11px' }} />
          <input type="search" aria-label="Search commodities" className="form-control" placeholder="Search..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} style={{ paddingLeft: '32px' }} />
        </div>
        <select aria-label="Filter by category" className="form-control" style={{ textOverflow: 'ellipsis' }} value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
          <option value="ALL">All Categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select aria-label="Filter by classification" className="form-control" style={{ textOverflow: 'ellipsis' }} value={classificationFilter} onChange={(event) => { setClassificationFilter(event.target.value); setPage(1); }}>
          <option value="ALL">All Classifications</option>
          {classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}
        </select>
      </div>

      <div className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="v-table-wrap" style={{ border: 'none' }}>
          <table className="v-table">
            <caption className="sr-only">Current price references</caption>
            <thead>
              <tr>
                <th>Commodity</th>
                <th>Unit</th>
                <th>Category</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right' }}>Reference</th>
                <th style={{ textAlign: 'right' }}>For review from</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No commodities match your search.</td></tr>
              )}
              {pageItems.map((item) => {
                const reviewFrom = hasReference(item) && item.reference.value !== null
                  ? analyzeReference(item.reference.value, item.reference).reviewFrom
                  : null;
                return (
                  <tr key={keyOf(item)}>
                    <td><strong>{item.commodity_name}</strong></td>
                    <td>{item.unit ?? '—'}</td>
                    <td>{item.category ?? '—'}</td>
                    <td>{item.regulatory_classification ? <span className="badge badge-navy">{item.regulatory_classification}</span> : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--dti-navy)' }}>
                      {formatPeso(item.reference.value)}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPeso(reviewFrom)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <nav aria-label="SRP list pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Showing {start + 1}–{start + pageItems.length} of {filteredItems.length}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
              <span aria-live="polite">Page {current} of {pageCount}</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>Next</button>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
};
