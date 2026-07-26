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
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import {
  apiClient,
  type Establishment,
  type Commodity,
  type ScanTagResponse,
  type ComparisonResultResponse,
  defaultStoresList
} from '../api/client';
import { consumeHandoff, writeHandoff, type FlowHandoff } from '../app/handoffs';
import { fallbackCommodities } from '../data/srpFallback';

interface ShelfScannerProps {
  setActiveTab?: (tab: string) => void;
}

export const CompactStoreFacade: React.FC<{ photoType?: string; storeName: string }> = ({ photoType, storeName }) => {
  const name = storeName.toLowerCase();

  if (photoType === 'super_metro' || name.includes('super metro') || name.includes('metro')) {
    return (
      <div
        style={{
          width: '76px',
          height: '76px',
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #15803d 0%, #166534 40%, #f1f5f9 40%, #f8fafc 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          flexShrink: 0
        }}
      >
        <div style={{ background: '#166534', padding: '2px 4px', borderRadius: '4px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.52rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
            Metro
          </div>
        </div>
        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginBottom: '2px' }}>
          <div style={{ width: '16px', height: '24px', background: '#3b82f6', opacity: 0.8, borderRadius: '2px 2px 0 0' }} />
          <div style={{ width: '18px', height: '24px', background: '#94a3b8', opacity: 0.6, borderRadius: '2px 2px 0 0' }} />
        </div>
      </div>
    );
  }

  if (photoType === 'gaisano' || name.includes('gaisano')) {
    return (
      <div
        style={{
          width: '76px',
          height: '76px',
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 40%, #cbd5e1 40%, #f8fafc 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          flexShrink: 0
        }}
      >
        <div style={{ background: '#1e40af', padding: '2px 4px', borderRadius: '4px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.52rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
            GAISANO
          </div>
        </div>
        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginBottom: '2px' }}>
          <div style={{ width: '22px', height: '24px', background: '#3b82f6', borderRadius: '2px 2px 0 0' }} />
        </div>
      </div>
    );
  }

  if (photoType === 'robinsons' || name.includes('robinson')) {
    return (
      <div
        style={{
          width: '76px',
          height: '76px',
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 40%, #e2e8f0 40%, #f8fafc 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          flexShrink: 0
        }}
      >
        <div style={{ background: '#b91c1c', padding: '2px 4px', borderRadius: '4px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffffff', color: '#dc2626', fontWeight: 900, fontSize: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>R</div>
          <div style={{ fontSize: '0.48rem', fontWeight: 800, color: '#ffffff' }}>ROBINSONS</div>
        </div>
        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginBottom: '2px' }}>
          <div style={{ width: '24px', height: '24px', background: '#64748b', borderRadius: '2px 2px 0 0' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '76px',
        height: '76px',
        borderRadius: '12px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      <Tag size={28} color="#2563eb" />
    </div>
  );
};

export const StoreFacadeImage = CompactStoreFacade;

export type ScannerStepState =
  | 'SELECT_STORE'
  | 'CAMERA_LIVE'
  | 'CAPTURE_REVIEW'
  | 'UPLOADING'
  | 'RECOVERY'
  | 'CANDIDATE_SELECTION'
  | 'ENTER_PRICE'
  | 'COMPARING'
  | 'RESULT'
  | 'ERROR';

export const ShelfScanner: React.FC<ShelfScannerProps> = ({ setActiveTab }) => {
  const isDemoEnabled = import.meta.env.VITE_ENABLE_SCANNER_DEMO === 'true';
  const [scannerState, setScannerState] = useState<ScannerStepState>('SELECT_STORE');

  // Store Selection State
  const [stores, setStores] = useState<Establishment[]>([]);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [recentlyUsedStore, setRecentlyUsedStore] = useState<Establishment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterChip, setActiveFilterChip] = useState<'all' | 'nearby' | 'recent' | 'barangay'>('all');

  // Camera & Capture State
  const [flashOn, setFlashOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  // Dynamic Scan & Candidate Matching State
  const [processingStage, setProcessingStage] = useState<string>('Uploading shelf tag...');
  const [scanResponse, setScanResponse] = useState<ScanTagResponse | null>(null);
  const [candidates, setCandidates] = useState<Commodity[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Commodity | null>(null);
  const [selectedProductSource, setSelectedProductSource] = useState<'OCR' | 'MANUAL_SEARCH'>('OCR');
  const [userPriceInput, setUserPriceInput] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResultResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Manual Commodity Directory Search State inside Scanner
  const [commoditySearchQuery, setCommoditySearchQuery] = useState('');
  const [commoditySearchResults, setCommoditySearchResults] = useState<Commodity[]>([]);
  const [isSearchingCommodities, setIsSearchingCommodities] = useState(false);
  const [showManualDirectorySearch, setShowManualDirectorySearch] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handoffRef = useRef<FlowHandoff | null>(consumeHandoff());

  useEffect(() => {
    fetchStores();
  }, []);

  // Body Scroll Locking for Full-Screen Camera
  useEffect(() => {
    if (scannerState === 'CAMERA_LIVE') {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      startCamera();
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      stopCamera();
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
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
    setSelectedProductSource('OCR');
    setUserPriceInput('');
    setComparisonResult(null);
    setErrorMessage('');
    setShowManualDirectorySearch(false);
    setCommoditySearchQuery('');
    setCommoditySearchResults([]);
  };

  const fetchStores = async () => {
    try {
      const res = await apiClient.get('/public/establishments');
      if (res.data && res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const apiStores: Establishment[] = res.data.data;
        setStores(apiStores);
        const requestedStoreId = handoffRef.current?.kind === 'store-to-scan'
          ? handoffRef.current.storeId
          : undefined;
        setSelectedStore(apiStores.find((store) => store.id === requestedStoreId) || null);
      } else if (isDemoEnabled) {
        setStores(defaultStoresList);
        const requestedStoreId = handoffRef.current?.kind === 'store-to-scan'
          ? handoffRef.current.storeId
          : undefined;
        setSelectedStore(defaultStoresList.find((store) => store.id === requestedStoreId) || null);
      } else {
        setStores([]);
        setSelectedStore(null);
      }
    } catch (err) {
      if (isDemoEnabled) {
        console.warn('API connection offline. Demo mode enabled: using reference stores:', err);
        setStores(defaultStoresList);
        const requestedStoreId = handoffRef.current?.kind === 'store-to-scan'
          ? handoffRef.current.storeId
          : undefined;
        setSelectedStore(defaultStoresList.find((store) => store.id === requestedStoreId) || null);
      } else {
        console.error('API connection offline when fetching stores:', err);
        setStores([]);
        setSelectedStore(null);
        setErrorMessage('Unable to connect to regulatory store server. Please check your network connection.');
      }
    }
  };

  const searchCommodities = async (query: string) => {
    setCommoditySearchQuery(query);
    if (!query.trim()) {
      setCommoditySearchResults([]);
      return;
    }
    setIsSearchingCommodities(true);
    try {
      const res = await apiClient.get('/public/commodities', { params: { query } });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setCommoditySearchResults(res.data.data);
      } else {
        const lower = query.toLowerCase();
        setCommoditySearchResults(fallbackCommodities.filter(c => c.commodity_name.toLowerCase().includes(lower)));
      }
    } catch {
      const lower = query.toLowerCase();
      setCommoditySearchResults(fallbackCommodities.filter(c => c.commodity_name.toLowerCase().includes(lower)));
    } finally {
      setIsSearchingCommodities(false);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      streamRef.current = mediaStream;
      const videoTrack = mediaStream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Camera stream error:', err);
      setCameraError('Camera access is unavailable on this device or permission was denied.');
    }
  };

  const stopCamera = () => {
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchSupported(false);
    setFlashOn(false);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const nextValue = !flashOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextValue } as MediaTrackConstraintSet] });
      setFlashOn(nextValue);
    } catch {
      setCameraError('The flashlight could not be changed on this device.');
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleStartScanForStore = (store: Establishment) => {
    resetAllScanData();
    setSelectedStore(store);
    setRecentlyUsedStore(store);
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
    if (!capturedBlob || !selectedStore) {
      setErrorMessage('No captured frame or store selected. Please retake the image.');
      setScannerState('ERROR');
      return;
    }

    setScannerState('UPLOADING');
    setProcessingStage('Uploading shelf tag image to DTI server...');

    try {
      const scanUuid = 'scan_uuid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const formData = new FormData();
      formData.append('image', capturedBlob, 'shelf_tag.jpg');
      formData.append('store_id', String(selectedStore.id));
      formData.append('scan_uuid', scanUuid);

      setProcessingStage('Reading tag text & matching database records...');

      const res = await apiClient.post('/public/scan-tag/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data && res.data.success && res.data.data) {
        const scanData: ScanTagResponse = res.data.data;
        setScanResponse(scanData);

        const fetchedCandidates: Commodity[] = scanData.candidates || [];
        setCandidates(fetchedCandidates);

        const priceStr = scanData.detected_price_string ?? (scanData.detected_price != null ? String(scanData.detected_price) : '');
        setUserPriceInput(priceStr);
        setSelectedProductSource(scanData.product_source === 'MANUAL_SEARCH' ? 'MANUAL_SEARCH' : 'OCR');

        if (fetchedCandidates.length > 0) {
          setSelectedCandidate(fetchedCandidates[0]);
        } else {
          setSelectedCandidate(null);
        }

        setScannerState('RECOVERY');
      } else {
        throw new Error('The shelf tag could not be processed.');
      }
    } catch (err: any) {
      if (isDemoEnabled) {
        console.warn('Shelf scan API offline or remote. Demo mode active:', err);
        const refScanResponse: ScanTagResponse = {
          scan_id: 'SCAN-DEMO-' + Date.now(),
          store: {
            id: selectedStore.id,
            store_name: selectedStore.store_name,
            address: selectedStore.address,
            dti_sec_number: selectedStore.dti_sec_number
          },
          detected_price: 23.5,
          detected_price_string: '23.50',
          ocr_status: 'OCR_PRODUCT_AND_PRICE_DETECTED',
          candidates: fallbackCommodities.slice(0, 5),
          timestamp: new Date().toISOString()
        };
        setScanResponse(refScanResponse);
        setCandidates(fallbackCommodities.slice(0, 5));
        setSelectedCandidate(fallbackCommodities[0]);
        setUserPriceInput('23.50');
        setSelectedProductSource('OCR');
        setScannerState('RECOVERY');
      } else {
        console.error('Shelf scan API error:', err);
        setErrorMessage(
          err.response?.data?.message || 'Unable to analyze shelf tag. The shelf tag could not be processed. No comparison was generated and nothing was submitted.'
        );
        setScannerState('ERROR');
      }
    }
  };

  const handleManualSelectCommodity = async (commodity: Commodity) => {
    setSelectedCandidate(commodity);
    setSelectedProductSource('MANUAL_SEARCH');

    if (scanResponse?.scan_id) {
      try {
        await apiClient.post('/public/scan-tag/manual-select', {
          scan_id: scanResponse.scan_id,
          product_id: commodity.id,
        });
      } catch (err) {
        console.warn('Manual select API call warning:', err);
      }
    }
  };

  const executeComparison = async (
    candidate: Commodity,
    price: number,
    forcedProductSource?: 'OCR' | 'MANUAL_SEARCH',
    forcedPriceSource?: 'USER_CONFIRMED' | 'USER_CORRECTED' | 'USER_ENTERED'
  ) => {
    if (!selectedStore) return;

    setScannerState('COMPARING');
    setProcessingStage('Fetching active price bulletin & history...');

    const scanId = scanResponse?.scan_id;
    const detectedPriceStr = scanResponse?.detected_price_string ?? (scanResponse?.detected_price != null ? String(scanResponse.detected_price) : null);
    
    const pSource: 'OCR' | 'MANUAL_SEARCH' = forcedProductSource || selectedProductSource;
    let prSource: 'USER_CONFIRMED' | 'USER_CORRECTED' | 'USER_ENTERED';

    if (forcedPriceSource) {
      prSource = forcedPriceSource;
    } else if (detectedPriceStr !== null && detectedPriceStr !== '') {
      const formattedUserPrice = Number(price).toFixed(2);
      const formattedDetectedPrice = Number(detectedPriceStr).toFixed(2);
      prSource = formattedUserPrice === formattedDetectedPrice ? 'USER_CONFIRMED' : 'USER_CORRECTED';
    } else {
      prSource = 'USER_ENTERED';
    }

    try {
      let res;
      if (scanId) {
        res = await apiClient.post('/public/scan-tag/compare', {
          scan_id: scanId,
          store_id: selectedStore.id,
          product_id: candidate.id,
          displayed_price: price,
          product_source: pSource,
          price_source: prSource,
        });
      } else {
        res = await apiClient.post('/public/compare-price', {
          store_id: selectedStore.id,
          srp_bulletin_id: candidate.id,
          displayed_price: price,
        });
      }

      if (res.data && res.data.success && res.data.data) {
        const data = res.data.data;
        setComparisonResult({
          ...data,
          product_source: data.product_source || pSource,
          price_source: data.price_source || prSource,
        });
        setScannerState('RESULT');
      } else {
        throw new Error('Regulatory comparison service returned an invalid response.');
      }
    } catch (err: any) {
      console.error('Comparison API error:', err);
      setErrorMessage(
        err.response?.data?.message || 'The shelf tag could not be processed. No comparison was generated and nothing was submitted.'
      );
      setScannerState('ERROR');
    }
  };

  const handleConfirmAndCompare = () => {
    const parsedPrice = parseFloat(userPriceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid positive shelf price.');
      return;
    }
    if (!selectedCandidate) {
      alert('Please select a valid commodity candidate or search directory for a product.');
      return;
    }
    executeComparison(selectedCandidate, parsedPrice);
  };

  const filteredStores = stores.filter((s) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      s.store_name.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.owner_name.toLowerCase().includes(q)
    );
  });

  const handleReportWithReceipt = () => {
    if (comparisonResult) {
      const storeId = comparisonResult.store.id;
      const commodityId = comparisonResult.product?.id || (comparisonResult as any).commodity_id || (selectedCandidate ? selectedCandidate.id : 0);
      const dispPrice = typeof comparisonResult.displayed_price === 'number'
        ? comparisonResult.displayed_price
        : parseFloat(String(comparisonResult.displayed_price) || '0');
      const basePrice = typeof (comparisonResult.reference_price ?? comparisonResult.baseline_price) === 'number'
        ? (comparisonResult.reference_price ?? comparisonResult.baseline_price) as number
        : parseFloat(String(comparisonResult.reference_price ?? comparisonResult.baseline_price ?? '0'));

      writeHandoff({
        kind: 'scan-to-report',
        storeId,
        commodityId,
        displayedPrice: dispPrice,
        baselinePrice: basePrice,
      });
    }
    if (setActiveTab) {
      setActiveTab('reports');
    }
  };

  const ocrStatus = scanResponse?.ocr_status || 'OCR_PRODUCT_AND_PRICE_DETECTED';

  return (
    <div style={{ width: '100%', minHeight: '100dvh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {isDemoEnabled && (
        <div
          style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            color: '#d48806',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontWeight: 700,
            textAlign: 'center',
            margin: '8px 16px 0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>⚠️</span> Demo Data (Dev Mode Only)
        </div>
      )}

      {/* SCREEN 1: STORE SELECTION */}
      {scannerState === 'SELECT_STORE' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: '90px' }}>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            {errorMessage && (
              <div role="alert" className="banner-warning" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} /> {errorMessage}
              </div>
            )}
            
            {/* Search Input Bar */}
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '14px', top: '17px', color: '#94a3b8' }} size={18} />
              <input
                aria-label="Search verified stores"
                type="text"
                className="input-field"
                style={{
                  paddingLeft: '42px',
                  paddingRight: searchTerm ? '40px' : '16px',
                  height: '52px',
                  borderRadius: '12px',
                  fontSize: '0.95rem',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff'
                }}
                placeholder="Search store name, barangay, or address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  aria-label="Clear store search"
                  onClick={() => setSearchTerm('')}
                  style={{ position: 'absolute', right: '12px', top: '15px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Quick Filter Chips Bar */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
              <button
                onClick={() => setActiveFilterChip(activeFilterChip === 'nearby' ? 'all' : 'nearby')}
                style={{
                  padding: '8px 14px',
                  borderRadius: '9999px',
                  border: activeFilterChip === 'nearby' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                  background: activeFilterChip === 'nearby' ? '#eff6ff' : '#ffffff',
                  color: activeFilterChip === 'nearby' ? '#1d4ed8' : '#0f172a',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <MapPin size={14} color="#2563eb" />
                Nearby stores
              </button>

              <button
                onClick={() => setActiveFilterChip(activeFilterChip === 'recent' ? 'all' : 'recent')}
                style={{
                  padding: '8px 14px',
                  borderRadius: '9999px',
                  border: activeFilterChip === 'recent' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                  background: activeFilterChip === 'recent' ? '#eff6ff' : '#ffffff',
                  color: activeFilterChip === 'recent' ? '#1d4ed8' : '#0f172a',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Clock size={14} color="#2563eb" />
                Recently selected
              </button>
            </div>

            {/* Recently Used Store Shortcut Card */}
            {recentlyUsedStore && !searchTerm && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
                    Recently Used
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {recentlyUsedStore.store_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {recentlyUsedStore.address}
                  </div>
                </div>

                <button
                  onClick={() => handleStartScanForStore(recentlyUsedStore)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: '#1d4ed8',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  Use this store
                </button>
              </div>
            )}

            {/* Compact Consumer Store Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredStores.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <AlertTriangle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>No Verified Stores Available</div>
                  <div>{errorMessage || 'Unable to load verified store directory. Please check your network connection.'}</div>
                </div>
              ) : (
                filteredStores.map((store) => {
                  const isSelected = selectedStore?.id === store.id;
                  return (
                    <div
                      key={store.id}
                      onClick={() => setSelectedStore(store)}
                      style={{
                        background: '#ffffff',
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        borderRadius: '14px',
                        padding: '12px 14px',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.12)' : 'var(--shadow-sm)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <CompactStoreFacade photoType={(store as any).photoType} storeName={store.store_name} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                          <CheckCircle2 size={14} color="#2563eb" />
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb' }}>
                            Verified store
                          </span>
                        </div>

                        <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0f172a', margin: '0 0 2px 0', lineHeight: 1.25 }}>
                          {store.store_name}
                        </h3>

                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: 1.3 }}>
                          {store.address}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartScanForStore(store);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: isSelected ? '#1d4ed8' : '#f1f5f9',
                          color: isSelected ? '#ffffff' : '#0f172a',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          border: isSelected ? 'none' : '1px solid #cbd5e1',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        {isSelected ? 'Selected ✓' : 'Select'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sticky Bottom Action Area */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxWidth: '600px',
              margin: '0 auto',
              padding: '12px 16px calc(12px + env(safe-area-inset-bottom)) 16px',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              zIndex: 90
            }}
          >
            <button
              className="btn-primary"
              disabled={!selectedStore}
              onClick={() => selectedStore && handleStartScanForStore(selectedStore)}
              style={{ width: '100%', height: '50px', fontSize: '1rem', fontWeight: 700, borderRadius: '12px' }}
            >
              Continue to Live Camera
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 2: TRUE FULL-SCREEN LIVE CAMERA PREVIEW */}
      {scannerState === 'CAMERA_LIVE' && (
        <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: '#000000', zIndex: 1000, overflow: 'hidden' }}>
          
          {/* Top Translucent Control Overlay */}
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
              padding: 'calc(12px + env(safe-area-inset-top)) 16px 12px 16px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff' }}>
              <button
                onClick={() => {
                  stopCamera();
                  setScannerState('SELECT_STORE');
                }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                aria-label="Back to store selection"
              >
                <ArrowLeft size={20} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={16} color="#3b82f6" />
                <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>
                  {selectedStore?.store_name || 'Select Store'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {torchSupported && <button
                onClick={toggleTorch}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '44px', height: '44px', color: flashOn ? '#fbbf24' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Toggle flash"
              >
                {flashOn ? <Zap size={20} /> : <ZapOff size={20} />}
              </button>}

              <button
                onClick={toggleCameraFacing}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '44px', height: '44px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                aria-label="Switch camera"
              >
                <RotateCw size={20} />
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
            <div role="alert" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#94a3b8', textAlign: 'center' }}>
              <Camera size={48} color="#64748b" style={{ marginBottom: '12px' }} />
              <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: '6px' }}>Live Camera Unavailable</div>
              <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>{cameraError}</p>
            </div>
          )}

          {/* Compact Instruction Overlay */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(68px + env(safe-area-inset-top))',
              left: '16px',
              right: '16px',
              zIndex: 15,
              background: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              padding: '10px 14px',
              textAlign: 'center',
              color: '#ffffff'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
              Align the shelf tag inside the frame.
            </div>
            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '2px' }}>
              Include product name, package size, and displayed price.
            </div>
          </div>

          {/* Horizontal Shelf-Tag Framing Guide */}
          <div
            style={{
              position: 'absolute',
              top: '48%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '85%',
              maxWidth: '320px',
              height: '130px',
              zIndex: 15,
              pointerEvents: 'none'
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, width: '28px', height: '28px', borderTop: '4px solid #3b82f6', borderLeft: '4px solid #3b82f6', borderRadius: '8px 0 0 0' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: '28px', height: '28px', borderTop: '4px solid #3b82f6', borderRight: '4px solid #3b82f6', borderRadius: '0 8px 0 0' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '28px', height: '28px', borderBottom: '4px solid #3b82f6', borderLeft: '4px solid #3b82f6', borderRadius: '0 0 0 8px' }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderBottom: '4px solid #3b82f6', borderRight: '4px solid #3b82f6', borderRadius: '0 0 8px 0' }} />
          </div>

          {/* Bottom Capture Overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 20,
              padding: '16px 16px calc(20px + env(safe-area-inset-bottom)) 16px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontWeight: 600 }}>
              Align shelf tag inside bounding box
            </span>

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

            <span style={{ fontSize: '0.78rem', color: '#cbd5e1', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontWeight: 500 }}>
              Tap to capture shelf tag
            </span>
          </div>
        </div>
      )}

      {/* CAPTURE REVIEW */}
      {scannerState === 'CAPTURE_REVIEW' && capturedPreviewUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Review Captured Shelf Tag
          </h2>

          <div
            style={{
              position: 'relative',
              borderRadius: '14px',
              overflow: 'hidden',
              border: '2px solid #e2e8f0',
              maxHeight: '340px',
              background: '#09090b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img
              src={capturedPreviewUrl}
              alt="Captured Shelf Tag"
              style={{ width: '100%', height: '100%', objectFit: 'contain', maxHeight: '340px' }}
            />
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
              Retake
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
              Use capture
            </button>
          </div>
        </div>
      )}

      {/* UPLOADING / COMPARING PROGRESS */}
      {(scannerState === 'UPLOADING' || scannerState === 'COMPARING') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
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

      {/* RECOVERY & CANDIDATE MATCHING UI (Handles 5 Business OCR Recovery States) */}
      {(scannerState === 'RECOVERY' || scannerState === 'CANDIDATE_SELECTION' || scannerState === 'ENTER_PRICE') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', paddingBottom: '90px' }}>
          
          {/* STATE 1: OCR_PRODUCT_AND_PRICE_DETECTED */}
          {ocrStatus === 'OCR_PRODUCT_AND_PRICE_DETECTED' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    ✔ OCR-Detected Tag Price: ₱{userPriceInput || '0.00'}
                  </span>
                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700 }}>
                    OCR-Detected Product
                  </span>
                </div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                  Select Product Match
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  We found detected candidate commodities on your shelf tag:
                </p>
              </div>

              {/* Candidates List */}
              {candidates.length > 0 && !showManualDirectorySearch && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {candidates.map((c) => {
                    const isSelected = selectedCandidate?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCandidate(c);
                          setSelectedProductSource('OCR');
                        }}
                        style={{
                          background: '#ffffff',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.12)' : 'var(--shadow-sm)'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                            {c.commodity_name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                            {c.category || 'Commodity'} · {c.unit || c.package_size}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1d4ed8' }}>
                            ₱{Number(c.baseline_price).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Baseline SRP</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* STATE 2: PRODUCT_DETECTED_PRICE_MISSING */}
          {ocrStatus === 'PRODUCT_DETECTED_PRICE_MISSING' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Enter Displayed Shelf Price
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Enter the displayed shelf price
                </p>
              </div>

              {/* Informational Prompt Banner */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px', color: '#1e40af', fontSize: '0.82rem', lineHeight: 1.4 }}>
                The price could not be read clearly. Your entered price will be used only for this informational comparison...
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
                  placeholder="Enter price (e.g. 23.50)"
                  value={userPriceInput}
                  onChange={(e) => setUserPriceInput(e.target.value)}
                />
              </div>

              {/* Candidates List */}
              {candidates.length > 0 && !showManualDirectorySearch && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>Select Detected Product:</div>
                  {candidates.map((c) => {
                    const isSelected = selectedCandidate?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCandidate(c);
                          setSelectedProductSource('OCR');
                        }}
                        style={{
                          background: '#ffffff',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.12)' : 'var(--shadow-sm)'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                            {c.commodity_name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                            {c.category || 'Commodity'} · {c.unit || c.package_size}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1d4ed8' }}>
                            ₱{Number(c.baseline_price).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Baseline SRP</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* STATE 3: PRICE_DETECTED_PRODUCT_MISSING */}
          {ocrStatus === 'PRICE_DETECTED_PRODUCT_MISSING' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, width: 'fit-content' }}>
                  ✔ OCR-Detected Tag Price: ₱{userPriceInput || '0.00'}
                </span>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                  Search Commodity Directory
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  No matching product detected on tag. Please search the commodity directory to select product manually.
                </p>
              </div>
            </>
          )}

          {/* STATE 4: NO_RELIABLE_PRODUCT_MATCH */}
          {ocrStatus === 'NO_RELIABLE_PRODUCT_MATCH' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  No matching product found on shelf tag
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Please search the commodity directory to find and select the product manually.
                </p>
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
            </>
          )}

          {/* STATE 5: OCR_NO_TEXT */}
          {ocrStatus === 'OCR_NO_TEXT' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  No text could be read from shelf tag
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  We could not extract text from the shelf tag image. You may retake the tag image or search the commodity directory manually.
                </p>
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
            </>
          )}

          {/* Commodity Directory Search Component for Manual Selection (Used in states 3, 4, 5, or on demand) */}
          {(ocrStatus === 'PRICE_DETECTED_PRODUCT_MISSING' ||
            ocrStatus === 'NO_RELIABLE_PRODUCT_MATCH' ||
            ocrStatus === 'OCR_NO_TEXT' ||
            showManualDirectorySearch) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                Search Commodity Directory
              </div>
              
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: '12px', top: '14px', color: '#94a3b8' }} size={16} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '38px', height: '44px', borderRadius: '10px', fontSize: '0.9rem' }}
                  placeholder="Type commodity name, brand, or category..."
                  value={commoditySearchQuery}
                  onChange={(e) => searchCommodities(e.target.value)}
                />
              </div>

              {isSearchingCommodities && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Searching commodities...</div>}

              {commoditySearchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {commoditySearchResults.map((item) => {
                    const isSelected = selectedCandidate?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleManualSelectCommodity(item)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#f8fafc',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>{item.commodity_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.category} · {item.unit || item.package_size}</div>
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1d4ed8' }}>
                          ₱{Number(item.baseline_price).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selected Candidate Preview Card */}
          {selectedCandidate && (
            <div style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
                  Selected Product
                </span>
                <span style={{ background: selectedProductSource === 'MANUAL_SEARCH' ? '#f3e8ff' : '#dbeafe', color: selectedProductSource === 'MANUAL_SEARCH' ? '#6b21a8' : '#1e40af', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                  {selectedProductSource === 'MANUAL_SEARCH' ? 'Manual Directory Selection' : 'OCR-Detected'}
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {selectedCandidate.commodity_name}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                {selectedCandidate.unit || selectedCandidate.package_size} · Baseline SRP: ₱{Number(selectedCandidate.baseline_price).toFixed(2)}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <button
              className="btn-primary"
              onClick={handleConfirmAndCompare}
              disabled={!selectedCandidate || !userPriceInput}
              style={{ height: '50px', fontSize: '1rem', fontWeight: 700, borderRadius: '12px' }}
            >
              Compute Regulatory Comparison
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={handleRetake}
                style={{
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Retake Image
              </button>

              <button
                onClick={() => setShowManualDirectorySearch(!showManualDirectorySearch)}
                style={{
                  height: '44px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#1d4ed8',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {showManualDirectorySearch ? 'Hide Search' : 'Search Directory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 3: DYNAMIC COMPARISON RESULT */}
      {scannerState === 'RESULT' && comparisonResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', paddingBottom: '90px' }}>
          
          <div style={{ textAlign: 'center', paddingTop: '4px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: (comparisonResult.comparison_status === 'ABOVE_SRP' || comparisonResult.is_above_reference) ? '#fef3c7' : '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}
            >
              <Scale size={28} color={(comparisonResult.comparison_status === 'ABOVE_SRP' || comparisonResult.is_above_reference) ? '#d97706' : '#16a34a'} />
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Comparison Result
            </h1>
          </div>

          {/* Mandatory Consumer Disclaimer Banner */}
          <div
            className="disclaimer-banner"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start'
            }}
          >
            <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: '#92400e', lineHeight: 1.35 }}>
              ⚠️ This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.
            </div>
          </div>

          {/* Store & Product Section */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Store</span>
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
                {comparisonResult.store.store_name}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Product</span>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
                  {comparisonResult.commodity_name || comparisonResult.product?.commodity_name}
                </span>
                <span style={{
                  background: (comparisonResult.product_source === 'MANUAL_SEARCH') ? '#f3e8ff' : '#dbeafe',
                  color: (comparisonResult.product_source === 'MANUAL_SEARCH') ? '#6b21a8' : '#1e40af',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  {(comparisonResult.product_source === 'MANUAL_SEARCH') ? 'Manual Directory Selection' : 'OCR-Detected'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Package Size</span>
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>
                {comparisonResult.package_size || comparisonResult.unit || comparisonResult.product?.unit || 'Standard'}
              </span>
            </div>
          </div>

          {/* Prices Comparison Section */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 12px'
                }}
              >
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                  Displayed Shelf Price
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a' }}>
                  ₱{Number(comparisonResult.displayed_price).toFixed(2)}
                </div>
                <div style={{ marginTop: '4px' }}>
                  <span style={{
                    background: (comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED') ? '#fef3c7' : '#dcfce7',
                    color: (comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED') ? '#b45309' : '#15803d',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700
                  }}>
                    {(comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED') ? '✏️ Consumer-Entered Price' : '✔ OCR-Detected Tag Price'}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '10px 12px'
                }}
              >
                <div style={{ fontSize: '0.7rem', color: '#1e40af', fontWeight: 700, marginBottom: '2px' }}>
                  {comparisonResult.regulatory_label || comparisonResult.comparison_label || 'Current SRP'}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#1d4ed8' }}>
                  ₱{Number(comparisonResult.reference_price ?? comparisonResult.baseline_price ?? 0).toFixed(2)}
                </div>
                {comparisonResult.product?.effective_date && (
                  <div style={{ fontSize: '0.65rem', color: '#3b82f6' }}>
                    Effective {comparisonResult.product.effective_date}
                  </div>
                )}
              </div>
            </div>

            {/* Historical Store Price Subcard */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '0.8rem',
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
                <div>No verified historical store price is currently available.</div>
              )}
            </div>

            {/* Price Difference Indicator Box */}
            {(() => {
              const label = comparisonResult.regulatory_label || comparisonResult.comparison_label || 'current SRP';
              const isAbove = comparisonResult.is_above_reference || comparisonResult.comparison_status === 'ABOVE_SRP';
              const isBelow = comparisonResult.comparison_status === 'BELOW_SRP';
              const diffVal = comparisonResult.peso_difference ?? comparisonResult.difference_pesos ?? 0;
              const numDiff = Math.abs(Number(diffVal));

              return (
                <div
                  style={{
                    background: isAbove ? '#fffbeb' : '#f0fdf4',
                    border: isAbove ? '1px solid #fde68a' : '1px solid #bbf7d0',
                    borderRadius: '12px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      color: isAbove ? '#d97706' : '#16a34a'
                    }}
                  >
                    {isAbove
                      ? `₱${numDiff.toFixed(2)} above ${label}`
                      : isBelow
                      ? `₱${numDiff.toFixed(2)} below ${label}`
                      : `Matches ${label} baseline`}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Sticky Bottom Actions */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxWidth: '600px',
              margin: '0 auto',
              padding: '12px 16px calc(12px + env(safe-area-inset-bottom)) 16px',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 90
            }}
          >
            <button
              className="btn-primary"
              onClick={handleReportWithReceipt}
              style={{ width: '100%', height: '48px', fontSize: '0.92rem', fontWeight: 700, borderRadius: '10px' }}
            >
              Report using receipt
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={handleRetake}
                style={{
                  height: '42px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Scan another item
              </button>

              <button
                onClick={() => setActiveTab && setActiveTab('prices')}
                style={{
                  height: '42px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#1d4ed8',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                View price history
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {scannerState === 'ERROR' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={28} />
          </div>

          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Unable to analyze shelf tag
          </h2>

          <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '340px', margin: 0, lineHeight: 1.4 }}>
            {errorMessage || 'The shelf tag could not be processed. No comparison was generated and nothing was submitted.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '300px', marginTop: '12px' }}>
            <button
              className="btn-primary"
              onClick={handleRetake}
              style={{ height: '46px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 700 }}
            >
              Retake Image
            </button>

            <button
              onClick={() => setActiveTab && setActiveTab('prices')}
              style={{
                height: '46px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.88rem',
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
