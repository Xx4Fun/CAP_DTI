import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileJson,
  History,
  LayoutGrid,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { SrpRecord } from '../../types/admin'
import type {
  ManagedSrpRecord,
  SrpCapabilities,
  SrpListFilters,
  SrpPage,
  SrpPagination,
  SrpRevisionPayload,
  SrpRevisionPreview,
  SrpView,
} from '../../types/adminSrp'
import './admin.css'

const emptyPagination: SrpPagination = {
  current_page: 1,
  last_page: 1,
  per_page: 20,
  total: 0,
  from: null,
  to: null,
}

const defaultCapabilities: SrpCapabilities = {
  can_publish: true,
  status: 'AVAILABLE',
}

function normalizePage(value: SrpPage | SrpRecord[]): SrpPage {
  if (!Array.isArray(value)) return value

  return {
    records: value,
    pagination: {
      ...emptyPagination,
      total: value.length,
      from: value.length ? 1 : null,
      to: value.length,
      per_page: Math.max(20, value.length),
    },
    capabilities: defaultCapabilities,
  }
}

function requestMessage(error: unknown): string {
  const response = (error as {
    response?: { data?: { message?: string; errors?: Record<string, string[]>; status?: string } }
  }).response?.data

  if (response?.status === 'SRP_VERSIONING_UNAVAILABLE') {
    return 'SRP publication is unavailable until the approved versioning and audit schema is ready.'
  }

  const firstValidation = response?.errors
    ? Object.values(response.errors).flat()[0]
    : null
  return firstValidation || response?.message || 'The request could not be completed. Try again.'
}

function AdminModal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([disabled])',
    )
    first?.focus()
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
    ) ?? [])
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div
        ref={panel}
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header className="admin-modal-header">
          <div>
            <span className="admin-eyebrow">Temporal SRP control</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="admin-icon-button" onClick={onClose} aria-label="Close">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  )
}

function ImportSrpModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [source, setSource] = useState('')
  const [payload, setPayload] = useState('')
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed = () => {
    const value = JSON.parse(payload)
    value.metadata = { ...value.metadata, source_reference: source }
    return value
  }

  const previewImport = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setPreview(await adminApi.previewSrp(parsed()))
    } catch (requestError) {
      setPreview(null)
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const importBulletin = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi.importSrp(parsed())
      await onImported()
      onClose()
    } catch (requestError) {
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModal title="Add SRP bulletin" onClose={onClose}>
      <form className="admin-form admin-modal-form" onSubmit={previewImport}>
        <div className="admin-field">
          <label htmlFor="srp-json-upload">Upload SRP JSON</label>
          <input
            id="srp-json-upload"
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) {
                setPayload(await file.text())
                setPreview(null)
              }
            }}
          />
          <small>Select the approved bulletin export. The file is previewed before publication.</small>
        </div>

        <div className="admin-field">
          <label htmlFor="srp-source-ref">Authoritative source reference</label>
          <input
            id="srp-source-ref"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setPreview(null)
            }}
            required
          />
        </div>

        <div className="admin-field">
          <label htmlFor="srp-payload-json">SRP JSON</label>
          <textarea
            id="srp-payload-json"
            rows={10}
            value={payload}
            onChange={(event) => {
              setPayload(event.target.value)
              setPreview(null)
            }}
            required
            spellCheck={false}
          />
        </div>

        {error && <p className="admin-feedback error" role="alert">{error}</p>}
        {preview && (
          <section className="srp-preview" aria-live="polite">
            <div><strong>{String(preview.insert_count ?? 0)}</strong><span>New versions</span></div>
            <div><strong>{String(preview.duplicate_count ?? 0)}</strong><span>Duplicates skipped</span></div>
            <div><strong>{String(preview.effective_date ?? '—')}</strong><span>Effective date</span></div>
          </section>
        )}

        <footer className="admin-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button secondary" disabled={busy || !payload || !source}>
            {busy ? 'Checking…' : 'Preview import'}
          </button>
          <button
            type="button"
            className="admin-button primary"
            disabled={busy || !preview}
            onClick={() => void importBulletin()}
          >
            Import new versions
          </button>
        </footer>
      </form>
    </AdminModal>
  )
}

