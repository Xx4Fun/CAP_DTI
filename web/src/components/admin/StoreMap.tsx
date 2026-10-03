import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { GisVisit, StoreRecord } from '../../types/admin'
import { STATUS_STYLE, buildStorePopupContent, buildVisitPopupContent, getStoreStatusInfo, visitNeedsReview, type PinInfo } from './storeMapUtils'

type MapStore = StoreRecord & { visits?: GisVisit[] }

export interface StoreMapProps {
  latitude?: number
  longitude?: number
  onLocationChange?: (lat: number, lng: number) => void
  readOnly?: boolean
  stores?: MapStore[]
  /** What each pin shows on the active layer. Must be stable between renders: a new function redraws every pin. */
  pinOf?: (store: StoreRecord) => PinInfo
  /** Draw each visit that carries coordinates: its GPS point, accuracy circle, and a line to the registered pin. */
  visitLinks?: boolean
  selectedStoreId?: number | null
  centerTrigger?: { storeId: number; timestamp: number } | null
  onSelectStore?: (store: StoreRecord) => void
  onOpenStoreDetail?: (store: StoreRecord) => void
  height?: string
  title?: string
  fullCanvas?: boolean
}

function createCustomPinIcon(status: 'green' | 'yellow' | 'red', isSelected: boolean = false): L.DivIcon {
  const colors = {
    green: { bg: '#10b981', ring: 'rgba(16, 185, 129, 0.5)', glow: 'rgba(16, 185, 129, 0.8)' },
    yellow: { bg: '#f59e0b', ring: 'rgba(245, 158, 11, 0.5)', glow: 'rgba(245, 158, 11, 0.8)' },
    red: { bg: '#ef4444', ring: 'rgba(239, 68, 68, 0.5)', glow: 'rgba(239, 68, 68, 0.8)' },
  }
  const theme = colors[status] || colors.green
  const size = isSelected ? 22 : 18
  const half = size / 2

  return L.divIcon({
    className: `store-pin-container status-${status} ${isSelected ? 'selected' : ''}`,
    html: `
      <div style="
        background-color: ${theme.bg};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: ${isSelected ? '3px solid #1e3a8a' : '2.5px solid #ffffff'};
        box-shadow: 0 0 10px ${theme.glow}${isSelected ? ', 0 0 0 4px rgba(30, 58, 138, 0.3)' : ''};
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
      ">
        <div style="width: 5px; height: 5px; background-color: #ffffff; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [half, half],
  })
}

function createStorePhotoPinIcon(store: StoreRecord, info: PinInfo, isSelected: boolean): L.DivIcon {
  const pin = document.createElement('div')
  pin.className = 'store-photo-pin'
  const photo = document.createElement('img')
  photo.className = 'store-photo-pin-image'
  photo.alt = ''
  photo.draggable = false
  photo.src = store.image_path || '/stores/store.webp'
  photo.onerror = () => {
    if (photo.getAttribute('src') !== '/stores/store.webp') photo.src = '/stores/store.webp'
    else photo.style.display = 'none'
  }
  pin.append(photo)
  if (info.badge) {
    const badge = document.createElement('span')
    badge.className = 'store-pin-badge'
    badge.title = info.badge
    badge.setAttribute('role', 'img')
    badge.setAttribute('aria-label', info.badge)
    badge.textContent = '!'
    pin.append(badge)
  }
  if (info.text) {
    const text = document.createElement('span')
    text.className = 'store-pin-text'
    text.textContent = info.text
    pin.append(text)
  }

  return L.divIcon({
    className: `store-photo-pin-container status-${info.status} ${isSelected ? 'selected' : ''}`,
    html: pin,
    iconSize: [42, 52],
    iconAnchor: [21, 52],
    popupAnchor: [0, -48],
  })
}

export const StoreMap: React.FC<StoreMapProps> = ({
  latitude = 10.7424,
  longitude = 121.9406,
  onLocationChange,
  readOnly = false,
  stores,
  pinOf = getStoreStatusInfo,
  visitLinks = false,
  selectedStoreId,
  centerTrigger,
  onSelectStore,
  onOpenStoreDetail,
  height = '380px',
  title = 'Geographical Pin Locator',
  fullCanvas = false,
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const storeMarkersRef = useRef<Map<number, L.Marker>>(new Map())
  const visitLayersRef = useRef<L.Layer[]>([])
  const hasFittedBoundsRef = useRef(false)

  const storesRef = useRef(stores)
  storesRef.current = stores
  const initialLatitudeRef = useRef(latitude)
  const initialLongitudeRef = useRef(longitude)
  const onSelectStoreRef = useRef(onSelectStore)
  onSelectStoreRef.current = onSelectStore
  const onOpenStoreDetailRef = useRef(onOpenStoreDetail)
  onOpenStoreDetailRef.current = onOpenStoreDetail

  useEffect(() => {
    if (!mapRef.current) return
    if ((mapRef.current as any)._leaflet_id) {
      delete (mapRef.current as any)._leaflet_id
    }

    if (!mapInstance.current) {
      // Initialize CartoDB Light basemap targeting San Jose de Buenavista, Antique
      const initialStores = storesRef.current
      const initialLat = initialStores && initialStores.length > 0 ? Number(initialStores[0].latitude) || initialLatitudeRef.current : initialLatitudeRef.current
      const initialLng = initialStores && initialStores.length > 0 ? Number(initialStores[0].longitude) || initialLongitudeRef.current : initialLongitudeRef.current

      mapInstance.current = L.map(mapRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: false,
      })

      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current)
      // Visit points sit above the store pins, so a visit signed at the registered pin stays clickable, and below popups.
      // admin.css flattens every Leaflet pane to one z-index, so the order in the document decides: place it after the markers.
      const visitPane = mapInstance.current.createPane('gis-visits')
      visitPane.style.zIndex = '620'
      mapInstance.current.getPane('markerPane')!.after(visitPane)

      L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(import.meta.env.VITE_CARTO_BASEMAP_KEY ?? '')}`, {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(mapInstance.current)

      // Map-level popup event delegation for Open Store Info buttons
      mapInstance.current.on('popupopen', (e: any) => {
        const popupEl = e.popup?.getElement()
        if (popupEl) {
          const btn = popupEl.querySelector('.leaflet-open-info-btn')
          if (btn) {
            btn.onclick = (evt: MouseEvent) => {
              evt.preventDefault()
              evt.stopPropagation()
              const storeIdStr = btn.getAttribute('data-store-id')
              if (storeIdStr && storesRef.current) {
                const storeId = Number(storeIdStr)
                const targetStore = storesRef.current.find((s) => s.id === storeId)
                if (targetStore) {
                  onSelectStoreRef.current?.(targetStore)
                  onOpenStoreDetailRef.current?.(targetStore)
                }
              }
            }
          }
        }
      })
    }

    const handleResize = () => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize()
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [])

  // Multi-store rendering mode
  useEffect(() => {
    if (!mapInstance.current || !stores) return

    // Clear existing multi-store markers
    storeMarkersRef.current.forEach((marker) => marker.remove())
    storeMarkersRef.current.clear()
    visitLayersRef.current.forEach((layer) => layer.remove())
    visitLayersRef.current = []

    const bounds = L.latLngBounds([])

    stores.forEach((store) => {
      const lat = Number(store.latitude)
      const lng = Number(store.longitude)
      if (isNaN(lat) || isNaN(lng)) return

      const isSelected = store.id === selectedStoreId
      const statusInfo = pinOf(store)
      const pinIcon = createStorePhotoPinIcon(store, statusInfo, isSelected)

      const marker = L.marker([lat, lng], { icon: pinIcon, title: store.store_name }).addTo(mapInstance.current!)

      marker.bindPopup(buildStorePopupContent(store, statusInfo, lat, lng))

      marker.on('click', () => {
        onSelectStoreRef.current?.(store)
        onOpenStoreDetailRef.current?.(store)
      })

      if (isSelected) {
        marker.openPopup()
      }

      storeMarkersRef.current.set(store.id, marker)
      bounds.extend([lat, lng])

      if (!visitLinks) return
      // One point per captured location: visits signed at the same spot share it and its popup, so none is hidden under another.
      const points = new Map<string, GisVisit[]>()
      for (const visit of store.visits ?? []) {
        if (visit.latitude === undefined || visit.longitude === undefined) continue
        const key = `${Number(visit.latitude).toFixed(6)},${Number(visit.longitude).toFixed(6)}`
        points.set(key, [...(points.get(key) ?? []), visit])
      }
      for (const visits of points.values()) {
        const at: L.LatLngTuple = [Number(visits[0].latitude), Number(visits[0].longitude)]
        const color = STATUS_STYLE[visits.some((visit) => visitNeedsReview(store, visit)) ? 'yellow' : 'green'].dot
        const accuracy = Math.max(...visits.map((visit) => Number(visit.accuracy_meters ?? 0)))
        visitLayersRef.current.push(
          L.polyline([[lat, lng], at], { color, weight: 2, dashArray: '4 4', interactive: false, className: 'gis-visit-link' }).addTo(mapInstance.current!),
          L.circle(at, { radius: accuracy, color, weight: 1, fillOpacity: 0.12, interactive: false, className: 'gis-visit-accuracy' }).addTo(mapInstance.current!),
          L.circleMarker(at, { pane: 'gis-visits', radius: 7, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1, className: 'gis-visit-point' })
            .bindPopup(buildVisitPopupContent(store, visits)).addTo(mapInstance.current!),
        )
      }
    })

    // Fit bounds ONLY once on initial store dataset load
    if (!hasFittedBoundsRef.current && stores.length > 0 && bounds.isValid()) {
      mapInstance.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })
      hasFittedBoundsRef.current = true
    }
  }, [stores, selectedStoreId, pinOf, visitLinks])

  // Explicit Center Map trigger handling (runs whenever centerTrigger is updated)
  useEffect(() => {
    if (!mapInstance.current || !centerTrigger || !stores) return
    const targetStore = stores.find((s) => s.id === centerTrigger.storeId)
    if (targetStore) {
      const lat = Number(targetStore.latitude)
      const lng = Number(targetStore.longitude)
      if (!isNaN(lat) && !isNaN(lng)) {
        mapInstance.current.invalidateSize()

        // Calculate offset so pin centers in the visible area to the right of the 390px sidebar overlay!
        // Moving map center left by 195px shifts the marker 195px to the right into clear view!
        const zoom = 16
        const targetPoint = mapInstance.current.project([lat, lng], zoom)
        const offsetPoint = L.point(targetPoint.x - 195, targetPoint.y)
        const adjustedCenter = mapInstance.current.unproject(offsetPoint, zoom)

        mapInstance.current.setView(adjustedCenter, zoom, { animate: true })
        const marker = storeMarkersRef.current.get(targetStore.id)
        if (marker) {
          marker.openPopup()
        }
      }
    }
  }, [centerTrigger, stores])

  // Single location marker mode (for onboarding or coordinate selection)
  useEffect(() => {
    if (!mapInstance.current || stores) return

    if (!markerRef.current) {
      const defaultIcon = createCustomPinIcon('green', true)
      markerRef.current = L.marker([latitude, longitude], {
        icon: defaultIcon,
        draggable: !readOnly,
      }).addTo(mapInstance.current)

      if (!readOnly && onLocationChange) {
        markerRef.current.on('dragend', () => {
          if (markerRef.current) {
            const pos = markerRef.current.getLatLng()
            onLocationChange(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)))
          }
        })

        mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
          if (markerRef.current) {
            markerRef.current.setLatLng(e.latlng)
            onLocationChange(parseFloat(e.latlng.lat.toFixed(6)), parseFloat(e.latlng.lng.toFixed(6)))
          }
        })
      }
    } else {
      markerRef.current.setLatLng([latitude, longitude])
      mapInstance.current.panTo([latitude, longitude])
    }
  }, [latitude, longitude, readOnly, onLocationChange, stores])

  // Pan map when selectedStoreId changes
  useEffect(() => {
    if (!mapInstance.current || !selectedStoreId || !stores) return
    const selectedStore = stores.find((s) => s.id === selectedStoreId)
    if (selectedStore) {
      const lat = Number(selectedStore.latitude)
      const lng = Number(selectedStore.longitude)
      if (!isNaN(lat) && !isNaN(lng)) {
        mapInstance.current.panTo([lat, lng])
        const marker = storeMarkersRef.current.get(selectedStore.id)
        if (marker) {
          marker.openPopup()
        }
      }
    }
  }, [selectedStoreId, stores])

  if (fullCanvas) {
    return (
      <div style={{ width: '100%', height, position: 'relative' }}>
        <div ref={mapRef} className="leaflet-map-frame" style={{ width: '100%', height: '100%', borderRadius: '12px' }} />
      </div>
    )
  }

  return (
    <div className="map-container-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
      <div className="map-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>{title}</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="map-badge" style={{ fontSize: '0.75rem', color: '#1e3a8a', background: '#eff6ff', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid #bfdbfe', fontWeight: 600 }}>
            CartoDB Light Engine (Antique)
          </span>
        </div>
      </div>

      <div ref={mapRef} className="leaflet-map-frame" style={{ height, borderRadius: '8px', border: '1px solid #e2e8f0' }} />

      {!readOnly && !stores && (
        <p className="map-instructions" style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem', marginBottom: 0 }}>
          Click anywhere on the map or drag the pin to dynamically adjust store location coordinates.
        </p>
      )}

      {stores && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem', fontSize: '0.75rem', color: '#64748b', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> No Confirmed Findings
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> Verification Pending
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> Inactive or Confirmed Findings
          </span>
        </div>
      )}
    </div>
  )
}
