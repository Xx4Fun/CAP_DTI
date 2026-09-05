import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, Search, TriangleAlert, X } from 'lucide-react'
import { analyzeWithReference, resolveClientReference } from '../app/workflow'
import type { Bulletin, MonitoringProtocol, RegulatoryPrice, StoreRecord, VisitDraft } from '../types'

interface DtiMonitoringSheetProps {
  store: StoreRecord | undefined
  draft: VisitDraft
  bulletins: Bulletin[]
  protocol?: MonitoringProtocol
  regulatoryPrices?: RegulatoryPrice[]
  onUpdatePrice: (srpId: number, price: number | null) => void
  onProceedToReview?: () => void
  onPrevious?: () => void
}

export function DtiMonitoringSheet({
  store,
  draft,
  bulletins,
  protocol,
  regulatoryPrices = [],
  onUpdatePrice,
  onProceedToReview,
  onPrevious,
}: DtiMonitoringSheetProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [filterMode, setFilterMode] = useState<'all' | 'encoded' | 'compliant' | 'anomalies'>('all')

  // Map of recorded prices for quick lookup
  const recordedMap = useMemo(() => {
    const map = new Map<number, number>()
    draft.items.forEach((item) => {
      map.set(item.srp_id, item.recorded_price)
    })
    return map
  }, [draft.items])

  const bulletinMap = useMemo(() => {
    const map = new Map<number, Bulletin>()
    bulletins.forEach((b) => map.set(b.id, b))
    return map
  }, [bulletins])

  // Count anomalies & compliance
  const { encodedCount, anomalyCount, compliantCount } = useMemo(() => {
    let anomalies = 0
    draft.items.forEach((item) => {
      const bulletin = bulletinMap.get(item.srp_id)
      if (bulletin) {
        if (analyzeWithReference(item, resolveClientReference(bulletin, protocol?.mode || 'standard', regulatoryPrices)).is_anomaly) anomalies++
      }
    })
    return {
      encodedCount: draft.items.length,
      anomalyCount: anomalies,
      compliantCount: draft.items.filter((item) => {
        const bulletin = bulletinMap.get(item.srp_id)
        return bulletin && analyzeWithReference(item, resolveClientReference(bulletin, protocol?.mode || 'standard', regulatoryPrices)).label === 'Within reference'
      }).length,
    }
  }, [draft.items, bulletinMap, protocol?.mode, regulatoryPrices])

  // Distinct categories
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>()
    bulletins.forEach((b) => {
      if (b.category) set.add(b.category)
    })
    return Array.from(set).sort()
  }, [bulletins])

  // Filtered bulletins
  const filteredBulletins = useMemo(() => {
    return bulletins.filter((item) => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const nameMatch = item.commodity_name.toLowerCase().includes(q)
        const unitMatch = item.unit ? item.unit.toLowerCase().includes(q) : false
        const catMatch = item.category ? item.category.toLowerCase().includes(q) : false
        if (!nameMatch && !unitMatch && !catMatch) return false
      }

      // 2. Category Filter
      if (selectedCategory !== 'ALL' && (item.category || 'General Commodities') !== selectedCategory) {
        return false
      }

      // 3. View Filter (All / Encoded / In Compliance / Flagged)
      const recorded = recordedMap.get(item.id)
      const isRecorded = recorded !== undefined
      const reference = resolveClientReference(item, protocol?.mode || 'standard', regulatoryPrices)
      const analysis = isRecorded ? analyzeWithReference({ srp_id: item.id, recorded_price: recorded }, reference) : null
      const isAnomaly = analysis?.is_anomaly || false

      if (filterMode === 'encoded' && !isRecorded) {
        return false
      }
      if (filterMode === 'compliant') {
        if (!isRecorded || isAnomaly || analysis?.label !== 'Within reference') return false
      }
      if (filterMode === 'anomalies') {
        if (!isRecorded || !isAnomaly) return false
      }

      return true
    })
  }, [bulletins, searchQuery, selectedCategory, filterMode, recordedMap, protocol?.mode, regulatoryPrices])

  // Group filtered bulletins by Major Classification -> Category
  const groupedSections = useMemo(() => {
    const sections: {
      classification: string
      categories: {
        categoryName: string
        items: Bulletin[]
      }[]
    }[] = []

    const basicItems: Bulletin[] = []
    const primeItems: Bulletin[] = []

    filteredBulletins.forEach((item) => {
      const classification = item.regulatory_classification || 'BASIC_NECESSITY'
      if (classification.toUpperCase().includes('PRIME')) {
        primeItems.push(item)
      } else {
        basicItems.push(item)
      }
    })

    const groupByCategory = (items: Bulletin[]) => {
      const map = new Map<string, Bulletin[]>()
      items.forEach((item) => {
        const cat = item.category || 'General Commodities'
        if (!map.has(cat)) map.set(cat, [])
        map.get(cat)!.push(item)
      })
      return Array.from(map.entries()).map(([categoryName, catItems]) => ({
        categoryName,
        items: catItems,
      }))
    }

    if (basicItems.length > 0) {
      sections.push({
        classification: 'BASIC NECESSITIES',
        categories: groupByCategory(basicItems),
      })
    }

    if (primeItems.length > 0) {
      sections.push({
        classification: 'PRIME COMMODITIES',
        categories: groupByCategory(primeItems),
      })
    }

    return sections
  }, [filteredBulletins])

  return (
    <div className="dti-matrix-sheet">
      {/* 1. Store Identity Strip with Live Progress Counter */}
      <div className="dti-store-strip">
        <div className="dti-store-identity">
          <Building2 size={18} className="dti-store-icon" aria-hidden="true" />
          <div className="dti-store-header-title">
            <strong className="dti-store-name">{store?.store_name || draft.store_name || (draft.store_id ? `Store #${draft.store_id}` : 'Selected Establishment')}</strong>
            <span className="dti-store-address">· {store?.address || draft.store_address || 'San Jose de Buenavista, Antique'}</span>
          </div>
        </div>

        <div className="dti-matrix-stats-pill">
          <span className="stats-encoded">
            <strong>{encodedCount}</strong> prices recorded
          </span>
          {anomalyCount > 0 && (
            <span className="stats-anomaly">
              <TriangleAlert size={12} /> {anomalyCount} for review
            </span>
          )}
        </div>
      </div>

      {/* 2. 2-Row Sticky Search & Filter Toolbar */}
      <div className="dti-matrix-toolbar">
        {/* Row 1: Search + Category side-by-side */}
        <div className="dti-search-pair">
          <div className="dti-matrix-search-box">
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search commodity or brand (e.g. Wilkins, Saba, Bear Brand)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="dti-matrix-category-select">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by commodity category"
            >
              <option value="ALL">All Categories ({bulletins.length})</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: 4 Dedicated Review Filter Pills */}
        <div className="dti-matrix-filter-row">
          <div className="dti-matrix-filter-pills" role="tablist" aria-label="Inspection record review filter">
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'all'}
              aria-label={`All (${bulletins.length})`}
              className={filterMode === 'all' ? 'active' : ''}
              onClick={() => setFilterMode('all')}
            >
              <span className="dti-pill-label-desktop">All</span>
              <span className="dti-pill-label-mobile">All</span>
              <span className="tab-badge">{bulletins.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'encoded'}
              aria-label={`Recorded (${encodedCount})`}
              className={filterMode === 'encoded' ? 'active' : ''}
              onClick={() => setFilterMode('encoded')}
            >
              <span className="dti-pill-label-desktop">Recorded</span>
              <span className="dti-pill-label-mobile">Done</span>
              <span className="tab-badge">{encodedCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'compliant'}
              aria-label={`Within reference (${compliantCount})`}
              className={`compliant-tab ${filterMode === 'compliant' ? 'active' : ''}`}
              onClick={() => setFilterMode('compliant')}
            >
              <span className="dti-pill-label-desktop">Within reference</span>
              <span className="dti-pill-label-mobile">OK</span>
              <span className="tab-badge">{compliantCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'anomalies'}
              aria-label={`For review (${anomalyCount})`}
              className={`anomaly-tab ${filterMode === 'anomalies' ? 'active' : ''}`}
              onClick={() => setFilterMode('anomalies')}
            >
              <span className="dti-pill-label-desktop">For review</span>
              <span className="dti-pill-label-mobile">Review</span>
              <span className="tab-badge">{anomalyCount}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Dedicated 5-Column DTI Price Monitoring Table */}
      <div className="dti-matrix-table-container">
        <table className="dti-matrix-table dti-5col-table">
          <thead>
            <tr>
              <th className="col-commodity">BASIC NECESSITIES AND PRIME COMMODITIES</th>
              <th className="col-unit">UNIT</th>
              <th className="col-srp">ACTIVE REFERENCE</th>
              <th className="col-price">MONITORED PRICE</th>
              <th className="col-status">VARIANCE</th>
            </tr>
          </thead>
          <tbody>
            {groupedSections.length === 0 ? (
              <tr>
                <td colSpan={5} className="dti-matrix-empty">
                  <p>No commodities found matching current filters</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedCategory('ALL')
                      setFilterMode('all')
                    }}
                  >
                    Reset filters
                  </button>
                </td>
              </tr>
            ) : (
              groupedSections.map((section) => (
                <React.Fragment key={section.classification}>
                  {/* Major Classification Banner */}
                  <tr className="dti-classification-banner">
                    <td colSpan={5}>
                      <span>{section.classification}</span>
                    </td>
                  </tr>

                  {/* Subcategory Groups (Highlighted in Warm Yellow) */}
                  {section.categories.map((catGroup) => (
                    <React.Fragment key={catGroup.categoryName}>
                      <tr className="dti-category-banner">
                        <td colSpan={5}>
                          <span>{catGroup.categoryName}</span>
                        </td>
                      </tr>

                      {/* Item Rows (5 Columns) */}
                      {catGroup.items.map((item) => {
                        const recordedPrice = recordedMap.get(item.id)
                        const hasRecorded = recordedPrice !== undefined && Number.isFinite(recordedPrice)
                        const reference = resolveClientReference(item, protocol?.mode || 'standard', regulatoryPrices)
                        const baseline = Number(item.baseline_price)
                        const displayedReference = protocol?.mode === 'emergency'
                          ? reference.value
                          : Number.isFinite(baseline) && baseline > 0 ? baseline : null
                        const analysis = hasRecorded ? analyzeWithReference({ srp_id: item.id, recorded_price: recordedPrice }, reference) : null
                        const isAnomaly = analysis?.is_anomaly || false
                        const variance = analysis?.variance_percent ?? null

                        return (
                          <tr
                            key={item.id}
                            className={`dti-item-row ${hasRecorded ? 'is-recorded' : ''} ${isAnomaly ? 'is-anomaly' : ''}`}
                          >
                            {/* Col 1: Commodity Name */}
                            <td className="dti-item-desc">
                              <span className="dti-item-name">{item.commodity_name}</span>
                            </td>

                            {/* Col 2: Unit */}
                            <td className="dti-item-unit">
                              <span className="unit-tag">{item.unit || '—'}</span>
                            </td>

                            {/* Col 3: Official SRP */}
                            <td className="dti-item-srp">
                              <span className={displayedReference !== null ? 'srp-value' : 'srp-none'}>
                                {displayedReference !== null ? `₱${displayedReference.toFixed(2)}` : 'UNAVAILABLE'}
                              </span>
                            </td>

                            {/* Col 4: Monitored Price (Clean numeric input without accidental 'X' trigger) */}
                            <td className="dti-item-input-cell">
                              <div className="dti-price-entry-group">
                                <div className={`dti-price-input-box ${hasRecorded ? 'has-value' : ''} ${isAnomaly ? 'is-anomaly-input' : ''}`}>
                                  <span className="currency-symbol">₱</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    aria-label={`Observed shelf price for ${item.commodity_name}`}
                                    value={hasRecorded ? recordedPrice : ''}
                                    onChange={(e) => {
                                      const text = e.target.value.trim()
                                      if (text === '') {
                                        onUpdatePrice(item.id, null)
                                      } else {
                                        const num = Number(text)
                                        if (Number.isFinite(num) && num >= 0) {
                                          onUpdatePrice(item.id, num)
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Col 5: Compact Variance Percentage Tag */}
                            <td className="dti-item-status-cell">
                              {hasRecorded && reference.status === 'unavailable' ? <span className="dti-variance-pill pill-unavailable">Reference unavailable</span> : hasRecorded && variance !== null ? (
                                <span
                                  className={`dti-variance-pill ${isAnomaly ? 'pill-anomaly' : variance === 0 ? 'pill-exact' : variance > 0 ? 'pill-ok' : 'pill-discount'}`}
                                  title={isAnomaly ? `+${variance.toFixed(1)}% above the current reference and requires review` : `${variance >= 0 ? '+' : ''}${variance.toFixed(1)}% relative to SRP`}
                                >
                                  {variance > 0 ? `+${variance.toFixed(1)}%` : `${variance.toFixed(1)}%`}
                                </span>
                              ) : (
                                <span className="dti-unrecorded-dash" title="Unrecorded price">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Unified Sticky Bottom Navigation Bar */}
      <div className="dti-floating-bottom-bar">
        {onPrevious ? (
          <button
            type="button"
            className="secondary-button bottom-prev-btn"
            aria-label="Back to Choose Store"
            onClick={onPrevious}
          >
            <ArrowLeft size={16} />
            <span>Previous</span>
          </button>
        ) : (
          <div />
        )}

        {onProceedToReview && (
          <button
            type="button"
            className="primary-button proceed-review-btn"
            disabled={encodedCount === 0}
            aria-label="Review visit evidence"
            onClick={onProceedToReview}
          >
            <span>Next</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
