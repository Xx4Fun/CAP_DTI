import React, { useEffect, useRef } from 'react'
import L from 'leaflet'

interface StoreMapProps {
  latitude: number
  longitude: number
  onLocationChange?: (lat: number, lng: number) => void
  readOnly?: boolean
}

export const StoreMap: React.FC<StoreMapProps> = ({
  latitude,
  longitude,
  onLocationChange,
  readOnly = false,
}) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      // Initialize Leaflet map targeting San Jose de Buenavista, Antique
      mapInstance.current = L.map(mapRef.current).setView([latitude, longitude], 15)

      // Use CartoDB Light basemap tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(mapInstance.current)

      // Create custom light-theme marker icon
      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: #1e3a8a; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 8px rgba(30, 58, 138, 0.4); animation: pulse 2s infinite;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })

      markerRef.current = L.marker([latitude, longitude], {
        icon: customIcon,
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
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (markerRef.current && mapInstance.current) {
      markerRef.current.setLatLng([latitude, longitude])
      mapInstance.current.panTo([latitude, longitude])
    }
  }, [latitude, longitude])

  return (
    <div className="map-container-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
      <div className="map-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>Geographical Pin Locator</h3>
        <span className="map-badge" style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
          CartoDB Light Engine (Antique)
        </span>
      </div>
      <div ref={mapRef} className="leaflet-map-frame" style={{ height: '380px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
      {!readOnly && (
        <p className="map-instructions" style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem', marginBottom: 0 }}>
          Click anywhere on the map or drag the pin to dynamically adjust store location coordinates.
        </p>
      )}
    </div>
  )
}
