import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Search,
  MapPin,
  Clock,
  CheckCircle2,
  Zap,
  ZapOff,
  RotateCw,
  Camera,
  Scale,
  AlertTriangle,
  Tag,
  Check,
  RefreshCw
} from 'lucide-react';
import {
  apiClient,
  type Establishment,
  type Commodity,
  type ScanTagResponse,
  type ComparisonResultResponse
} from '../api/client';

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

export type ScannerStepState =
  | 'SELECT_STORE'
  | 'CAMERA_LIVE'
  | 'CAPTURE_REVIEW'
  | 'UPLOADING'
  | 'CANDIDATE_SELECTION'
  | 'ENTER_PRICE'
  | 'COMPARING'
  | 'RESULT'
  | 'ERROR';

export const ShelfScanner: React.FC<ShelfScannerProps> = ({ setActiveTab }) => {
  const [scannerState, setScannerState] = useState<ScannerStepState>('SELECT_STORE');

  // Store Selection State
  const [stores, setStores] = useState<Establishment[]>(defaultEstablishments);
  const [selectedStore, setSelectedStore] = useState<Establishment>(defaultEstablishments[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterChip, setActiveFilterChip] = useState<'all' | 'nearby' | 'recent' | 'barangay'>('all');

  // Camera & Capture State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  // Dynamic Scan & Candidate Matching State
  const [processingStage, setProcessingStage] = useState<string>('Uploading shelf tag...');
  const [scanResponse, setScanResponse] = useState<ScanTagResponse | null>(null);
  const [candidates, setCandidates] = useState<Commodity[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Commodity | null>(null);
  const [userPriceInput, setUserPriceInput] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResultResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (scannerState === 'CAMERA_LIVE') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [scannerState, facingMode]);

  const resetAllScanData = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setScanResponse(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setUserPriceInput('');
    setComparisonResult(null);
    setErrorMessage('');
  };

  const fetchStores = async () => {
    try {
      const res = await apiClient.get('/public/establishments');
      if (res.data && res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const apiStores: Establishment[] = res.data.data;
        const merged = [...defaultEstablishments];
        apiStores.forEach((s) => {
          if (!merged.some((m) => m.id === s.id || m.store_name.toLowerCase() === s.store_name.toLowerCase())) {
            merged.push(s);
          }
        });
        setStores(merged);
        setSelectedStore(merged[0]);
      }
    } catch (err) {
      console.warn('Using default verified stores for fallback:', err);
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
      setCameraError('Camera access is unavailable on this device or permission was denied.');
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

  const handleStartScanForStore = (store: Establishment) => {
    resetAllScanData();
    setSelectedStore(store);
    setScannerState('CAMERA_LIVE');
  };

  const handleShutterCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const previewUrl = URL.createObjectURL(blob);
          setCapturedBlob(blob);
          setCapturedPreviewUrl(previewUrl);
          stopCamera();
          setScannerState('CAPTURE_REVIEW');
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const handleRetake = () => {
    resetAllScanData();
    setScannerState('CAMERA_LIVE');
  };

  const handleUploadAndAnalyze = async () => {
    if (!capturedBlob) {
      setErrorMessage('No captured frame available. Please retake the shelf tag image.');
      setScannerState('ERROR');
      return;
    }

    setScannerState('UPLOADING');
    setProcessingStage('Uploading shelf tag image to DTI server...');

    try {
      const formData = new FormData();
      formData.append('image', capturedBlob, 'shelf_tag.jpg');
      formData.append('store_id', String(selectedStore.id));

      setProcessingStage('Reading text & analyzing tag structure...');

      const res = await apiClient.post('/public/scan-tag', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data && res.data.success && res.data.data) {
        const scanData: ScanTagResponse = res.data.data;
        setScanResponse(scanData);

        const fetchedCandidates: Commodity[] = scanData.candidates || [];
        setCandidates(fetchedCandidates);

        if (scanData.detected_price) {
          setUserPriceInput(String(scanData.detected_price));
        }

        if (fetchedCandidates.length === 1) {
          setSelectedCandidate(fetchedCandidates[0]);
          executeComparison(fetchedCandidates[0], scanData.detected_price || 0);
        } else if (fetchedCandidates.length > 1) {
          setScannerState('CANDIDATE_SELECTION');
        } else {
          setScannerState('ENTER_PRICE');
        }
      } else {
        throw new Error('Could not parse shelf tag OCR output.');
      }
    } catch (err: any) {
      console.error('Shelf scan API error:', err);
      setErrorMessage(
        err.response?.data?.message || 'We could not read this shelf tag. Please ensure lighting is adequate and text is clear.'
      );
      setScannerState('ERROR');
    }
  };

  const handleSelectCandidate = (candidate: Commodity) => {
    setSelectedCandidate(candidate);
    const initialPrice = scanResponse?.detected_price ? String(scanResponse.detected_price) : String(candidate.baseline_price);
    setUserPriceInput(initialPrice);
    setScannerState('ENTER_PRICE');
  };

  const handleConfirmPriceAndCompare = () => {
    const parsedPrice = parseFloat(userPriceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid positive shelf price.');
      return;
    }
    if (!selectedCandidate) {
      alert('Please select a valid commodity candidate.');
      return;
    }
    executeComparison(selectedCandidate, parsedPrice);
  };

  const executeComparison = async (candidate: Commodity, price: number) => {
    setScannerState('COMPARING');
    setProcessingStage('Fetching active price bulletin & history...');

    try {
      const res = await apiClient.post('/public/compare-price', {
        store_id: selectedStore.id,
        srp_bulletin_id: candidate.id,
        displayed_price: price,
      });

      if (res.data && res.data.success && res.data.data) {
        setComparisonResult(res.data.data);
        setScannerState('RESULT');
      } else {
        throw new Error('Regulatory comparison service returned an invalid response.');
      }
    } catch (err: any) {
      console.error('Comparison API error:', err);
      setErrorMessage(
        err.response?.data?.message || 'Unable to connect to regulatory price server to compute comparison.'
      );
      setScannerState('ERROR');
    }
  };

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
    if (comparisonResult) {
      sessionStorage.setItem(
        'report_prefill',
        JSON.stringify({
          store_id: comparisonResult.store.id,
          store_name: comparisonResult.store.store_name,
          address: comparisonResult.store.address,
          product_name: comparisonResult.product.commodity_name,
          shelf_price: comparisonResult.displayed_price,
          srp_baseline: comparisonResult.baseline_price
        })
      );
    }
    if (setActiveTab) {
      setActiveTab('reports');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh', paddingBottom: '90px' }}>
      {/* Stepper Progress Indicator */}
      <div style={{ padding: '10px 16px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
          {scannerState === 'SELECT_STORE' && 'Step 1 of 3 · Select Store'}
          {scannerState === 'CAMERA_LIVE' && 'Step 2 of 3 · Live Camera Capture'}
          {scannerState === 'CAPTURE_REVIEW' && 'Step 2 of 3 · Review Capture'}
          {(scannerState === 'UPLOADING' || scannerState === 'CANDIDATE_SELECTION' || scannerState === 'ENTER_PRICE' || scannerState === 'COMPARING') && 'Step 2 of 3 · Processing Tag'}
          {scannerState === 'RESULT' && 'Step 3 of 3 · Dynamic Comparison Result'}
          {scannerState === 'ERROR' && 'Scan Notice · Error'}
        </div>
        <div style={{ height: '4px', width: '100%', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width:
                scannerState === 'SELECT_STORE'
                  ? '33%'
                  : scannerState === 'RESULT'
                  ? '100%'
                  : '66%',
              background: scannerState === 'ERROR' ? '#ef4444' : '#1d4ed8',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      </div>

      {/* STATE 1: SELECT STORE */}
      {scannerState === 'SELECT_STORE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Select the store
          </h1>

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
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredStores.map((store) => {
              const isSelected = selectedStore.id === store.id;
              return (
                <div
                  key={store.id}
                  onClick={() => setSelectedStore(store)}
                  style={{
                    background: '#ffffff',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    gap: '14px',
                    alignItems: 'center',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'var(--shadow-sm)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <StoreFacadeImage photoType={(store as any).photoType} storeName={store.store_name} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <CheckCircle2 size={15} color="#2563eb" />
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb' }}>
                        Verified store
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {store.store_name}
                    </h3>

                    <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 6px 0', lineHeight: 1.3 }}>
                      {store.address}
                    </p>

                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>
                      DTI SEC: {store.dti_sec_number}
                    </div>
                  </div>

                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: isSelected ? '7px solid #2563eb' : '2px solid #cbd5e1',
                      background: '#ffffff',
                      flexShrink: 0
                    }}
                  />
                </div>
              );
            })}
          </div>

          <button
            className="btn-primary"
            onClick={() => handleStartScanForStore(selectedStore)}
            style={{ width: '100%', height: '52px', fontSize: '1rem', fontWeight: 700, borderRadius: '14px', marginTop: '12px' }}
          >
            Continue to Live Camera Scanner
          </button>
        </div>
      )}

      {/* STATE 2: LIVE CAMERA STREAM */}
      {scannerState === 'CAMERA_LIVE' && (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 120px)', background: '#09090b', overflow: 'hidden' }}>
          {/* Top Control Bar Overlay */}
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
              background: 'linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff' }}>
              <MapPin size={16} color="#3b82f6" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {selectedStore.store_name}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setFlashOn(!flashOn)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: flashOn ? '#fbbf24' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Toggle flash"
              >
                {flashOn ? <Zap size={20} /> : <ZapOff size={20} />}
              </button>

              <button
                onClick={toggleCameraFacing}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Switch camera"
              >
                <RotateCw size={20} />
              </button>

              <button
                onClick={() => setScannerState('SELECT_STORE')}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Close camera"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Live Video Element */}
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
              <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: '6px' }}>Live Camera Unavailable</div>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>{cameraError}</p>
            </div>
          )}

          {/* Instruction Box Overlay */}
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
              padding: '12px 16px',
              textAlign: 'center',
              color: '#ffffff'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: '2px' }}>
              Position the physical shelf tag inside the frame.
            </div>
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              Include the product name, package size, and displayed price.
            </div>
          </div>

          {/* Framing Guides Overlay (NO Fake Shelf Tag Card Superimposed) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '85%',
              maxWidth: '340px',
              height: '180px',
              zIndex: 15,
              pointerEvents: 'none'
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '32px', height: '32px', borderTop: '4px solid #3b82f6', borderLeft: '4px solid #3b82f6', borderRadius: '8px 0 0 0' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '32px', height: '32px', borderTop: '4px solid #3b82f6', borderRight: '4px solid #3b82f6', borderRadius: '0 8px 0 0' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '32px', height: '32px', borderBottom: '4px solid #3b82f6', borderLeft: '4px solid #3b82f6', borderRadius: '0 0 0 8px' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '32px', height: '32px', borderBottom: '4px solid #3b82f6', borderRight: '4px solid #3b82f6', borderRadius: '0 0 8px 0' }} />
          </div>

          {/* Shutter Button Overlay */}
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
            <button
              onClick={handleShutterCapture}
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                border: '4px solid #ffffff',
                background: 'transparent',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
              }}
              aria-label="Capture Shutter"
            >
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: '#ffffff',
                }}
              />
            </button>

            <span style={{ fontSize: '0.8rem', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontWeight: 600 }}>
              ✔ Hold steady · Tap shutter to capture frame
            </span>
          </div>
        </div>
      )}

      {/* STATE 3: CAPTURE REVIEW */}
      {scannerState === 'CAPTURE_REVIEW' && capturedPreviewUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Review Captured Shelf Tag
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Verify that the product name and displayed price are clear before uploading for DTI analysis.
          </p>

          <div
            style={{
              position: 'relative',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '2px solid #e2e8f0',
              boxShadow: 'var(--shadow-sm)',
              maxHeight: '360px',
              background: '#09090b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img
              src={capturedPreviewUrl}
              alt="Captured Shelf Tag Frame"
              style={{ width: '100%', height: '100%', objectFit: 'contain', maxHeight: '360px' }}
            />
            <span
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700
              }}
            >
              ✔ Captured Frame
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={handleRetake}
              style={{
                height: '48px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={16} />
              Retake Frame
            </button>

            <button
              onClick={handleUploadAndAnalyze}
              className="btn-primary"
              style={{
                height: '48px',
                borderRadius: '12px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Check size={18} />
              Use Capture
            </button>
          </div>
        </div>
      )}

      {/* STATE 4 & 7: UPLOADING / COMPARING PROGRESS */}
      {(scannerState === 'UPLOADING' || scannerState === 'COMPARING') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '4px solid #dbeafe',
              borderTopColor: '#1d4ed8',
              animation: 'spin 1s linear infinite'
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
              Analyzing Shelf Tag
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0 }}>
              {processingStage}
            </p>
          </div>
        </div>
      )}

      {/* STATE 5: CANDIDATE SELECTION */}
      {scannerState === 'CANDIDATE_SELECTION' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Select Product Match
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            We found possible matching regulated commodities for this shelf tag. Select the applicable product:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {candidates.map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelectCandidate(c)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                    {c.commodity_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    {c.category} · {c.unit}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1d4ed8' }}>
                    ₱{Number(c.baseline_price).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Baseline SRP</div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleRetake}
            style={{
              height: '48px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '12px'
            }}
          >
            Retake Tag Image
          </button>
        </div>
      )}

      {/* STATE 6: CONFIRM DISPLAYED PRICE */}
      {scannerState === 'ENTER_PRICE' && selectedCandidate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Confirm Displayed Shelf Price
          </h2>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
              Selected Product
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
              {selectedCandidate.commodity_name}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
              {selectedCandidate.unit} · Current SRP: ₱{Number(selectedCandidate.baseline_price).toFixed(2)}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
              Displayed Shelf Price (₱)
            </label>
            <input
              type="number"
              step="0.01"
              className="input-field"
              style={{
                height: '50px',
                fontSize: '1.2rem',
                fontWeight: 800,
                borderRadius: '12px',
                padding: '0 16px',
                border: '1.5px solid #2563eb',
                background: '#ffffff'
              }}
              placeholder="e.g. 23.50"
              value={userPriceInput}
              onChange={(e) => setUserPriceInput(e.target.value)}
            />
          </div>

          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px', color: '#92400e', fontSize: '0.8rem', lineHeight: 1.35 }}>
            ⚠️ Any manual price correction is used only for this informational comparison and is not an official monitoring record.
          </div>

          <button
            className="btn-primary"
            onClick={handleConfirmPriceAndCompare}
            style={{ height: '50px', fontSize: '1rem', fontWeight: 700, borderRadius: '12px' }}
          >
            Compute Regulatory Comparison
          </button>
        </div>
      )}

      {/* STATE 8: DYNAMIC COMPARISON RESULT */}
      {scannerState === 'RESULT' && comparisonResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <div style={{ textAlign: 'center', paddingTop: '8px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: comparisonResult.comparison_status === 'ABOVE_SRP' ? '#fef3c7' : '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
            >
              <Scale size={32} color={comparisonResult.comparison_status === 'ABOVE_SRP' ? '#d97706' : '#16a34a'} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Comparison Result
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
              <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>Store</span>
              <span style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 700 }}>
                {comparisonResult.store.store_name}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>Product</span>
              <span style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 700, textTransform: 'capitalize' }}>
                {comparisonResult.product.commodity_name}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>Package Size</span>
              <span style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 700 }}>
                {comparisonResult.product.unit || 'Standard'}
              </span>
            </div>
          </div>

          {/* Price Comparison Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>
                  Displayed Shelf Price
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
                  ₱{Number(comparisonResult.displayed_price).toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 700, marginBottom: '2px' }}>
                  {comparisonResult.comparison_label}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1d4ed8' }}>
                  ₱{Number(comparisonResult.baseline_price).toFixed(2)}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#3b82f6', marginTop: '1px' }}>
                  Effective {comparisonResult.product.effective_date}
                </div>
              </div>
            </div>

            {/* Historical Store Price Subcard */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '0.82rem',
                color: '#475569'
              }}
            >
              {comparisonResult.previous_verified_price ? (
                <div>
                  Previous verified store price was{' '}
                  <strong style={{ color: '#0f172a' }}>
                    ₱{Number(comparisonResult.previous_verified_price).toFixed(2)}
                  </strong>{' '}
                  on {comparisonResult.previous_recorded_date}.
                </div>
              ) : (
                <div>No verified historical store price is currently available for this store.</div>
              )}
            </div>

            {/* Price Difference Indicator Box */}
            <div
              style={{
                background: comparisonResult.comparison_status === 'ABOVE_SRP' ? '#fffbeb' : '#f0fdf4',
                border: comparisonResult.comparison_status === 'ABOVE_SRP' ? '1px solid #fde68a' : '1px solid #bbf7d0',
                borderRadius: '14px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  color: comparisonResult.comparison_status === 'ABOVE_SRP' ? '#d97706' : '#16a34a'
                }}
              >
                {comparisonResult.comparison_status === 'ABOVE_SRP'
                  ? `₱${Number(comparisonResult.difference_pesos).toFixed(2)} above current SRP (${comparisonResult.percentage_srp}% higher)`
                  : comparisonResult.comparison_status === 'BELOW_SRP'
                  ? `₱${Math.abs(comparisonResult.difference_pesos).toFixed(2)} below current SRP`
                  : 'Matches current SRP baseline'}
              </div>
            </div>
          </div>

          {/* Mandatory Legal Disclaimer Banner */}
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}
          >
            <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: '#92400e', lineHeight: 1.4 }}>
              <strong>INFORMATIONAL NOTICE:</strong> {comparisonResult.informational_notice}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="btn-primary"
              onClick={handleReportWithReceipt}
              style={{ height: '50px', fontSize: '0.95rem', fontWeight: 700, borderRadius: '12px' }}
            >
              Report using receipt
            </button>

            <button
              onClick={handleRetake}
              style={{
                height: '48px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Scan another item
            </button>
          </div>
        </div>
      )}

      {/* STATE 9: ERROR STATE */}
      {scannerState === 'ERROR' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center', gap: '16px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            We could not read this shelf tag
          </h2>

          <p style={{ fontSize: '0.88rem', color: '#64748b', maxWidth: '360px', margin: 0, lineHeight: 1.4 }}>
            {errorMessage}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '320px', marginTop: '12px' }}>
            <button
              className="btn-primary"
              onClick={handleRetake}
              style={{ height: '48px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700 }}
            >
              Retake Image
            </button>

            <button
              onClick={() => setActiveTab && setActiveTab('prices')}
              style={{
                height: '48px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Search Prices Manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShelfScanner;
