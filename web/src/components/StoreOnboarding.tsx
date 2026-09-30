import React, { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import L from 'leaflet'
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  ImagePlus,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
} from 'lucide-react'
import api from '../services/api'
import { adminToast } from '../services/adminToast'
import type { StoreRecord } from '../types/admin'

interface NominatimSuggestion {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

const STORE_IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png']
const STORE_IMAGE_MAX_BYTES = 2 * 1024 * 1024

export interface StoreOnboardingProps {
  onCreated?: (store: StoreRecord) => void
  onBack?: () => void
}

export const StoreOnboarding: React.FC<StoreOnboardingProps> = ({ onCreated, onBack }) => {
  const [secNumber, setSecNumber] = useState('')
  const [storeName, setStoreName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState(10.7424)
  const [longitude, setLongitude] = useState(121.9406)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState('')
  const [imagePreview, setImagePreview] = useState('')

  // Geocoding & address suggestions state
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([])
  const [searchingAddress, setSearchingAddress] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [reverseGeocoding, setReverseGeocoding] = useState(false)
  const [addressSource, setAddressSource] = useState<'typed' | 'map' | 'suggestion' | null>(null)

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const initialLatitudeRef = useRef(latitude)
  const initialLongitudeRef = useRef(longitude)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionContainerRef = useRef<HTMLDivElement>(null)

  // Initialize Leaflet map with CartoDB Voyager Light tiles
  useEffect(() => {
    if (!mapRef.current) return

    if ((mapRef.current as any)._leaflet_id) {
      delete (mapRef.current as any)._leaflet_id
    }

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {
        center: [initialLatitudeRef.current, initialLongitudeRef.current],
        zoom: 15,
        zoomControl: false,
      })

      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current)

      L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(import.meta.env.VITE_CARTO_BASEMAP_KEY ?? '')}`, {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(mapInstance.current)

      const pinIcon = L.divIcon({
        className: 'store-onboarding-pin',
        html: `
          <div style="
            background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 0 14px rgba(37, 99, 235, 0.6), 0 0 0 4px rgba(37, 99, 235, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
          ">
            <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%;"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      markerRef.current = L.marker([initialLatitudeRef.current, initialLongitudeRef.current], {
        icon: pinIcon,
        draggable: true,
      }).addTo(mapInstance.current)

      // Marker drag event -> reverse geocode
      markerRef.current.on('dragend', () => {
        if (markerRef.current) {
          const pos = markerRef.current.getLatLng()
          const lat = parseFloat(pos.lat.toFixed(6))
          const lng = parseFloat(pos.lng.toFixed(6))
          setLatitude(lat)
          setLongitude(lng)
          void performReverseGeocode(lat, lng)
        }
      })

