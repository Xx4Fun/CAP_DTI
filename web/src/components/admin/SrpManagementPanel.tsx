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
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileJson,
  LayoutGrid,
  Plus,
  RotateCcw,
  Search,
  TrendingUp,
  X,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import { formatCommodityDisplay } from '../../utils/commodityFormatter'
import type { SrpRecord } from '../../types/admin'
import type {
  ManagedSrpRecord,
  SrpCapabilities,
  SrpListFilters,
  SrpPage,
  SrpPagination,
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
    const focusable = Array.from(
      panel.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
      ) ?? [],
    )
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
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
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

function CreateSrpModal({
  onClose,
  onCreated,
  categories,
}: {
  onClose: () => void
  onCreated: () => Promise<void>
  categories: string[]
}) {
  const [commodityName, setCommodityName] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [regulatoryClassification, setRegulatoryClassification] = useState('BASIC_NECESSITY')
  const [baselinePrice, setBaselinePrice] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [sourceReference, setSourceReference] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      let imagePath: string | undefined = undefined
      if (imageFile) {
        const uploadRes = await adminApi.uploadCommodityImage(imageFile)
        imagePath = uploadRes.image_path
      }
      await adminApi.createSrpItem({
        commodity_name: commodityName,
        unit: unit || undefined,
        category: category || undefined,
        regulatory_classification: regulatoryClassification,
        baseline_price: Number(baselinePrice),
        effective_date: effectiveDate,
        source_reference: sourceReference,
        image_path: imagePath,
      })
      await onCreated()
      onClose()
    } catch (requestError) {
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModal title="Add SRP bulletin item" onClose={onClose}>
      <form className="admin-form admin-modal-form" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="create-commodity-name">Commodity Name</label>
            <input
              id="create-commodity-name"
              type="text"
              value={commodityName}
              onChange={(e) => setCommodityName(e.target.value)}
              placeholder="e.g. Nescafé Classic"
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="create-unit">Unit / Weight</label>
            <input
              id="create-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. 50g, 155g, 330ml"
            />
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="create-category">Category</label>
            <select
              id="create-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="create-classification">Regulatory Classification</label>
            <select
              id="create-classification"
              value={regulatoryClassification}
              onChange={(e) => setRegulatoryClassification(e.target.value)}
            >
              <option value="BASIC_NECESSITY">Basic Necessity</option>
              <option value="PRIME_COMMODITY">Prime Commodity</option>
            </select>
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="create-price">SRP Baseline (₱)</label>
            <input
              id="create-price"
              type="number"
              min="0"
              step="0.01"
              value={baselinePrice}
              onChange={(e) => setBaselinePrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="create-effective-date">Effective Date</label>
            <input
              id="create-effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="admin-field">
          <label htmlFor="create-source">Authoritative Source Reference</label>
          <input
            id="create-source"
            type="text"
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
            placeholder="e.g. DTI Memorandum Circular No. 2026-01"
            required
          />
        </div>

        <div className="admin-field">
          <label htmlFor="create-image">Product Image (Optional WebP / PNG / JPG)</label>
          <input
            id="create-image"
            type="file"
            accept="image/webp,image/jpeg,image/png,image/jpg"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setImageFile(file)
            }}
          />
        </div>

        {error && <p className="admin-feedback error" role="alert">{error}</p>}

        <footer className="admin-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add Item'}
          </button>
        </footer>
      </form>
    </AdminModal>
  )
}

