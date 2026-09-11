import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, LoaderCircle, Plus, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { apiClient, type CaptureSessionResponse } from '../api/client';
import { deleteReceiptResumeToken, getReceiptResumeToken } from '../app/receiptResumeStore';
import { navigate } from '../app/routing';
import { GuidedReceiptCapture } from './GuidedReceiptCapture';

interface ReceiptReviewItem {
  sequence: number;
  raw_text: string | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  observed_price: number | null;
  ocr_confidence: number | null;
}

type ReceiptEvidence = { id: number; sequence: number; mime_type: string; size_bytes: number };

interface ReceiptReviewData {
  attempt_number?: number;
  transaction_date?: string | null;
  report_reference: string;
  status: string;
  store: { id: number; store_name: string; address: string } | null;
  items: ReceiptReviewItem[];
  continuity: { status: string; continuity_score?: number; reasons?: string[] } | null;
  merchant: { status: string; observed?: string[]; display_name?: string | null } | null;
  detected_total: number | null;
  warnings: Array<{ code: string; message: string }>;
  manual_review_required: boolean;
  lines: string[];
  evidence: ReceiptEvidence[];
}

interface ReceiptProcessingData {
  report_reference: string;
  status: string;
  processing_status: string;
  message: string | null;
  ready_for_review: boolean;
  can_recapture: boolean;
  /** False when rerunning OCR cannot help (for example, stored photos failed their integrity check). */
  can_retry_processing?: boolean;
  failure_reason?: { code: string; message: string } | null;
  attempt_number: number;
  store: { id: number; store_name: string } | null;
  recapture_reason: { code: string; message: string } | null;
  evidence: ReceiptEvidence[];
}

export interface ReceiptConfirmationResult {
  report_reference: string;
  status: string;
  submitted_at: string;
}

interface ReceiptDraftViewProps {
  reference: string;
  mode: 'processing' | 'review';
  onSubmitted?: (result: ReceiptConfirmationResult) => void;
  onStatus?: (status: string) => void;
}

