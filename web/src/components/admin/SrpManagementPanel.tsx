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
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileJson,
  History,
  PencilLine,
  Plus,
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

export function SrpManagementPanel() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [view, setView] = useState<SrpView>('current')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
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

  const categories = useMemo(
    () => Array.from(new Set(records.map((record) => record.category).filter(Boolean) as string[])).sort(),
    [records],
  )
  const range = pagination.total === 0
    ? '0 records'
    : `${pagination.from ?? 1}–${pagination.to ?? records.length} of ${pagination.total}`

  return (
    <section className="srp-workspace" aria-busy={loading}>
      <header className="admin-data-toolbar">
        <div className="admin-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search SRP bulletins"
            placeholder="Search commodity, category, unit, or source"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <select aria-label="Filter SRP category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>

        <button
          type="button"
          className="admin-button primary"
          disabled={!capabilities.can_publish}
          onClick={() => setImportOpen(true)}
          title={capabilities.can_publish ? undefined : 'Approved versioning and audit schema required'}
        >
          <Plus size={18} aria-hidden="true" />
          Add SRP bulletin
        </button>
      </header>

      <div className="admin-view-tabs" role="tablist" aria-label="SRP record view">
        {([
          ['current', ShieldCheck, 'Current'],
          ['scheduled', CalendarClock, 'Scheduled'],
          ['history', History, 'History'],
        ] as const).map(([value, Icon, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={view === value}
            className={view === value ? 'active' : ''}
            key={value}
            onClick={() => setView(value)}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
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

      <div className="admin-table-card">
        <div className="admin-table-summary">
          <span>{loading ? 'Loading SRP records…' : range}</span>
          <div className="admin-rows-per-page-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="srp-rows-per-page">Rows per page</label>
            <select
              id="srp-rows-per-page-select"
              aria-label="Rows per page preset"
              value={[10, 20, 50, 100].includes(perPage) ? perPage : 'custom'}
              onChange={(e) => {
                const val = e.target.value
                if (val !== 'custom') setPerPage(Number(val))
              }}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            >
              <option value={10}>10</option>
              <option value={20}>20 (Default)</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              {![10, 20, 50, 100].includes(perPage) && <option value="custom">Custom ({perPage})</option>}
            </select>
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
              style={{ width: '60px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-data-table">
            <caption className="sr-only">SRP bulletin records</caption>
            <thead>
              <tr>
                <th>Commodity</th>
                <th>Classification</th>
                <th>Effective date</th>
                <th>SRP</th>
                <th>Source</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }, (_, index) => (
                <tr className="admin-skeleton-row" key={index}>
                  <td colSpan={7}><span /></td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="admin-empty-state">
                      <FileJson size={28} aria-hidden="true" />
                      <strong>No SRP records found</strong>
                      <span>Adjust the search or choose another record view.</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && records.map((record) => (
                <tr key={record.id}>
                  <td data-label="Commodity">
                    <strong>{record.commodity_name}</strong>
                    <small>{record.unit || 'Unit not specified'}</small>
                  </td>
                  <td data-label="Classification">
                    <span>{record.category || 'Uncategorized'}</span>
                    <small>{record.regulatory_classification?.replaceAll('_', ' ') || 'No classification'}</small>
                  </td>
                  <td data-label="Effective date">{record.effective_date.slice(0, 10)}</td>
                  <td data-label="SRP" className="admin-price">₱{Number(record.baseline_price).toFixed(2)}</td>
                  <td data-label="Source">{record.source_reference || 'Legacy record'}</td>
                  <td data-label="Status">
                    <span className={`admin-status-badge ${view}`}>
                      {view === 'current' ? 'Current' : view === 'scheduled' ? 'Scheduled' : 'Historical'}
                    </span>
                  </td>
                  <td data-label="Action">
                    <button
                      type="button"
                      className="admin-row-action"
                      disabled={!capabilities.can_publish}
                      aria-label={`Revise ${record.commodity_name}`}
                      onClick={() => setRevisionRecord(record)}
                    >
                      <PencilLine size={16} aria-hidden="true" /> Revise
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <nav className="admin-pagination" aria-label="SRP pagination">
          <button
            type="button"
            aria-label="Previous page"
            disabled={pagination.current_page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft size={17} aria-hidden="true" /> Previous
          </button>

          <div className="admin-page-jump-container" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span>Page</span>
            <input
              type="number"
              className="admin-page-input"
              aria-label="Jump to page"
              min={1}
              max={pagination.last_page || 1}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPageJump}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitPageJump()
                }
              }}
              style={{
                width: '54px',
                padding: '4px 6px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                textAlign: 'center',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            />
            <span>of {pagination.last_page || 1}</span>
          </div>

          <button
            type="button"
            aria-label="Next page"
            disabled={pagination.current_page >= pagination.last_page || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next <ChevronRight size={17} aria-hidden="true" />
          </button>
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
