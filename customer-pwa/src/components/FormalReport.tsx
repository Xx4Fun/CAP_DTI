import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck, FileText, ChevronRight, Camera, Shield, UserCheck,
  CheckCircle2, RefreshCw, Eye, Copy, Check, Lock, ArrowLeft, Flashlight,
  SwitchCamera, AlertTriangle, ExternalLink, MapPin,
  Info, ChevronDown, Store, Scale, MessageSquare
} from 'lucide-react';
import { apiClient, type Establishment, type CaptureSessionResponse, type FormalReportResponse, defaultStoresList } from '../api/client';
import { createFormalReportPayload } from '../app/reportIntegrity';
import { consumeHandoff, type FlowHandoff } from '../app/handoffs';
import { haversineKm, formatDistance, type GeoPosition } from '../app/geolocation';
import { getRecentStoreIds, addRecentStore } from '../app/recentStores';
import { getFavoriteStoreIds, toggleFavoriteStore } from '../app/favoriteStores';
import { matchesPublicStoreSearch } from '../app/storeSearch';
import { StoreSelectionCard } from './StoreSelectionCard';
import { StoreSelectionView, type StoreDirectoryFilter } from './StoreSelectionView';
import { useBackLayer } from '../hooks/useBackLayer';
import { receiptCaptureSupport } from '../app/receiptCapture';
import { PRIVACY_NOTICE_SECTIONS, PRIVACY_NOTICE_TITLE } from '../app/privacyNotice';
import { GuidedReceiptCapture } from './GuidedReceiptCapture';
import { navigate } from '../app/routing';
import { saveReportTrackingToken } from '../app/reportTrackingStore';

interface FormalReportProps {
  setActiveTab?: (tab: string) => void;
  onTrackReport?: (reference: string) => void;
  onReportSubmitted?: (report: FormalReportResponse, storeName: string) => void;
  guidedCaptureEnabled?: boolean;
  vapidPublicKey?: string;
  location?: GeoPosition | null;
  locationError?: string;
}

