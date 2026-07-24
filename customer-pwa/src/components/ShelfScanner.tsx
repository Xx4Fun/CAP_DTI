import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Search,
  MapPin,
  Clock,
  Filter,
  CheckCircle2,
  Zap,
  ZapOff,
  RotateCw,
  Camera,
  Scale,
  AlertTriangle,
  FileText,
  ScanLine,
  ChevronRight,
  Tag,
  Check
} from 'lucide-react';
import { apiClient, type Establishment } from '../api/client';

interface ShelfScannerProps {
  setActiveTab?: (tab: string) => void;
}

const defaultEstablishments: (Establishment & { photoType?: string; barangay?: string })[] = [
  {
    id: 1,
    dti_sec_number: 'SEC-CS202612345',
    store_name: 'Super Metro San Jose',
    owner_name: 'Metro Retail Stores Group Inc.',
    latitude: 10.7424,
    longitude: 121.9406,
    address: 'Tradetown, San Jose de Buenavista',
    recidivism_index: 0,
    barangay: 'Tradetown',
    photoType: 'super_metro'
  },
  {
    id: 2,
    dti_sec_number: 'SEC-CS202654321',
    store_name: 'Gaisano Grand Antique',
    owner_name: 'Gaisano Grand Malls Group',
    latitude: 10.7465,
    longitude: 121.9430,
    address: 'San Angel, San Jose de Buenavista',
    recidivism_index: 0,
    barangay: 'San Angel',
    photoType: 'gaisano'
  },
  {
    id: 3,
    dti_sec_number: 'SEC-CS202699887',
    store_name: 'Robinsons Superstore Antique',
    owner_name: 'Robinsons Retail Holdings Inc.',
    latitude: 10.7480,
    longitude: 121.9450,
    address: 'Brgy. 8 (Poblacion), San Jose de Buenavista',
    recidivism_index: 0,
    barangay: 'Brgy. 8 (Poblacion)',
    photoType: 'robinsons'
  }
];

