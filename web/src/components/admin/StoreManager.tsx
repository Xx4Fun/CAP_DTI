import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminApi } from '../../services/adminApi'
import type { GisMonitoringPayload, GisStoreRecord, StoreRecord } from '../../types/admin'
import type { NavigateTo } from './AdminShell'
import { StoreMap } from './StoreMap'
import { MAP_LAYERS, STATUS_STYLE, VISITS_UNLOADED, weekLabel, type LayerId, type PinStatus } from './storeMapUtils'

// chart.js lives in the detail overlay; keep it out of the map's first load.
const StoreDetailOverlay = lazy(() => import('./StoreDetailOverlay').then((module) => ({ default: module.StoreDetailOverlay })))

const NO_STORES: GisStoreRecord[] = []

// What the map can still show from the plain store list when the API predates the GIS endpoint.
const fromStoreList = (stores: StoreRecord[]): GisMonitoringPayload => ({
  week: { key: '', ends_on: '', starts_at: '', ends_at: '', timezone: 'Asia/Manila', is_current: false },
  locations: false,
  weeks: [],
  stores: stores.map((store) => ({ ...store, has_prior_routine_visit: false, verification_required: false, visits: [], prices: [] })),
})
const peso = (value: number) => `₱${value.toFixed(2)}`

export const StoreManager: React.FC<{ onNavigate?: NavigateTo }> = ({ onNavigate }) => {
  // Everything drawn (pins, legend, counts, week label) comes from this loaded payload, never from the slider position.
  const [payload, setPayload] = useState<GisMonitoringPayload | null>(null)
  // The week the slider points at; undefined until the user moves it, which means the current week.
  const [targetWeek, setTargetWeek] = useState<string | undefined>()
  const [layerId, setLayerId] = useState<LayerId>('compliance')
  // Kept with its label so it stays selectable in a week that recorded no price for it.
  const [commodity, setCommodity] = useState<{ key: string; label: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [detailStore, setDetailStore] = useState<StoreRecord | null>(null)
  const [centerTrigger, setCenterTrigger] = useState<{ storeId: number; timestamp: number } | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // The web app can be deployed before the API. An API without the GIS endpoint still serves Compliance from the store list.
  const [apiBehind, setApiBehind] = useState(false)
  const hasLoaded = useRef(false)

  // Visit coordinates are audited evidence: ask for them only while the Visit check layer is open.
  const wantLocations = layerId === 'visit_check'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    // A dragged slider settles into one request; a response for a week the user has left is dropped.
    const timer = setTimeout(() => {
      adminApi.getGisMonitoring(targetWeek, wantLocations).then((data) => {
        if (cancelled) return
        hasLoaded.current = true
        setApiBehind(false)
        setPayload(data)
        setLoading(false)
      }).catch((reason: { response?: { status?: number } }) => {
        if (cancelled) return
        if (reason?.response?.status !== 404) {
          setLoadError(true)
          setLoading(false)
          return
        }
        // 404: this API has no GIS endpoint yet. Fall back to the store list it does have.
        adminApi.getStores().then((list) => {
          if (cancelled) return
          setApiBehind(true)
          setLayerId('compliance')
          setCategoryFilter('all')
          setPayload(fromStoreList(list))
          setLoading(false)
        }).catch(() => {
          if (cancelled) return
          setLoadError(true)
          setLoading(false)
        })
      })
    }, hasLoaded.current ? 300 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [targetWeek, wantLocations, attempt])

  const retry = () => setAttempt((n) => n + 1)

  const handleCenterStore = (storeId: number) => {
    setSelectedStoreId(storeId)
    setCenterTrigger({ storeId, timestamp: Date.now() })
  }

  const handleOpenStoreDetail = (store: StoreRecord) => {
    setSelectedStoreId(store.id)
    setDetailStore(store)
    setIsSidebarOpen(true)
    setCenterTrigger({ storeId: store.id, timestamp: Date.now() })
  }

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev)
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 300)
  }

  const stores = payload?.stores ?? NO_STORES
  const layer = MAP_LAYERS[layerId]
  // Visit check uses coordinates only when they are current: not while a request is in flight, and not after one failed,
  // even if an earlier load for the same week is still in memory.
  const locationsReady = payload?.locations === true && !loading && !loadError

  const weekCommodities = useMemo<[string, string][]>(() => [...new Map(
    stores.flatMap((store) => store.prices).map((price): [string, string] => [
      price.commodity,
      // Some SRP names already carry their unit ("Absolute (1L)").
      price.unit && !price.commodity_name.toLowerCase().includes(price.unit.toLowerCase()) ? `${price.commodity_name} · ${price.unit}` : price.commodity_name,
    ]),
  )].sort((a, b) => a[1].localeCompare(b[1])), [stores])
  // A week without the chosen commodity still shows that commodity (grey pins, no summary), never another one.
  const commodityOptions: [string, string][] = commodity && !weekCommodities.some(([key]) => key === commodity.key)
    ? [...weekCommodities, [commodity.key, commodity.label]]
    : weekCommodities
  const activeCommodity = commodity?.key ?? commodityOptions[0]?.[0] ?? ''
  const chooseCommodity = (key: string) => {
    const option = commodityOptions.find(([candidate]) => candidate === key)
    if (option) setCommodity({ key: option[0], label: option[1] })
  }

  // Stable until the layer, commodity, or loaded payload changes, so StoreMap redraws its pins exactly then.
  const pinOf = useCallback((store: StoreRecord) => layer.pinOf(store as GisStoreRecord, {
    commodity: activeCommodity,
    week: payload?.week ?? { is_current: false },
    locations: locationsReady,
  }), [layer, activeCommodity, payload, locationsReady])

  const counts = useMemo(() => stores.reduce<Record<string, number>>((tally, store) => {
    const { category } = pinOf(store)
    tally[category] = (tally[category] ?? 0) + 1
    return tally
  }, {}), [stores, pinOf])

  // Memoized so StoreMap keeps the same array and does not rebuild every marker on unrelated renders.
  const filteredStores = useMemo(() => stores.filter((s) => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      s.store_name.toLowerCase().includes(term) ||
      s.address.toLowerCase().includes(term) ||
      (s.dti_sec_number || '').toLowerCase().includes(term)

    return matchesSearch && (categoryFilter === 'all' || pinOf(s).category === categoryFilter)
  }), [stores, searchTerm, categoryFilter, pinOf])

  const categories = counts[VISITS_UNLOADED.id] ? [VISITS_UNLOADED] : layer.categories

  const weeks = payload?.weeks ?? []
  const sliderWeek = targetWeek ?? payload?.week.key
  const weekPending = payload !== null && targetWeek !== undefined && targetWeek !== payload.week.key
  const verificationCount = stores.filter((store) => pinOf(store).badge).length

  const priced = stores.flatMap((store) => {
    const price = store.prices.find((row) => row.commodity === activeCommodity)
    return price ? [{ name: store.store_name, price: Number(price.recorded_price) }] : []
  }).sort((a, b) => a.price - b.price)
  const lowest = priced[0]
  const highest = priced[priced.length - 1]

  return (
    <div
      className="gis-monitor"
      data-sidebar={isSidebarOpen ? 'open' : 'closed'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
      }}
    >
      {/* Full-Screen GIS Monitor Canvas */}
      <StoreMap
        stores={filteredStores}
        pinOf={pinOf}
        visitLinks={layerId === 'visit_check' && locationsReady}
        selectedStoreId={selectedStoreId}
        centerTrigger={centerTrigger}
        onSelectStore={(store) => {
          setSelectedStoreId(store.id)
          setCenterTrigger({ storeId: store.id, timestamp: Date.now() })
        }}
        onOpenStoreDetail={handleOpenStoreDetail}
        height="100%"
        fullCanvas
        title="Full-Screen GIS Store Monitoring Canvas"
      />

      {/* Floating layer controls and legend (Top Right) */}
      <div className="gis-control-panel">
        <span className="gis-panel-title">
          <i className="fa-solid fa-layer-group" aria-hidden="true" /> CartoDB GIS Monitor
        </span>

        <div role="group" aria-label="Map layer" className="gis-layer-switch">
          {Object.values(MAP_LAYERS).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === layerId}
              disabled={apiBehind && option.id !== 'compliance'}
              onClick={() => {
                setLayerId(option.id)
                setCategoryFilter('all')
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {apiBehind && (
          <p role="status" className="gis-note">
            Coverage, Prices and Visit check need a server update that has not reached this environment yet. <button type="button" onClick={retry}>Check again</button>
          </p>
        )}

        {layerId !== 'compliance' && payload && (
          <div className="gis-week">
            <label htmlFor="gis-week-slider">Week of {weekLabel(payload.week.key, payload.week.ends_on)}</label>
            {weeks.length > 1 && sliderWeek && (
              <input
                id="gis-week-slider"
                type="range"
                min={0}
                max={weeks.length - 1}
                step={1}
                value={Math.max(0, weeks.indexOf(sliderWeek))}
                aria-valuetext={weekLabel(sliderWeek)}
                onChange={(e) => {
                  // Hold the commodity on screen, even if it was only the default, so weeks compare like with like.
                  if (activeCommodity) chooseCommodity(activeCommodity)
                  setTargetWeek(weeks[Number(e.target.value)])
                }}
              />
            )}
            {weekPending && targetWeek && (loadError
              ? <p role="alert" className="gis-note error">Week of {weekLabel(targetWeek)} could not be loaded. <button type="button" onClick={retry}>Retry</button></p>
              : <p role="status" className="gis-note">Loading week of {weekLabel(targetWeek)}…</p>)}
          </div>
        )}

        {layerId === 'prices' && payload && (
          commodityOptions.length === 0
            ? <p role="status" className="gis-note">No prices were recorded in this week.</p>
            : (
              <>
                <label className="gis-field">
                  Commodity
                  <select value={activeCommodity} onChange={(e) => chooseCommodity(e.target.value)}>
                    {commodityOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                  </select>
                </label>
                {lowest && highest ? (
                  <p className="gis-note" data-testid="gis-price-summary">
                    Lowest {peso(lowest.price)} at {lowest.name} · Highest {peso(highest.price)} at {highest.name} · Spread {peso(highest.price - lowest.price)}
                  </p>
                ) : <p role="status" className="gis-note">No price was recorded for this commodity in this week.</p>}
              </>
            )
        )}

        {layerId === 'visit_check' && payload && !locationsReady && !weekPending && (loadError
          ? <p role="alert" className="gis-note error">Visit locations unavailable. <button type="button" onClick={retry}>Retry</button></p>
          : <p role="status" className="gis-note">Loading visit locations…</p>)}

        <ul className="gis-legend" aria-label="Map legend">
          {categories.map((category) => (
            <li key={category.id} style={{ color: STATUS_STYLE[category.status].color }}>
              <span className="gis-legend-dot" style={{ background: STATUS_STYLE[category.status].dot }} /> {counts[category.id] ?? 0} {category.label}
            </li>
          ))}
          {verificationCount > 0 && (
            <li>
              <span className="store-pin-badge gis-legend-badge" aria-hidden="true">!</span> {verificationCount} Verification required
            </li>
          )}
        </ul>
      </div>


      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          bottom: '12px',
          zIndex: 500,
          width: isSidebarOpen ? '390px' : '54px',
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(14px)',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15), 0 4px 8px -2px rgba(15, 23, 42, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'visible',
        }}
      >
        {/* Vertically Centered Right-Edge Collapse/Expand Toggle Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          style={{
            position: 'absolute',
            top: '50%',
            right: '-14px',
            transform: 'translateY(-50%)',
            zIndex: 600,
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#1e3a8a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
            transition: 'all 0.15s ease',
          }}
        >
          <i className={`fa-solid ${isSidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`} aria-hidden="true" />
        </button>

        {/* Inner Content Frame */}
        <div style={{ width: '100%', height: '100%', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isSidebarOpen && detailStore ? (
            /* Fully Replaces Entire Sidebar when Viewing Store Info */
            <Suspense fallback={
              <div className="store-sidebar-skeleton-list" role="status" aria-label="Loading store details">
                <span className="sr-only">Loading store details...</span>
                {Array.from({ length: 3 }, (_, index) => <div key={index} className="admin-skeleton-block" style={{ height: '96px' }} />)}
              </div>
            }>
              <StoreDetailOverlay
                key={detailStore.id}
                store={detailStore}
                onClose={() => setDetailStore(null)}
                onCenterMap={() => handleCenterStore(detailStore.id)}
                onOpenNotice={onNavigate ? (noticeId) => onNavigate('legal_actions', { source_notice: noticeId }) : undefined}
              />
            </Suspense>
          ) : isSidebarOpen ? (
            /* Standard Store List & Search View */
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Sidebar Header */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: '#ffffff',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1e3a8a',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-building-circle-check" style={{ fontSize: '0.95rem' }} aria-hidden="true" />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    Store Monitoring
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    San Jose de Buenavista Zone
                  </p>
                </div>
              </div>

              {/* Search Input & Status Tabs */}
              <div style={{ padding: '0.85rem 1rem 0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', flexShrink: 0, background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <i
                    className="fa-solid fa-magnifying-glass"
                    style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    placeholder="Search stores, address, SEC #..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.1rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      color: '#0f172a',
                      fontSize: '0.83rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Status Filter Chips */}
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {[{ id: 'all', label: 'All', status: 'blue' as PinStatus, chip: undefined }, ...categories].map((category) => {
                    const active = categoryFilter === category.id
                    const tone = STATUS_STYLE[category.status]
                    return (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCategoryFilter(category.id)}
                        style={{
                          minHeight: '44px',
                          padding: '0.3rem 0.5rem',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          borderRadius: '6px',
                          border: active ? `1px solid ${tone.color}` : '1px solid #e2e8f0',
                          background: active ? tone.bg : '#ffffff',
                          color: active ? tone.color : '#64748b',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {category.chip ?? category.label} ({category.id === 'all' ? stores.length : counts[category.id] ?? 0})
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Scrollable Store Cards List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {loading && !payload && (
                  <div className="store-sidebar-skeleton-list" aria-label="Loading establishments" role="status">
                    <span className="sr-only">Loading establishments...</span>
                    {Array.from({ length: 4 }, (_, idx) => (
                      <div key={idx} className="store-card-skeleton" aria-hidden="true">
                        <div className="store-skeleton-header">
                          <div className="admin-skeleton-block" style={{ height: '16px', width: '60%', borderRadius: '4px' }} />
                          <div className="admin-skeleton-block" style={{ height: '18px', width: '25%', borderRadius: '999px' }} />
                        </div>
                        <div className="admin-skeleton-block" style={{ height: '13px', width: '85%', borderRadius: '4px', marginTop: '6px' }} />
                        <div className="admin-skeleton-block" style={{ height: '12px', width: '40%', borderRadius: '4px', marginTop: '6px' }} />
                      </div>
                    ))}
                  </div>
                )}

                {loadError && !payload && (
                  <div role="alert" style={{ padding: '1rem', color: '#991b1b', background: '#fef2f2', borderRadius: '8px', fontSize: '0.82rem' }}>
                    Establishments could not be loaded. Retry when the Admin API is available. <button type="button" onClick={retry}>Retry</button>
                  </div>
                )}

                {payload && filteredStores.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    No establishments found matching search criteria.
                  </div>
                )}

                {filteredStores.map((store) => {
                  const statusInfo = pinOf(store)
                  const tone = STATUS_STYLE[statusInfo.status]
                  const isSelected = store.id === selectedStoreId

                  return (
                    <div
                      key={store.id}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        boxShadow: isSelected ? '0 2px 8px rgba(30, 58, 138, 0.12)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.88rem', color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                          {store.store_name}
                        </strong>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: tone.bg,
                            color: tone.color,
                            border: `1px solid ${tone.border}`,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {statusInfo.label}{statusInfo.text ? ` · ${statusInfo.text}` : ''}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span>
                          <strong style={{ color: '#1e3a8a' }}>SEC #:</strong> {store.dti_sec_number || 'N/A'}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <i className="fa-solid fa-location-dot" style={{ color: '#94a3b8', marginRight: '0.3rem' }} aria-hidden="true" />
                          {store.address}
                        </span>
                        {statusInfo.badge && <strong style={{ color: '#6d28d9' }}>{statusInfo.badge}</strong>}
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenStoreDetail(store)
                          }}
                          style={{
                            flex: 1,
                            padding: '0.35rem 0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe',
                            background: isSelected ? '#1e3a8a' : '#eff6ff',
                            color: isSelected ? '#ffffff' : '#1e3a8a',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <i className="fa-solid fa-circle-info" aria-hidden="true" /> Open Info
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand GIS Registry Sidebar"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', gap: '0.4rem', border: 0, background: 'transparent' }}
              title="Expand GIS Registry Sidebar"
            >
              <i className="fa-solid fa-map-location-dot" style={{ color: '#1e3a8a', fontSize: '1.2rem' }} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