      // Map click event -> move marker & reverse geocode
      mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
        if (markerRef.current) {
          markerRef.current.setLatLng(e.latlng)
          const lat = parseFloat(e.latlng.lat.toFixed(6))
          const lng = parseFloat(e.latlng.lng.toFixed(6))
          setLatitude(lat)
          setLongitude(lng)
          void performReverseGeocode(lat, lng)
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

  // Created and revoked in the same effect so a discarded render never leaks an object URL.
  useEffect(() => {
    if (!imageFile) {
      setImagePreview('')
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const pickImage = (file?: File) => {
    if (!file) return
    const problem = !STORE_IMAGE_TYPES.includes(file.type)
      ? 'Choose a WebP, JPG or PNG image.'
      : file.size > STORE_IMAGE_MAX_BYTES ? 'The photo must be 2 MB or smaller.' : ''
    if (problem) {
      // Drop any earlier photo so a rejected replacement never uploads the previous file.
      setImageFile(null)
      setImageError(problem)
      return
    }
    setImageError('')
    setImageFile(file)
  }

  // Dismiss suggestions on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        suggestionContainerRef.current &&
        !suggestionContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Reverse Geocoding (Coordinates -> Address string via Nominatim)
  const performReverseGeocode = async (lat: number, lng: number) => {
    try {
      setReverseGeocoding(true)
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'PRICE-Watch-DTI-Antique/1.0 (dti.gov.ph)',
          'Accept-Language': 'en-PH,en',
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.display_name) {
          setAddress(data.display_name)
          setAddressSource('map')
        }
      }
    } catch {
      // Graceful offline fallback
    } finally {
      setReverseGeocoding(false)
    }
  }

  // Forward Geocoding (Address query -> Coordinates via Nominatim)
  const handleAddressChange = (value: string) => {
    setAddress(value)
    setAddressSource('typed')
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    if (value.trim().length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setSearchingAddress(true)
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          value.trim()
        )}&format=json&limit=5&countrycodes=ph`
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'PRICE-Watch-DTI-Antique/1.0 (dti.gov.ph)',
            'Accept-Language': 'en-PH,en',
          },
        })
        if (res.ok) {
          const data: NominatimSuggestion[] = await res.json()
          setSuggestions(data)
          setShowSuggestions(data.length > 0)
        }
      } catch {
        // Fallback silently if offline
      } finally {
        setSearchingAddress(false)
      }
    }, 450)
  }

  // Handle selecting a suggested address from dropdown
  const handleSelectSuggestion = (sug: NominatimSuggestion) => {
    const lat = parseFloat(parseFloat(sug.lat).toFixed(6))
    const lng = parseFloat(parseFloat(sug.lon).toFixed(6))
    setAddress(sug.display_name)
    setLatitude(lat)
    setLongitude(lng)
    setAddressSource('suggestion')
    setShowSuggestions(false)

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    }
    if (mapInstance.current) {
      mapInstance.current.setView([lat, lng], 16, { animate: true })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const form = new FormData()
      const fields = {
        dti_sec_number: secNumber.trim(),
        store_name: storeName.trim(),
        owner_name: ownerName.trim(),
        address: address.trim(),
        latitude: String(latitude),
        longitude: String(longitude),
      }
      Object.entries(fields).forEach(([key, value]) => { if (value) form.append(key, value) })
      if (imageFile) form.append('image', imageFile)
      // The shared client defaults to JSON, which would serialize FormData instead of uploading the file.
      const response = await api.post<{ data: StoreRecord }>('/admin/stores', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      adminToast.success('Establishment registered and published.', {
        id: 'store-onboard-success',
      })
      onCreated?.(response.data.data)
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message)
      } else if (err.response?.data?.errors) {
        setError(Object.values(err.response.data.errors).flat().join(' '))
      } else {
        setError('Failed to onboard establishment. Please check your connection.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="field-officer-create-page">
      <header className="admin-form-header-bar">
        {onBack && (
          <button
            type="button"
            className="admin-header-back-button"
            aria-label="Back to User Management"
            title="Back to User Management"
            onClick={onBack}
          >
            <ArrowLeft size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
        <h2 className="admin-form-page-title">Register new establishment</h2>
      </header>

      <form className="field-officer-create-card" onSubmit={handleSubmit}>
        <div className="field-officer-card-body">
          {/* Left Column: Establishment Details */}
          <div className="field-officer-section">
            <div className="field-officer-section-header">
              <div className="field-section-icon">
                <Store size={22} />
              </div>
              <div>
                <h3>Establishment details</h3>
                <p>Official registration, trade name, and proprietor information</p>
              </div>
            </div>

            <div className="field-officer-fields">
              <div className="admin-field-group">
                <label htmlFor="store-sec-number">
                  SEC / DTI registration number
                </label>
                <input
                  id="store-sec-number"
                  autoFocus
                  autoComplete="off"
                  placeholder="e.g. SEC-CS202612345"
                  value={secNumber}
                  onChange={(e) => setSecNumber(e.target.value)}
                />
                <small className="field-helper-text">Optional when the official record does not provide one.</small>
              </div>

              <div className="admin-field-group">
                <label htmlFor="store-trade-name" className="required-field">
                  Store / business name
                </label>
                <input
                  id="store-trade-name"
                  required
                  autoComplete="organization"
                  placeholder="e.g. Antique Quality Groceries"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>

              <div className="admin-field-group">
                <label htmlFor="store-owner-name">
                  Owner / proprietor full name
                </label>
                <input
                  id="store-owner-name"
                  autoComplete="name"
                  placeholder="e.g. Maria Clara Santos"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                />
                <small className="field-helper-text">Optional when the official record does not provide one.</small>
              </div>

              <div className="admin-field-group" ref={suggestionContainerRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="store-business-address" className="required-field">
                    Business address
                  </label>
                  {addressSource === 'map' && (
                    <span className="address-source-pill map">
                      <MapPin size={12} /> Resolved from map pin
                    </span>
                  )}
                  {addressSource === 'suggestion' && (
                    <span className="address-source-pill search">
                      <CheckCircle2 size={12} /> Matched location
                    </span>
                  )}
                </div>

                <div className="address-input-wrapper">
                  <textarea
                    id="store-business-address"
                    required
                    rows={3}
                    placeholder="Type address to search location, or click/drag pin on map..."
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true)
                    }}
                  />
                  {(searchingAddress || reverseGeocoding) && (
                    <span className="address-search-spinner" title="Resolving location...">
                      <Loader2 size={16} className="spin-animation" />
                    </span>
                  )}
                </div>

                {/* Forward Geocoding Dropdown Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="address-suggestions-dropdown" role="listbox">
                    {suggestions.map((sug) => (
                      <li
                        key={sug.place_id}
                        role="option"
                        aria-selected={false}
                        className="address-suggestion-item"
                        onClick={() => handleSelectSuggestion(sug)}
                      >
                        <MapPin size={15} className="suggestion-icon" />
                        <span className="suggestion-text">{sug.display_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <small className="field-helper-text">
                  Typing will suggest Philippine addresses; selecting one moves the map pin.
                </small>
              </div>

              <div className="store-photo-field">
                <label htmlFor="store-photo-input" className="store-photo-title">Establishment photo</label>
                <div className="store-photo-preview">
                  {imagePreview
                    ? <img src={imagePreview} alt="Selected establishment photo" />
                    : <span><ImagePlus size={22} aria-hidden="true" />No photo selected. The default storefront image is used.</span>}
                </div>
                <div className="store-photo-actions">
                  <label className="admin-button secondary store-photo-upload">
                    <Upload size={16} aria-hidden="true" /><span>{imageFile ? 'Replace photo' : 'Choose photo'}</span>
                    <input
                      id="store-photo-input"
                      type="file"
                      accept={STORE_IMAGE_TYPES.join(',')}
                      onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = '' }}
                    />
                  </label>
                  {imageFile && (
                    <button type="button" className="admin-button secondary" onClick={() => { setImageFile(null); setImageError('') }}>
                      <Trash2 size={16} aria-hidden="true" />Remove
                    </button>
                  )}
                </div>
                {imageError && <p role="alert" className="admin-feedback error">{imageError}</p>}
                <small className="field-helper-text">Optional. WebP, JPG or PNG, up to 2 MB.</small>
              </div>
            </div>
          </div>

          {/* Right Column: Location & GIS Pinning */}
          <div className="field-officer-section">
            <div className="field-officer-section-header">
              <div className="field-section-icon">
                <Compass size={22} />
              </div>
              <div>
                <h3>Geographical location</h3>
                <p>Pin the exact physical storefront coordinates on the GIS map</p>
              </div>
            </div>

            <div className="field-officer-fields">
              <div className="store-map-wrapper">
                <div
                  ref={mapRef}
                  className="leaflet-map-frame store-registration-map"
                  aria-label="Interactive establishment location map"
                />
              </div>

              <div className="coords-display-card">
                <div className="coords-display-header">
                  <span className="coords-label">
                    <Compass size={14} /> Synchronized GIS Coordinates
                  </span>
                  <span className="coords-badge">CartoDB Voyager Light</span>
                </div>
                <div className="coords-values">
                  <div className="coord-chip">
                    <span className="coord-chip-label">Latitude:</span>
                    <code>{latitude.toFixed(6)}</code>
                  </div>
                  <div className="coord-chip">
                    <span className="coord-chip-label">Longitude:</span>
                    <code>{longitude.toFixed(6)}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="admin-feedback error" role="alert">
            {error}
          </p>
        )}

        <footer className="field-officer-card-footer">
          <div className="field-officer-card-notice">
            <ShieldCheck size={18} />
            <span>Manager-created stores are active, verified, and visible in the public directory immediately.</span>
          </div>
          <div className="field-officer-card-actions">
            {onBack && (
              <button type="button" className="admin-button secondary" onClick={onBack}>
                Cancel
              </button>
            )}
            <button type="submit" className="admin-button primary" disabled={loading}>
              {loading ? 'Registering establishment…' : 'Register establishment'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}
export default StoreOnboarding