export const StoreFacadeImage: React.FC<{ photoType?: string; storeName: string }> = ({ photoType, storeName }) => {
  const name = storeName.toLowerCase();

  if (photoType === 'super_metro' || name.includes('super metro') || name.includes('metro')) {
    return (
      <div
        style={{
          width: '110px',
          height: '86px',
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #15803d 0%, #166534 35%, #e2e8f0 35%, #f1f5f9 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '6px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div style={{ background: '#166534', padding: '4px 6px', borderRadius: '4px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em', lineHeight: 1.1 }}>
            Super Metro
          </div>
          <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#fef08a' }}>SAN JOSE</div>
        </div>
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', marginBottom: '2px' }}>
          <div style={{ width: '22px', height: '32px', background: '#3b82f6', opacity: 0.8, borderRadius: '2px 2px 0 0' }} />
          <div style={{ width: '26px', height: '32px', background: '#94a3b8', opacity: 0.6, borderRadius: '2px 2px 0 0' }} />
          <div style={{ width: '22px', height: '32px', background: '#3b82f6', opacity: 0.8, borderRadius: '2px 2px 0 0' }} />
        </div>
      </div>
    );
  }

  if (photoType === 'gaisano' || name.includes('gaisano')) {
    return (
      <div
        style={{
          width: '110px',
          height: '86px',
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 40%, #cbd5e1 40%, #f1f5f9 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '6px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div style={{ background: '#1e40af', padding: '4px 6px', borderRadius: '4px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em', lineHeight: 1.1 }}>
            GAISANO
          </div>
          <div style={{ fontSize: '0.52rem', fontWeight: 800, color: '#93c5fd' }}>GRAND</div>
        </div>
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '2px' }}>
          <div style={{ width: '30px', height: '30px', background: '#475569', borderRadius: '2px 2px 0 0' }} />
          <div style={{ width: '24px', height: '30px', background: '#3b82f6', borderRadius: '2px 2px 0 0' }} />
        </div>
      </div>
    );
  }

  if (photoType === 'robinsons' || name.includes('robinson')) {
    return (
      <div
        style={{
          width: '110px',
          height: '86px',
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 38%, #e2e8f0 38%, #f8fafc 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '6px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div style={{ background: '#b91c1c', padding: '4px 4px', borderRadius: '4px', textAlign: 'center', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#ffffff', color: '#dc2626', fontWeight: 900, fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>R</div>
          <div style={{ fontSize: '0.52rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            ROBINSONS
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '2px' }}>
          <div style={{ width: '40px', height: '30px', background: '#64748b', borderRadius: '2px 2px 0 0' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '110px',
        height: '86px',
        borderRadius: '12px',
        background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 40%, #e2e8f0 40%, #f8fafc 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 6px',
        flexShrink: 0
      }}
    >
      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ffffff', textAlign: 'center' }}>
        RETAIL STORE
      </div>
      <Tag size={28} color="#64748b" />
    </div>
  );
};

export const ShelfScanner: React.FC<ShelfScannerProps> = ({ setActiveTab }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 State
  const [stores, setStores] = useState<Establishment[]>(defaultEstablishments);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('1');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterChip, setActiveFilterChip] = useState<'all' | 'nearby' | 'recent' | 'barangay'>('all');

  // Step 2 State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (step === 2) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step, facingMode]);

  const fetchStores = async () => {
    try {
      const res = await apiClient.get('/public/establishments');
      if (res.data && res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        // Merge API stores with defaults to preserve rich prototype store metadata
        const apiStores: Establishment[] = res.data.data;
        const merged = [...defaultEstablishments];
        apiStores.forEach((s) => {
          if (!merged.some((m) => m.id === s.id || m.store_name.toLowerCase() === s.store_name.toLowerCase())) {
            merged.push(s);
          }
        });
        setStores(merged);
      }
    } catch (err) {
      console.warn('Using default verified stores for offline/fallback:', err);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Camera stream error:', err);
      setCameraError('Camera access unavailable on this device. Position shelf tag framing overlay below.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleSelectStore = (store: Establishment) => {
    setSelectedStoreId(String(store.id));
  };

  const handleCaptureAndScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setStep(3);
    }, 600);
  };

  const selectedStore = stores.find((s) => String(s.id) === selectedStoreId) || defaultEstablishments[0];

  const filteredStores = stores.filter((s) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      s.store_name.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.owner_name.toLowerCase().includes(q) ||
      (s.dti_sec_number && s.dti_sec_number.toLowerCase().includes(q))
    );
  });

  const handleReportWithReceipt = () => {
    sessionStorage.setItem(
      'report_prefill',
      JSON.stringify({
        store_id: selectedStore.id,
        store_name: selectedStore.store_name,
        address: selectedStore.address,
        product_name: 'Saba Philippines Sardines 155g',
        shelf_price: 23.50,
        srp_baseline: 21.50
      })
    );
    if (setActiveTab) {
      setActiveTab('reports');
    }
  };

  const handleViewPriceHistory = () => {
    sessionStorage.setItem('srp_search_term', 'Sardines');
    if (setActiveTab) {
      setActiveTab('prices');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh', paddingBottom: '90px' }}>
      {/* Stepper Progress Indicator */}
      <div style={{ padding: '10px 16px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
          Step {step} of 3 · {step === 1 ? 'Store' : step === 2 ? 'Scan tag' : 'Result'}
        </div>
        <div style={{ height: '4px', width: '100%', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: step === 1 ? '33%' : step === 2 ? '66%' : '100%',
              background: '#1d4ed8',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      </div>

      {/* STEP 1: Store Selection */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          {/* Main Title */}
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Select the store
          </h1>

          {/* Search Input Bar */}
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '14px', top: '15px', color: '#94a3b8' }} size={18} />
            <input
              type="text"
              className="input-field"
              style={{
                paddingLeft: '42px',
                paddingRight: searchTerm ? '40px' : '16px',
                height: '48px',
                borderRadius: '14px',
                fontSize: '0.92rem',
                border: '1px solid #e2e8f0',
                background: '#ffffff'
              }}
              placeholder="Search store name, barangay, or address"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: '12px', top: '13px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Quick Filter Chips Bar */}
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveFilterChip(activeFilterChip === 'nearby' ? 'all' : 'nearby')}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: activeFilterChip === 'nearby' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                background: activeFilterChip === 'nearby' ? '#eff6ff' : '#ffffff',
                color: activeFilterChip === 'nearby' ? '#1d4ed8' : '#0f172a',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <MapPin size={16} color="#2563eb" />
              Nearby stores
            </button>

            <button
              onClick={() => setActiveFilterChip(activeFilterChip === 'recent' ? 'all' : 'recent')}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: activeFilterChip === 'recent' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                background: activeFilterChip === 'recent' ? '#eff6ff' : '#ffffff',
                color: activeFilterChip === 'recent' ? '#1d4ed8' : '#0f172a',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Clock size={16} color="#2563eb" />
              Recently selected
            </button>

            <button
              onClick={() => setActiveFilterChip(activeFilterChip === 'barangay' ? 'all' : 'barangay')}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: activeFilterChip === 'barangay' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                background: activeFilterChip === 'barangay' ? '#eff6ff' : '#ffffff',
                color: activeFilterChip === 'barangay' ? '#1d4ed8' : '#0f172a',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Filter size={16} color="#2563eb" />
              Filter by barangay
            </button>
          </div>

          {/* Section Subheader */}
          <div style={{ marginTop: '2px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Suggested nearby stores
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Verified participating stores near you
            </p>
          </div>

          {/* Verified Stores Card List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredStores.map((store) => {
              const isSelected = selectedStoreId === String(store.id);
              return (
                <div
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  style={{
                    background: '#ffffff',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.12)' : 'var(--shadow-sm)',
                    position: 'relative',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Left Facade Photo Thumbnail */}
                  <StoreFacadeImage photoType={(store as any).photoType} storeName={store.store_name} />

                  {/* Right Info Details */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      {/* Verified Badge Header & Selection Radio Indicator */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontSize: '0.75rem', fontWeight: 700 }}>
                          <CheckCircle2 size={14} color="#059669" />
                          <span>Verified participating store</span>
                        </div>
                        {isSelected && (
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={14} color="#ffffff" strokeWidth={3} />
                          </div>
                        )}
                      </div>

                      {/* Store Name */}
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', lineHeight: 1.2, marginBottom: '6px' }}>
                        {store.store_name}
                      </div>

                      {/* Address */}
                      <div style={{ fontSize: '0.82rem', color: '#64748b', display: 'flex', alignItems: 'flex-start', gap: '4px', lineHeight: 1.3 }}>
                        <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{store.address}</span>
                      </div>
                    </div>

                    {/* Bottom Right Select State Button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                      {isSelected ? (
                        <span
                          style={{
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            padding: '5px 14px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={14} strokeWidth={2.5} /> Selected
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectStore(store);
                          }}
                          style={{
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            padding: '5px 16px',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Continue Blue Action Button */}
          <div style={{ marginTop: '10px' }}>
            <button
              className="btn-primary"
              style={{
                height: '50px',
                borderRadius: '14px',
                fontSize: '1rem',
                fontWeight: 700,
                background: selectedStoreId ? '#1d4ed8' : '#94a3b8'
              }}
              onClick={() => setStep(2)}
              disabled={!selectedStoreId}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Live Camera Viewport */}
      {step === 2 && (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 140px)', minHeight: '520px', background: '#000000', borderRadius: '16px', overflow: 'hidden', margin: '0 auto' }}>
          {/* Controls Overlay Header */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)'
            }}
          >
            {/* Flash toggle */}
            <button
              onClick={() => setFlashOn(!flashOn)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: flashOn ? '#fbbf24' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="Toggle flash"
            >
              {flashOn ? <Zap size={20} /> : <ZapOff size={20} />}
            </button>

            {/* Camera Switch */}
            <button
              onClick={toggleCameraFacing}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="Switch camera"
            >
              <RotateCw size={20} />
            </button>
          </div>

          {/* Live Camera Stream */}
          {!cameraError ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#94a3b8', textAlign: 'center' }}>
              <Camera size={48} color="#64748b" style={{ marginBottom: '12px' }} />
              <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: '6px' }}>Live Camera Viewport</div>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
                Position shelf tag inside the bounding frame overlay.
              </p>
            </div>
          )}

          {/* Translucent Instruction Box Overlay */}
          <div
            style={{
              position: 'absolute',
              top: '65px',
              left: '20px',
              right: '20px',
              zIndex: 15,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              padding: '14px 18px',
              textAlign: 'center',
              color: '#ffffff'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '4px' }}>
              Position the shelf tag inside the frame.
            </div>
            <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.35 }}>
              Include the product name, package size, and displayed price.
            </div>
          </div>

          {/* Shelf Tag Bounding Box Frame Overlay */}
          <div
            style={{
              position: 'absolute',
              top: '52%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '85%',
              maxWidth: '340px',
              height: '170px',
              zIndex: 15,
              pointerEvents: 'none'
            }}
          >
            {/* 4 Corner Bracket Framing Marks */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '28px', height: '28px', borderTop: '3.5px solid #ffffff', borderLeft: '3.5px solid #ffffff', borderRadius: '8px 0 0 0' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '28px', height: '28px', borderTop: '3.5px solid #ffffff', borderRight: '3.5px solid #ffffff', borderRadius: '0 8px 0 0' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '28px', height: '28px', borderBottom: '3.5px solid #ffffff', borderLeft: '3.5px solid #ffffff', borderRadius: '0 0 0 8px' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderBottom: '3.5px solid #ffffff', borderRight: '3.5px solid #ffffff', borderRadius: '0 0 8px 0' }} />

            {/* Target Shelf Tag Sample Display Card inside Frame */}
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'rgba(255, 255, 255, 0.92)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                    SABA PHILIPPINES SARDINES 155G
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>
                  155 g
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '8px' }}>
                {/* Barcode representation */}
                <div style={{ width: '80px', height: '28px', background: 'repeating-linear-gradient(90deg, #000 0, #000 2px, #fff 2px, #fff 4px)' }} />
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>
                  ₱23.50
                </div>
              </div>
            </div>
          </div>

          {/* Shutter Button & Controls at Bottom */}
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              left: 0,
              right: 0,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            {/* Shutter Ring Button */}
            <button
              onClick={handleCaptureAndScan}
              disabled={scanning}
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                border: '4px solid #ffffff',
                background: 'transparent',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
                transition: 'transform 0.15s ease'
              }}
              aria-label="Shutter"
            >
              <div
                style={{
                  width: '58px',
                  height: '58px',
                  borderRadius: '50%',
                  background: scanning ? '#ef4444' : '#ffffff',
                  transition: 'background-color 0.2s ease'
                }}
              />
            </button>

            <span style={{ fontSize: '0.78rem', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontWeight: 600 }}>
              {scanning ? 'Processing shelf tag...' : 'Tap shutter to scan shelf tag'}
            </span>
          </div>
        </div>
      )}

      {/* STEP 3: Comparison Result Card */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          {/* Balance Scale Circular Icon Header */}
          <div style={{ textAlign: 'center', paddingTop: '8px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
              }}
            >
              <Scale size={32} color="#1d4ed8" />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Comparison result
            </h1>
          </div>

          {/* Store & Product Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Store</span>
              <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                {selectedStore ? selectedStore.store_name : 'Super Metro San Jose'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Product</span>
              <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                Saba Philippines Sardines
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Package size</span>
              <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                155 g
              </span>
            </div>
          </div>

          {/* Prices Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 500 }}>Displayed shelf price</span>
              <span style={{ fontSize: '1.35rem', color: '#0f172a', fontWeight: 900 }}>₱23.50</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.92rem', color: '#2563eb', fontWeight: 700 }}>Current SRP</span>
              <span style={{ fontSize: '1.35rem', color: '#2563eb', fontWeight: 900 }}>₱21.50</span>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>Comparison basis</div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Previous verified store price</span>
                <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>₱20.50</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Recorded</span>
                <span style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>17 Jul 2026</span>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                Based on the latest verified monitoring record.
              </div>
            </div>
          </div>

          {/* Difference Math Box */}
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#dc2626' }}>
              ₱2.00 above current SRP
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#dc2626' }}>
              14.6% higher than the previous verified price
            </div>
          </div>

          {/* MANDATORY Legal Disclaimer Banner (CRITICAL) */}
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center'
            }}
          >
            <AlertTriangle size={22} color="#d97706" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#92400e', lineHeight: 1.35 }}>
              A possible price difference was found. This does not automatically confirm a violation.
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            {/* Primary Blue Button */}
            <button
              onClick={handleReportWithReceipt}
              style={{
                background: '#1d4ed8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '14px',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700 }}>
                <FileText size={18} /> Report using receipt
              </div>
              <div style={{ fontSize: '0.76rem', color: '#dbeafe', fontWeight: 400 }}>
                Requires an actual checkout receipt.
              </div>
            </button>

            {/* Secondary White Button */}
            <button
              onClick={() => setStep(1)}
              style={{
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '14px',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.98rem',
                fontWeight: 700
              }}
            >
              <ScanLine size={18} /> Scan another item
            </button>

            {/* Bottom Link */}
            <button
              onClick={handleViewPriceHistory}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '8px 0',
                marginTop: '4px'
              }}
            >
              View price history and details <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShelfScanner;
