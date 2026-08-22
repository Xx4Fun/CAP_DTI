import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  MapPin,
  Zap,
  ZapOff,
  RotateCw,
  Camera,
  Scale,
  AlertTriangle,
  Tag,
  ArrowLeft
} from 'lucide-react';
import {
  apiClient,
  defaultStoresList,
  type Establishment,
  type Commodity,
  type ScanCandidate,
  type ScanTagResponse,
  type ComparisonResultResponse
} from '../api/client';
import { consumeHandoff, writeHandoff, type FlowHandoff } from '../app/handoffs';
import { formatCommodityDisplay } from '../app/commodityFormatter';
import { haversineKm, formatDistance, type GeoPosition } from '../app/geolocation';
import { getRecentStoreIds, addRecentStore } from '../app/recentStores';
import { getFavoriteStoreIds, toggleFavoriteStore } from '../app/favoriteStores';
import { matchesPublicStoreSearch } from '../app/storeSearch';
import { computeGuideSourceCrop, computeNormalizedCropSize } from '../app/shelfTagCrop';
import { StoreSelectionCard } from './StoreSelectionCard';
import { StoreSelectionView } from './StoreSelectionView';
import { useBackLayer } from '../hooks/useBackLayer';

interface ShelfScannerProps {
  setActiveTab?: (tab: string) => void;
  location?: GeoPosition | null;
  locationError?: string;
  mode?: 'manual' | 'ocr';
}

export const CompactStoreFacade: React.FC<{ photoType?: string; storeName: string }> = ({ photoType, storeName }) => {
  const name = storeName.toLowerCase();

  if (photoType === 'super_metro' || name.includes('super metro') || name.includes('metro')) {
    return (
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '0.65rem',
          boxShadow: '0 2px 4px rgba(29, 78, 216, 0.2)',
          flexShrink: 0
        }}
      >
        <span style={{ color: '#fef08a' }}>METRO</span>
        <span style={{ fontSize: '0.55rem', opacity: 0.9 }}>SUPER</span>
      </div>
    );
  }

  if (photoType === 'gaisano' || name.includes('gaisano')) {
    return (
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '0.62rem',
          boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
          flexShrink: 0
        }}
      >
        <span>GAISANO</span>
        <span style={{ fontSize: '0.55rem', color: '#fef08a' }}>GRAND</span>
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

type ProductChoice = Pick<Commodity, 'id' | 'commodity_name'> &
  Partial<Commodity> &
  Partial<Pick<ScanCandidate, 'match_score' | 'match_level' | 'match_basis'>>;
type ProductSource = 'OCR' | 'OCR_CANDIDATE_SELECTED' | 'MANUAL_SEARCH';
type PriceSource = 'OCR_DETECTED' | 'USER_CONFIRMED' | 'USER_CORRECTED' | 'USER_ENTERED';

const isCatalogCommodity = (candidate: ProductChoice): candidate is Commodity =>
  typeof candidate.baseline_price === 'number';

export type ScannerStepState =
  | 'SELECT_STORE'
  | 'MANUAL_ENTRY'
  | 'CAMERA_LIVE'
  | 'UPLOADING'
  | 'ANALYZING'
  | 'RECOVERY'
  | 'CANDIDATE_SELECTION'
  | 'CANDIDATE_PICK'
  | 'ENTER_PRICE'
  | 'PRICE_INPUT'
  | 'COMPARING'
  | 'RESULT'
  | 'ERROR';

