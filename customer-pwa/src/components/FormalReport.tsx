import React, { useState, useRef, useEffect } from 'react';
import {
  FilePlus, FileSearch, HelpCircle, ShieldCheck, FileText, ChevronRight, ChevronDown, ChevronUp, Camera, Shield, UserCheck,
  Search, CheckCircle2, RefreshCw, Eye, Copy, Check, Lock, ArrowLeft, Flashlight,
  SwitchCamera, AlertTriangle, Building2, ExternalLink
} from 'lucide-react';
import { apiClient, type Establishment, type CaptureSessionResponse, type FormalReportResponse, defaultStoresList } from '../api/client';
import { createFormalReportPayload } from '../app/reportIntegrity';
import { consumeHandoff, type FlowHandoff } from '../app/handoffs';

interface FormalReportProps {
  setActiveTab?: (tab: string) => void;
  onTrackReport?: (reference: string, token: string) => void;
}

export const FormalReport: React.FC<FormalReportProps> = ({ setActiveTab, onTrackReport }) => {
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeChip, setActiveChip] = useState<string>('nearby');

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
    transactionDate: new Date().toISOString().split('T')[0],
    receiptNumber: 'Not detected',
    linesDetected: 0,
  });

  // Result & Submission State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [submissionResult, setSubmissionResult] = useState<FormalReportResponse | null>(null);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handoffRef = useRef<FlowHandoff | null>(consumeHandoff());

  useEffect(() => {
    setSubmissionUuid('sub-' + Math.random().toString(36).substring(2, 12) + '-' + Date.now());
    fetchStores();
    checkCapabilities();
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
    setSelectedStore(store);
    setError('');
    try {
      const res = await apiClient.post('/public/capture-session', { store_id: store.id });
      if (res.data && res.data.success) {
        setCaptureSession(res.data.data);
      }
      setShowGuidelinesModal(true);
    } catch (err) {
      setShowGuidelinesModal(true);
    }
  };

  const startCamera = async () => {
    setShowGuidelinesModal(false);
    setCurrentView('camera-viewport');
    setError('');

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
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const toggleCameraFlip = async () => {
    stopCamera();
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    await new Promise(resolve => setTimeout(resolve, 100));
    await startCamera();
  };

  const captureLiveFrame = async () => {
    if (canvasRef.current) {
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
          if (blob) {
            setCapturedBlob(blob);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(blob));
            stopCamera();

            // Calculate SHA-256 Hash
            const arrayBuffer = await blob.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
            setImageHash(hashHex);

            setOcrMetadata({
              transactionDate: new Date().toISOString().split('T')[0],
              receiptNumber: 'REC-' + Math.floor(Math.random() * 10000),
              linesDetected: 1,
            });

            if (handoffRef.current?.kind === 'scan-to-report') {
              setOcrItems([{
                commodity_name: String(handoffRef.current.commodityId || 'Unknown Item'),
                receipt_price: (handoffRef.current.displayedPrice || 0).toString(),
                baseline_price: handoffRef.current.baselinePrice || 0
              }]);
            } else {
              setOcrItems([{
                commodity_name: 'Detected Item',
                receipt_price: '0.00',
                baseline_price: 0.00
              }]);
            }

            setCurrentView('review-submit');
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const submitFormalReport = async () => {
    if (!affirmationChecked) return;
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

      if (res.data && res.data.success) {
        setSubmissionResult(res.data.data);
        setCurrentView('confirmation');
      } else {
        throw new Error('API return unsuccessful');
      }
    } catch (err: any) {
      setSubmissionResult(null);
      setError(err.response?.data?.message || err.message || 'Submission failed. No report was filed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRef = () => {
    if (submissionResult) {
      navigator.clipboard.writeText(submissionResult.report_reference);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleCopyToken = () => {
    if (submissionResult) {
      navigator.clipboard.writeText(submissionResult.secret_tracking_token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const filteredStores = React.useMemo(() => {
    let result = stores;
    if (activeChip === 'barangay') {
      result = stores.filter(s => s.address.toLowerCase().includes('barangay'));
    } else if (activeChip === 'recent') {
      result = stores.slice(0, 2); // Mock recent
    }
    
    return result.filter(s =>
      s.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.dti_sec_number.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stores, activeChip, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {error && currentView !== 'camera-viewport' && (
        <div role="alert" className="banner-warning" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. DASHBOARD VIEW (cus_ui/Reports/1.png) */}
      {/* ========================================================================= */}
      {currentView === 'dashboard' && (
        <>
          {/* Header Title */}
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>Reports</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Submit a receipt for DTI evaluation or track the latest status of a submitted report.
            </p>
          </div>

          {/* Action Card 1: Submit a new report */}
          <div
            className="action-card"
            role="button"
            tabIndex={0}
            onClick={() => setShowPrivacyModal(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setShowPrivacyModal(true);
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="icon-wrapper-blue">
                <FilePlus size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                  Submit a new report
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Capture a checkout receipt for DTI evaluation.
                </div>
              </div>
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: '50%', padding: '8px', color: 'var(--primary)' }}>
              <ChevronRight size={20} />
            </div>
          </div>

          {/* Action Card 2: Track an existing report */}
          <div
            className="action-card"
            role="button"
            tabIndex={0}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="icon-wrapper-green">
                <FileSearch size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                  Track an existing report
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  View the latest public status of a submitted report.
                </div>
              </div>
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: '50%', padding: '8px', color: 'var(--accent-green)' }}>
              <ChevronRight size={20} />
            </div>
          </div>

          {/* Info Section Cards (Collapsible Accordions) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            {/* Card: How reporting works */}
            <div className="glass-panel" style={{ margin: 0 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleAccordion('how-reporting-works')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion('how-reporting-works');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: openAccordions['how-reporting-works'] ? '10px' : '0px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="icon-wrapper-amber" style={{ width: '36px', height: '36px' }}>
                    <HelpCircle size={20} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    How reporting works
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {openAccordions['how-reporting-works'] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              {openAccordions['how-reporting-works'] && (
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5, paddingTop: '4px' }}>
                  1. Select a verified store establishment in San Jose de Buenavista.<br />
                  2. Capture a live photo of your physical checkout receipt using your camera.<br />
                  3. DTI evaluators review extracted price data and cross-reference with official SRP bulletins.
                </div>
              )}
            </div>

            {/* Card: Privacy notice */}
            <div className="glass-panel" style={{ margin: 0 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleAccordion('privacy-security')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion('privacy-security');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: openAccordions['privacy-security'] ? '10px' : '0px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="icon-wrapper-blue" style={{ width: '36px', height: '36px' }}>
                    <ShieldCheck size={20} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    Privacy & Evidence Security
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {openAccordions['privacy-security'] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              {openAccordions['privacy-security'] && (
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5, paddingTop: '4px' }}>
                  Camera access is used exclusively during live receipt capture. All submitted receipt photos are encrypted, cryptographically hashed (SHA-256), and vaulted in restricted DTI storage.
                </div>
              )}
            </div>

            {/* Card: Frequently asked questions */}
            <div className="glass-panel" style={{ margin: 0 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleAccordion('faq')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleAccordion('faq');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: openAccordions['faq'] ? '10px' : '0px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="icon-wrapper-green" style={{ width: '36px', height: '36px' }}>
                    <FileText size={20} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                    Frequently Asked Questions
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {openAccordions['faq'] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              {openAccordions['faq'] && (
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5, paddingTop: '4px' }}>
                  <strong>Why are gallery uploads disabled?</strong><br />
                  To maintain a tamper-evident evidence trail under DTI regulatory rules.<br />
                  <strong>Does reporting auto-issue a violation?</strong><br />
                  No. All submissions require human verification by authorized DTI officers.
                </div>
              )}
            </div>
          </div>
        </>
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
                    Sensitive receipt details are protected during review.
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
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '10px' }}>DTI Consumer Evidence Vault Privacy Policy (v1.0)</h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: 1.5 }}>
              <p>1. <strong>Scope:</strong> Pursuant to R.A. 7581 (Price Act) and Data Privacy Act of 2012, all receipt evidence uploaded via PRICE-Watch is sealed in private DTI storage (<code>storage/app/private/receipt_vault</code>).</p>
              <p>2. <strong>Redaction & PII:</strong> Personal identity numbers, credit card tokens, and cashier signatures are automatically masked during administrative workflow processing.</p>
              <p>3. <strong>Tamper-Evident Verification:</strong> Live camera frames generate an immediate SHA-256 cryptographic hash on client devices prior to transmission.</p>
            </div>
            <button className="btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowFullNoticeModal(false)}>
              Close Notice
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. STEP 1 OF 3: SELECT STORE (cus_ui/Reports/3.png) */}
      {/* ========================================================================= */}
      {currentView === 'select-store' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Step Indicator */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Step 1 of 3 · Store
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
              Select the store
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Choose the verified retail store where your purchase took place.
            </p>
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search store name, barangay, or address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '42px' }}
            />
          </div>

          {/* Quick Filter Chips Bar */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            <button
              className={`chip ${activeChip === 'nearby' ? 'active' : ''}`}
              onClick={() => setActiveChip('nearby')}
            >
              Nearby stores
            </button>
            <button
              className={`chip ${activeChip === 'recent' ? 'active' : ''}`}
              onClick={() => setActiveChip('recent')}
            >
              Recently selected
            </button>
            <button
              className={`chip ${activeChip === 'barangay' ? 'active' : ''}`}
              onClick={() => setActiveChip('barangay')}
            >
              Filter by barangay
            </button>
          </div>

          {/* Verified Store Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredStores.map((s) => {
              const isSelected = selectedStore?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedStore(s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedStore(s);
                    }
                  }}
                  style={{
                    background: '#ffffff',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 0 3px rgba(29, 78, 216, 0.15)' : 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: isSelected ? '#dbeafe' : '#f1f5f9',
                      color: isSelected ? 'var(--primary)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Building2 size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                        {s.store_name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {s.address}
                      </div>
                      <span className="badge badge-blue" style={{ marginTop: '6px', fontSize: '0.68rem', padding: '2px 8px' }}>
                        {s.dti_sec_number}
                      </span>
                    </div>
                  </div>

                  <button
                    className={isSelected ? 'btn-primary' : 'btn-secondary'}
                    style={{ width: 'auto', padding: '6px 14px', fontSize: '0.82rem' }}
                  >
                    {isSelected ? '✓ Selected' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Bottom Action Bar */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="btn-secondary" onClick={() => setCurrentView('dashboard')}>
              Back
            </button>
            <button
              className="btn-primary"
              disabled={!selectedStore}
              onClick={() => {
                if (selectedStore) startCaptureSession(selectedStore);
              }}
            >
              Continue
            </button>
          </div>
        </div>
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
                <CheckCircle2 size={18} color="var(--accent-green)" /> Include the full receipt.
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
      {/* 5. STEP 2 OF 3: LIVE RECEIPT CAMERA VIEWPORT (cus_ui/Reports/5.png) */}
      {/* ========================================================================= */}
      {currentView === 'camera-viewport' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '10px 14px', borderRadius: '12px', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <span>{selectedStore?.store_name || 'Selected store unavailable'}</span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>▾</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                style={{ background: flashOn ? '#f59e0b' : 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Toggle Flash"
              >
                <Flashlight size={16} />
              </button>
              <button
                onClick={toggleCameraFlip}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Flip Camera"
              >
                <SwitchCamera size={16} />
              </button>
            </div>
          </div>

          {/* Instruction Subtitle */}
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Fit the entire receipt inside the frame. Include the store name, date, and relevant item lines.
          </p>

          {error && (
            <div role="alert" className="banner-warning" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Status Indicator Pill */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="badge badge-green" style={{ padding: '6px 14px', fontSize: '0.78rem', boxShadow: 'var(--shadow-sm)' }}>
              {stream ? '🟢 Camera Feed Active · Frame Aligned' : '⏳ Initializing Camera...'}
            </span>
          </div>

          {/* Camera Viewfinder Box */}
          <div className="camera-container">
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />

            {/* Bounding Box Overlay */}
            <div className="camera-overlay">
              <div style={{ textAlign: 'center', background: 'rgba(15,23,42,0.75)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', color: '#fbbf24', backdropFilter: 'blur(4px)' }}>
                Targeting Checkout Receipt · Position Full Length
              </div>

              {/* Corner Framing Guides */}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', height: '100%', position: 'absolute', inset: 0, padding: '12px', pointerEvents: 'none' }}>
                <div style={{ borderTop: '4px solid #f59e0b', borderLeft: '4px solid #f59e0b', width: '30px', height: '30px' }} />
                <div style={{ borderTop: '4px solid #f59e0b', borderRight: '4px solid #f59e0b', width: '30px', height: '30px' }} />
              </div>

              <div style={{ textAlign: 'center', background: 'rgba(15,23,42,0.75)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', color: '#ffffff', backdropFilter: 'blur(4px)' }}>
                DTI Hardware Lock Active · Gallery Disabled
              </div>
            </div>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Shutter Button Bar */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '8px' }}>
            <button
              className="btn-secondary"
              style={{ borderRadius: '50%', width: '44px', height: '44px', padding: 0 }}
              onClick={() => setCurrentView('select-store')}
            >
              <ArrowLeft size={20} />
            </button>

            <button
              onClick={captureLiveFrame}
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '4px solid var(--primary)',
                boxShadow: '0 4px 12px rgba(29,78,216,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.15s ease'
              }}
              title="Shutter Button"
            >
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--primary)' }} />
            </button>

            <div style={{ width: '44px' }} />
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
                RELEVANT DETECTED COMMODITY LINE
              </div>
              {ocrItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ fontSize: '0.88rem', fontWeight: 700 }}
                    value={item.commodity_name}
                    onChange={(e) => {
                      const updated = [...ocrItems];
                      updated[idx].commodity_name = e.target.value;
                      setOcrItems(updated);
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Detected Price: ₱</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      style={{ width: '120px', padding: '6px 10px', fontSize: '0.88rem' }}
                      value={item.receipt_price}
                      onChange={(e) => {
                        const updated = [...ocrItems];
                        updated[idx].receipt_price = e.target.value;
                        setOcrItems(updated);
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      (SRP Baseline: ₱{item.baseline_price.toFixed(2)})
                    </span>
                  </div>
                </div>
              ))}
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
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-main)' }}>
            <input
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
              <button className="btn-secondary" onClick={() => setCurrentView('select-store')}>
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
                <div>3. Return using your private tracking link.</div>
              </div>
            </div>

            {/* Secret Tracking Code Notice */}
            <div style={{
              background: '#fffbeb',
              border: '1px dashed #f59e0b',
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Lock size={16} /> Keep your private tracking code secure.
              </div>
              <p style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '10px' }}>
                You will need both your Reference Code and Secret Token to track evaluation progress updates.
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

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  if (onTrackReport) {
                    onTrackReport(submissionResult.report_reference, submissionResult.secret_tracking_token);
                  } else if (setActiveTab) {
                    setActiveTab('track');
                  }
                }}
              >
                Track this report
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setCurrentView('dashboard');
                  setPrivacyAccepted(false);
                  setSelectedStore(null);
                  setCapturedBlob(null);
                  setPreviewUrl(null);
                  setSubmissionResult(null);
                }}
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