export const ReceiptDraftView: React.FC<ReceiptDraftViewProps> = ({ reference, mode, onSubmitted, onStatus }) => {
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<ReceiptProcessingData | null>(null);
  const [review, setReview] = useState<ReceiptReviewData | null>(null);
  const [items, setItems] = useState<ReceiptReviewItem[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState<ReceiptConfirmationResult | null>(null);
  const [recaptureSession, setRecaptureSession] = useState<CaptureSessionResponse | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState<Array<{ id: number; sequence: number; url: string | null }>>([]);
  const [decodedIds, setDecodedIds] = useState<number[]>([]);
  const [viewer, setViewer] = useState<{ url: string; sequence: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cooldownUntil = React.useRef(0);
  const requestRef = React.useRef<AbortController | null>(null);
  const evidenceUrlsRef = React.useRef(new Map<number, string>());
  const attemptRef = React.useRef('');
  const onStatusRef = React.useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const reportError = useCallback((caught: unknown, fallback: string) => {
    const response = (caught as { response?: { status?: number; headers?: Record<string, string>; data?: { message?: string } } })?.response;
    if (response?.status === 429) {
      const header = response.headers?.['retry-after'];
      const seconds = header && /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 60;
      const delay = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60;
      cooldownUntil.current = Math.max(cooldownUntil.current, Date.now() + delay * 1000);
      setRetrySeconds(Math.ceil((cooldownUntil.current - Date.now()) / 1000));
      setError('Too many requests. Your receipt has not been discarded. Please wait, then try again.');
    } else if (cooldownUntil.current <= Date.now()) {
      setError(response?.data?.message || fallback);
    }
  }, []);

  useEffect(() => {
    if (!retrySeconds) return;
    const timer = window.setInterval(() => setRetrySeconds(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [retrySeconds]);

  useEffect(() => {
    if (!viewer) return;
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus(); };
  }, [viewer]);

  const loadEvidence = useCallback(async (assets: ReceiptEvidence[], token: string, signal: AbortSignal) => {
    const cache = evidenceUrlsRef.current;
    for (const [id, url] of cache) {
      if (!assets.some(asset => asset.id === id)) { URL.revokeObjectURL(url); cache.delete(id); }
    }
    const results = await Promise.allSettled(assets.map(async (asset) => {
      if (cache.has(asset.id)) return { ...asset, url: cache.get(asset.id)! };
      const evidence = await apiClient.get(
        `/public/reports/${encodeURIComponent(reference)}/evidence-assets/${asset.id}`,
        { headers: { 'X-Report-Resume-Token': token }, responseType: 'blob', signal },
      );
      if (signal.aborted) return { ...asset, url: null };
      const url = URL.createObjectURL(evidence.data as Blob);
      cache.set(asset.id, url);
      return { ...asset, url };
    }));
    if (signal.aborted) return;
    const originals = results.map((result, index) => result.status === 'fulfilled' ? result.value : { ...assets[index], url: null });
    setEvidenceUrls(originals);
    const failure = results.find(result => result.status === 'rejected' && result.reason?.response?.status === 429)
      || results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') reportError(failure.reason, 'Some receipt photos could not be loaded. Retry loading photos before submitting.');
  }, [reference, reportError]);

  const load = useCallback(async (token: string) => {
    if (requestRef.current || cooldownUntil.current > Date.now()) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    setError('');
    try {
      if (mode === 'review') {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/review`, {
          headers: { 'X-Report-Resume-Token': token }, signal: controller.signal,
        });
        const data = response.data.data as ReceiptReviewData;
        if (controller.signal.aborted) return;
        const attempt = `${data.attempt_number ?? ''}:${(data.evidence ?? []).map(asset => asset.id).join(',')}`;
        if (attemptRef.current !== attempt) {
          attemptRef.current = attempt;
          setConfirmed(false);
          setDecodedIds([]);
        }
        setReview(data);
        setItems(data.items);
        await loadEvidence(data.evidence ?? [], token, controller.signal);
        if (!controller.signal.aborted) onStatusRef.current?.(data.status);
      } else {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/processing`, {
          headers: { 'X-Report-Resume-Token': token }, signal: controller.signal,
        });
        const data = response.data.data as ReceiptProcessingData;
        if (controller.signal.aborted) return;
        setProcessing(data);
        if (data.status === 'Needs recapture' || (data.status === 'Processing failed' && data.can_retry_processing !== false)) {
          await loadEvidence(data.evidence ?? [], token, controller.signal);
        }
        if (!controller.signal.aborted) onStatusRef.current?.(data.status);
      }
    } catch (caught: unknown) {
      if (!controller.signal.aborted) reportError(caught, 'Unable to load this receipt draft. Try again, or use Track Report with your recovery token.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [loadEvidence, mode, reference, reportError]);

  useEffect(() => {
    let active = true;
    void getReceiptResumeToken(reference).then((token) => {
      if (!active) return;
      setResumeToken(token);
      if (!token) {
        setError('This device no longer has the secure resume credential. Use Track Report with your report reference and recovery token.');
        setLoading(false);
        return;
      }
      void load(token);
    }).catch(() => {
      if (!active) return;
      setError('Secure device storage is unavailable. Use Track Report with your recovery information.');
      setLoading(false);
    });
    return () => { active = false; requestRef.current?.abort(); requestRef.current = null; };
  }, [load, reference]);

  useEffect(() => () => {
    evidenceUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    evidenceUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (mode !== 'processing' || !resumeToken || !processing || processing.ready_for_review || retrySeconds || recaptureSession) return;
    if (!['Processing receipt'].includes(processing.status)) return;
    const interval = window.setInterval(() => void load(resumeToken), 8000);
    return () => window.clearInterval(interval);
  }, [load, mode, processing, resumeToken, retrySeconds, recaptureSession]);

  const evidenceComplete = Boolean(review?.evidence.length) && review!.evidence.every(asset => evidenceUrlsRef.current.has(asset.id) && decodedIds.includes(asset.id));
  const busy = submitting || refreshing || retrySeconds > 0;
  const errorNotice = error ? <div className="receipt-form-error" role="alert"><p>{error}</p>{retrySeconds > 0 && <p>Try again in {retrySeconds} seconds.</p>}</div> : null;

  const submit = async () => {
    if (!resumeToken || !confirmed || !evidenceComplete || busy || cooldownUntil.current > Date.now()) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/confirm-ocr`,
        {
          consumer_confirmed: true,
        },
        { headers: { 'X-Report-Resume-Token': resumeToken } },
      );
      const result = response.data.data as ReceiptConfirmationResult;
      await deleteReceiptResumeToken(reference);
      setSubmitted(result);
      onSubmitted?.(result);
    } catch (caught: unknown) {
      reportError(caught, 'The report was not submitted. Your receipt is still available; try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startRecapture = async (action: { replace_sequence?: number; append?: boolean; restart?: boolean } = {}) => {
    if (!resumeToken || busy || cooldownUntil.current > Date.now()) return;
    if (action.restart && !window.confirm('Restart this receipt capture? Your previous uploaded evidence will remain in the report history.')) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/recapture-session`,
        action,
        { headers: { 'X-Report-Resume-Token': resumeToken } },
      );
      setRecaptureSession(response.data.data as CaptureSessionResponse);
    } catch (caught: unknown) {
      reportError(caught, 'A new receipt capture could not be started. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const retryProcessing = async () => {
    if (!resumeToken || busy || cooldownUntil.current > Date.now()) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/retry-processing`,
        {},
        { headers: { 'X-Report-Resume-Token': resumeToken } },
      );
      await load(resumeToken);
    } catch (caught: unknown) {
      reportError(caught, 'Receipt processing could not be retried. Try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="receipt-draft-page receipt-draft-success" aria-live="polite">
        <CheckCircle2 size={42} aria-hidden="true" />
        <h1>Report submitted to DTI</h1>
        <p>Your receipt and system results are available for DTI review. Submission does not establish a violation.</p>
        <strong>{submitted.report_reference}</strong>
      </section>
    );
  }

  if (loading) {
    return <div className="receipt-draft-loading" role="status"><LoaderCircle className="spin" size={22} /> Loading receipt status…</div>;
  }

  if (recaptureSession && resumeToken) {
    return <GuidedReceiptCapture
      session={recaptureSession}
      storeName={processing?.store?.store_name || review?.store?.store_name || 'Selected store'}
      submissionUuid={`recapture-${reference}`}
      recapture={{ reference, resumeToken }}
      onCancel={() => setRecaptureSession(null)}
      onDraftCreated={() => { setConfirmed(false); onStatusRef.current?.('Processing receipt'); }}
      onCheckStatus={() => {
        setRecaptureSession(null);
        setConfirmed(false);
        setReview(null);
        setProcessing(null);
        setLoading(true);
        navigate({ name: 'receipt-processing', reference });
        if (mode === 'processing') void load(resumeToken);
      }}
    />;
  }

  if (error && !review && !processing) {
    return (
      <section className="receipt-draft-page">
        <AlertTriangle size={34} aria-hidden="true" />
        <h1>Receipt status unavailable</h1>
        {errorNotice}
        {resumeToken && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void load(resumeToken)}><RefreshCw size={17} /> Try again</button>}
      </section>
    );
  }

  if (mode === 'processing' && processing) {
    const needsRecapture = processing.status === 'Needs recapture';
    const failed = processing.status === 'Processing failed';
    const retryable = failed && processing.can_retry_processing !== false;
    const needsAttention = needsRecapture || failed;
    return (
      <section className="receipt-draft-page">
        {needsAttention ? <AlertTriangle size={36} aria-hidden="true" /> : <Clock3 size={36} aria-hidden="true" />}
        <h1>{processing.status}</h1>
        <p>{processing.recapture_reason?.message || processing.message || 'PRICE-Watch is preparing the receipt for your confirmation.'}</p>
        {processing.ready_for_review && (
          <button type="button" className="btn-primary" onClick={() => navigate({ name: 'receipt-review', reference })}>Review detected items</button>
        )}
        {needsRecapture && evidenceUrls.length > 0 && <section className="receipt-review-section" aria-labelledby="recapture-evidence-heading">
          <h2 id="recapture-evidence-heading">Original captured receipt evidence</h2>
          <div className="receipt-evidence-grid">
            {evidenceUrls.map((asset) => <figure key={asset.id} className="receipt-evidence-card">
              {asset.url ? <img src={asset.url} alt={`Original receipt section ${asset.sequence + 1}`} /> : <p>Section {asset.sequence + 1} could not be loaded.</p>}
              <figcaption>Section {asset.sequence + 1}</figcaption>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void startRecapture({ replace_sequence: asset.sequence })}>
                <Camera size={16} /> Retake section {asset.sequence + 1}
              </button>
            </figure>)}
          </div>
          <div className="receipt-evidence-actions">
            <button type="button" className="btn-secondary" disabled={busy || evidenceUrls.length >= 12} onClick={() => void startRecapture({ append: true })}><Plus size={16} /> Add section</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void startRecapture({ restart: true })}><RefreshCw size={16} /> Restart receipt</button>
          </div>
        </section>}
        {needsRecapture && processing.can_recapture && evidenceUrls.length === 0 && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void startRecapture({ restart: true })}>
            {submitting ? 'Starting camera…' : 'Scan receipt again'}
          </button>
        )}
        {retryable && <div className="banner-warning">Processing failed on the server. Your receipt is not marked as a bad capture. Retry processing runs OCR again on the same receipt evidence. Refresh status only checks progress.</div>}
        {retryable && <button type="button" className="btn-primary" disabled={busy} onClick={() => void retryProcessing()}>
          {submitting ? 'Retrying processing…' : 'Retry processing'}
        </button>}
        {failed && !retryable && <div className="banner-warning">{processing.failure_reason?.message || 'This receipt cannot be processed again. Capture the receipt again from the start.'}</div>}
        {failed && !retryable && processing.can_recapture && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void startRecapture({ restart: true })}>
            {submitting ? 'Starting camera…' : 'Restart receipt'}
          </button>
        )}
        {!processing.ready_for_review && !needsAttention && <p className="receipt-draft-muted">You may leave this page. This status also appears under Recent Reports.</p>}
        {errorNotice}
        {resumeToken && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void load(resumeToken)}><RefreshCw size={17} /> Refresh status</button>}
      </section>
    );
  }

  if (!review) return null;

  return (
    <section className="receipt-draft-page receipt-review-page">
      <h1>Review your receipt</h1>
      <p>Check that every section is clear and complete.</p>
      <div className="receipt-review-store"><span>Selected store</span><strong>{review.store?.store_name || 'Unavailable'}</strong><span>{review.store?.address}</span></div>
      <section className="receipt-review-section" aria-labelledby="original-receipt-heading">
        <h2 id="original-receipt-heading">Receipt photos</h2>
        <div className="receipt-evidence-grid">
          {evidenceUrls.map((asset) => <figure key={asset.id} className="receipt-evidence-card">
            {asset.url ? <img src={asset.url} alt={`Original receipt section ${asset.sequence + 1}`}
              onLoad={() => setDecodedIds(ids => ids.includes(asset.id) ? ids : [...ids, asset.id])}
              onError={() => {
                URL.revokeObjectURL(asset.url!);
                evidenceUrlsRef.current.delete(asset.id);
                setDecodedIds(ids => ids.filter(id => id !== asset.id));
                setConfirmed(false);
                setEvidenceUrls(assets => assets.map(entry => entry.id === asset.id ? { ...entry, url: null } : entry));
                setError('A receipt photo could not be displayed. Retry loading photos.');
              }} /> : <p>Section {asset.sequence + 1} could not be loaded.</p>}
            <figcaption>Section {asset.sequence + 1}</figcaption>
            <div className="receipt-photo-actions">
            {asset.url && <button type="button" className="btn-secondary" aria-label={`View full size: section ${asset.sequence + 1}`}
              onClick={() => { setZoom(1); setViewer({ url: asset.url!, sequence: asset.sequence }); }}><ZoomIn size={16} /> View full size</button>}
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void startRecapture({ replace_sequence: asset.sequence })}>
              <Camera size={16} /> Retake section {asset.sequence + 1}
            </button>
            </div>
          </figure>)}
        </div>
        {evidenceUrls.length === 0 && <p>Original receipt photos are unavailable. Try loading them again before submitting.</p>}
        {(!evidenceUrls.length || evidenceUrls.some(asset => !asset.url)) && <button type="button" className="btn-secondary" disabled={busy} onClick={() => resumeToken && void load(resumeToken)}>Retry loading photos</button>}
        <div className="receipt-evidence-actions">
          <button type="button" className="btn-secondary" disabled={busy || review.evidence.length >= 12} onClick={() => void startRecapture({ append: true })}><Plus size={16} /> Add section</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void startRecapture({ restart: true })}><RefreshCw size={16} /> Restart receipt</button>
        </div>
      </section>
      <section className="receipt-review-section" aria-labelledby="system-extraction-heading">
        <h2 id="system-extraction-heading">Details read from your receipt</h2>
        <dl className="receipt-summary">
          <div><dt>Merchant</dt><dd>{review.merchant?.display_name || 'Not detected'}{review.merchant?.display_name && review.merchant.status !== 'matched' && <span> — Uncertain</span>}</dd></div>
          <div><dt>Date</dt><dd>{review.transaction_date || 'Not detected'}</dd></div>
          <div><dt>Total</dt><dd>{review.detected_total != null ? `₱${Number(review.detected_total).toFixed(2)}` : 'Not detected'}{review.warnings?.some(warning => warning.code === 'TOTAL_MISMATCH') && <span> — Uncertain</span>}</dd></div>
        </dl>
      <div className="receipt-review-items">
        {items.map((item, index) => (
          <div key={item.sequence} className="receipt-review-item" aria-label={`Item ${index + 1}`}>
            <strong>{item.item_name}</strong>
            <div className="receipt-review-row">
              <span>Qty: {item.quantity ?? 'Not detected'} {item.unit ?? ''}</span>
              <span>{item.observed_price != null ? `₱${Number(item.observed_price).toFixed(2)}` : 'Price not detected'}</span>
            </div>
            {(item.ocr_confidence == null || item.ocr_confidence <= 0.8 || !/[\p{L}]/u.test(item.item_name)) && <span className="receipt-field-warning">Uncertain — check the photo</span>}
          </div>
        ))}
      </div>
      {items.length === 0 && <p>No items detected.</p>}
      {(review.manual_review_required || review.merchant?.status !== 'matched' || items.some(item => item.ocr_confidence == null || item.ocr_confidence <= 0.8)) && <div className="banner-warning"><AlertTriangle size={20} /><span>Some details couldn’t be read reliably. If your photos are clear and complete, you can submit them for DTI review.</span></div>}
      </section>
      <label className="receipt-confirmation-check">
        <input type="checkbox" checked={confirmed} disabled={!evidenceComplete || busy} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I reviewed the receipt photos and want to submit this report.</span>
      </label>
      {errorNotice}
      {error && !evidenceUrls.some(asset => !asset.url) && <button type="button" className="btn-secondary" disabled={busy} onClick={() => resumeToken && void load(resumeToken)}>Refresh receipt</button>}
      <button type="button" className="btn-primary" disabled={!confirmed || !evidenceComplete || busy} onClick={() => void submit()}>
        {submitting ? 'Submitting report…' : 'Submit report to DTI'}
      </button>
      {viewer && <dialog ref={dialogRef} className="receipt-photo-dialog" aria-label={`Receipt section ${viewer.sequence + 1}`} onCancel={() => setViewer(null)}>
        <div className="receipt-photo-toolbar"><strong>Section {viewer.sequence + 1}</strong>
          <button type="button" className="btn-secondary" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><ZoomOut size={20} /></button>
          <button type="button" className="btn-secondary" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))}><ZoomIn size={20} /></button>
          <button type="button" className="btn-secondary" aria-label="Close photo" onClick={() => setViewer(null)}><X size={20} /></button>
        </div>
        <div className="receipt-photo-scroll"><img src={viewer.url} alt={`Full receipt section ${viewer.sequence + 1}`} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} /></div>
      </dialog>}
    </section>
  );
};

export default ReceiptDraftView;