export const ShelfScanner: React.FC<ShelfScannerProps> = ({
  setActiveTab,
  location = null,
  locationError = '',
  mode = 'ocr',
}) => {
  const [scannerState, setScannerState] = useState<ScannerStepState>('SELECT_STORE');

  // Store Selection State
  const [stores, setStores] = useState<Establishment[]>(defaultStoresList);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterChip, setActiveFilterChip] = useState<'all' | 'recent' | 'favorite'>('all');
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<number[]>(getFavoriteStoreIds);

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
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ProductChoice | null>(null);
  const [selectedProductSource, setSelectedProductSource] = useState<ProductSource>('OCR');
  const [userPriceInput, setUserPriceInput] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResultResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Manual Commodity Directory Search State inside Scanner
  const [commoditySearchQuery, setCommoditySearchQuery] = useState('');
  const [commoditySearchResults, setCommoditySearchResults] = useState<Commodity[]>([]);
  const [isSearchingCommodities, setIsSearchingCommodities] = useState(false);
  const [commoditySearchError, setCommoditySearchError] = useState('');
  const [showManualDirectorySearch, setShowManualDirectorySearch] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const scanGenerationRef = useRef(0);
  const cameraRequestRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handoffRef = useRef<FlowHandoff | null>(consumeHandoff());
  const handedOffCommodityRef = useRef<Commodity | null>(null);

  useEffect(() => {
    fetchStores();
    if (mode === 'manual' && handoffRef.current?.kind === 'price-to-compare') {
      void preloadHandoffCommodity(handoffRef.current.commodityId);
    }
    return () => {
      scanGenerationRef.current += 1;
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      analysisAbortRef.current?.abort();
    };
  }, [mode]);

  // Body Scroll Locking for Full-Screen Camera
  useEffect(() => {
    if (mode === 'ocr' && scannerState === 'CAMERA_LIVE') {
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
  }, [scannerState, facingMode, mode]);

  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [capturedPreviewUrl]);

  const resetAllScanData = () => {
    scanGenerationRef.current += 1;
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
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
    setCommoditySearchError('');
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
      } else {
        setStores([]);
        setSelectedStore(null);
      }
    } catch (err) {
      console.error('API connection offline when fetching stores:', err);
      setStores([]);
      setSelectedStore(null);
      setErrorMessage('Unable to connect to regulatory store server. Please check your network connection.');
    }
  };

  const preloadHandoffCommodity = async (commodityId: number) => {
    try {
      const res = await apiClient.get('/public/commodities');
      const directory = res.data?.success && Array.isArray(res.data.data)
        ? res.data.data as Commodity[]
        : [];
      const commodity = directory.find((item) => item.id === commodityId) || null;
      if (!commodity) return;
      handedOffCommodityRef.current = commodity;
      setSelectedCandidate(commodity);
      setSelectedProductSource('MANUAL_SEARCH');
      setCommoditySearchQuery(commodity.commodity_name);
    } catch {
      // The form remains usable if the previously selected item is no longer in the live directory.
      handedOffCommodityRef.current = null;
    }
  };

  const searchCommodities = async (query: string) => {
    const generation = scanGenerationRef.current;
    setCommoditySearchQuery(query);
    setCommoditySearchError('');
    if (!query.trim()) {
      setCommoditySearchResults([]);
      return;
    }
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = window.setTimeout(async () => {
      setIsSearchingCommodities(true);
      try {
        const res = await apiClient.get('/public/commodities', { params: { query } });
        if (generation !== scanGenerationRef.current) return;
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
          setCommoditySearchResults(res.data.data);
        } else {
          setCommoditySearchResults([]);
          setCommoditySearchError('The current product directory could not be loaded.');
        }
      } catch {
        if (generation !== scanGenerationRef.current) return;
        setCommoditySearchResults([]);
        setCommoditySearchError('The current product directory is unavailable. Check your connection and try again.');
      } finally {
        if (generation === scanGenerationRef.current) setIsSearchingCommodities(false);
      }
    }, 300);
  };

  const startCamera = async () => {
    const requestId = ++cameraRequestRef.current;
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
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
      if (requestId !== cameraRequestRef.current) return;
      console.warn('Camera stream error:', err);
      setCameraError('Camera access is unavailable on this device or permission was denied.');
    }
  };

  const stopCamera = () => {
    cameraRequestRef.current += 1;
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchSupported(false);
    setFlashOn(false);
  };

  const returnScannerToStart = () => {
    analysisAbortRef.current?.abort();
    stopCamera();
    resetAllScanData();
    setSelectedStore(null);
    setScannerState('SELECT_STORE');
  };

  const returnScannerToCamera = () => {
    analysisAbortRef.current?.abort();
    resetAllScanData();
    if (selectedStore) {
      setScannerState('CAMERA_LIVE');
    } else {
      setScannerState('SELECT_STORE');
    }
  };

  useBackLayer('scanner-step', scannerState !== 'SELECT_STORE', () => {
    if (mode === 'manual') {
      if (scannerState === 'RESULT') {
        setErrorMessage('');
        setScannerState('MANUAL_ENTRY');
      } else if (scannerState === 'MANUAL_ENTRY') {
        returnScannerToStart();
      } else {
        setScannerState(selectedStore ? 'MANUAL_ENTRY' : 'SELECT_STORE');
      }
      return;
    }
    if (scannerState === 'CAMERA_LIVE' || scannerState === 'RESULT') {
      returnScannerToStart();
    } else {
      returnScannerToCamera();
    }
  });
  useBackLayer(
    'scanner-manual-directory',
    scannerState !== 'SELECT_STORE' && showManualDirectorySearch,
    () => setShowManualDirectorySearch(false),
  );

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
    addRecentStore(store.id);
    if (mode === 'manual' && handedOffCommodityRef.current) {
      setSelectedCandidate(handedOffCommodityRef.current);
      setSelectedProductSource('MANUAL_SEARCH');
      setCommoditySearchQuery(handedOffCommodityRef.current.commodity_name);
    }
    setScannerState(mode === 'manual' ? 'MANUAL_ENTRY' : 'CAMERA_LIVE');
  };

  const handleShutterCapture = () => {
    if (!videoRef.current || !selectedStore) return;
    const generation = scanGenerationRef.current;

    const video = videoRef.current;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;
    const videoRect = video.getBoundingClientRect();
    const guideRect = guideRef.current?.getBoundingClientRect();
    const sourceCrop = guideRect && videoRect.width > 0 && videoRect.height > 0
      ? computeGuideSourceCrop({ videoWidth, videoHeight, videoRect, guideRect })
      : { x: 0, y: 0, width: videoWidth, height: videoHeight };
    const normalizedSize = computeNormalizedCropSize(sourceCrop.width, sourceCrop.height);

    canvas.width = normalizedSize.width;
    canvas.height = normalizedSize.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      video,
      sourceCrop.x,
      sourceCrop.y,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    canvas.toBlob(
      (blob) => {
        if (generation !== scanGenerationRef.current) return;
        if (blob) {
          const previewUrl = URL.createObjectURL(blob);
          setCapturedBlob(blob);
          setCapturedPreviewUrl(previewUrl);
          stopCamera();
          void handleUploadAndAnalyze(blob);
        }
      },
      'image/jpeg',
      0.88
    );
  };

  const handleRetake = () => {
    analysisAbortRef.current?.abort();
    resetAllScanData();
    setScannerState('CAMERA_LIVE');
  };

  const handleUploadAndAnalyze = async (blobOverride?: Blob) => {
    const generation = scanGenerationRef.current;
    const imageBlob = blobOverride || capturedBlob;
    if (!imageBlob || !selectedStore) {
      setErrorMessage('No captured frame or store selected. Please retake the image.');
      setScannerState('ERROR');
      return;
    }

    setScannerState('ANALYZING');
    setProcessingStage('Uploading shelf tag image to DTI server...');
    analysisAbortRef.current?.abort();
    const abortController = new AbortController();
    analysisAbortRef.current = abortController;

    try {
      const scanUuid = 'scan_uuid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const formData = new FormData();
      formData.append('image', imageBlob, 'shelf_tag.jpg');
      formData.append('store_id', String(selectedStore.id));
      formData.append('scan_uuid', scanUuid);

      setProcessingStage('Reading tag text & matching database records...');

      const res = await apiClient.post('/public/scan-tag/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: abortController.signal,
        timeout: 12000,
      });
      if (generation !== scanGenerationRef.current) return;

      if (res.data && res.data.success && res.data.data) {
        const scanData: ScanTagResponse = res.data.data;
        setScanResponse(scanData);

        const fetchedCandidates: ScanCandidate[] = scanData.candidates || [];
        setCandidates(fetchedCandidates);

        const priceStr = scanData.detected_price_string ?? (scanData.detected_price != null ? String(scanData.detected_price) : '');
        setUserPriceInput(priceStr);
        setSelectedProductSource(scanData.product_source === 'MANUAL_SEARCH' ? 'MANUAL_SEARCH' : 'OCR');

        if (fetchedCandidates.length > 0 && scanData.recovery_reason !== 'AMBIGUOUS_PRODUCT') {
          setSelectedCandidate(fetchedCandidates[0]);
        } else {
          setSelectedCandidate(null);
        }

        if (scanData.auto_resolved && scanData.comparison) {
          setComparisonResult(scanData.comparison);
          if (scanData.comparison.product) {
            setSelectedCandidate(scanData.comparison.product);
          }
          setScannerState('RESULT');
        } else {
          setScannerState('RECOVERY');
        }
      } else {
        throw new Error('The shelf tag could not be processed.');
      }
    } catch (err: any) {
      if (generation !== scanGenerationRef.current || err?.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Shelf scan API error:', err);
      setErrorMessage(
        err.response?.data?.message || 'Unable to analyze shelf tag. The shelf tag could not be processed. No comparison was generated and nothing was submitted.'
      );
      setScannerState('ERROR');
    } finally {
      if (analysisAbortRef.current === abortController) {
        analysisAbortRef.current = null;
      }
    }
  };

  const handleManualSelectCommodity = async (commodity: Commodity) => {
    const generation = scanGenerationRef.current;
    setSelectedCandidate(commodity);
    setSelectedProductSource('MANUAL_SEARCH');

    try {
      if (scanResponse?.scan_id) {
        analysisAbortRef.current?.abort();
        const abortController = new AbortController();
        analysisAbortRef.current = abortController;
        await apiClient.post('/public/scan-tag/manual-select', {
          scan_id: scanResponse.scan_id,
          product_id: commodity.id,
        }, { signal: abortController.signal });
      }
      if (generation !== scanGenerationRef.current) return;

      const parsedPrice = Number(userPriceInput);
      if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
        await executeComparison(
          commodity,
          parsedPrice,
          'MANUAL_SEARCH',
        );
      }
    } catch (err: any) {
      if (generation !== scanGenerationRef.current || err?.code === 'ERR_CANCELED') return;
      console.error('Manual product selection error:', err);
      setErrorMessage(err.response?.data?.message || 'The selected product could not be applied to this scan. Please try again.');
      setScannerState('ERROR');
    }
  };

  const handleOcrCandidateSelect = (candidate: ScanCandidate) => {
    setSelectedCandidate(candidate);
    setSelectedProductSource('OCR_CANDIDATE_SELECTED');
    const parsedPrice = Number(userPriceInput);
    if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
      void executeComparison(candidate, parsedPrice, 'OCR_CANDIDATE_SELECTED');
    }
  };

  const executeComparison = async (
    candidate: ProductChoice,
    price: number,
    forcedProductSource?: ProductSource,
    forcedPriceSource?: PriceSource
  ) => {
    if (!selectedStore) return;
    const generation = scanGenerationRef.current;

    setScannerState('COMPARING');
    setProcessingStage('Fetching active price bulletin & history...');
    analysisAbortRef.current?.abort();
    const abortController = new AbortController();
    analysisAbortRef.current = abortController;

    const scanId = scanResponse?.scan_id;
    const detectedPriceStr = scanResponse?.detected_price_string ?? (scanResponse?.detected_price != null ? String(scanResponse.detected_price) : null);
    
    const pSource: ProductSource = forcedProductSource || selectedProductSource;
    let prSource: PriceSource;

    if (forcedPriceSource) {
      prSource = forcedPriceSource;
    } else if (detectedPriceStr !== null && detectedPriceStr !== '') {
      const formattedUserPrice = Number(price).toFixed(2);
      const formattedDetectedPrice = Number(detectedPriceStr).toFixed(2);
      prSource = formattedUserPrice === formattedDetectedPrice ? 'OCR_DETECTED' : 'USER_CORRECTED';
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
        }, { signal: abortController.signal });
      } else {
        res = await apiClient.post('/public/compare-price', {
          store_id: selectedStore.id,
          srp_bulletin_id: candidate.id,
          displayed_price: price,
        }, { signal: abortController.signal });
      }
      if (generation !== scanGenerationRef.current) return;

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
      if (generation !== scanGenerationRef.current || err?.code === 'ERR_CANCELED') return;
      console.error('Comparison API error:', err);
      setErrorMessage(
        err.response?.data?.message || (mode === 'manual'
          ? 'The price comparison could not be completed. Nothing was submitted.'
          : 'The shelf tag could not be processed. No comparison was generated and nothing was submitted.')
      );
      setScannerState('ERROR');
    } finally {
      if (analysisAbortRef.current === abortController) {
        analysisAbortRef.current = null;
      }
    }
  };

  const handleConfirmAndCompare = () => {
    const parsedPrice = parseFloat(userPriceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage('Please enter a valid positive shelf price.');
      setScannerState('ERROR');
      return;
    }
    if (!selectedCandidate) {
      setErrorMessage('Please select a valid commodity candidate or search directory for a product.');
      setScannerState('ERROR');
      return;
    }
    executeComparison(selectedCandidate, parsedPrice);
  };

  const handleManualEntryCommoditySelect = (commodity: Commodity) => {
    handedOffCommodityRef.current = null;
    setSelectedCandidate(commodity);
    setSelectedProductSource('MANUAL_SEARCH');
    setCommoditySearchQuery(commodity.commodity_name);
    setCommoditySearchResults([]);
    setCommoditySearchError('');
    setErrorMessage('');
  };

  const handleManualCompare = () => {
    const parsedPrice = Number(userPriceInput);
    if (!selectedCandidate) {
      setErrorMessage('Select an official item before comparing its price.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0.01) {
      setErrorMessage('Enter a shelf price of at least ₱0.01.');
      return;
    }
    setErrorMessage('');
    void executeComparison(selectedCandidate, parsedPrice, 'MANUAL_SEARCH', 'USER_ENTERED');
  };

  const handleEditManualComparison = () => {
    setErrorMessage('');
    setScannerState('MANUAL_ENTRY');
  };

  const handleCompareAnotherManualItem = () => {
    handedOffCommodityRef.current = null;
    resetAllScanData();
    setScannerState('MANUAL_ENTRY');
  };

  const openManualRecovery = () => {
    setErrorMessage('');
    setShowManualDirectorySearch(true);
    setScannerState('RECOVERY');
  };

  const handleCorrectResult = () => {
    const displayedPrice = Number(comparisonResult?.displayed_price);
    if (Number.isFinite(displayedPrice) && displayedPrice > 0) {
      setUserPriceInput(displayedPrice.toFixed(2));
    }
    if (comparisonResult?.product) {
      setSelectedCandidate(comparisonResult.product);
    }
    setShowManualDirectorySearch(true);
    setScannerState('RECOVERY');
  };

  const recentStoreIds = getRecentStoreIds();
  const filteredStores = stores.filter((s) => {
    let matchesFilter = true;
    if (activeFilterChip === 'recent') {
      matchesFilter = recentStoreIds.includes(s.id);
    } else if (activeFilterChip === 'favorite') {
      matchesFilter = favoriteStoreIds.includes(s.id);
    }

    return matchesFilter && matchesPublicStoreSearch(s, searchTerm);
  });

  if (activeFilterChip === 'all' && location) {
    filteredStores.sort((a, b) =>
      haversineKm(location.latitude, location.longitude, a.latitude, a.longitude) -
      haversineKm(location.latitude, location.longitude, b.latitude, b.longitude)
    );
  } else if (activeFilterChip === 'recent') {
    filteredStores.sort((a, b) => recentStoreIds.indexOf(a.id) - recentStoreIds.indexOf(b.id));
  }

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

  const ocrStatus = scanResponse?.ocr_status || 'OCR_NO_TEXT';
  const rawResultProductName = comparisonResult?.commodity_name
    || comparisonResult?.product?.commodity_name
    || '';
  const resultProductName = formatCommodityDisplay(
    rawResultProductName,
    comparisonResult?.product?.category || '',
    comparisonResult?.package_size || comparisonResult?.unit || comparisonResult?.product?.unit || '',
  ).title;
  const resultIsAboveReference = Boolean(
    comparisonResult
    && (comparisonResult.is_above_reference || comparisonResult.comparison_status === 'ABOVE_SRP'),
  );

  return (
    <div style={{ width: '100%', minHeight: '100dvh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* SCREEN 1: STORE SELECTION */}
      {scannerState === 'SELECT_STORE' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: '24px' }}>
          <div className="store-selection-screen">
            <StoreSelectionView
              subtitle="Where are you checking the shelf price?"
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              activeFilter={activeFilterChip}
              onFilterChange={setActiveFilterChip}
              resultCount={filteredStores.length}
              geoError={locationError}
              emptyTitle={errorMessage
                ? 'Store directory unavailable'
                : activeFilterChip === 'recent'
                  ? 'No recent stores'
                  : activeFilterChip === 'favorite'
                    ? 'No favorite stores'
                  : 'No matching stores found'}
              emptyDescription={errorMessage || (activeFilterChip === 'recent'
                ? 'Stores you scan will appear here for faster access.'
                : activeFilterChip === 'favorite'
                  ? 'Tap the star on a store to keep it close at hand.'
                : 'Try another store name or view the full directory.')}
              onReset={!errorMessage && (searchTerm || activeFilterChip !== 'all') ? () => {
                setSearchTerm('');
                setActiveFilterChip('all');
              } : undefined}
            >
              {filteredStores.map((store) => (
                <StoreSelectionCard
                  key={store.id}
                  store={store}
                  distanceLabel={location
                    ? formatDistance(haversineKm(location.latitude, location.longitude, store.latitude, store.longitude))
                    : undefined}
                  isFavorite={favoriteStoreIds.includes(store.id)}
                  onToggleFavorite={() => setFavoriteStoreIds(toggleFavoriteStore(store.id))}
                  onActivate={() => handleStartScanForStore(store)}
                />
              ))}
            </StoreSelectionView>
          </div>
        </div>
      )}

      {/* Manual Compare is the visible customer flow. It intentionally bypasses camera and OCR. */}
      {mode === 'manual' && scannerState === 'MANUAL_ENTRY' && selectedStore && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', paddingBottom: 'calc(104px + env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={returnScannerToStart}
              aria-label="Back to store selection"
              style={{ width: '42px', height: '42px', borderRadius: '12px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.35rem', fontWeight: 800 }}>Compare a shelf price</h1>
              <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.82rem' }}>Choose an official item, then enter the price shown in store.</p>
            </div>
          </div>

          <div style={{ background: '#eaf3ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapPin size={18} color="#2563eb" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#1e3a8a', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Selected store</div>
              <div style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedStore.store_name}</div>
            </div>
          </div>

          <section style={{ background: '#ffffff', border: '1px solid #dbe3ee', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label htmlFor="manual-commodity-search" style={{ display: 'block', color: '#0f172a', fontSize: '0.84rem', fontWeight: 750, marginBottom: '7px' }}>Official item</label>
              <div style={{ position: 'relative' }}>
                <Search size={18} color="#64748b" aria-hidden="true" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  id="manual-commodity-search"
                  type="search"
                  aria-label="Search official item"
                  placeholder="Search product name or brand"
                  autoComplete="off"
                  value={commoditySearchQuery}
                  onChange={(event) => {
                    const query = event.target.value;
                    if (selectedCandidate && query !== selectedCandidate.commodity_name) {
                      handedOffCommodityRef.current = null;
                      setSelectedCandidate(null);
                    }
                    void searchCommodities(query);
                  }}
                  style={{ width: '100%', height: '46px', borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0 14px 0 40px', color: '#0f172a', background: '#ffffff', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
            </div>

            {isSearchingCommodities && <div role="status" style={{ color: '#64748b', fontSize: '0.8rem' }}>Searching official price directory…</div>}
            {commoditySearchError && <div role="alert" style={{ color: '#b91c1c', fontSize: '0.8rem' }}>{commoditySearchError}</div>}
            {!isSearchingCommodities && commoditySearchQuery.trim() && !selectedCandidate && commoditySearchResults.length === 0 && !commoditySearchError && (
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No official items match that search.</div>
            )}
            {commoditySearchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {commoditySearchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Select ${item.commodity_name}`}
                    onClick={() => handleManualEntryCommoditySelect(item)}
                    style={{ width: '100%', border: '1px solid #dbe3ee', borderRadius: '12px', background: '#f8fafc', padding: '11px 12px', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span style={{ display: 'block', color: '#0f172a', fontSize: '0.86rem', fontWeight: 750 }}>{item.commodity_name}</span>
                    <span style={{ display: 'block', color: '#64748b', fontSize: '0.74rem', marginTop: '3px' }}>{item.unit || item.package_size || 'Standard unit'} · Current SRP ₱{Number(item.baseline_price).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedCandidate && (
              <div style={{ border: '1px solid #bfdbfe', borderRadius: '13px', background: '#eff6ff', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{selectedCandidate.commodity_name}</strong>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#475569', fontSize: '0.78rem' }}>
                  <span>Official unit</span>
                  <strong style={{ color: '#1e3a8a' }}>{selectedCandidate.unit || selectedCandidate.package_size || 'Standard'}</strong>
                </div>
                <div style={{ color: '#1d4ed8', fontSize: '0.8rem', fontWeight: 750 }}>Current SRP: ₱{Number(selectedCandidate.baseline_price || 0).toFixed(2)}</div>
              </div>
            )}

            <div>
              <label htmlFor="manual-shelf-price" style={{ display: 'block', color: '#0f172a', fontSize: '0.84rem', fontWeight: 750, marginBottom: '7px' }}>Shelf price</label>
              <div style={{ position: 'relative' }}>
                <span aria-hidden="true" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontWeight: 750 }}>₱</span>
                <input
                  id="manual-shelf-price"
                  type="number"
                  aria-label="Shelf price"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={userPriceInput}
                  onChange={(event) => {
                    setUserPriceInput(event.target.value);
                    setErrorMessage('');
                  }}
                  style={{ width: '100%', height: '48px', boxSizing: 'border-box', borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0 14px 0 34px', color: '#0f172a', background: '#ffffff', fontSize: '1rem', fontWeight: 700, outline: 'none' }}
                />
              </div>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.74rem' }}>Enter the price exactly as displayed on the shelf.</p>
            </div>

            {errorMessage && <div role="alert" style={{ borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', padding: '10px 12px', fontSize: '0.8rem' }}>{errorMessage}</div>}

            <button
              type="button"
              className="btn-primary"
              onClick={handleManualCompare}
              disabled={!selectedCandidate || !Number.isFinite(Number(userPriceInput)) || Number(userPriceInput) < 0.01}
              style={{ width: '100%', height: '48px', borderRadius: '12px', fontSize: '0.92rem', fontWeight: 750 }}
            >
              Compare price
            </button>
          </section>
        </div>
      )}

      {/* SCREEN 2: TRUE FULL-SCREEN LIVE CAMERA PREVIEW */}
      {mode === 'ocr' && scannerState === 'CAMERA_LIVE' && (
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
                onClick={returnScannerToStart}
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

          {/* Sleek Floating Pill Badge Overlay */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(68px + env(safe-area-inset-top))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 15,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(8px)',
              borderRadius: '999px',
              padding: '6px 14px',
              textAlign: 'center',
              color: '#ffffff',
              whiteSpace: 'nowrap'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>
              Align tag inside frame
            </div>
          </div>

          {/* Horizontal Shelf-Tag Framing Guide */}
          <div
            ref={guideRef}
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
              bottom: 'calc(20px + env(safe-area-inset-bottom))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <button
              onClick={handleShutterCapture}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                border: '3px solid #ffffff',
                background: 'transparent',
                padding: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
              }}
              aria-label="Capture Shutter"
            >
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: '#ffffff',
                }}
              />
            </button>
          </div>
        </div>
      )}

      {/* UPLOADING / COMPARING PROGRESS */}
      {(scannerState === 'UPLOADING' || scannerState === 'ANALYZING' || scannerState === 'COMPARING') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: '16px' }}>
          {capturedPreviewUrl && (
            <img
              src={capturedPreviewUrl}
              alt="Shelf tag being analyzed"
              style={{ width: 'min(100%, 360px)', maxHeight: '180px', objectFit: 'contain', borderRadius: '14px', background: '#0f172a' }}
            />
          )}
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
                  <span style={{ background: scanResponse?.recovery_reason === 'PRICE_UNCERTAIN' ? '#fef3c7' : '#dcfce7', color: scanResponse?.recovery_reason === 'PRICE_UNCERTAIN' ? '#92400e' : '#14532d', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {scanResponse?.recovery_reason === 'PRICE_UNCERTAIN' ? 'Check OCR price' : '✔ OCR-Detected Tag Price'}: ₱{userPriceInput || '0.00'}
                  </span>
                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700 }}>
                    OCR-Detected Product
                  </span>
                </div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                  {scanResponse?.recovery_reason === 'PRICE_UNCERTAIN' ? 'Check the shelf price' : 'Select Product Match'}
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  {scanResponse?.recovery_reason === 'PRICE_UNCERTAIN'
                    ? 'The product matched, but the price text was not clear enough to use automatically.'
                    : 'We found detected candidate commodities on your shelf tag:'}
                </p>
              </div>

              {(showManualDirectorySearch || scanResponse?.recovery_reason === 'PRICE_UNCERTAIN') && (
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
                    Displayed Shelf Price (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    style={{ height: '50px', fontSize: '1.2rem', fontWeight: 800, borderRadius: '12px', padding: '0 16px', border: '1.5px solid #2563eb', background: '#ffffff' }}
                    value={userPriceInput}
                    onChange={(e) => setUserPriceInput(e.target.value)}
                  />
                </div>
              )}

              {/* Candidates List */}
              {candidates.length > 0 && !showManualDirectorySearch && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {candidates.map((c) => {
                    const isSelected = selectedCandidate?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOcrCandidateSelect(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleOcrCandidateSelect(c);
                          }
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
                            {c.category || 'Commodity'} · {c.unit || c.package_size || 'Standard'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>
                            {c.match_level === 'STRONG' ? 'Strong match' : 'Possible match'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>OCR text match</div>
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
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOcrCandidateSelect(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleOcrCandidateSelect(c);
                          }
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
                            {c.category || 'Commodity'} · {c.unit || c.package_size || 'Standard'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1d4ed8' }}>
                            {c.match_level === 'STRONG' ? 'Strong match' : 'Possible match'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>OCR text match</div>
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
                <span style={{ background: '#dcfce7', color: '#14532d', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, width: 'fit-content' }}>
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

              {commoditySearchError && (
                <div role="alert" style={{ fontSize: '0.8rem', color: '#b91c1c' }}>{commoditySearchError}</div>
              )}

              {!isSearchingCommodities && !commoditySearchError && commoditySearchQuery.trim() && commoditySearchResults.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>No current product matched. Try the brand, product type, or package size.</div>
              )}

              {commoditySearchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {commoditySearchResults.map((item) => {
                    const isSelected = selectedCandidate?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleManualSelectCommodity(item)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleManualSelectCommodity(item); }}
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
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.category || 'Commodity'} · {item.unit || item.package_size || 'Standard'}</div>
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
                {selectedCandidate.unit || selectedCandidate.package_size || 'Standard'}
                {isCatalogCommodity(selectedCandidate)
                  ? ` · Current catalog reference: ₱${Number(selectedCandidate.baseline_price).toFixed(2)}`
                  : selectedCandidate.match_level
                    ? ` · ${selectedCandidate.match_level === 'STRONG' ? 'Strong' : 'Possible'} OCR text match`
                    : ''}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
          
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
                  {resultProductName}
                </span>
                <span style={{
                  background: (comparisonResult.product_source === 'MANUAL_SEARCH') ? '#f3e8ff' : '#dbeafe',
                  color: (comparisonResult.product_source === 'MANUAL_SEARCH') ? '#6b21a8' : '#1e40af',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  {mode === 'manual'
                    ? 'Manual entry'
                    : (comparisonResult.product_source === 'MANUAL_SEARCH')
                      ? 'Manual Directory Selection'
                      : 'OCR-Detected'}
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
                    {mode === 'manual'
                      ? 'Consumer-entered price'
                      : (comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED')
                        ? '✏️ Consumer-Entered Price'
                        : '✔ OCR-Detected Tag Price'}
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
                    Effective {comparisonResult.product.effective_date.split('T')[0]}
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

          {/* Result actions */}
          <div
            data-testid="scan-result-actions"
            style={{
              marginTop: '4px',
              padding: '4px 0 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            {mode === 'ocr' && resultIsAboveReference && (
              <button
                className="btn-primary"
                onClick={handleReportWithReceipt}
                style={{ width: '100%', height: '48px', fontSize: '0.92rem', fontWeight: 700, borderRadius: '10px' }}
              >
                Report using receipt
              </button>
            )}

            {mode === 'manual' ? (
              <>
                <button
                  type="button"
                  onClick={handleEditManualComparison}
                  style={{ width: '100%', height: '44px', borderRadius: '10px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Edit item or price
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleCompareAnotherManualItem}
                    style={{ minHeight: '44px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', padding: '8px' }}
                  >
                    Compare another item
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab?.('prices')}
                    style={{ minHeight: '44px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#1d4ed8', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', padding: '8px' }}
                  >
                    Return to Prices
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleCorrectResult}
                  style={{
                    width: '100%',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid #93c5fd',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Correct product or price
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
              </>
            )}
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
            {mode === 'manual' ? 'Unable to compare price' : 'Unable to analyze shelf tag'}
          </h2>

          <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '340px', margin: 0, lineHeight: 1.4 }}>
            {errorMessage || (mode === 'manual'
              ? 'The price comparison could not be completed. Nothing was submitted.'
              : 'The shelf tag could not be processed. No comparison was generated and nothing was submitted.')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '300px', marginTop: '12px' }}>
            {mode === 'manual' ? (
              <>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setScannerState('MANUAL_ENTRY');
                  }}
                  style={{ height: '46px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 700 }}
                >
                  Back to price entry
                </button>
                <button
                  type="button"
                  onClick={returnScannerToStart}
                  style={{ height: '46px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Choose another store
                </button>
              </>
            ) : <>
            {capturedBlob && (
              <button
                className="btn-primary"
                onClick={() => void handleUploadAndAnalyze()}
                style={{ height: '46px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 700 }}
              >
                Retry analysis
              </button>
            )}

            <button
              onClick={handleRetake}
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
              Retake Image
            </button>

            <button
              onClick={openManualRecovery}
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
              Enter product and price manually
            </button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShelfScanner;
