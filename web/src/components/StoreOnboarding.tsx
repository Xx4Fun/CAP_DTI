import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import api from '../services/api';

export const StoreOnboarding: React.FC = () => {
  const [secNumber, setSecNumber] = useState('');
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(10.7424);
  const [longitude, setLongitude] = useState(121.9406);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      // Initialize Leaflet map targeting San Jose de Buenavista, Antique
      mapInstance.current = L.map(mapRef.current).setView([10.7424, 121.9406], 15);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstance.current);

      // Create a custom SVG pulsing marker
      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: var(--primary); width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px var(--primary); animation: pulse 1.5s infinite;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      // Default marker
      markerRef.current = L.marker([10.7424, 121.9406], { icon: customIcon, draggable: true })
        .addTo(mapInstance.current);

      // Drag event handler
      markerRef.current.on('dragend', () => {
        if (markerRef.current) {
          const position = markerRef.current.getLatLng();
          setLatitude(parseFloat(position.lat.toFixed(6)));
          setLongitude(parseFloat(position.lng.toFixed(6)));
        }
      });

      // Map click event handler to move marker
      mapInstance.current.on('click', (e: L.LeafletMouseEvent) => {
        if (markerRef.current) {
          markerRef.current.setLatLng(e.latlng);
          setLatitude(parseFloat(e.latlng.lat.toFixed(6)));
          setLongitude(parseFloat(e.latlng.lng.toFixed(6)));
        }
      });
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update marker position if coordinates are edited manually in form
  const handleCoordChange = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    if (markerRef.current && mapInstance.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapInstance.current.panTo([lat, lng]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setIsError(false);

    try {
      await api.post('/stores', {
        dti_sec_number: secNumber,
        store_name: storeName,
        owner_name: ownerName,
        address,
        latitude,
        longitude
      });
      setMessage('Store successfully onboarded and map pin saved!');
      // Reset form
      setSecNumber('');
      setStoreName('');
      setOwnerName('');
      setAddress('');
    } catch (err: any) {
      setIsError(true);
      if (err.response && err.response.data && err.response.data.message) {
        setMessage(err.response.data.message);
      } else if (err.response && err.response.data && err.response.data.errors) {
        setMessage(Object.values(err.response.data.errors).flat().join(' '));
      } else {
        setMessage('Failed to onboard store. Connection error.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-grid">
      <div className="glass onboarding-card">
        <h2 className="section-title">Onboard New Vendor</h2>
        <p className="section-subtitle">Register store details and set geographical coordinate lockpin.</p>

        {message && (
          <div className={isError ? 'error-badge' : 'success-badge'}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="input-group">
            <label>SEC Registration Number</label>
            <input 
              type="text" 
              value={secNumber}
              onChange={(e) => setSecNumber(e.target.value)}
              placeholder="e.g. SEC-CS202612345"
              required 
            />
          </div>

          <div className="input-group">
            <label>Store Name</label>
            <input 
              type="text" 
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="e.g. Antique Quality Groceries"
              required 
            />
          </div>

          <div className="input-group">
            <label>Owner Full Name</label>
            <input 
              type="text" 
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. Maria Clara Santos"
              required 
            />
          </div>

          <div className="input-group">
            <label>Geographic Coordinates</label>
            <div className="coords-row">
              <input 
                type="number" 
                step="0.000001"
                value={latitude}
                onChange={(e) => handleCoordChange(parseFloat(e.target.value), longitude)}
                placeholder="Latitude"
                required 
              />
              <input 
                type="number" 
                step="0.000001"
                value={longitude}
                onChange={(e) => handleCoordChange(latitude, parseFloat(e.target.value))}
                placeholder="Longitude"
                required 
              />
            </div>
          </div>

          <div className="input-group">
            <label>Business Address</label>
            <textarea 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Provide exact physical street location..."
              rows={3}
              required 
            />
          </div>

          <button type="submit" className="btn-primary onboarding-btn" disabled={loading}>
            {loading ? 'Processing Onboarding...' : 'Onboard & Drop Pin'}
          </button>
        </form>
      </div>

      <div className="glass map-container-card">
        <div className="map-header">
          <h3>Geographical Pin Locator</h3>
          <span className="map-badge">Leaflet.js Light/Dark Engine</span>
        </div>
        <div ref={mapRef} className="leaflet-map-frame" style={{ height: '420px', borderRadius: '8px' }}></div>
        <p className="map-instructions">Click anywhere on the map or drag the pin to dynamically set coordinates.</p>
      </div>
    </div>
  );
};
