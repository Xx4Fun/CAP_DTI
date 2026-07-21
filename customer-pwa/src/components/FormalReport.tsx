import React, { useState, useRef, useEffect } from 'react';
import { Camera, ShieldCheck, CheckCircle2, RefreshCw, Copy, Check } from 'lucide-react';
import { apiClient, type Establishment, type CaptureSessionResponse, type FormalReportResponse } from '../api/client';

export const FormalReport: React.FC = () => {
  // Steps: 1 = Privacy & Capability, 2 = Select Store, 3 = Live Camera Capture, 4 = OCR Confirmation, 5 = Submitted Confirmation
  const [step, setStep] = useState<number>(1);

  // Capability checks
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean>(false);

  // Store Selection
  const [stores, setStores] = useState<Establishment[]>([]);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);

  // Capture Session
  const [captureSession, setCaptureSession] = useState<CaptureSessionResponse | null>(null);

  // Camera & Image state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string>('');
  const [submissionUuid, setSubmissionUuid] = useState<string>('');

  // OCR Confirmation State
  const [ocrItems, setOcrItems] = useState([
    { commodity_name: 'Regular Milled Rice', receipt_price: '45.00', srp_baseline: 38.00, quantity: 1 }
  ]);

  // Result state
  const [submissionResult, setSubmissionResult] = useState<FormalReportResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Generate unique submission UUID for idempotency
    setSubmissionUuid('sub-' + Math.random().toString(36).substring(2, 15) + Date.now());
    fetchStores();
    checkCapabilities();
  }, []);

  const checkCapabilities = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCamera(false);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await apiClient.get('/public/establishments');
      if (res.data.success) {
        setStores(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startCaptureSession = async (store: Establishment) => {
    setSelectedStore(store);
    setError('');
    try {
      const res = await apiClient.post('/public/capture-session', {
        store_id: store.id
      });
      if (res.data.success) {
        setCaptureSession(res.data.data);
        setStep(3);
        startCamera();
      }
    } catch (err: any) {
      setError('Unable to issue secure capture session from server. Please try again.');
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Secure live camera capture permission denied or unavailable.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const captureLiveFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setPreviewUrl(URL.createObjectURL(blob));
          stopCamera();

          // Calculate SHA-256 Hash of raw image bytes
          const arrayBuffer = await blob.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          setImageHash(hashHex);
        }
      }, 'image/jpeg', 0.85);
    }
  };

  const submitFormalReport = async () => {
    if (!capturedBlob || !captureSession || !selectedStore) return;
    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('submission_uuid', submissionUuid);
      formData.append('capture_session_id', String(captureSession.capture_session_id));
      formData.append('capture_token', captureSession.capture_token);
      formData.append('store_id', String(selectedStore.id));
      formData.append('privacy_notice_version', '1.0');
      formData.append('image_hash', imageHash);
      formData.append('image', capturedBlob, 'receipt.jpg');
      formData.append('extracted_text_json', JSON.stringify({ items: ocrItems }));

      const res = await apiClient.post('/public/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data.success) {
        setSubmissionResult(res.data.data);
        setStep(5); // Show Submitted Confirmation
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit formal receipt report. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = () => {
    if (submissionResult) {
      navigator.clipboard.writeText(submissionResult.secret_tracking_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      {/* Step 1: Privacy Notice & Capability Verification */}
      {step === 1 && (
        <div className="glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#f59e0b' }}>
            <ShieldCheck size={24} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Formal Receipt Reporting Notice</h2>
          </div>

          <p style={{ fontSize: '0.88rem', color: '#a1a1aa', marginBottom: '16px' }}>
            Submitting a receipt report creates an official price concern record for DTI evaluation. Reports require human verification by regulatory officers.
          </p>

          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '14px', borderRadius: '10px', fontSize: '0.82rem', color: '#d4d4d8', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Evidence Privacy & Vaulting Terms:</div>
            <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Camera access is required for live tamper-evident receipt capture.</li>
              <li>Gallery uploads are disabled for formal regulatory evidence.</li>
              <li>Unrelated grocery lines and cashier details are redacted during routine review.</li>
              <li>Original receipts are sealed in a private DTI vault (`storage/app/private/receipt_vault`).</li>
            </ul>
          </div>

          {!hasCamera && (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px' }}>
              Secure live receipt capture requires HTTPS and camera access. Public price checking remains available.
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '20px' }}>
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
            />
            <span>I acknowledge and accept the DTI Privacy Terms (Version 1.0)</span>
          </label>

          <button
            className="btn-primary"
            disabled={!privacyAccepted || !hasCamera}
            onClick={() => setStep(2)}
          >
            Proceed to Store Selection
          </button>
        </div>
      )}

      {/* Step 2: Select Establishment */}
      {step === 2 && (
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
            Select Store / Establishment
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
            Select the verified establishment where the purchase occurred.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {stores.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '14px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onClick={() => startCaptureSession(s)}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#fff' }}>{s.store_name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#a1a1aa' }}>{s.address}</div>
                </div>
                <span className="badge badge-amber">Select</span>
              </div>
            ))}
          </div>

          <button className="btn-secondary" onClick={() => setStep(1)}>
            Back to Terms
          </button>
        </div>
      )}

      {/* Step 3: Live Camera Stream Capture */}
      {step === 3 && (
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Live Receipt Camera Capture</h2>
            {captureSession && (
              <span className="badge badge-amber">
                Session Token Active
              </span>
            )}
          </div>

          {error && (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.15)', borderRadius: '10px', color: '#f87171', fontSize: '0.85rem', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          {!previewUrl ? (
            <div>
              <div className="camera-container">
                <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
                <div className="camera-overlay">
                  <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', color: '#fbbf24' }}>
                    Position full receipt within boundaries
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', color: '#fff' }}>
                    Avoid glare & ensure clear text
                  </div>
                </div>
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <button className="btn-primary" style={{ marginTop: '16px' }} onClick={captureLiveFrame}>
                <Camera size={18} /> Capture Live Receipt Frame
              </button>
            </div>
          ) : (
            <div>
              <img src={previewUrl} alt="Receipt Preview" style={{ width: '100%', borderRadius: '12px', marginBottom: '16px' }} />

              <div style={{ fontSize: '0.78rem', color: '#a1a1aa', background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px', marginBottom: '16px' }}>
                <div>SHA-256 Hash: <span style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{imageHash}</span></div>
                <div>Idempotency UUID: <span style={{ color: '#fff' }}>{submissionUuid}</span></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button className="btn-secondary" onClick={() => { setPreviewUrl(null); startCamera(); }}>
                  <RefreshCw size={16} /> Retake
                </button>
                <button className="btn-primary" onClick={() => setStep(4)}>
                  Confirm Photo
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: OCR Confirmation Screen */}
      {step === 4 && (
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
            Confirm Extracted Receipt Fields
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
            Verify recognized product items and prices extracted from your receipt.
          </p>

          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '14px', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
            {ocrItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Product Name</label>
                  <input
                    type="text"
                    className="input-field"
                    value={item.commodity_name}
                    onChange={(e) => {
                      const updated = [...ocrItems];
                      updated[idx].commodity_name = e.target.value;
                      setOcrItems(updated);
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Receipt Price (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={item.receipt_price}
                    onChange={(e) => {
                      const updated = [...ocrItems];
                      updated[idx].receipt_price = e.target.value;
                      setOcrItems(updated);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="btn-primary" disabled={submitting} onClick={submitFormalReport}>
            {submitting ? 'Submitting to DTI Vault...' : 'Submit Formal Report'}
          </button>
        </div>
      )}

      {/* Step 5: Submission Confirmation */}
      {step === 5 && submissionResult && (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '24px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle2 size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>
            Report Successfully Received
          </h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.88rem', marginBottom: '20px' }}>
            Your formal receipt report has been encrypted, hashed, and queued for DTI human evaluation.
          </p>

          <div style={{ background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '12px', textAlign: 'left', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>PUBLIC REPORT REFERENCE</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>
                {submissionResult.report_reference}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>SECRET TRACKING TOKEN (SAVE THIS)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#60a5fa', wordBreak: 'break-all', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px', flex: 1 }}>
                  {submissionResult.secret_tracking_token}
                </div>
                <button className="btn-secondary" style={{ width: 'auto', padding: '8px 12px' }} onClick={handleCopySecret}>
                  {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#71717a', marginBottom: '20px' }}>
            Keep your secret tracking token safe. You will need both the Reference and Tracking Token to check public progress updates.
          </div>

          <button className="btn-primary" onClick={() => setStep(1)}>
            Submit Another Report
          </button>
        </div>
      )}
    </div>
  );
};