function EditMetadataModal({
  record,
  onClose,
  onUpdated,
  categories,
}: {
  record: ManagedSrpRecord
  onClose: () => void
  onUpdated: () => Promise<void>
  categories: string[]
}) {
  const [commodityName, setCommodityName] = useState(record.commodity_name)
  const [unit, setUnit] = useState(record.unit ?? '')
  const [category, setCategory] = useState(record.category ?? '')
  const [regulatoryClassification, setRegulatoryClassification] = useState(
    record.regulatory_classification ?? 'BASIC_NECESSITY',
  )
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      let imagePath = record.image_path ?? undefined
      if (imageFile) {
        const uploadRes = await adminApi.uploadCommodityImage(imageFile)
        imagePath = uploadRes.image_path
      }
      await adminApi.updateSrpMetadata(record.id, {
        commodity_name: commodityName,
        unit: unit || undefined,
        category: category || undefined,
        regulatory_classification: regulatoryClassification,
        image_path: imagePath,
      })
      await onUpdated()
      onClose()
    } catch (requestError) {
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModal title="Edit commodity details" onClose={onClose}>
      <form className="admin-form admin-modal-form" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="edit-commodity-name">Commodity Name</label>
            <input
              id="edit-commodity-name"
              type="text"
              value={commodityName}
              onChange={(e) => setCommodityName(e.target.value)}
              required
            />
          </div>
          <div className="admin-field">
            <label htmlFor="edit-unit">Unit / Weight</label>
            <input
              id="edit-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
        </div>

        <div className="admin-form-grid">
          <div className="admin-field">
            <label htmlFor="edit-category">Category</label>
            <select
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="edit-classification">Regulatory Classification</label>
            <select
              id="edit-classification"
              value={regulatoryClassification}
              onChange={(e) => setRegulatoryClassification(e.target.value)}
            >
              <option value="BASIC_NECESSITY">Basic Necessity</option>
              <option value="PRIME_COMMODITY">Prime Commodity</option>
            </select>
          </div>
        </div>

        <div className="admin-field">
          <label htmlFor="edit-image">Product Image (Optional WebP / PNG / JPG)</label>
          <input
            id="edit-image"
            type="file"
            accept="image/webp,image/jpeg,image/png,image/jpg"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setImageFile(file)
            }}
          />
          {record.image_path && <small style={{ color: '#059669' }}>Current image: {record.image_path}</small>}
        </div>

        {error && <p className="admin-feedback error" role="alert">{error}</p>}

        <footer className="admin-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </footer>
      </form>
    </AdminModal>
  )
}

