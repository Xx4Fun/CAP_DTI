import React, { useMemo, useState } from 'react';
import { Search, Calculator, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import type { SrpCatalog, SrpItem } from '../../app/types';
import { analyzeReference, formatPeso } from '../../app/rules';

interface SrpDirectoryProps {
  catalog: SrpCatalog | null;
  error: string;
  onRetry: () => void;
}

// SRP revisions create new bulletin ids, so the self-check follows the commodity, not the row id.
const keyOf = (item: SrpItem) => item.commodity_key ?? `id:${item.id}`;
const hasReference = (item: SrpItem) => item.reference.status === 'available' && item.reference.value !== null;

export const SrpDirectory: React.FC<SrpDirectoryProps> = ({ catalog, error, onRetry }) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [classificationFilter, setClassificationFilter] = useState('ALL');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // null = not edited yet, so the field starts at the reference price; '' is a deliberately cleared field.
  const [inputPrice, setInputPrice] = useState<string | null>(null);

  const items = useMemo(() => catalog?.items ?? [], [catalog]);
  const available = useMemo(() => items.filter(hasReference), [items]);
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category).filter((value): value is string => !!value))), [items]);
  const classifications = useMemo(() => Array.from(new Set(items.map((item) => item.regulatory_classification).filter((value): value is string => !!value))), [items]);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (classificationFilter !== 'ALL' && item.regulatory_classification !== classificationFilter) return false;
    const query = search.trim().toLowerCase();
    return !query || item.commodity_name.toLowerCase().includes(query) || (item.category ?? '').toLowerCase().includes(query);
  }), [items, categoryFilter, classificationFilter, search]);

  if (error) {
    return (
      <div className="v-card portal-status" role="alert">
        <AlertTriangle size={32} color="var(--danger-color)" style={{ margin: '0 auto 10px' }} />
        <p>{error}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: '12px' }}><RotateCw size={14} /><span>Retry</span></button>
      </div>
    );
  }
  if (!catalog) return <div className="v-card portal-status" role="status">Loading price references…</div>;

  const chosen = selectedKey === null ? available[0] ?? null : items.find((item) => keyOf(item) === selectedKey) ?? null;
  const selected = chosen && hasReference(chosen) ? chosen : null;
  // A chosen commodity that lost its reference (or left the catalog) is never swapped for another product.
  const selectionLost = selectedKey !== null && !selected;
  const shownPrice = inputPrice ?? String(selected?.reference.value ?? '');
  const price = shownPrice.trim() === '' ? NaN : Number(shownPrice);
  const analysis = selected && Number.isFinite(price) ? analyzeReference(price, selected.reference) : null;
  const isEmergency = catalog.protocol.mode === 'emergency';

  return (
    <div className="srp-directory-view">
      <div className="v-card-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--dti-navy)' }}>Official DTI Suggested Retail Price (SRP) Directory</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isEmergency
              ? `Price Freeze in effect${catalog.protocol.reference ? ` (${catalog.protocol.reference})` : ''}: covered goods use the official ceiling; other goods keep their SRP.`
              : 'Current SRP references for basic necessities and prime commodities in San Jose de Buenavista'}
          </p>
        </div>
      </div>

      <div className="v-card" style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)', border: '1.5px solid #CBD5E1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'var(--dti-navy)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calculator size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--dti-navy)' }}>Shelf Price Self-Check</h3>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>A provisional comparison with the same reference DTI monitoring uses. It is not a legal finding.</p>
          </div>
        </div>

        {available.length === 0 && !selectionLost ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No price reference is currently available.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="srp-commodity">Commodity</label>
                <select
                  id="srp-commodity"
                  className="form-control"
                  value={selected ? keyOf(selected) : ''}
                  onChange={(event) => { setSelectedKey(event.target.value); setInputPrice(null); }}
                >
                  {selectionLost && <option value="" disabled>{chosen?.commodity_name ?? 'Previously selected commodity'} — reference unavailable</option>}
                  {available.map((item) => (
                    <option key={keyOf(item)} value={keyOf(item)}>{item.commodity_name}{item.unit ? ` (${item.unit})` : ''} — {formatPeso(item.reference.value)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="intended-shelf-price">Your shelf price (₱)</label>
                <input id="intended-shelf-price" type="number" step="0.05" min="0" className="form-control" value={shownPrice} disabled={!selected} onChange={(event) => {
                  // Pin the commodity being checked the moment a price is typed, so a refresh cannot silently swap in another product.
                  if (selectedKey === null && selected) setSelectedKey(keyOf(selected));
                  setInputPrice(event.target.value);
                }} />
              </div>
            </div>

            {selectionLost ? (
              <p role="status" style={{ fontSize: '0.8rem', color: 'var(--danger-color)', marginTop: '12px' }}>
                The selected commodity no longer has an available price reference. Choose another commodity to compare.
              </p>
            ) : analysis && selected ? (
              <div className="calc-result-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Result:</span>
                  <span className={`badge ${analysis.forReview ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                    {analysis.forReview ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    <span>{analysis.label}</span>
                  </span>
                </div>
                <div className="calc-stat-row"><span style={{ color: 'var(--text-muted)' }}>{selected.reference.label}:</span><strong>{formatPeso(selected.reference.value)}</strong></div>
                <div className="calc-stat-row">
                  <span style={{ color: 'var(--text-muted)' }}>{selected.reference.type === 'emergency_ceiling' ? 'Reviewed above the official ceiling:' : 'Reviewed above SRP + 10%:'}</span>
                  <strong>{formatPeso(analysis.reviewAbove)}</strong>
                </div>
                <div className="calc-stat-row">
                  <span style={{ color: 'var(--text-muted)' }}>Difference from reference:</span>
                  <strong>{analysis.variancePercent !== null ? `${analysis.variancePercent > 0 ? '+' : ''}${analysis.variancePercent.toFixed(1)}%` : '—'}</strong>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>Enter a shelf price to compare it with the reference.</p>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '11px' }} />
          <input type="search" aria-label="Search commodities" className="form-control" placeholder="Search commodities..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ paddingLeft: '32px' }} />
        </div>
        <select aria-label="Filter by category" className="form-control" style={{ width: 'auto', minWidth: '150px' }} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="ALL">All Categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select aria-label="Filter by classification" className="form-control" style={{ width: 'auto', minWidth: '160px' }} value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)}>
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
                <th style={{ textAlign: 'right' }}>Reviewed above</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const reviewAbove = hasReference(item) && item.reference.value !== null
                  ? analyzeReference(item.reference.value, item.reference).reviewAbove
                  : null;
                return (
                  <tr key={keyOf(item)}>
                    <td><strong>{item.commodity_name}</strong></td>
                    <td>{item.unit ?? '—'}</td>
                    <td>{item.category ?? '—'}</td>
                    <td>{item.regulatory_classification ? <span className="badge badge-navy">{item.regulatory_classification}</span> : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--dti-navy)' }}>
                      {formatPeso(item.reference.value)}
                      <div style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>{item.reference.label}</div>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatPeso(reviewAbove)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
