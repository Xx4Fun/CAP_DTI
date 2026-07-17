import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import reactLogo from './assets/react.svg';
import viteLogo from './assets/vite.svg';

// Register Chart.js elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler
);

interface Store {
  id: number;
  name: string;
  owner: string;
  lat: number;
  lng: number;
  recidivismIndex: number;
}

interface Commodity {
  id: number;
  name: string;
  baselinePrice: number;
  unit: string;
}

const mockStores: Store[] = [
  { id: 1, name: "San Jose Public Market - Stall 12", owner: "Juan Dela Cruz", lat: 10.7424, lng: 121.9406, recidivismIndex: 0 },
  { id: 2, name: "Buenavista Grocery Mart", owner: "Maria Santos", lat: 10.7465, lng: 121.9430, recidivismIndex: 1 },
  { id: 3, name: "Antique General Store", owner: "Robert Lim", lat: 10.7390, lng: 121.9385, recidivismIndex: 2 }
];

const mockCommodities: Commodity[] = [
  { id: 1, name: "Regular Milled Rice", baselinePrice: 38.00, unit: "kg" },
  { id: 2, name: "Refined White Sugar", baselinePrice: 85.00, unit: "kg" },
  { id: 3, name: "Red Onion (Local)", baselinePrice: 140.00, unit: "kg" },
  { id: 4, name: "Canned Sardines (155g)", baselinePrice: 22.00, unit: "can" }
];