function BatchUpdateSrpModal({
  onClose,
  onUpdated,
}: {
  onClose: () => void
  onUpdated: () => Promise<void>
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [sourceReference, setSourceReference] = useState('')
  const [changeReason, setChangeReason] = useState('')

  const [items, setItems] = useState<ManagedSrpRecord[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const goToStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveDate || !sourceReference || !changeReason) return
    setStep(2)
    setLoadingItems(true)
    setError('')
    try {
      const pageResult = normalizePage(await adminApi.getSrp({ per_page: 1000 }))
      setItems(pageResult.records)
    } catch (err) {
      setError(requestMessage(err))
    } finally {
      setLoadingItems(false)
    }
  }

  const filteredItems = useMemo(() => {
    if (!modalSearch.trim()) return items
    const q = modalSearch.toLowerCase()
    return items.filter(
      (item) =>
        item.commodity_name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)),
    )
  }, [items, modalSearch])

  const handlePriceChange = (id: number, val: string) => {
    setPriceEdits((prev) => ({ ...prev, [id]: val }))
  }

  const changedUpdates = useMemo(() => {
    const updates: Array<{ id: number; baseline_price: number }> = []
    Object.entries(priceEdits).forEach(([idStr, val]) => {
      const numVal = parseFloat(val)
      if (!isNaN(numVal) && numVal >= 0) {
        updates.push({ id: Number(idStr), baseline_price: numVal })
      }
    })
    return updates
  }, [priceEdits])

  const handleFinalSubmit = async () => {
    if (changedUpdates.length === 0) {
      setError('Please enter at least one updated SRP price.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await adminApi.batchUpdateSrpPrices({
        effective_date: effectiveDate,
        source_reference: sourceReference,
        change_reason: changeReason,
        updates: changedUpdates,
      })
      await onUpdated()
      onClose()
    } catch (requestError) {
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModal
      title={
        step === 1
          ? 'Update SRP prices — Step 1: Bulletin Details'
          : 'Update SRP prices — Step 2: Revise Prices'
      }
      onClose={onClose}
    >
      {step === 1 ? (
        <form className="admin-form admin-modal-form" onSubmit={goToStep2}>
          <div className="admin-field">
            <label htmlFor="batch-effective-date">Unified Effective Date</label>
            <input
              id="batch-effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
            />
            <small>All updated prices in this batch will take effect on this date.</small>
          </div>

          <div className="admin-field">
            <label htmlFor="batch-source-ref">Authoritative Source Reference</label>
            <input
              id="batch-source-ref"
              type="text"
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
              placeholder="e.g. DTI Memorandum Circular No. 2026-03"
              required
            />
          </div>

          <div className="admin-field">
            <label htmlFor="batch-reason">Change Reason / Bulletin Note</label>
            <textarea
              id="batch-reason"
              rows={3}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. Quarterly SRP adjustment based on raw material fluctuations."
              required
            />
          </div>

          <footer className="admin-modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-button primary">
              Next: Edit Prices →
            </button>
          </footer>
        </form>
      ) : (
        <div className="admin-form admin-modal-form">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              marginBottom: '0.75rem',
            }}
          >
            <div className="admin-search-field" style={{ position: 'relative', flex: 1 }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Filter commodities in this list..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.4rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#1d4ed8',
                whiteSpace: 'nowrap',
              }}
            >
              {changedUpdates.length} items modified
            </span>
          </div>

          <div
            style={{
              maxHeight: '380px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            {loadingItems ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Loading commodities list…
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0.6rem 0.85rem', color: '#64748b' }}>Commodity</th>
                    <th style={{ padding: '0.6rem 0.85rem', color: '#64748b' }}>Current SRP</th>
                    <th style={{ padding: '0.6rem 0.85rem', color: '#64748b', width: '140px' }}>
                      New SRP (₱)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const hasEdit =
                      priceEdits[item.id] !== undefined && priceEdits[item.id] !== ''
                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: hasEdit ? '#eff6ff' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0.6rem 0.85rem' }}>
                          {(() => {
                            const parsed = formatCommodityDisplay(item.commodity_name, item.category || '', item.unit || '')
                            return (
                              <>
                                <strong style={{ display: 'block', color: '#0f172a' }}>
                                  {parsed.title}
                                </strong>
                                <small style={{ color: '#64748b' }}>
                                  {parsed.unit ? `${parsed.unit} • ${parsed.categoryPath}` : parsed.categoryPath}
                                </small>
                              </>
                            )
                          })()}
                        </td>
                        <td
                          style={{
                            padding: '0.6rem 0.85rem',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                          }}
                        >
                          ₱{Number(item.baseline_price).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={Number(item.baseline_price).toFixed(2)}
                            value={priceEdits[item.id] ?? ''}
                            onChange={(e) => handlePriceChange(item.id, e.target.value)}
                            style={{
                              width: '110px',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '6px',
                              border: hasEdit ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              fontWeight: 700,
                              color: hasEdit ? '#1d4ed8' : '#0f172a',
                              textAlign: 'right',
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {error && <p className="admin-feedback error" role="alert">{error}</p>}

          <footer className="admin-modal-actions">
            <button type="button" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              type="button"
              className="admin-button primary"
              disabled={busy || changedUpdates.length === 0}
              onClick={() => void handleFinalSubmit()}
            >
              {busy ? 'Saving…' : `Submit ${changedUpdates.length} SRP Updates`}
            </button>
          </footer>
        </div>
      )}
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

  const [createOpen, setCreateOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<ManagedSrpRecord | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)

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
            gridTemplateColumns: 'minmax(240px, 2fr) minmax(160px, 1fr) auto auto auto',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          <div className="admin-search-field" style={{ position: 'relative', width: '100%' }}>
            <Search
              size={17}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search SRP bulletins"
              placeholder="Search commodity name, category, or source..."
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
              padding: '0.65rem 0.85rem',
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
            className="admin-button secondary"
            disabled={!capabilities.can_publish}
            onClick={() => setBatchOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: '1px solid #3b82f6',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <TrendingUp size={16} aria-hidden="true" /> Update SRP Prices
          </button>

          <button
            type="button"
            className="admin-button primary"
            disabled={!capabilities.can_publish}
            onClick={() => setCreateOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1rem',
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
            <Plus size={17} aria-hidden="true" /> Add SRP Item
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
          <button type="button" onClick={() => void loadRecords()}>
            Retry
          </button>
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
                <th
                  style={{
                    padding: '0.85rem 1.1rem',
                    textAlign: 'left',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  Commodity
                </th>
                <th
                  style={{
                    padding: '0.85rem 1.1rem',
                    textAlign: 'left',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  Category
                </th>
                <th
                  style={{
                    padding: '0.85rem 1.1rem',
                    textAlign: 'left',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  Effective Date
                </th>
                <th
                  style={{
                    padding: '0.85rem 1.1rem',
                    textAlign: 'left',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  SRP Baseline
                </th>
                <th
                  style={{
                    padding: '0.85rem 1.1rem',
                    textAlign: 'left',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  Source Reference
                </th>
                <th
                  style={{
                    padding: '0.85rem 1.1rem',
                    textAlign: 'center',
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 4 }, (_, index) => (
                  <tr className="admin-skeleton-row" key={index}>
                    <td colSpan={6} style={{ padding: '1rem' }}>
                      <span />
                    </td>
                  </tr>
                ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center' }}>
                    <div
                      className="admin-empty-state"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <FileJson size={32} style={{ color: '#94a3b8' }} aria-hidden="true" />
                      <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                        No SRP records found
                      </strong>
                      <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        Adjust search query or category filter.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading &&
                records.map((record) => (
                  <tr
                    key={record.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                  >
                    <td data-label="Commodity" style={{ padding: '0.85rem 1.1rem' }}>
                      {(() => {
                        const parsed = formatCommodityDisplay(record.commodity_name, record.category || '', record.unit || '')
                        return (
                          <>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: '0.9rem',
                                color: '#0f172a',
                                fontWeight: 700,
                              }}
                            >
                              {parsed.title}
                            </strong>
                            <small style={{ fontSize: '0.78rem', color: '#64748b' }}>
                              {parsed.unit || 'Unit not specified'}
                            </small>
                          </>
                        )
                      })()}
                    </td>
                    <td data-label="Category" style={{ padding: '0.85rem 1.1rem' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.85rem',
                          color: '#334155',
                          fontWeight: 600,
                        }}
                      >
                        {record.category || 'Uncategorized'}
                      </span>
                      <small style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        {record.regulatory_classification?.replaceAll('_', ' ') ||
                          'No classification'}
                      </small>
                    </td>
                    <td
                      data-label="Effective date"
                      style={{
                        padding: '0.85rem 1.1rem',
                        fontSize: '0.85rem',
                        color: '#475569',
                        fontWeight: 500,
                      }}
                    >
                      {record.effective_date.slice(0, 10)}
                    </td>
                    <td
                      data-label="SRP"
                      className="admin-price"
                      style={{
                        padding: '0.85rem 1.1rem',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        fontSize: '0.92rem',
                      }}
                    >
                      ₱{Number(record.baseline_price).toFixed(2)}
                    </td>
                    <td
                      data-label="Source"
                      style={{ padding: '0.85rem 1.1rem', fontSize: '0.85rem', color: '#64748b' }}
                    >
                      {record.source_reference || 'Official DTI Record'}
                    </td>
                    <td
                      data-label="Action"
                      style={{ padding: '0.85rem 1.1rem', textAlign: 'center' }}
                    >
                      <button
                        type="button"
                        disabled={!capabilities.can_publish}
                        aria-label={`Edit ${record.commodity_name}`}
                        onClick={() => setEditRecord(record)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#334155',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={14} aria-hidden="true" />
                        <span>Edit</span>
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
              Showing{' '}
              <strong style={{ color: '#0f172a' }}>
                {pagination.from ?? (records.length ? 1 : 0)}–{pagination.to ?? records.length}
              </strong>{' '}
              of <strong style={{ color: '#0f172a' }}>{pagination.total}</strong> entries
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label
                htmlFor="srp-rows-per-page-select"
                style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 600 }}
              >
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

      {createOpen && (
        <CreateSrpModal
          onClose={() => setCreateOpen(false)}
          onCreated={loadRecords}
          categories={categories}
        />
      )}

      {editRecord && (
        <EditMetadataModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onUpdated={loadRecords}
          categories={categories}
        />
      )}

      {batchOpen && (
        <BatchUpdateSrpModal onClose={() => setBatchOpen(false)} onUpdated={loadRecords} />
      )}
    </section>
  )
}