function RevisionModal({
  record,
  onClose,
  onCreated,
}: {
  record: ManagedSrpRecord
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [price, setPrice] = useState(String(record.baseline_price))
  const [effectiveDate, setEffectiveDate] = useState('')
  const [source, setSource] = useState(record.source_reference ?? '')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<SrpRevisionPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const revisionPayload = (): SrpRevisionPayload => ({
    commodity_name: record.commodity_name,
    category: record.category,
    unit: record.unit,
    regulatory_classification: record.regulatory_classification,
    baseline_price: Number(price),
    effective_date: effectiveDate,
    source_reference: source,
    change_reason: reason,
  })

  const previewRevision = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setPreview(await adminApi.previewSrpRevision(record.id, revisionPayload()))
    } catch (requestError) {
      setPreview(null)
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const createRevision = async () => {
    setBusy(true)
    setError('')
    try {
      await adminApi.createSrpRevision(record.id, revisionPayload())
      await onCreated()
      onClose()
    } catch (requestError) {
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModal title="Create SRP revision" onClose={onClose}>
      <div className="srp-version-context">
        <History size={18} aria-hidden="true" />
        <div>
          <strong>{record.commodity_name}</strong>
          <span>Current version remains unchanged for historical receipt and inspection dates.</span>
        </div>
      </div>

      <form className="admin-form admin-modal-form" onSubmit={previewRevision}>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="revision-price">Revised SRP</label>
            <input
              id="revision-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value)
                setPreview(null)
              }}
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="revision-effective-date">Effective date</label>
            <input
              id="revision-effective-date"
              type="date"
              value={effectiveDate}
              min={record.effective_date.slice(0, 10)}
              onChange={(event) => {
                setEffectiveDate(event.target.value)
                setPreview(null)
              }}
              required
            />
          </div>
        </div>

        <div className="admin-field">
          <label htmlFor="revision-source">Authoritative source reference</label>
          <input
            id="revision-source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setPreview(null)
            }}
            required
          />
        </div>

        <div className="admin-field">
          <label htmlFor="revision-reason">Change reason</label>
          <textarea
            id="revision-reason"
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setPreview(null)
            }}
            required
          />
        </div>

        {error && <p className="admin-feedback error" role="alert">{error}</p>}
        {preview && (
          <section className="srp-impact-preview" aria-live="polite">
            <ShieldCheck size={20} aria-hidden="true" />
            <div>
              <strong>Customer PWA update scheduled for {preview.becomes_public_on}</strong>
              <span>
                ₱{Number(preview.original.baseline_price).toFixed(2)} → ₱{Number(preview.proposed.baseline_price).toFixed(2)}.
                Historical versions remain available for date-correct resolution.
              </span>
            </div>
          </section>
        )}

        <footer className="admin-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button secondary" disabled={busy}>
            {busy ? 'Checking…' : 'Preview revision'}
          </button>
          <button
            type="button"
            className="admin-button primary"
            disabled={busy || !preview}
            onClick={() => void createRevision()}
          >
            Schedule revised version
          </button>
        </footer>
      </form>
    </AdminModal>
  )
}

const MASTER_DTI_CATEGORIES = [
  'Batteries',
  'Beef Loaf',
  'Bottled Water',
  'Bottled Water - Distilled Water',
  'Bottled Water - Mineralized Water',
  'Bottled Water - Purified Water',
  'Bread',
  'Candles',
  'Canned Sardines in Tomato Sauce',
  'Coffee',
  'Coffee 3-in-1 Original',
  'Condiments - Patis (Doy Pack / Budget Pack)',
  'Condiments - Patis (Gin / PET Bottle)',
  'Condiments - Soy Sauce (Doy Pack / Refill Pack)',
  'Condiments - Soy Sauce (Gin / PET Bottle)',
  'Condiments - Vinegar (Doy / Refill Pack)',
  'Condiments - Vinegar (Gin and PET Bottle)',
  'Corned Beef',
  'Detergent Soap / Laundry Soap',
  'Instant Mami Noodles - Chicken & Beef Flavor',
  'Luncheon Meat',
  'Meat Loaf',
  'Processed Milk',
  'Processed Milk - Condensed Milk',
  'Processed Milk - Evaporated Milk',
  'Processed Milk - Powdered Milk',
  'Salt - Iodized Rock Salt',
  'Salt - Iodized Salt',
  'Toilet Soap',
]