function App() {
  // Application State
  const [isCalamity, setIsCalamity] = useState<boolean>(false);
  const [selectedStore, setSelectedStore] = useState<Store>(mockStores[0]);
  const [selectedCommodity, setSelectedCommodity] = useState<Commodity>(mockCommodities[0]);
  const [recordedPrice, setRecordedPrice] = useState<string>("42.00");
  
  // OCR Simulation State
  const [ocrText, setOcrText] = useState<string>(
    `STORE: BUENAVISTA GROCERY\n` +
    `DATE: 2026-07-15\n` +
    `========================\n` +
    `REGULAR MILLED RICE  1KG  PHP 43.50\n` +
    `REFINED SUGAR 1KG        PHP 85.00\n` +
    `SUBTOTAL                 PHP 128.50\n` +
    `CASH                     PHP 150.00\n` +
    `CHANGE                   PHP 21.50`
  );
  const [ocrValidationResults, setOcrValidationResults] = useState<{
    valid: boolean;
    extractedPrice: number | null;
    message: string;
  }>({ valid: true, extractedPrice: 43.50, message: "Decimals detected successfully." });

  // Map Refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Update Body Class for Calamity Mode Theme Shift
  useEffect(() => {
    if (isCalamity) {
      document.body.classList.add('calamity-mode');
    } else {
      document.body.classList.remove('calamity-mode');
    }
  }, [isCalamity]);

  // Leaflet Map Initialization & Sync
  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      // Initialize Map
      mapInstance.current = L.map(mapRef.current).setView([10.7424, 121.9406], 15);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapInstance.current);
    }

    // Clear old markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (mapInstance.current) {
      mockStores.forEach(store => {
        const isSelected = store.id === selectedStore.id;
        const color = isSelected ? (isCalamity ? '#ef4444' : '#f59e0b') : '#71717a';
        
        // Custom SVG Marker to prevent missing asset path errors
        const customIcon = L.divIcon({
          html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); transition: all 0.3s ease;"></div>`,
          className: 'custom-leaflet-marker',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([store.lat, store.lng], { icon: customIcon })
          .addTo(mapInstance.current!)
          .bindPopup(`
            <div style="color: #000; font-family: 'Outfit', sans-serif;">
              <strong>${store.name}</strong><br/>
              Owner: ${store.owner}<br/>
              Recidivism: ${store.recidivismIndex} offense(s)
            </div>
          `);

        if (isSelected) {
          marker.openPopup();
          mapInstance.current?.panTo([store.lat, store.lng]);
        }

        markersRef.current.push(marker);
      });
    }
  }, [selectedStore, isCalamity]);

  // Handle OCR Regex Validation Simulation
  const handleOcrParse = () => {
    // Regex looking for numbers with decimals: \d+\.\d{2}
    const decimalRegex = /\d+\.\d{2}/g;
    const matches = ocrText.match(decimalRegex);

    if (matches && matches.length > 0) {
      // Find the first price that looks like regular milled rice price (43.50)
      const prices = matches.map(parseFloat);
      // Filter for values matching our simulation
      const ricePrice = prices.find(p => p > 30 && p < 60) || prices[0];
      setOcrValidationResults({
        valid: true,
        extractedPrice: ricePrice,
        message: `Validated OCR. Found decimals: ${matches.join(', ')}. Parsed commodity price: PHP ${ricePrice.toFixed(2)}`
      });
    } else {
      setOcrValidationResults({
        valid: false,
        extractedPrice: null,
        message: "Error: OCR validation failed. Must detect decimal patterns (\\d+\\.\\d{2})."
      });
    }
  };

  // Volatility Chart Data Configuration
  const basePrice = selectedCommodity.baselinePrice;
  // Generate mock prices over 4 weeks based on store properties
  const volatilityMultiplier = 1 + (selectedStore.recidivismIndex * 0.04);
  const week1 = parseFloat((basePrice * 1.01 * volatilityMultiplier).toFixed(2));
  const week2 = parseFloat((basePrice * 1.05 * volatilityMultiplier).toFixed(2));
  const week3 = parseFloat((basePrice * 1.12 * volatilityMultiplier).toFixed(2));
  const week4 = parseFloat(recordedPrice) || basePrice;

  const chartData = {
    labels: ['Week 1', 'Week 2', 'Week 3 (Sync)', 'Week 4 (Current)'],
    datasets: [
      {
        label: `${selectedCommodity.name} (PHP/${selectedCommodity.unit})`,
        data: [week1, week2, week3, week4],
        borderColor: isCalamity ? '#ef4444' : '#f59e0b',
        backgroundColor: isCalamity ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: isCalamity ? '#ef4444' : '#f59e0b',
        pointBorderColor: '#ffffff',
        pointRadius: 6,
        pointHoverRadius: 8
      },
      {
        label: `Official SRP Baseline (PHP ${basePrice.toFixed(2)})`,
        data: [basePrice, basePrice, basePrice, basePrice],
        borderColor: 'rgba(255, 255, 255, 0.25)',
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#e4e4e7',
          font: { family: 'Outfit', size: 12, weight: 600 as const }
        }
      },
      tooltip: {
        backgroundColor: '#18181b',
        titleFont: { family: 'Outfit' },
        bodyFont: { family: 'Outfit' },
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#a1a1aa', font: { family: 'Outfit' } }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#a1a1aa', font: { family: 'Outfit' } }
      }
    }
  };

  // Bifurcated Legal Engine Calculation
  const getBifurcatedLegalDecision = () => {
    const baseline = selectedCommodity.baselinePrice;
    const currentPrice = parseFloat(recordedPrice) || baseline;
    const allowance = isCalamity ? 0 : 0.10;
    const upperLimit = baseline * (1 + allowance);
    const isOverLimit = currentPrice > upperLimit;
    
    let noticeType: 'LOI' | 'SCO' | 'NONE' = 'NONE';
    let reasoning = "";

    if (isOverLimit) {
      if (isCalamity || selectedStore.recidivismIndex > 0) {
        noticeType = 'SCO';
        reasoning = isCalamity 
          ? "Emergency Protocols Active (State of Calamity): 0% Price Tolerance baseline enforced. Immediate Show Cause Order (SCO) required."
          : `Repeat Offender Flagged (Recidivism Index: ${selectedStore.recidivismIndex}). Bypass 10% market tolerance. Direct Show Cause Order (SCO) generated.`;
      } else {
        noticeType = 'LOI';
        reasoning = `Standard Market Protocol: Price exceeds 10% allowance limit (SRP PHP ${baseline.toFixed(2)} + 10% allowance = Limit PHP ${upperLimit.toFixed(2)}). Initial Letter of Inquiry (LOI) with 48-hour response window generated.`;
      }
    } else {
      reasoning = `Within Permitted Price Range (SRP PHP ${baseline.toFixed(2)} + ${allowance * 100}% Allowance = Limit PHP ${upperLimit.toFixed(2)}). No legal notice required.`;
    }

    return { noticeType, reasoning, upperLimit, isOverLimit };
  };

  const decision = getBifurcatedLegalDecision();

  return (
    <div className="app-container">
      {/* Top Header Section */}
      <header className="header">
        <div className="brand-section">
          <div className="logo-icon">P</div>
          <div className="brand-info">
            <h1>PRICE-Watch Portal</h1>
            <p>DTI Antique Commodity Price Regulation Dashboard &bull; San Jose de Buenavista Pilot</p>
          </div>
        </div>
        <div className="control-panel">
          <div className="toggle-container">
            <span className="toggle-label">State of Calamity</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={isCalamity} 
                onChange={(e) => setIsCalamity(e.target.checked)} 
              />
              <span className="slider"></span>
            </label>
          </div>
          {isCalamity ? (
            <span className="badge badge-danger">Calamity Protocols Active</span>
          ) : (
            <span className="badge badge-success">Normal Market Mode</span>
          )}
        </div>
      </header>

      {/* Main Dashboard Layout */}
      <div className="dashboard-grid">
        
        {/* Left Hand: GIS Map & General Info */}
        <div className="col-6 card">
          <div className="card-header">
            <h2 className="card-title">GIS Vendor Onboarding Map</h2>
            <span className="badge badge-warning">Leaflet Active</span>
          </div>
          <p className="card-subtitle">Showing active stores under surveillance in San Jose de Buenavista, Antique.</p>
          
          <div ref={mapRef} className="map-container"></div>
          
          <div className="form-group">
            <label className="form-label">Active Surveillance target</label>
            <select 
              className="form-select" 
              value={selectedStore.id}
              onChange={(e) => {
                const store = mockStores.find(s => s.id === parseInt(e.target.value));
                if (store) {
                  setSelectedStore(store);
                }
              }}
            >
              {mockStores.map(store => (
                <option key={store.id} value={store.id}>{store.name} (Offenses: {store.recidivismIndex})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <span className="form-label">Latitude</span>
              <div className="ocr-console" style={{ padding: '0.5rem', color: '#a1a1aa' }}>{selectedStore.lat}</div>
            </div>
            <div className="form-group">
              <span className="form-label">Longitude</span>
              <div className="ocr-console" style={{ padding: '0.5rem', color: '#a1a1aa' }}>{selectedStore.lng}</div>
            </div>
          </div>
        </div>

        {/* Right Hand: Temporal Price Volatility Analytics */}
        <div className="col-6 card">
          <div className="card-header">
            <h2 className="card-title">Temporal Volatility Analysis (4-Week)</h2>
            <span className="badge badge-warning">Chart.js Active</span>
          </div>
          <p className="card-subtitle">Comparing monitored price fluctuations with the national Suggested Retail Price (SRP).</p>
          
          <div style={{ height: '220px', position: 'relative' }}>
            <Line data={chartData} options={chartOptions} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Regulatory Commodity</label>
              <select
                className="form-select"
                value={selectedCommodity.id}
                onChange={(e) => {
                  const comm = mockCommodities.find(c => c.id === parseInt(e.target.value));
                  if (comm) setSelectedCommodity(comm);
                }}
              >
                {mockCommodities.map(comm => (
                  <option key={comm.id} value={comm.id}>{comm.name} (SRP: ₱{comm.baselinePrice.toFixed(2)}/{comm.unit})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Input Simulated Shelf Price (₱)</label>
              <input 
                type="number"
                step="0.01" 
                className="form-input" 
                value={recordedPrice} 
                onChange={(e) => setRecordedPrice(e.target.value)} 
              />
            </div>
          </div>
        </div>

        {/* Bottom Left: Tamper-Proof Consumer OCR Node */}
        <div className="col-6 card">
          <div className="card-header">
            <h2 className="card-title">On-Device OCR & Image Hashing</h2>
            <span className="badge badge-warning">Dart regex Simulator</span>
          </div>
          <p className="card-subtitle">Offline client parsing receipt details using regex formats to search for float values.</p>
          
          <div className="form-group">
            <label className="form-label">Extracted Receipt OCR Raw Text</label>
            <textarea 
              className="form-textarea" 
              rows={6}
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleOcrParse}>Run OCR Text Validation</button>
            {ocrValidationResults.valid ? (
              <span className="badge badge-success">✓ Decimals Detected</span>
            ) : (
              <span className="badge badge-danger">✗ Decimal Error</span>
            )}
          </div>

          <div className="ocr-console">
            {ocrValidationResults.message}
          </div>
        </div>

        {/* Bottom Right: Bifurcated Legal Action Dispatch */}
        <div className="col-6 card">
          <div className="card-header">
            <h2 className="card-title">Bifurcated Legal Decision Engine</h2>
            {decision.noticeType === 'SCO' ? (
              <span className="badge badge-danger" style={{ animation: 'pulse 1.5s infinite' }}>🚨 SCO Required</span>
            ) : decision.noticeType === 'LOI' ? (
              <span className="badge badge-warning">⚡ LOI Dispatched</span>
            ) : (
              <span className="badge badge-success">✓ Compliant</span>
            )}
          </div>
          <p className="card-subtitle">Automated rule processing system for legal dispatch and penalty assessment.</p>

          <div className="form-group">
            <span className="form-label">Target Violator Recidivism Index</span>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.25rem 0.75rem' }} 
                onClick={() => {
                  const updatedIndex = Math.max(0, selectedStore.recidivismIndex - 1);
                  setSelectedStore({ ...selectedStore, recidivismIndex: updatedIndex });
                }}
              >
                -
              </button>
              <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{selectedStore.recidivismIndex} Previous Offenses</span>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.25rem 0.75rem' }} 
                onClick={() => {
                  const updatedIndex = selectedStore.recidivismIndex + 1;
                  setSelectedStore({ ...selectedStore, recidivismIndex: updatedIndex });
                }}
              >
                +
              </button>
            </div>
          </div>

          <div className="ocr-console" style={{ color: '#fff', background: '#1c1917', minHeight: '80px' }}>
            <strong>Decision Logic Output:</strong>
            <p style={{ marginTop: '0.5rem', color: decision.noticeType !== 'NONE' ? '#f87171' : '#34d399' }}>
              {decision.reasoning}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              className="btn btn-accent" 
              style={{ flex: 1 }}
              disabled={decision.noticeType === 'NONE'}
              onClick={() => {
                alert(`Notice PDF successfully compiled using DomPDF! Dispatched to: ${selectedStore.name}. Type: ${decision.noticeType}`);
              }}
            >
              Generate & Dispatch {decision.noticeType !== 'NONE' ? decision.noticeType : 'Notice'}
            </button>
          </div>
        </div>

      </div>

      {/* Footer Branding */}
      <footer style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem 0', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
        <span>PRICE-Watch system &copy; 2026 Department of Trade and Industry Antique</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <img src={viteLogo} alt="Vite" style={{ height: '14px' }} />
          <span>Vite + React</span>
          <img src={reactLogo} alt="React" style={{ height: '14px' }} />
        </div>
      </footer>
    </div>
  );
}

export default App;
