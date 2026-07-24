import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, ClipboardCheck, FilePlus2, FileSearch, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { apiClient, type CaptureSessionResponse, type Establishment, type FormalReportResponse } from '../api/client';
import { consumeHandoff, type FlowHandoff } from '../app/handoffs';
import type { AppRoute } from '../app/routing';
import { CameraShell } from './CameraShell';
import { StorePicker } from './StorePicker';
import { CopyButton } from './ui/CopyButton';
import { Dialog } from './ui/Dialog';
import { Field } from './ui/Field';
import { StatusBanner } from './ui/StatusBanner';

type ReportView = 'dashboard' | 'intro' | 'store' | 'guidance' | 'camera' | 'review' | 'submitting' | 'confirmation';
type ReportError = { operation: 'capture-session' | 'camera' | 'submission'; message: string };
type FormalReportProps = { mode: 'dashboard' | 'new'; onNavigate: (route: AppRoute) => void; onTrackReport: (reference: string, token: string) => void };
const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

export function FormalReport({ mode, onNavigate, onTrackReport }: FormalReportProps) {
  const [view, setView] = useState<ReportView>(mode === 'new' ? 'intro' : 'dashboard');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [stores, setStores] = useState<Establishment[]>([]);
  const [storeLoadError, setStoreLoadError] = useState('');
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [recentStoreId, setRecentStoreId] = useState<number | null>(null);
  const [handoff, setHandoff] = useState<FlowHandoff | null>(null);
  const [captureSession, setCaptureSession] = useState<CaptureSessionResponse | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transactionDate, setTransactionDate] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<ReportError | null>(null);
  const [result, setResult] = useState<FormalReportResponse | null>(null);
  const updateStream = (next: MediaStream | null) => { streamRef.current = next; setStream(next); };

  useEffect(() => {
    setView(mode === 'new' ? 'intro' : 'dashboard');
  }, [mode]);
  useEffect(() => {
    let active = true;
    const incoming = consumeHandoff(); setHandoff(incoming);
    apiClient.get('/public/establishments').then((response) => {
      if (!active) return;
      if (response.data?.success && Array.isArray(response.data.data)) {
        const loadedStores = response.data.data as Establishment[];
        setStores(loadedStores);
        if (incoming?.kind === 'scan-to-report') setSelectedStore(loadedStores.find((store) => store.id === incoming.storeId) ?? null);
      } else setStoreLoadError('We could not load the participating store directory. No store was selected.');
    }).catch(() => { if (active) setStoreLoadError('We could not load the participating store directory. No store was selected.'); });
    return () => { active = false; stopStream(streamRef.current); };
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const startSecureCapture = async () => {
    if (!selectedStore) return;
    setError(null);
    try {
      const response = await apiClient.post('/public/capture-session', { store_id: selectedStore.id });
      if (!response.data?.success || !response.data.data?.capture_token) throw new Error('Secure capture could not be initialized.');
      setCaptureSession(response.data.data); setRecentStoreId(selectedStore.id); setView('guidance'); setGuidanceOpen(true);
    } catch {
      setCaptureSession(null); setError({ operation: 'capture-session', message: "We couldn't start secure receipt capture. Nothing was saved. Check your connection and try again." });
    }
  };
  const openCamera = async (modeValue = facingMode) => {
    if (!captureSession) return;
    stopStream(streamRef.current); updateStream(null); setCameraError(null); setGuidanceOpen(false); setView('camera');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Live camera capture is not supported by this browser.');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: modeValue } }, audio: false }); updateStream(mediaStream);
    } catch (reason) {
      const blocked = reason instanceof DOMException && reason.name === 'NotAllowedError';
      const message = blocked ? 'Camera access is blocked. Allow camera access in your browser, then try again.' : reason instanceof Error ? reason.message : 'We could not start the camera. Try again.';
      setCameraError(message); setError({ operation: 'camera', message });
    }
  };
  const closeCamera = () => { stopStream(streamRef.current); updateStream(null); setView('guidance'); setGuidanceOpen(true); };
  const switchCamera = () => { const next = facingMode === 'environment' ? 'user' : 'environment'; setFacingMode(next); void openCamera(next); };
  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) { setCameraError('The camera is not ready. Keep the receipt in view and try again.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((captured) => {
      if (!captured) { setCameraError('We could not capture the receipt. Try again.'); return; }
      stopStream(streamRef.current); updateStream(null); if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(captured); setPreviewUrl(URL.createObjectURL(captured)); setView('review'); setError(null);
    }, 'image/jpeg', .92);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!blob || !selectedStore || !captureSession || !affirmed) return;
    setView('submitting'); setError(null);
    try {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map((value) => value.toString(16).padStart(2, '0')).join('');
      const form = new FormData();
      form.append('submission_uuid', crypto.randomUUID()); form.append('capture_session_id', String(captureSession.capture_session_id)); form.append('capture_token', captureSession.capture_token);
      form.append('store_id', String(selectedStore.id)); form.append('privacy_notice_version', '1.0'); form.append('image_hash', hash); form.append('image', blob, 'receipt.jpg');
      form.append('extracted_text_json', JSON.stringify({ transaction_date: transactionDate || null, receipt_number: receiptNumber || null, items: itemDescription || itemPrice ? [{ commodity_name: itemDescription || null, receipt_price: itemPrice ? Number(itemPrice) : null }] : [] }));
      const response = await apiClient.post('/public/reports', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const confirmed = response.data?.data as FormalReportResponse | undefined;
      if (!response.data?.success || !confirmed?.report_reference || !confirmed.secret_tracking_token) throw new Error('The server did not confirm this report.');
      setResult(confirmed); setView('confirmation');
    } catch {
      setView('review'); setError({ operation: 'submission', message: "We couldn't submit your report. Nothing was filed. Your captured receipt remains on this screen while you retry." });
    }
  };

  if (view === 'camera') return <CameraShell title="Capture checkout receipt" subtitle={selectedStore?.store_name ?? 'Selected store'} stream={stream} error={cameraError} canCapture={Boolean(stream)} torchSupported={false} torchOn={false} onClose={closeCamera} onRetry={() => void openCamera()} onToggleTorch={() => undefined} onSwitchCamera={switchCamera} onCapture={capture} videoRef={videoRef} />;
  if (view === 'dashboard') return <section className="report-dashboard" aria-labelledby="reports-title">
    <header className="page-header"><p className="page-kicker">Consumer reporting</p><h1 id="reports-title">Reports</h1><p className="page-intro">Submit a physical checkout receipt for DTI evaluation, or privately track a report you already filed.</p></header>
    <div className="report-dashboard-layout"><button className="report-action report-action--primary" type="button" onClick={() => onNavigate({ name: 'new-report' })}><FilePlus2 aria-hidden="true" /><span><strong>Submit a new report</strong><small>Live receipt capture is required.</small></span></button><button className="report-action" type="button" onClick={() => onNavigate({ name: 'track-report' })}><FileSearch aria-hidden="true" /><span><strong>Track an existing report</strong><small>Use your reference and secret token.</small></span></button></div>
    <details className="before-report"><summary>Before you report</summary><div className="prose"><p>A shelf comparison is informational. A formal report requires the physical checkout receipt and a live camera capture.</p><p>Your submission is reviewed by authorized DTI personnel; it does not automatically establish a violation.</p></div></details>
  </section>;

  return <section className="workflow-page report-flow" aria-labelledby="report-title">
    <header className="page-header"><p className="page-kicker">Secure consumer report</p><h1 id="report-title">Submit a checkout receipt</h1><p className="page-intro">Capture the original receipt live. DTI personnel will evaluate the submitted information and applicable price bulletin.</p></header>
    {handoff && <div className="starting-with"><span><small>Starting with context from {handoff.kind === 'scan-to-report' ? 'your shelf comparison' : 'the price directory'}</small><strong>{handoff.kind === 'scan-to-report' ? `Shelf ₱${handoff.displayedPrice.toFixed(2)} · Reference ₱${handoff.baselinePrice.toFixed(2)}` : `Product record ${handoff.commodityId}`}</strong></span><button type="button" aria-label="Remove starting context" onClick={() => setHandoff(null)}><X aria-hidden="true" /></button></div>}
    {view === 'intro' && <section className="workflow-card"><div className="trust-panel"><ShieldCheck aria-hidden="true" /><div><h2>Live capture protects report integrity</h2><p>Gallery uploads are unavailable. The receipt image stays in memory until it is sent through a secure, tamper-evident submission.</p></div></div><ul className="check-list"><li><Camera aria-hidden="true" />Keep the original physical receipt ready.</li><li><LockKeyhole aria-hidden="true" />Your secret tracking token is shown only after confirmed submission.</li><li><ClipboardCheck aria-hidden="true" />A DTI evaluator reviews the evidence.</li></ul><label className="check-control"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /><span>I understand the live camera and privacy notice.</span></label><button className="text-button" type="button" onClick={() => setPrivacyOpen(true)}>Read the full privacy notice</button><button className="button button--primary" type="button" disabled={!privacyAccepted} onClick={() => setView('store')}>Choose store</button></section>}
    {view === 'store' && <><button className="back-link" type="button" onClick={() => setView('intro')}><ArrowLeft aria-hidden="true" /> Back</button>{storeLoadError && <StatusBanner variant="error" title="Store directory unavailable">{storeLoadError}</StatusBanner>}<StorePicker stores={stores} selectedId={selectedStore?.id ?? null} recentStoreId={recentStoreId} onSelect={setSelectedStore} title="Where was the receipt issued?" />{error?.operation === 'capture-session' && <StatusBanner variant="error" title="Secure capture unavailable">{error.message}</StatusBanner>}<div className="sticky-actions"><button className="button button--primary" type="button" disabled={!selectedStore} onClick={() => void startSecureCapture()}><Camera aria-hidden="true" /> Start secure capture</button></div></>}
    {view === 'guidance' && <StatusBanner title="Capture session ready">Review the camera guidance to continue. The session expires at {captureSession ? new Date(captureSession.expires_at).toLocaleTimeString() : 'the server-defined time'}.</StatusBanner>}
    {(view === 'review' || view === 'submitting') && previewUrl && <form className="workflow-card review-form" onSubmit={submit}><div className="workflow-heading"><button className="back-link" type="button" onClick={() => { setGuidanceOpen(true); setView('guidance'); }}><ArrowLeft aria-hidden="true" /> Retake</button><p>Review before submission</p></div><h2>Review receipt information</h2><img className="capture-preview capture-preview--receipt" src={previewUrl} alt="Captured checkout receipt" /><StatusBanner title="Detected details require your review">Fields are blank unless you enter or confirm them. The image and form will be reviewed by DTI personnel.</StatusBanner><div className="form-grid"><Field label="Transaction date" name="transaction_date" type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} hint="Not detected automatically." /><Field label="Receipt number" name="receipt_number" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="Not detected" /><Field label="Product description" name="item_description" value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} placeholder="Not detected" /><Field label="Receipt price" name="item_price" inputMode="decimal" value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} placeholder="Not detected" /></div><label className="check-control"><input type="checkbox" checked={affirmed} onChange={(event) => setAffirmed(event.target.checked)} /><span>This is the receipt I intend to submit, and the information I entered is accurate to the best of my knowledge.</span></label>{error?.operation === 'submission' && <StatusBanner variant="error" title="Report not submitted">{error.message}</StatusBanner>}<button className="button button--primary" type="submit" disabled={!affirmed || view === 'submitting'}>{view === 'submitting' ? 'Submitting securely…' : 'Submit receipt for evaluation'}</button></form>}
    {view === 'confirmation' && result && <section className="confirmation-card"><ShieldCheck aria-hidden="true" /><p className="page-kicker">Server-confirmed submission</p><h2>Your report has been received</h2><p>Save both credentials now. The secret token is not stored in this browser.</p><div className="credential-block"><span><small>Public reference</small><strong>{result.report_reference}</strong></span><CopyButton value={result.report_reference} label="Copy reference number" /></div><div className="credential-block"><span><small>Secret tracking token</small><strong>{result.secret_tracking_token}</strong></span><CopyButton value={result.secret_tracking_token} label="Copy secret tracking token" successMessage="Secret tracking token copied." /></div><StatusBanner variant="warning" title="Keep the token private">DTI cannot display report details without both credentials.</StatusBanner><button className="button button--primary" type="button" onClick={() => onTrackReport(result.report_reference, result.secret_tracking_token)}>Track this report</button></section>}
    <Dialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy and evidence notice" description="What happens to your live receipt capture"><div className="prose"><p>The camera image is held in this page's memory until you submit or leave the flow. PRICE-Watch does not place receipt images or secret tracking tokens in local storage.</p><p>A SHA-256 digest supports a tamper-evident evidence trail. Authorized human review remains required because no technical control makes evidence immune to alteration.</p></div></Dialog>
    <Dialog open={guidanceOpen} onClose={() => { setGuidanceOpen(false); setView('store'); }} title="Capture the full receipt" description="Use the original physical checkout receipt"><div className="prose"><ol><li>Place the receipt on a flat, contrasting surface.</li><li>Keep the store name, transaction details, items, and totals visible.</li><li>Avoid glare and hold the device steady.</li></ol><p>Gallery upload is unavailable for formal reporting.</p><button className="button button--primary" type="button" onClick={() => void openCamera()}>Open live camera</button></div></Dialog>
  </section>;
}