export const FormalReport: React.FC<FormalReportProps> = ({
  setActiveTab,
  onTrackReport,
  onReportSubmitted,
  guidedCaptureEnabled = true,
  vapidPublicKey = '',
  location = null,
  locationError = '',
}) => {
  // Navigation & Wizard Stage
  const [currentView, setCurrentView] = useState<'dashboard' | 'select-store' | 'camera-viewport' | 'review-submit' | 'confirmation'>('dashboard');

  // Modals visibility
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState<boolean>(false);
  const [showFullNoticeModal, setShowFullNoticeModal] = useState<boolean>(false);
  const [showFullReceiptModal, setShowFullReceiptModal] = useState<boolean>(false);

  // Accordion State
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    'how-reporting-works': false,
    'privacy-security': false,
    'faq': false,
  });

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Form State
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean>(false);
  const [stores, setStores] = useState<Establishment[]>(defaultStoresList);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [openingStoreId, setOpeningStoreId] = useState<number | null>(null);
  const openingStoreRef = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChip, setActiveChip] = useState<StoreDirectoryFilter>('all');
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<number[]>(getFavoriteStoreIds);

  // Camera & Image State
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string>('');
  const [submissionUuid, setSubmissionUuid] = useState<string>('');
  const [flashOn, setFlashOn] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [captureSession, setCaptureSession] = useState<CaptureSessionResponse | null>(null);

  // Review & Submit State
  const [affirmationChecked, setAffirmationChecked] = useState<boolean>(false);
  const [ocrItems, setOcrItems] = useState<Array<{ commodity_name: string; receipt_price: string; baseline_price: number }>>([]);
  const [ocrMetadata, setOcrMetadata] = useState({
    transactionDate: 'Not detected',
    receiptNumber: 'Not detected',
    linesDetected: 0,
  });

  // Result & Submission State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [submissionResult, setSubmissionResult] = useState<FormalReportResponse | null>(null);
  const [trackingAccessStored, setTrackingAccessStored] = useState<boolean | null>(null);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handoffRef = useRef<FlowHandoff | null>(consumeHandoff());
  const reportGenerationRef = useRef(0);
  const cameraRequestRef = useRef(0);
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;

  const invalidateReportAsyncWork = () => {
    reportGenerationRef.current += 1;
    cameraRequestRef.current += 1;
    openingStoreRef.current = null;
    setOpeningStoreId(null);
    setSubmitting(false);
    setTrackingAccessStored(null);
  };

  const resetReportFlow = () => {
    invalidateReportAsyncWork();
    setCurrentView('dashboard');
    setShowPrivacyModal(false);
    setShowGuidelinesModal(false);
    setShowFullNoticeModal(false);
    setShowFullReceiptModal(false);
    setPrivacyAccepted(false);
    setSelectedStore(null);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setImageHash('');
    setCaptureSession(null);
    setAffirmationChecked(false);
    setOcrItems([]);
    setSubmissionResult(null);
    setError('');
    setCopiedRef(false);
    setCopiedToken(false);
  };

  const handleReportStepBack = () => {
    if (currentView === 'confirmation') {
      resetReportFlow();
    } else if (currentView === 'select-store') {
      invalidateReportAsyncWork();
      setCurrentView('dashboard');
    } else {
      invalidateReportAsyncWork();
      setCurrentView('select-store');
    }
  };

  useBackLayer('report-step', currentView !== 'dashboard', handleReportStepBack);
  useBackLayer('report-privacy-modal', showPrivacyModal, () => setShowPrivacyModal(false));
  useBackLayer('report-guidelines-modal', showGuidelinesModal, () => setShowGuidelinesModal(false));
  useBackLayer('report-full-notice-modal', showFullNoticeModal, () => setShowFullNoticeModal(false));
  useBackLayer('report-full-receipt-modal', showFullReceiptModal, () => setShowFullReceiptModal(false));

  useEffect(() => {
    setSubmissionUuid('sub-' + Math.random().toString(36).substring(2, 12) + '-' + Date.now());
    fetchStores();
    checkCapabilities();
    return () => {
      reportGenerationRef.current += 1;
      cameraRequestRef.current += 1;
      openingStoreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const hasOpenDialog = showPrivacyModal || showGuidelinesModal || showFullNoticeModal || showFullReceiptModal;
    if (!hasOpenDialog) return;

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    dialogs[dialogs.length - 1]?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showFullReceiptModal) setShowFullReceiptModal(false);
      else if (showFullNoticeModal) setShowFullNoticeModal(false);
      else if (showGuidelinesModal) setShowGuidelinesModal(false);
      else setShowPrivacyModal(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showPrivacyModal, showGuidelinesModal, showFullNoticeModal, showFullReceiptModal]);


  const checkCapabilities = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCamera(false);
    }
  };



  const fetchStores = async () => {
    try {
      const res = await apiClient.get('/public/establishments');
      if (res.data && res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setStores(res.data.data);
        const requestedStoreId = handoffRef.current?.kind === 'scan-to-report'
          ? handoffRef.current.storeId
          : undefined;
        setSelectedStore(res.data.data.find((store: Establishment) => store.id === requestedStoreId) || null);
      } else {
        setStores(defaultStoresList);
        const requestedStoreId = handoffRef.current?.kind === 'scan-to-report'
          ? handoffRef.current.storeId
          : undefined;
        setSelectedStore(defaultStoresList.find((store: Establishment) => store.id === requestedStoreId) || null);
      }
    } catch (err) {
      console.warn('API connection offline or remote. Using reference store directory:', err);
      setStores(defaultStoresList);
      const requestedStoreId = handoffRef.current?.kind === 'scan-to-report'
        ? handoffRef.current.storeId
        : undefined;
      setSelectedStore(defaultStoresList.find((store: Establishment) => store.id === requestedStoreId) || null);
    }
  };

  const startCaptureSession = async (store: Establishment) => {
    if (openingStoreRef.current !== null) return;
    const generation = reportGenerationRef.current;
    openingStoreRef.current = store.id;
    setOpeningStoreId(store.id);
    setSelectedStore(store);
    setError('');
    try {
      if (!guidedCaptureEnabled) {
        throw new Error('Secure receipt reporting is temporarily unavailable.');
      }
      const captureMode = receiptCaptureSupport({
        camera: Boolean(navigator.mediaDevices?.getUserMedia),
      });
      if (captureMode === 'unsupported') {
        throw new Error('This device does not provide a supported live camera for receipt reporting.');
      }
      const res = await apiClient.post('/public/capture-session', { store_id: store.id, capture_mode: captureMode });
      if (generation !== reportGenerationRef.current) return;
      if (res.data && res.data.success) {
        setCaptureSession(res.data.data);
      }
      setShowGuidelinesModal(true);
    } catch (err) {
      if (generation !== reportGenerationRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to start a secure receipt capture session.');
    } finally {
      if (generation === reportGenerationRef.current) {
        openingStoreRef.current = null;
        setOpeningStoreId(null);
      }
    }
  };

  const startCamera = async () => {
    const requestId = ++cameraRequestRef.current;
    const generation = reportGenerationRef.current;
    setShowGuidelinesModal(false);
    setCurrentView('camera-viewport');
    setError('');

    if (captureSession?.capture_mode === 'guided_photos_v1') {
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current || generation !== reportGenerationRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch {
      if (requestId !== cameraRequestRef.current || generation !== reportGenerationRef.current) return;
      setError('Camera access is unavailable or permission was denied. No receipt was captured.');
      setStream(null);
    }
  };

  useEffect(() => {
    if (currentView !== 'camera-viewport') {
      stopCamera();
    }
  }, [currentView]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const stopCamera = () => {
    cameraRequestRef.current += 1;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const toggleCameraFlip = async () => {
    const generation = reportGenerationRef.current;
    stopCamera();
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    await new Promise(resolve => setTimeout(resolve, 100));
    if (
      generation !== reportGenerationRef.current
      || currentViewRef.current !== 'camera-viewport'
    ) return;
    await startCamera();
  };

  const captureLiveFrame = async () => {
    if (canvasRef.current) {
      const generation = reportGenerationRef.current;
      const canvas = canvasRef.current;
      canvas.width = videoRef.current?.videoWidth || 640;
      canvas.height = videoRef.current?.videoHeight || 860;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        if (!videoRef.current || videoRef.current.videoWidth === 0) {
          setError('The live camera is not ready. No receipt was captured.');
          return;
        }
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (generation !== reportGenerationRef.current) return;
          if (blob) {
            setCapturedBlob(blob);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(blob));
            stopCamera();

            setOcrMetadata({
              transactionDate: 'Not detected',
              receiptNumber: 'Not detected',
              linesDetected: 0,
            });
            setOcrItems([]);

            setCurrentView('review-submit');
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const submitFormalReport = async () => {
    if (!affirmationChecked) return;
    const generation = reportGenerationRef.current;
    setSubmitting(true);
    setError('');

    try {
      const formData = createFormalReportPayload({
        submissionUuid,
        captureSessionId: captureSession?.capture_session_id,
        captureToken: captureSession?.capture_token || '',
        storeId: selectedStore?.id,
        imageHash,
        image: capturedBlob,
        extractedText: { items: ocrItems, metadata: ocrMetadata },
      });

      const res = await apiClient.post('/public/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (generation !== reportGenerationRef.current) return;

      if (res.data && res.data.success) {
        const submittedReport = res.data.data as FormalReportResponse;
        let accessStored = false;
        try {
          await saveReportTrackingToken(submittedReport.report_reference, submittedReport.secret_tracking_token);
          accessStored = true;
        } catch {
          accessStored = false;
        }
        if (generation !== reportGenerationRef.current) return;
        setTrackingAccessStored(accessStored);
        setSubmissionResult(submittedReport);
        onReportSubmitted?.(submittedReport, selectedStore?.store_name || 'Unspecified Store');
        setCurrentView('confirmation');
      } else {
        throw new Error('API return unsuccessful');
      }
    } catch (err: any) {
      if (generation !== reportGenerationRef.current) return;
      setSubmissionResult(null);
      setError(err.response?.data?.message || err.message || 'Submission failed. No report was filed. Please try again.');
    } finally {
      if (generation === reportGenerationRef.current) setSubmitting(false);
    }
  };

  const copyRefTimerRef = useRef<number | null>(null);
  const copyTokenTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyRefTimerRef.current) clearTimeout(copyRefTimerRef.current);
      if (copyTokenTimerRef.current) clearTimeout(copyTokenTimerRef.current);
    };
  }, []);

  const handleCopyRef = () => {
    if (submissionResult) {
      navigator.clipboard.writeText(submissionResult.report_reference);
      setCopiedRef(true);
      if (copyRefTimerRef.current) clearTimeout(copyRefTimerRef.current);
      copyRefTimerRef.current = window.setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleCopyToken = () => {
    if (submissionResult) {
      navigator.clipboard.writeText(submissionResult.secret_tracking_token);
      setCopiedToken(true);
      if (copyTokenTimerRef.current) clearTimeout(copyTokenTimerRef.current);
      copyTokenTimerRef.current = window.setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const filteredStores = React.useMemo(() => {
    let result = stores;
    const recentIds = getRecentStoreIds();
    if (activeChip === 'recent') {
      result = stores.filter(s => recentIds.includes(s.id));
    } else if (activeChip === 'favorite') {
      result = stores.filter(s => favoriteStoreIds.includes(s.id));
    }
    
    let filtered = result.filter((store) => matchesPublicStoreSearch(store, searchQuery));

    if (activeChip === 'all' && location) {
      filtered = [...filtered].sort((a, b) =>
        haversineKm(location.latitude, location.longitude, a.latitude, a.longitude) -
        haversineKm(location.latitude, location.longitude, b.latitude, b.longitude)
      );
    } else if (activeChip === 'recent') {
      filtered = [...filtered].sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
    }

    return filtered;
  }, [stores, activeChip, searchQuery, location, favoriteStoreIds]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {error && currentView !== 'camera-viewport' && (
        <div role="alert" className="banner-warning" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. DASHBOARD VIEW (Home UI & rep.png Harmonization) */}
      {/* ========================================================================= */}
      {currentView === 'dashboard' && (
        <div className="report-hub-container">
          {/* 2 Full-Width Horizontal Action Rows (Stacked Vertically) */}
          <div className="report-hero-cards">
            {/* Row 1: Submit a new report (Warm Orange / Amber Motif) */}
            <div
              className="report-hero-card report-hero-card--submit"
              role="button"
              tabIndex={0}
              aria-label="Submit a new report"
              onClick={() => setShowPrivacyModal(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setShowPrivacyModal(true);
                }
              }}
            >
              <svg className="report-card-dots" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="4" cy="4" r="1.5" fill="currentColor" />
                <circle cx="13" cy="4" r="1.5" fill="currentColor" />
                <circle cx="22" cy="4" r="1.5" fill="currentColor" />
                <circle cx="31" cy="4" r="1.5" fill="currentColor" />
                <circle cx="4" cy="13" r="1.5" fill="currentColor" />
                <circle cx="13" cy="13" r="1.5" fill="currentColor" />
                <circle cx="22" cy="13" r="1.5" fill="currentColor" />
                <circle cx="31" cy="13" r="1.5" fill="currentColor" />
                <circle cx="4" cy="22" r="1.5" fill="currentColor" />
                <circle cx="13" cy="22" r="1.5" fill="currentColor" />
                <circle cx="22" cy="22" r="1.5" fill="currentColor" />
                <circle cx="31" cy="22" r="1.5" fill="currentColor" />
                <circle cx="4" cy="31" r="1.5" fill="currentColor" />
                <circle cx="13" cy="31" r="1.5" fill="currentColor" />
                <circle cx="22" cy="31" r="1.5" fill="currentColor" />
                <circle cx="31" cy="31" r="1.5" fill="currentColor" />
              </svg>

              <div className="report-hero-card-left">
                <div className="report-hero-title">Submit a new report</div>
                <div className="report-hero-desc">
                  Capture a checkout receipt for DTI evaluation.
                </div>
                <span className="report-card-cta report-card-cta--submit">
                  Start report <ChevronRight size={16} className="report-card-cta-icon" />
                </span>
              </div>

              {/* Right Media / Image Slot */}
              <div className="report-hero-media-slot" aria-hidden="true">
                <img
                  src="/branding/report-submit-artwork.png"
                  alt=""
                  className="report-hero-artwork-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const placeholder = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (placeholder) placeholder.style.display = 'flex';
                  }}
                />
                <div className="report-vector-receipt-placeholder" style={{ display: 'none' }}>
                  <div>
                    <div className="report-vector-receipt-header">Super Metro</div>
                    <div className="report-vector-receipt-subheader">San Jose Antique</div>
                    <div className="report-vector-receipt-lines">
                      <div className="report-vector-receipt-line" style={{ width: '85%' }} />
                      <div className="report-vector-receipt-line" style={{ width: '60%' }} />
                      <div className="report-vector-receipt-line" style={{ width: '90%' }} />
                      <div className="report-vector-receipt-line" style={{ width: '70%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="report-vector-receipt-total">
                      <span>TOTAL</span>
                      <span>₱345.50</span>
                    </div>
                    <div className="report-vector-receipt-barcode">
                      <div className="report-vector-barcode-bar" style={{ width: '2px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '1px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '3px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '1.5px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '2px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '1px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '2.5px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '1px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '3px' }} />
                      <div className="report-vector-barcode-bar" style={{ width: '2px' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Track existing report (Electric Blue Motif) */}
            <div
              className="report-hero-card report-hero-card--track"
              role="button"
              tabIndex={0}
              aria-label="Track an existing report"
              onClick={() => {
                if (setActiveTab) setActiveTab('track');
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && setActiveTab) {
                  event.preventDefault();
                  setActiveTab('track');
                }
              }}
            >
              <svg className="report-card-dots" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="4" cy="4" r="1.5" fill="currentColor" />
                <circle cx="13" cy="4" r="1.5" fill="currentColor" />
                <circle cx="22" cy="4" r="1.5" fill="currentColor" />
                <circle cx="31" cy="4" r="1.5" fill="currentColor" />
                <circle cx="4" cy="13" r="1.5" fill="currentColor" />
                <circle cx="13" cy="13" r="1.5" fill="currentColor" />
                <circle cx="22" cy="13" r="1.5" fill="currentColor" />
                <circle cx="31" cy="13" r="1.5" fill="currentColor" />
                <circle cx="4" cy="22" r="1.5" fill="currentColor" />
                <circle cx="13" cy="22" r="1.5" fill="currentColor" />
                <circle cx="22" cy="22" r="1.5" fill="currentColor" />
                <circle cx="31" cy="22" r="1.5" fill="currentColor" />
                <circle cx="4" cy="31" r="1.5" fill="currentColor" />
                <circle cx="13" cy="31" r="1.5" fill="currentColor" />
                <circle cx="22" cy="31" r="1.5" fill="currentColor" />
                <circle cx="31" cy="31" r="1.5" fill="currentColor" />
              </svg>

              <div className="report-hero-card-left">
                <div className="report-hero-title">Track an existing report</div>
                <div className="report-hero-desc">
                  View the latest public status of a submitted report.
                </div>
                <span className="report-card-cta report-card-cta--track">
                  Track status <ChevronRight size={16} className="report-card-cta-icon" />
                </span>
              </div>

              {/* Right Media / Image Slot */}
              <div className="report-hero-media-slot" aria-hidden="true">
                <img
                  src="/branding/report-track-artwork.png"
                  alt=""
                  className="report-hero-artwork-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    const placeholder = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (placeholder) placeholder.style.display = 'flex';
                  }}
                />
                <div className="report-vector-track-placeholder" style={{ display: 'none' }}>
                  <div className="report-vector-track-badge">
                    <Shield size={20} />
                  </div>
                  <div className="report-vector-track-info">
                    <div style={{ fontSize: '0.60rem', fontWeight: 800, color: '#0369a1', letterSpacing: '0.04em' }}>DTI SECURE</div>
                    <span className="report-vector-track-pill">
                      <Shield size={10} />
                      VERIFIED
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Retained Info Section: 3 Collapsible Accordions (Lucide Icons) */}
          <div className="report-accordion-group">
            <div className="report-accordion-header-label">Information & Guidelines</div>

            {/* Accordion 1: How reporting works (Lucide Info) */}
            <div className="report-accordion-item">
              <div
                className="report-accordion-trigger"
                role="button"
                tabIndex={0}
                aria-expanded={openAccordions['how-reporting-works']}
                aria-label="How reporting works"
                onClick={() => toggleAccordion('how-reporting-works')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion('how-reporting-works');
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="icon-wrapper-amber" style={{ width: '36px', height: '36px' }}>
                    <Info size={18} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    How reporting works
                  </div>
                </div>
                <div>
                  <ChevronDown
                    size={18}
                    className={`report-accordion-chevron ${openAccordions['how-reporting-works'] ? 'report-accordion-chevron--open' : ''}`}
                  />
                </div>
              </div>
              {openAccordions['how-reporting-works'] && (
                <div className="report-accordion-body">
                  <div className="report-steps-container">
                    <div className="report-step-item">
                      <div className="report-step-icon-badge">
                        <Store size={18} />
                      </div>
                      <div className="report-step-content">
                        <div className="report-step-title">1. Select Establishment</div>
                        <div className="report-step-desc">Choose a verified store in San Jose de Buenavista, Antique.</div>
                      </div>
                    </div>
                    <div className="report-step-item">
                      <div className="report-step-icon-badge">
                        <Camera size={18} />
                      </div>
                      <div className="report-step-content">
                        <div className="report-step-title">2. Live Receipt Capture</div>
                        <div className="report-step-desc">Take one clear full-receipt photo, or overlapping section photos when the receipt is long.</div>
                      </div>
                    </div>
                    <div className="report-step-item">
                      <div className="report-step-icon-badge">
                        <Scale size={18} />
                      </div>
                      <div className="report-step-content">
                        <div className="report-step-title">3. DTI Evaluation</div>
                        <div className="report-step-desc">Evaluators cross-examine extracted prices against active R.A. 7581 SRP bulletins.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Privacy & Evidence Security (Lucide Shield) */}
            <div className="report-accordion-item">
              <div
                className="report-accordion-trigger"
                role="button"
                tabIndex={0}
                aria-expanded={openAccordions['privacy-security']}
                aria-label="Privacy & Evidence Security"
                onClick={() => toggleAccordion('privacy-security')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion('privacy-security');
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="icon-wrapper-blue" style={{ width: '36px', height: '36px' }}>
                    <Shield size={18} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    Privacy & Evidence Security
                  </div>
                </div>
                <div>
                  <ChevronDown
                    size={18}
                    className={`report-accordion-chevron ${openAccordions['privacy-security'] ? 'report-accordion-chevron--open' : ''}`}
                  />
                </div>
              </div>
              {openAccordions['privacy-security'] && (
                <div className="report-accordion-body">
                  <div className="report-security-points">
                    <div className="report-security-point">
                      <div className="report-security-point-icon">
                        <Camera size={18} />
                      </div>
                      <div>
                        <strong>Live Capture Only:</strong> Camera access is strictly active during receipt capture. Gallery uploads are disabled to maintain tamper-evident legal integrity.
                      </div>
                    </div>
                    <div className="report-security-point">
                      <div className="report-security-point-icon">
                        <Lock size={18} />
                      </div>
                      <div>
                        <strong>SHA-256 Vaulting:</strong> All submitted receipts are cryptographically hashed and vaulted in restricted DTI evidence storage.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 3: Frequently Asked Questions (Lucide MessageSquare) */}
            <div className="report-accordion-item">
              <div
                className="report-accordion-trigger"
                role="button"
                tabIndex={0}
                aria-expanded={openAccordions['faq']}
                aria-label="Frequently Asked Questions"
                onClick={() => toggleAccordion('faq')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion('faq');
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="icon-wrapper-green" style={{ width: '36px', height: '36px' }}>
                    <MessageSquare size={18} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    Frequently Asked Questions
                  </div>
                </div>
                <div>
                  <ChevronDown
                    size={18}
                    className={`report-accordion-chevron ${openAccordions['faq'] ? 'report-accordion-chevron--open' : ''}`}
                  />
                </div>
              </div>
              {openAccordions['faq'] && (
                <div className="report-accordion-body">
                  <div className="report-faq-list">
                    <div className="report-faq-item">
                      <div className="report-faq-q">Why are gallery uploads disabled?</div>
                      <div className="report-faq-a">To keep each submitted original tied to the live capture session and its server-recorded fingerprint.</div>
                    </div>
                    <div className="report-faq-item">
                      <div className="report-faq-q">Does reporting auto-issue a violation?</div>
                      <div className="report-faq-a">No. All submissions require human verification by authorized DTI officers before issuing legal notices (LOI or SCO).</div>
                    </div>
                    <div className="report-faq-item">
                      <div className="report-faq-q">How long does DTI evaluation take?</div>
                      <div className="report-faq-a">Reports are typically assessed within 24 to 48 hours during official business days.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PRIVACY TERMS MODAL (cus_ui/Reports/2.png) */}
      {/* ========================================================================= */}
      {showPrivacyModal && (
        <div className="modal-backdrop">
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="privacy-dialog-title" tabIndex={-1}>
            <h2 id="privacy-dialog-title" style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              Before you submit a receipt
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Your receipt will be used to create a possible price-concern report for DTI evaluation.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              {/* Point 1: Camera use */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div className="icon-wrapper-blue" style={{ width: '36px', height: '36px' }}>
                  <Camera size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Camera use</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Your camera is used only during receipt capture.
                  </div>
                </div>
              </div>

              {/* Point 2: Privacy protection */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div className="icon-wrapper-green" style={{ width: '36px', height: '36px' }}>
                  <Shield size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Privacy protection</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    An automated service (Google Gemini) may read the printed items for DTI. Otherwise only DTI staff see your photos.
                  </div>
                </div>
              </div>

              {/* Point 3: Human evaluation */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div className="icon-wrapper-amber" style={{ width: '36px', height: '36px' }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Human evaluation</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Reports do not automatically confirm a violation.
                  </div>
                </div>
              </div>
            </div>

            {/* Link to Full Privacy Notice */}
            <button
              onClick={() => setShowFullNoticeModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '18px',
                padding: 0
              }}
            >
              Read full privacy notice <ExternalLink size={14} />
            </button>

            {!hasCamera && (
              <div className="banner-warning" style={{ marginBottom: '14px', background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
                Secure live receipt capture requires camera permissions and an active HTTPS connection.
              </div>
            )}

            {/* Checkbox */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '20px', color: 'var(--text-main)' }}>
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--primary)' }}
              />
              <span>I have read and agree to the privacy notice.</span>
            </label>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowPrivacyModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!privacyAccepted || !hasCamera}
                onClick={() => {
                  setShowPrivacyModal(false);
                  setCurrentView('select-store');
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Privacy Notice Sub-Modal */}
      {showFullNoticeModal && (
        <div className="modal-backdrop" style={{ zIndex: 300 }}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-label="Full privacy notice" tabIndex={-1} style={{ maxHeight: '80vh' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '10px' }}>{PRIVACY_NOTICE_TITLE}</h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: 1.5 }}>
              {PRIVACY_NOTICE_SECTIONS.map((section, index) => (
                <p key={section.heading}>{index + 1}. <strong>{section.heading}:</strong> {section.body}</p>
              ))}
            </div>
            <button className="btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowFullNoticeModal(false)}>
              Close Notice
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SELECT STORE VIEW */}
      {/* ========================================================================= */}
      {currentView === 'select-store' && (
        <StoreSelectionView
          subtitle="Where did you make this purchase?"
          backAction={{ label: 'Back to reports', onActivate: handleReportStepBack }}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeChip}
          onFilterChange={setActiveChip}
          resultCount={filteredStores.length}
          geoError={locationError}
          emptyTitle={activeChip === 'recent'
            ? 'No recent stores'
            : activeChip === 'favorite'
              ? 'No favorite stores'
              : 'No matching stores found'}
          emptyDescription={activeChip === 'recent'
            ? 'Stores you report will appear here for faster access.'
            : activeChip === 'favorite'
              ? 'Tap the star on a store to keep it close at hand.'
              : 'Try another store name or view the full directory.'}
          onReset={(searchQuery || activeChip !== 'all') ? () => {
            setSearchQuery('');
            setActiveChip('all');
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
              busy={openingStoreId === store.id}
              disabled={openingStoreId !== null}
              onActivate={() => {
                addRecentStore(store.id);
                void startCaptureSession(store);
              }}
            />
          ))}
        </StoreSelectionView>
      )}

      {/* ========================================================================= */}
      {/* 4. CAPTURE GUIDELINES MODAL (cus_ui/Reports/4.png) */}
      {/* ========================================================================= */}
      {showGuidelinesModal && (
        <div className="modal-backdrop">
          <div className="modal-content" role="dialog" aria-modal="true" aria-label="Receipt capture guidelines" tabIndex={-1}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Capture your receipt
              </h2>
              <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                {selectedStore?.store_name || 'Store Selected'}
              </span>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Follow these guidelines to ensure your receipt photo can be OCR-processed and validated by DTI evaluators:
            </p>

            <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px', paddingLeft: 0, listStyle: 'none' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={18} color="var(--accent-green)" /> Place the receipt on a flat surface.
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={18} color="var(--accent-green)" /> Capture the whole receipt if it fits. For a long receipt, take sections from top to bottom with visible overlap.
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={18} color="var(--accent-green)" /> Make the store name and transaction date visible.
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={18} color="var(--accent-green)" /> Avoid glare, shadows, and blur.
              </li>
            </ul>

            {/* SECURITY WARNING BANNER */}
            <div className="banner-security" style={{ marginBottom: '20px' }}>
              <Lock size={18} style={{ flexShrink: 0 }} />
              <div>
                ℹ️ Gallery uploads are unavailable for formal receipt reporting.
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowGuidelinesModal(false)}
              >
                Back
              </button>
              <button
                className="btn-primary"
                onClick={startCamera}
              >
                <Camera size={18} /> Open camera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. STEP 2 OF 3: LIVE RECEIPT CAMERA VIEWPORT (Fixed Zero-Scroll Viewport) */}
      {/* ========================================================================= */}
      {currentView === 'camera-viewport' && guidedCaptureEnabled && captureSession?.capture_mode === 'guided_photos_v1' && (
        <GuidedReceiptCapture
          session={captureSession}
          storeName={selectedStore?.store_name || 'Selected store'}
          submissionUuid={submissionUuid}
          vapidPublicKey={vapidPublicKey}
          onCancel={handleReportStepBack}
          onDraftCreated={(report) => {
            setSubmissionResult(report);
            onReportSubmitted?.(report, selectedStore?.store_name || 'Unspecified Store');
          }}
          onCheckStatus={(reference) => navigate({ name: 'receipt-processing', reference })}
          onGoHome={() => setActiveTab?.('home')}
        />
      )}

      {currentView === 'camera-viewport' && (!guidedCaptureEnabled || !captureSession || captureSession.capture_mode !== 'guided_photos_v1') && (
        <div data-app-fullscreen-layer style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: '#000000', zIndex: 1000, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          
          {/* Top Control Bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={handleReportStepBack}
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Back to store selection"
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ background: 'rgba(15,23,42,0.6)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} style={{ color: '#60a5fa' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedStore?.store_name || 'Store Selected'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={async () => {
                  if (stream) {
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                      const capabilities = videoTrack.getCapabilities() as any;
                      if (capabilities.torch) {
                        try {
                          await videoTrack.applyConstraints({
                            advanced: [{ torch: !flashOn }] as any
                          });
                          setFlashOn(!flashOn);
                        } catch (e) {
                          console.warn('Torch constraint failed', e);
                        }
                      }
                    }
                  }
                }}
                style={{ background: flashOn ? '#f59e0b' : 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Toggle Flash"
                title="Toggle Flash"
              >
                <Flashlight size={18} />
              </button>
              <button
                onClick={toggleCameraFlip}
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Flip Camera"
                title="Flip Camera"
              >
                <SwitchCamera size={18} />
              </button>
            </div>
          </div>

          {/* Full Viewport Camera Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Receipt Bounding Box & Floating Status Guide */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 16px 105px 16px', pointerEvents: 'none' }}>
            
            {/* Status Pills Container ABOVE Capture Frame */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '10px' }}>
              <span style={{ background: 'rgba(15,23,42,0.85)', color: '#fbbf24', fontSize: '0.75rem', fontWeight: 700, padding: '5px 14px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.4)', backdropFilter: 'blur(6px)', letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                Targeting Receipt · Include Store & Total
              </span>
              <span style={{ background: 'rgba(15,23,42,0.7)', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', borderRadius: '14px', backdropFilter: 'blur(4px)' }}>
                {stream ? '🟢 Camera Feed Active' : '⏳ Initializing...'}
              </span>
            </div>

            {/* Elongated Tall Rectangular Bounding Box for Receipts */}
            <div style={{ width: '88%', maxWidth: '360px', height: '82%', maxHeight: '560px', border: '2px dashed #f59e0b', borderRadius: '16px', boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px' }}>
              {/* Top Corners */}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ borderTop: '4px solid #f59e0b', borderLeft: '4px solid #f59e0b', width: '32px', height: '32px', borderRadius: '6px 0 0 0' }} />
                <div style={{ borderTop: '4px solid #f59e0b', borderRight: '4px solid #f59e0b', width: '32px', height: '32px', borderRadius: '0 6px 0 0' }} />
              </div>

              {/* Center Receipt Watermark Guide */}
              <div style={{ textAlign: 'center', opacity: 0.35, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <FileText size={36} style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: '0.7rem', color: '#ffffff', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Position Full Length Receipt
                </span>
              </div>

              {/* Bottom Corners */}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ borderBottom: '4px solid #f59e0b', borderLeft: '4px solid #f59e0b', width: '32px', height: '32px', borderRadius: '0 0 0 6px' }} />
                <div style={{ borderBottom: '4px solid #f59e0b', borderRight: '4px solid #f59e0b', width: '32px', height: '32px', borderRadius: '0 0 6px 0' }} />
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div style={{ position: 'absolute', top: '70px', left: '16px', right: '16px', zIndex: 30, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              {error}
            </div>
          )}

          {/* Bottom Shutter Control Bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '16px 20px max(24px, env(safe-area-inset-bottom)) 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: 'linear-gradient(0deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0) 100%)' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500, letterSpacing: '0.01em' }}>
              🔒 DTI Hardware Camera Lock · Hold Steady to Capture
            </div>

            <button
              onClick={captureLiveFrame}
              aria-label="Capture receipt photo"
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '4px solid var(--primary)',
                boxShadow: '0 0 20px rgba(37,99,235,0.5)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.15s ease'
              }}
              title="Shutter Button"
            >
              <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'var(--primary)' }} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. STEP 3 OF 3: REVIEW AND SUBMIT RECEIPT (cus_ui/Reports/6.png) */}
      {/* ========================================================================= */}
      {currentView === 'review-submit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header step indicator */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Step 3 of 3 · Review & Submit
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
              Review and submit your receipt
            </h1>
          </div>

          {/* Captured Receipt Box */}
          <div className="glass-panel" style={{ margin: 0, padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Captured Receipt Image</span>
              <span className="badge badge-green">✔ Protected original receipt</span>
            </div>

            <div style={{ position: 'relative', width: '100%', background: '#0f172a', borderRadius: '12px', overflow: 'hidden', textAlign: 'center', maxHeight: '280px' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="Captured Receipt Preview" style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '40px', color: '#94a3b8', fontSize: '0.85rem' }}>Receipt Image Loaded</div>
              )}
            </div>

            {/* Receipt Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
              <button className="btn-secondary" style={{ padding: '8px', fontSize: '0.78rem' }} onClick={() => setShowFullReceiptModal(true)}>
                <Eye size={14} /> Full receipt
              </button>
              <button className="btn-secondary" style={{ padding: '8px', fontSize: '0.78rem' }} onClick={startCamera}>
                <RefreshCw size={14} /> Retake
              </button>
            </div>
          </div>

          {/* Capture Information Table */}
          <div className="glass-panel" style={{ margin: 0, padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '12px' }}>
              Capture Metadata
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>SELECTED STORE</span>
                <strong style={{ color: 'var(--text-main)' }}>{selectedStore?.store_name || 'Selected store unavailable'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>CAPTURED DATE/TIME</span>
                <strong style={{ color: 'var(--text-main)' }}>{new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>CAPTURE METHOD</span>
                <strong style={{ color: 'var(--primary)' }}>Live camera 📷</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>RECEIPT STATUS</span>
                <strong style={{ color: 'var(--primary)' }}>Captured for review</strong>
              </div>
            </div>
          </div>

          {/* Automatically Detected OCR Box */}
          <div className="glass-panel" style={{ margin: 0, padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Automatically Detected Fields</span>
              <span className="badge badge-amber">Subject to DTI verification</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              <div>Store Name: <strong style={{ color: 'var(--text-main)' }}>{selectedStore?.store_name}</strong></div>
              <div>Transaction Date: <strong style={{ color: 'var(--text-main)' }}>{ocrMetadata.transactionDate}</strong></div>
              <div>Receipt No: <strong style={{ color: 'var(--text-main)' }}>{ocrMetadata.receiptNumber}</strong></div>
              <div>Lines Detected: <strong style={{ color: 'var(--text-main)' }}>{ocrMetadata.linesDetected} lines</strong></div>
            </div>

            {/* Highlighted Detected Line Item */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>
                EXTRACTED EVIDENCE (READ-ONLY)
              </div>
              {ocrItems.length > 0 ? (
                ocrItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                      {item.commodity_name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Receipt Price: <strong>₱{item.receipt_price}</strong> · SRP Baseline: <strong>₱{item.baseline_price.toFixed(2)}</strong>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
                  <strong>Receipt captured successfully.</strong> DTI evaluators will review the original image directly. No manual data entry is required.
                </div>
              )}
            </div>
          </div>

          {/* Explanation Box */}
          <div className="banner-info">
            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>What Happens After Submission:</strong> Your receipt is vaulted securely and routed to the DTI Antique evaluation queue. Evaluators verify product details against active price bulletins.
            </div>
          </div>

          {/* Affirmation Checkbox */}
          <label htmlFor="affirmation-checkbox" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-main)' }}>
            <input
              id="affirmation-checkbox"
              type="checkbox"
              checked={affirmationChecked}
              onChange={(e) => setAffirmationChecked(e.target.checked)}
              style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--primary)' }}
            />
            <span>I confirm that this is the receipt I intend to submit and that the captured image clearly shows the relevant item details.</span>
          </label>

          {/* MANDATORY LEGAL WARNING BANNER */}
          <div className="banner-warning">
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              ⚠️ This submission does not automatically confirm a violation. The receipt and detected information require DTI evaluation.
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              className="btn-primary"
              disabled={!affirmationChecked || submitting}
              onClick={submitFormalReport}
            >
              {submitting ? 'Submitting to DTI Vault...' : 'Submit full receipt for DTI review'}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={startCamera}>
                Retake receipt
              </button>
              <button className="btn-secondary" onClick={handleReportStepBack}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Receipt Image Lightbox Modal */}
      {showFullReceiptModal && (
        <div className="modal-backdrop" onClick={() => setShowFullReceiptModal(false)}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-label="Full protected receipt" tabIndex={-1} style={{ maxWidth: '600px', padding: '16px', background: '#0f172a', color: '#fff' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Full Protected Receipt View</h3>
              <button onClick={() => setShowFullReceiptModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }} aria-label="Close modal">✕</button>
            </div>
            {previewUrl && <img src={previewUrl} alt="Full Receipt" style={{ width: '100%', borderRadius: '8px' }} />}
            <button className="btn-secondary" style={{ marginTop: '12px' }} onClick={() => setShowFullReceiptModal(false)}>
              Close Full View
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. CONFIRMATION & TRACKING VIEW (cus_ui/Reports/7.png) */}
      {/* ========================================================================= */}
      {currentView === 'confirmation' && submissionResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Main Success Container */}
          <div className="glass-panel" style={{ textAlign: 'center', padding: '24px 16px', margin: 0 }}>
            {/* Big Green Checkmark Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#d1fae5',
              color: 'var(--accent-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px'
            }}>
              <CheckCircle2 size={36} />
            </div>

            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>
              Your report has been received
            </h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', maxWidth: '440px', margin: '0 auto 20px' }}>
              Authorized DTI personnel will review the protected receipt and verify the applicable product and price information.
            </p>

            {/* Reference Box */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  REPORT REFERENCE CODE
                </span>
                <span className="badge badge-green">Submitted for initial evaluation</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {submissionResult.report_reference}
                </span>
                <button
                  onClick={handleCopyRef}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                  title="Copy Reference Code"
                >
                  {copiedRef ? <Check size={16} color="var(--accent-green)" /> : <Copy size={16} />}
                </button>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Submitted timestamp: <strong>{new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
              </div>
            </div>

            {/* What Happens Next Stepper */}
            <div style={{ textAlign: 'left', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '12px' }}>
                What Happens Next
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                <div>1. DTI reviews the submitted information.</div>
                <div>2. Additional validation may be requested.</div>
                <div>3. Open My Reports on this device to see progress.</div>
              </div>
            </div>

            {trackingAccessStored ? (
              <div className="banner-info" style={{ marginBottom: '20px', textAlign: 'left' }}>
                <ShieldCheck size={18} style={{ flexShrink: 0 }} />
                <div><strong>Saved to this device.</strong> You can open this report from My Reports without entering codes.</div>
              </div>
            ) : (
            <div style={{
              background: '#fffbeb',
              border: '1px dashed #f59e0b',
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Lock size={16} /> Automatic report access could not be saved.
              </div>
              <p style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '10px' }}>
                Keep this one-time recovery credential before leaving. You can enter it later from My Reports.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code style={{ flex: 1, background: '#ffffff', border: '1px solid #fde68a', padding: '8px 10px', borderRadius: '8px', fontSize: '0.82rem', color: '#78350f', fontWeight: 700, wordBreak: 'break-all' }}>
                  {submissionResult.secret_tracking_token}
                </code>
                <button
                  className="btn-secondary"
                  style={{ width: 'auto', padding: '8px 12px', background: '#ffffff' }}
                  onClick={handleCopyToken}
                >
                  {copiedToken ? <Check size={16} color="var(--accent-green)" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  if (onTrackReport) {
                    onTrackReport(submissionResult.report_reference);
                  } else if (setActiveTab) {
                    setActiveTab('track');
                  }
                }}
              >
                View report
              </button>
              <button
                className="btn-secondary"
                onClick={resetReportFlow}
              >
                Return to Reports
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FormalReport;