export function SrpManagementPanel() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [view] = useState<SrpView>('current')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [records, setRecords] = useState<ManagedSrpRecord[]>([])
  const [pagination, setPagination] = useState(emptyPagination)
  const [capabilities, setCapabilities] = useState(defaultCapabilities)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [revisionRecord, setRevisionRecord] = useState<ManagedSrpRecord | null>(null)
  const [pageInput, setPageInput] = useState('1')

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    const filters: SrpListFilters = {
      query: deferredQuery,
      view,
      category,
      page,
      per_page: perPage,
    }
    try {
      const result = normalizePage(await adminApi.getSrp(filters))
      setRecords(result.records)
      setPagination(result.pagination)
      setCapabilities(result.capabilities ?? defaultCapabilities)
    } catch (requestError) {
      setRecords([])
      setError(requestMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [category, deferredQuery, page, perPage, view])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  useEffect(() => {
    setPage(1)
  }, [deferredQuery, view, category, perPage])

  useEffect(() => {
    setPageInput(String(pagination.current_page))
  }, [pagination.current_page])

  const commitPageJump = () => {
    const target = parseInt(pageInput, 10)
    const maxPage = pagination.last_page || 1
    if (!isNaN(target) && target >= 1 && target <= maxPage) {
      setPage(target)
    } else {
      setPageInput(String(pagination.current_page))
    }
  }

  const resetFilters = () => {
    setQuery('')
    setCategory('')
    setPage(1)
    setPerPage(10)
  }

  const categories = useMemo(() => {
    const set = new Set<string>(MASTER_DTI_CATEGORIES)
    records.forEach((record) => {
      if (record.category) set.add(record.category)
    })
    return Array.from(set).sort()
  }, [records])

  const maxPage = pagination.last_page || 1
  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    const current = pagination.current_page || 1
    for (let i = Math.max(1, current - 2); i <= Math.min(maxPage, current + 2); i++) {
      pages.push(i)
    }
    return pages
  }, [pagination.current_page, maxPage])

  return (
    <section className="srp-workspace" aria-busy={loading}>
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '1.15rem 1.35rem',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <header
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 2fr) minmax(180px, 1fr) auto auto',
            gap: '0.85rem',
            alignItems: 'center',
          }}
        >
          <div className="admin-search-field" style={{ position: 'relative', width: '100%' }}>
            <Search size={17} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search SRP bulletins"
              placeholder="Search commodity name, category, POS abbreviation, or source..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem 0.65rem 2.6rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.86rem',
                background: '#f8fafc',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <select
            aria-label="Filter SRP category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.86rem',
              background: '#f8fafc',
              fontWeight: 600,
              color: '#0f172a',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All categories ({categories.length})</option>
            {categories.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> Reset
          </button>

          <button
            type="button"
            className="admin-button primary"
            disabled={!capabilities.can_publish}
            onClick={() => setImportOpen(true)}
            title={capabilities.can_publish ? undefined : 'Approved versioning and audit schema required'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.1rem',
              borderRadius: '8px',
              background: '#1d4ed8',
              color: '#ffffff',
              fontSize: '0.86rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={17} aria-hidden="true" /> Add SRP bulletin
          </button>
        </header>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.65rem',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
            {pagination.total} records found
          </span>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Results update automatically as you type or change filters.
          </span>
        </div>
      </div>

      {!capabilities.can_publish && !loading && (
        <p className="admin-feedback warning" role="status">
          Read-only mode. SRP publishing requires the approved versioning and audit migration.
        </p>
      )}
      {error && (
        <div className="admin-feedback error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadRecords()}>Retry</button>
        </div>
      )}

      <div
        className="admin-table-card"
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
        }}
      >
        <div className="admin-table-wrap">
          <table className="admin-data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption className="sr-only">SRP bulletin records</caption>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.85rem 1.1rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Commodity</th>
                <th style={{ padding: '0.85rem 1.1rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Category</th>
                <th style={{ padding: '0.85rem 1.1rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Effective Date</th>
                <th style={{ padding: '0.85rem 1.1rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>SRP Baseline</th>
                <th style={{ padding: '0.85rem 1.1rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Source Reference</th>
                <th style={{ padding: '0.85rem 1.1rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }, (_, index) => (
                <tr className="admin-skeleton-row" key={index}>
                  <td colSpan={6} style={{ padding: '1rem' }}><span /></td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center' }}>
                    <div className="admin-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <FileJson size={32} style={{ color: '#94a3b8' }} aria-hidden="true" />
                      <strong style={{ fontSize: '1rem', color: '#0f172a' }}>No SRP records found</strong>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Adjust search query or category filter.</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && records.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                  <td data-label="Commodity" style={{ padding: '0.85rem 1.1rem' }}>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>{record.commodity_name}</strong>
                    <small style={{ fontSize: '0.78rem', color: '#64748b' }}>{record.unit || 'Unit not specified'}</small>
                  </td>
                  <td data-label="Category" style={{ padding: '0.85rem 1.1rem' }}>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>{record.category || 'Uncategorized'}</span>
                    <small style={{ fontSize: '0.76rem', color: '#64748b' }}>{record.regulatory_classification?.replaceAll('_', ' ') || 'No classification'}</small>
                  </td>
                  <td data-label="Effective date" style={{ padding: '0.85rem 1.1rem', fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
                    {record.effective_date.slice(0, 10)}
                  </td>
                  <td data-label="SRP" className="admin-price" style={{ padding: '0.85rem 1.1rem', color: '#1d4ed8', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.92rem' }}>
                    ₱{Number(record.baseline_price).toFixed(2)}
                  </td>
                  <td data-label="Source" style={{ padding: '0.85rem 1.1rem', fontSize: '0.85rem', color: '#64748b' }}>
                    {record.source_reference || 'Official DTI Record'}
                  </td>
                  <td data-label="Action" style={{ padding: '0.85rem 1.1rem', textAlign: 'center' }}>
                    <button
                      type="button"
                      disabled={!capabilities.can_publish}
                      aria-label={`Revise ${record.commodity_name}`}
                      onClick={() => setRevisionRecord(record)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid #bfdbfe',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span>Revise</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <nav
          aria-label="SRP pagination"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.9rem 1.25rem',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
              }}
            >
              <LayoutGrid size={16} aria-hidden="true" />
            </div>
            <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
              Showing <strong style={{ color: '#0f172a' }}>{pagination.from ?? (records.length ? 1 : 0)}–{pagination.to ?? records.length}</strong> of <strong style={{ color: '#0f172a' }}>{pagination.total}</strong> entries
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="srp-rows-per-page-select" style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 600 }}>
                Rows per page
              </label>
              <input
                id="srp-rows-per-page"
                type="number"
                min={1}
                max={100}
                step={1}
                aria-label="Rows per page"
                value={perPage}
                onChange={(event) => {
                  const next = event.currentTarget.valueAsNumber
                  if (Number.isInteger(next) && next >= 1 && next <= 100) {
                    setPerPage(next)
                  }
                }}
                style={{
                  width: '54px',
                  padding: '0.35rem 0.55rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  background: '#ffffff',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                aria-label="Previous page"
                disabled={pagination.current_page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: pagination.current_page <= 1 ? '#cbd5e1' : '#334155',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: pagination.current_page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={16} aria-hidden="true" /> Previous
              </button>

              <input
                type="number"
                aria-label="Jump to page"
                className="sr-only"
                min={1}
                max={maxPage}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={commitPageJump}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitPageJump()
                  }
                }}
              />

              {pageNumbers.map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  style={{
                    minWidth: '34px',
                    height: '34px',
                    padding: '0 0.5rem',
                    borderRadius: '8px',
                    border: pNum === pagination.current_page ? 'none' : '1px solid #cbd5e1',
                    background: pNum === pagination.current_page ? '#2563eb' : '#ffffff',
                    color: pNum === pagination.current_page ? '#ffffff' : '#334155',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {pNum}
                </button>
              ))}

              <button
                type="button"
                aria-label="Next page"
                disabled={pagination.current_page >= maxPage || loading}
                onClick={() => setPage((current) => current + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: pagination.current_page >= maxPage ? '#cbd5e1' : '#334155',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: pagination.current_page >= maxPage ? 'not-allowed' : 'pointer',
                }}
              >
                Next <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </nav>
      </div>

      {importOpen && (
        <ImportSrpModal onClose={() => setImportOpen(false)} onImported={loadRecords} />
      )}
      {revisionRecord && (
        <RevisionModal
          record={revisionRecord}
          onClose={() => setRevisionRecord(null)}
          onCreated={loadRecords}
        />
      )}
    </section>
  )
}
