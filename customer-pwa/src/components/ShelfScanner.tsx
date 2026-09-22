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
  ArrowLeft,
  CheckCircle2,
  History
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
import { peekHandoff, clearHandoff, writeHandoff, type FlowHandoff } from '../app/handoffs';
import { saveRecentComparison, getRecentComparisons } from '../app/recentComparisons';
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

const STAPLE_CHIPS = [
  { label: 'Rice', query: 'Rice' },
  { label: 'Canned Fish', query: 'Sardines' },
  { label: 'Milk', query: 'Milk' },
  { label: 'Coffee', query: 'Coffee' },
  { label: 'Bread', query: 'Bread' },
  { label: 'Candles', query: 'Esperma' },
];

const getConciseCommodityTitle = (commodity: Pick<Commodity, 'commodity_name' | 'category' | 'unit' | 'package_size'>): string =>
  formatCommodityDisplay(
    commodity.commodity_name,
    commodity.category || '',
    commodity.unit || commodity.package_size || '',
  ).title || commodity.commodity_name;

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

type InlineCheck = {
  key: string;
  status: 'pending' | 'done' | 'error';
  result?: ComparisonResultResponse;
  saved?: boolean;
  message?: string;
};

const isCatalogCommodity =(candidate: ProductChoice): candidate is Commodity =>
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
  const handoffRef = useRef<FlowHandoff | null>(null);
  if (handoffRef.current === null) {
    handoffRef.current = peekHandoff();
  }
  const initialComparison = handoffRef.current?.kind === 'view-comparison'
    ? handoffRef.current.comparison
    : null;

  const [scannerState, setScannerState] = useState<ScannerStepState>(() => (initialComparison ? 'RESULT' : 'SELECT_STORE'));

  // Store Selection State
  const [stores, setStores] = useState<Establishment[]>(defaultStoresList);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(() => {
    if (initialComparison?.store) {
      return {
        id: initialComparison.store.id,
        store_name: initialComparison.store.store_name,
        address: initialComparison.store.address,
        dti_sec_number: initialComparison.store.dti_sec_number,
        latitude: 0,
        longitude: 0,
      };
    }
    return null;
  });
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
  const [selectedCandidate, setSelectedCandidate] = useState<ProductChoice | null>(() => {
    if (initialComparison?.product) {
      return initialComparison.product as Commodity;
    }
    return null;
  });
  const [selectedProductSource, setSelectedProductSource] = useState<ProductSource>(() => {
    if (initialComparison?.product_source === 'MANUAL_SEARCH') return 'MANUAL_SEARCH';
    return 'OCR';
  });
  const [userPriceInput, setUserPriceInput] = useState<string>(() => {
    if (initialComparison?.displayed_price != null) return String(initialComparison.displayed_price);
    return '';
  });
  const [comparisonResult, setComparisonResult] = useState<ComparisonResultResponse | null>(initialComparison);
  const [errorMessage, setErrorMessage] = useState<string>('');
  // Manual entry: live server check + auto-save to history once item and price settle.
  const [inlineCheck, setInlineCheck] = useState<InlineCheck | null>(null);
  const inlineKeyRef = useRef<string | null>(null);
  // `${storeId}-${itemId}` the server said has no official reference; sticks across price edits for that item.
  const [unavailableProductKey, setUnavailableProductKey] = useState<string | null>(null);

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
  const handedOffCommodityRef = useRef<Commodity | null>(null);

  useEffect(() => {
    // Clear handoff once mounted
    if (peekHandoff()) {
      clearHandoff();
    }
  }, []);

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

  // Ensure scroll offset resets to top when entering entry, result, or store selection views
  useEffect(() => {
    if (scannerState === 'RESULT' || scannerState === 'MANUAL_ENTRY' || scannerState === 'SELECT_STORE') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [scannerState]);

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
    inlineKeyRef.current = null;
    setInlineCheck(null);
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
          : handoffRef.current?.kind === 'view-comparison'
            ? handoffRef.current.comparison.store.id
            : undefined;
        if (requestedStoreId) {
          const matchedStore = apiStores.find((store) => store.id === requestedStoreId);
          if (matchedStore) setSelectedStore(matchedStore);
        }
      } else {
        setStores([]);
        if (!initialComparison) setSelectedStore(null);
      }
    } catch (err) {
      console.error('API connection offline when fetching stores:', err);
      setStores([]);
      if (!initialComparison) setSelectedStore(null);
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
      setCommoditySearchQuery(getConciseCommodityTitle(commodity));
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
        const params = mode === 'manual'
          ? { query, match_mode: 'identity', limit: 5 }
          : { query };
        const res = await apiClient.get('/public/commodities', { params });
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
          saveRecentComparison(scanData.comparison);
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
        const finalComparison: ComparisonResultResponse = {
          ...data,
          product_source: data.product_source || pSource,
          price_source: data.price_source || prSource,
        };
        setComparisonResult(finalComparison);
        setScannerState('RESULT');
        saveRecentComparison(finalComparison);
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
    inlineKeyRef.current = null;
    handedOffCommodityRef.current = null;
    setSelectedCandidate(commodity);
    setSelectedProductSource('MANUAL_SEARCH');
    setCommoditySearchQuery(getConciseCommodityTitle(commodity));
    setCommoditySearchResults([]);
    setCommoditySearchError('');
    setErrorMessage('');
  };

  const inlineCents = Math.round(Number(userPriceInput) * 100);
  const inlinePrice = inlineCents / 100;
  const inlineKey = mode === 'manual'
    && scannerState === 'MANUAL_ENTRY'
    && selectedStore
    && selectedCandidate
    && Number.isFinite(inlinePrice)
    && Number.isSafeInteger(inlineCents)
    && inlineCents >= 1
    ? `${selectedStore.id}-${selectedCandidate.id}-${inlineCents}`
    : null;

  // Raw inputs are deps so an edit that keeps the same key still restores the ref that handlers null out.
  // inlineCheck is deliberately not a dep: setting it to 'pending' here must not cancel this run's timer.
  useEffect(() => {
    inlineKeyRef.current = inlineKey;
    if (!inlineKey || !selectedStore || !selectedCandidate) {
      // Invalidated input forgets the last result so re-entering the same item and price checks again.
      setInlineCheck(null);
      return;
    }
    if (inlineCheck?.key === inlineKey && inlineCheck.status === 'done') return;

    setInlineCheck({ key: inlineKey, status: 'pending' });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiClient.post('/public/compare-price', {
          store_id: selectedStore.id,
          srp_bulletin_id: selectedCandidate.id,
          displayed_price: inlinePrice,
        }, { signal: controller.signal });
        if (inlineKeyRef.current !== inlineKey) return;
        if (!res.data?.success || !res.data.data) throw new Error('Invalid comparison response.');
        const result: ComparisonResultResponse = {
          ...res.data.data,
          product_source: 'MANUAL_SEARCH',
          price_source: 'USER_ENTERED',
        };
        setUnavailableProductKey(null);
        const next = saveRecentComparison(result);
        // saveRecentComparison swallows storage failures; read back to confirm it persisted.
        const saved = getRecentComparisons()[0]?.id === next[0]?.id;
        setInlineCheck({ key: inlineKey, status: 'done', result, saved });
      } catch (err: any) {
        if (inlineKeyRef.current !== inlineKey || err?.code === 'ERR_CANCELED') return;
        const referenceUnavailable = err?.response?.data?.status === 'REFERENCE_UNAVAILABLE';
        if (referenceUnavailable) setUnavailableProductKey(`${selectedStore.id}-${selectedCandidate.id}`);
        setInlineCheck({
          key: inlineKey,
          status: 'error',
          message: referenceUnavailable
            ? err.response.data.message || 'No official reference price is on record for this item right now.'
            : err?.response?.status === 429
              ? 'Too many checks right now. Try again in a minute.'
              : "Couldn't check price records. The live SRP check above still applies.",
        });
      }
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [inlineKey, userPriceInput, selectedCandidate, selectedStore]);

  const visibleInlineCheck = inlineKey && inlineCheck?.key === inlineKey ? inlineCheck : null;

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
        <div className="shelf-compare-page">
          <div className="shelf-compare-header">
            <button
              type="button"
              onClick={returnScannerToStart}
              aria-label="Back to store selection"
              className="shelf-compare-back-btn"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="shelf-compare-title">Compare a shelf price</h1>
              <p className="shelf-compare-subtitle">Choose an official item, then enter the price shown in store.</p>
            </div>
          </div>

          <div className="shelf-compare-store-card">
            <div className="shelf-compare-store-info">
              <span className="shelf-compare-store-badge">Selected Store</span>
              <div className="shelf-compare-store-name">{selectedStore.store_name}</div>
              {selectedStore.address && (
                <div className="shelf-compare-store-address">{selectedStore.address}</div>
              )}
            </div>
            <button
              type="button"
              onClick={returnScannerToStart}
              className="shelf-compare-change-btn"
              aria-label="Change store"
            >
              Change
            </button>
          </div>

          <section className="shelf-compare-form-card">
            <div className="shelf-compare-field">
              <label htmlFor="manual-commodity-search" className="shelf-compare-label">
                <span>Official item</span>
              </label>
              <div className="shelf-compare-input-wrap">
                <Search size={18} className="shelf-compare-search-icon" aria-hidden="true" />
                <input
                  id="manual-commodity-search"
                  type="search"
                  aria-label="Search official item"
                  placeholder="Search product name or brand"
                  autoComplete="off"
                  value={commoditySearchQuery}
                  onChange={(event) => {
                    const query = event.target.value;
                    inlineKeyRef.current = null;
                    if (selectedCandidate && query !== selectedCandidate.commodity_name) {
                      handedOffCommodityRef.current = null;
                      setSelectedCandidate(null);
                    }
                    void searchCommodities(query);
                  }}
                  className="shelf-compare-search-input"
                />
              </div>

              {!selectedCandidate && !commoditySearchQuery && (
                <div className="shelf-compare-chips-container">
                  <span className="shelf-compare-chips-label">Common staples</span>
                  <div className="shelf-compare-chips-scroll">
                    {STAPLE_CHIPS.map((chip) => (
                      <button
                        key={chip.query}
                        type="button"
                        className="shelf-compare-chip"
                        onClick={() => {
                          void searchCommodities(chip.query);
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {commoditySearchResults.length > 0 && (
                <div className="shelf-compare-dropdown">
                  {commoditySearchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Select ${getConciseCommodityTitle(item)}`}
                      onClick={() => handleManualEntryCommoditySelect(item)}
                      className="shelf-compare-dropdown-item"
                    >
                      <span className="shelf-compare-dropdown-title">{getConciseCommodityTitle(item)}</span>
                      <span className="shelf-compare-dropdown-meta">
                        {item.unit || item.package_size || 'Standard unit'} · Current SRP ₱{Number(item.baseline_price).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isSearchingCommodities && (
              <div role="status" style={{ color: '#64748b', fontSize: '0.8rem' }}>
                Searching official price directory…
              </div>
            )}
            {commoditySearchError && (
              <div role="alert" style={{ color: '#b91c1c', fontSize: '0.8rem' }}>
                {commoditySearchError}
              </div>
            )}
            {!isSearchingCommodities && commoditySearchQuery.trim() && !selectedCandidate && commoditySearchResults.length === 0 && !commoditySearchError && (
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                No official items match that search.
              </div>
            )}

            {selectedCandidate && (
              <div className="shelf-compare-selected-card">
                <div className="shelf-compare-selected-top">
                  <div className="shelf-compare-selected-title-group">
                    <span className="shelf-compare-selected-badge">Selected Product</span>
                    <strong className="shelf-compare-selected-title">
                      {getConciseCommodityTitle(selectedCandidate as Commodity)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    aria-label="Change item"
                    className="shelf-compare-selected-clear-btn"
                    onClick={() => {
                      inlineKeyRef.current = null;
                      handedOffCommodityRef.current = null;
                      setSelectedCandidate(null);
                      setCommoditySearchQuery('');
                    }}
                  >
                    Change
                  </button>
                </div>
                <div className="shelf-compare-selected-details">
                  <div className="shelf-compare-selected-unit-row">
                    <span>Official unit</span>
                    <strong className="shelf-compare-selected-unit-val">
                      {selectedCandidate.unit || selectedCandidate.package_size || 'Standard'}
                    </strong>
                  </div>
                  <div className="shelf-compare-selected-srp-val">
                    Current SRP: ₱{Number(selectedCandidate.baseline_price || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="shelf-compare-field">
              <label htmlFor="manual-shelf-price" className="shelf-compare-label">
                <span>Shelf price</span>
              </label>
              <div className="shelf-compare-price-wrap">
                <span aria-hidden="true" className="shelf-compare-currency-symbol">₱</span>
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
                    inlineKeyRef.current = null;
                    setUserPriceInput(event.target.value);
                    setErrorMessage('');
                  }}
                  className="shelf-compare-price-input"
                />
              </div>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.74rem' }}>
                Enter the price exactly as displayed on the shelf.
              </p>

              {/* Live Reactive Price Delta Indicator */}
              {selectedCandidate && userPriceInput && Number(userPriceInput) > 0 && unavailableProductKey !== `${selectedStore.id}-${selectedCandidate.id}` && (() => {
                const userPrice = Number(userPriceInput);
                // Catalog SRP gives instant feedback; the server's reference replaces it once the check completes.
                const serverResult = visibleInlineCheck?.status === 'done' ? visibleInlineCheck.result : undefined;
                const srp = Number(serverResult
                  ? serverResult.reference_price ?? serverResult.baseline_price ?? 0
                  : selectedCandidate.baseline_price || 0);
                const serverLabel = serverResult?.regulatory_label || serverResult?.comparison_label;
                const refLabel = serverLabel && serverLabel !== 'Current SRP' ? serverLabel : 'Current SRP baseline';
                const diff = Math.round((userPrice - srp) * 100) / 100;
                const absDiff = Math.abs(diff).toFixed(2);
                if (diff > 0) {
                  return (
                    <div className="shelf-compare-live-delta shelf-compare-live-delta--above">
                      <AlertTriangle size={15} color="#d97706" />
                      <span>₱{absDiff} above {refLabel}</span>
                    </div>
                  );
                } else if (diff < 0) {
                  return (
                    <div className="shelf-compare-live-delta shelf-compare-live-delta--below">
                      <Scale size={15} color="#059669" />
                      <span>₱{absDiff} below {refLabel} (within reference)</span>
                    </div>
                  );
                } else {
                  return (
                    <div className="shelf-compare-live-delta shelf-compare-live-delta--exact">
                      <Scale size={15} color="#2563eb" />
                      <span>Matches {refLabel} exactly</span>
                    </div>
                  );
                }
              })()}
            </div>

            {errorMessage && (
              <div role="alert" style={{ borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', padding: '10px 12px', fontSize: '0.8rem' }}>
                {errorMessage}
              </div>
            )}

            {visibleInlineCheck?.status === 'pending' && (
              <div role="status" style={{ color: '#64748b', fontSize: '0.8rem' }}>
                Checking price records…
              </div>
            )}
            {visibleInlineCheck?.status === 'error' && (
              <div role="status" style={{ color: '#b45309', fontSize: '0.8rem' }}>
                {visibleInlineCheck.message}
              </div>
            )}
            {visibleInlineCheck?.status === 'done' && visibleInlineCheck.result && (() => {
              const result = visibleInlineCheck.result;
              return (
                <>
                  <div className="shelf-result-history-strip">
                    <History size={16} />
                    {result.previous_verified_price ? (
                      <div>
                        Previous verified store price was{' '}
                        <strong style={{ color: '#0f172a' }}>
                          ₱{Number(result.previous_verified_price).toFixed(2)}
                        </strong>{' '}
                        on {result.previous_recorded_date}.
                      </div>
                    ) : (
                      <div>No verified historical store price is currently available.</div>
                    )}
                  </div>
                  <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: visibleInlineCheck.saved ? '#15803d' : '#b45309', fontSize: '0.78rem', fontWeight: 600 }}>
                    {visibleInlineCheck.saved ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>
                      {visibleInlineCheck.saved
                        ? 'Saved to comparison history'
                        : "Couldn't save to this device's history"}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#92400e', fontSize: '0.74rem', lineHeight: 1.35 }}>
                    This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.
                  </p>
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* SCREEN 2: TRUE FULL-SCREEN LIVE CAMERA PREVIEW */}
      {mode === 'ocr' && scannerState === 'CAMERA_LIVE' && (
        <div data-app-fullscreen-layer style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: '#000000', zIndex: 1000, overflow: 'hidden' }}>
          
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
      {scannerState === 'RESULT' && comparisonResult && (() => {
        const label = comparisonResult.regulatory_label || comparisonResult.comparison_label || 'Current SRP';
        const isAbove = comparisonResult.is_above_reference || comparisonResult.comparison_status === 'ABOVE_SRP';
        const isBelow = comparisonResult.comparison_status === 'BELOW_SRP';
        const diffVal = comparisonResult.peso_difference ?? comparisonResult.difference_pesos ?? 0;
        const numDiff = Math.abs(Number(diffVal));
        const verdictTitle = isAbove
          ? `₱${numDiff.toFixed(2)} above ${label}`
          : isBelow
          ? `₱${numDiff.toFixed(2)} below ${label}`
          : `Matches ${label} baseline`;

        return (
          <div className="shelf-compare-page">
            {/* TOP HEADER: BACK BUTTON + SCALE ICON + COMPARISON RESULT TITLE (IN SAME ROW) */}
            <div className="shelf-compare-header" style={{ alignItems: 'center' }}>
              <button
                type="button"
                className="shelf-compare-back-btn"
                onClick={mode === 'manual' ? handleCompareAnotherManualItem : handleRetake}
                aria-label="Compare another item"
              >
                <ArrowLeft size={20} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: isAbove ? '#fef3c7' : '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Scale size={20} color={isAbove ? '#d97706' : '#16a34a'} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h1 className="shelf-compare-title" style={{ fontSize: '1.25rem', margin: 0, lineHeight: 1.2 }}>
                    Comparison Result
                  </h1>
                  <p className="shelf-compare-subtitle" style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>
                    Official DTI Price Check
                  </p>
                </div>
              </div>
            </div>

            {/* Hero Result Card */}
            <div className="shelf-result-hero-card">
              {/* Verdict Banner */}
              <div className={`shelf-result-verdict-banner ${isAbove ? 'shelf-result-verdict-banner--above' : 'shelf-result-verdict-banner--within'}`}>
                <div className="shelf-result-verdict-icon">
                  {isAbove ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
                </div>
                <div className="shelf-result-verdict-text">
                  <div className="shelf-result-verdict-title">{verdictTitle}</div>
                  <div className="shelf-result-verdict-subtitle">
                    {isAbove ? 'Displayed price exceeds the official ceiling' : 'Complies with DTI suggested retail price'}
                  </div>
                </div>
              </div>

              {/* Price Grid */}
              <div className="shelf-result-price-grid">
                <div className="shelf-result-price-card shelf-result-price-card--shelf">
                  <div className="shelf-result-price-label">Shelf Price</div>
                  <div className="shelf-result-price-amount">
                    ₱{Number(comparisonResult.displayed_price).toFixed(2)}
                  </div>
                  {mode === 'ocr' && (
                    <div className="shelf-result-price-subtext">
                      <span style={{
                        background: (comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED') ? '#fef3c7' : '#dcfce7',
                        color: (comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED') ? '#b45309' : '#15803d',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 700
                      }}>
                        {comparisonResult.price_source === 'USER_ENTERED' || comparisonResult.price_source === 'USER_CORRECTED'
                          ? '✏️ Consumer-Entered Price'
                          : '✔ OCR-Detected Tag Price'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="shelf-result-price-card shelf-result-price-card--srp">
                  <div className="shelf-result-price-label">
                    {label}
                  </div>
                  <div className="shelf-result-price-amount">
                    ₱{Number(comparisonResult.reference_price ?? comparisonResult.baseline_price ?? 0).toFixed(2)}
                  </div>
                  {mode === 'ocr' && comparisonResult.product?.effective_date && (
                    <div className="shelf-result-price-subtext">
                      Effective {comparisonResult.product.effective_date.split('T')[0]}
                    </div>
                  )}
                </div>
              </div>

              {/* Historical Benchmark Strip */}
              <div className="shelf-result-history-strip">
                <History size={16} />
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

              {/* Item & Store Meta Details */}
              <div className="shelf-result-meta-strip">
                <div className="shelf-result-meta-row">
                  <span>Store</span>
                  <span>{comparisonResult.store.store_name}</span>
                </div>
                <div className="shelf-result-meta-row">
                  <span>Product</span>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <span>{resultProductName}</span>
                    {mode === 'ocr' && comparisonResult.product_source && (
                      <span style={{
                        background: (comparisonResult.product_source === 'MANUAL_SEARCH') ? '#f3e8ff' : '#dbeafe',
                        color: (comparisonResult.product_source === 'MANUAL_SEARCH') ? '#6b21a8' : '#1e40af',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700
                      }}>
                        {comparisonResult.product_source === 'MANUAL_SEARCH'
                          ? 'Manual Directory Selection'
                          : 'OCR-Detected'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shelf-result-meta-row">
                  <span>Package Size</span>
                  <span>{comparisonResult.package_size || comparisonResult.unit || comparisonResult.product?.unit || 'Standard'}</span>
                </div>
              </div>
            </div>

            {/* Result actions */}
            <div
              data-testid="scan-result-actions"
              style={{
                marginTop: '4px',
                padding: '4px 0 0',
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
                <div className="shelf-compare-actions-2col">
                  <button
                    type="button"
                    onClick={handleEditManualComparison}
                    className="shelf-compare-action-btn shelf-compare-action-btn--secondary"
                  >
                    Edit item or price
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab?.('prices')}
                    className="shelf-compare-action-btn shelf-compare-action-btn--primary"
                  >
                    Return to Prices
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
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
                      type="button"
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
                      type="button"
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

            {/* Mandatory Consumer Disclaimer Banner (at the very bottom) */}
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
                This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.
              </div>
            </div>
          </div>
        );
      })()}

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
