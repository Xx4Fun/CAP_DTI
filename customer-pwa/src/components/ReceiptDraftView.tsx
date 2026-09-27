import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock3, LoaderCircle, Plus, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { apiClient, type CaptureSessionResponse } from '../api/client';
import { deleteReceiptResumeToken, getReceiptResumeToken } from '../app/receiptResumeStore';
import { navigate } from '../app/routing';
import { GuidedReceiptCapture } from './GuidedReceiptCapture';
// Reuses the back-control styling that ReportDetail already imports from this stylesheet.
import './TrackReport.css';

interface ReceiptReviewItem {
  sequence: number;
  raw_text: string | null;
  item_name: string | null;
  quantity: number | null;
  unit: string | null;
  observed_price: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  /** Structured extraction only: fields that could not be read with confidence. */
  uncertain_fields?: string[] | null;
  section?: number | null;
  /** Sequence of an earlier item this line may repeat where two photos overlap. */
  possible_duplicate_of?: number | null;
  ocr_confidence: number | null;
}

type ReceiptEvidence = { id: number; sequence: number; mime_type: string; size_bytes: number };

type ReceiptAmountLine = { description?: string | null; kind?: string; direction?: 'add' | 'subtract'; amount: string | null; uncertain: boolean };

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
  receipt_number?: string | null;
  subtotal?: string | null;
  subtotal_uncertain?: boolean;
  total?: string | null;
  total_uncertain?: boolean;
  discounts?: ReceiptAmountLine[];
  adjustments?: ReceiptAmountLine[];
  reconciliation?: { status: string; checks?: Record<string, string> } | null;
  /** `gemini` for structured extraction; uncertainty then comes from `uncertain_fields`, never from `ocr_confidence`. */
  extraction_provider?: string | null;
  warnings: Array<{ code: string; message: string }>;
  manual_review_required: boolean;
  lines: string[];
  evidence: ReceiptEvidence[];
}

const peso = (value: number | string | null | undefined): string | null =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : `₱${Number(value).toFixed(2)}`;

const FIELD_LABELS: Record<string, string> = { raw_description: 'Name', quantity: 'Quantity', unit_price: 'Unit price', line_total: 'Line total' };

const ADJUSTMENT_LABELS: Record<string, string> = { vat_exemption: 'VAT exemption', rounding: 'Rounding', service_charge: 'Service charge' };

const RECONCILIATION_MESSAGES: Record<string, string> = {
  matched: 'The item amounts add up to the receipt total.',
  mismatch: 'The item amounts do not add up to the receipt total. DTI will check the photos.',
  unavailable: 'The amounts could not be checked automatically. DTI will check the photos.',
};

const UncertainBadge: React.FC<{ label?: string }> = ({ label = 'Uncertain' }) => <span className="receipt-uncertain-badge">{label}</span>;

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
  onBack?: () => void;
}

export const ReceiptDraftView: React.FC<ReceiptDraftViewProps> = ({ reference, mode, onSubmitted, onStatus, onBack }) => {
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

  // Every screen branch below is reachable from My Reports, so each needs a way back. The
  // recapture branch is deliberately excluded: GuidedReceiptCapture owns full-screen camera
  // chrome and carries its own cancel control.
  // Came from My Reports? Then processing and review are one destination, not two: replace the
  // entry instead of pushing. App.tsx's returnToReportList calls history.back() when this flag is
  // set, so pushing would leave processing as the back target and send a control labelled
  // "Back to My Reports" to the previous receipt screen instead of the list.
  const fromReportList = () =>
    (history.state as { fromReportList?: unknown } | null)?.fromReportList === true;

  // Always replace, whatever the origin. Processing and review are two views of one receipt, so
  // processing must never be the back target: a fresh capture arrives here without provenance
  // (FormalReport.tsx:1105 pushes processing with no state), and pushing review would leave
  // processing sitting behind the list entry that the back control writes.
  const openReview = () => {
    navigate({ name: 'receipt-review', reference }, {
      replace: true,
      ...(fromReportList() ? { state: { fromReportList: true } } : {}),
    });
  };

  // No heading of its own: each branch below already renders the page h1, so the control ships
  // icon-only rather than introducing a second h1.
  const backHeader = onBack ? (
    <header className="track-report-heading track-report-detail-app-header receipt-draft-back-header">
      <button type="button" className="track-report-back" aria-label="Back to My Reports" onClick={onBack}>
        <ArrowLeft size={21} aria-hidden="true" />
      </button>
    </header>
  ) : null;

  if (submitted) {
    return (
      <section className="receipt-draft-page receipt-draft-success" aria-live="polite">
        {backHeader}
        <CheckCircle2 size={42} aria-hidden="true" />
        <h1>Report submitted to DTI</h1>
        <p>Your receipt and system results are available for DTI review. Submission does not establish a violation.</p>
        <strong>{submitted.report_reference}</strong>
      </section>
    );
  }

  if (loading) {
    return (
      <>
        {backHeader}
        <div className="receipt-draft-loading" role="status"><LoaderCircle className="spin" size={22} /> Loading receipt status…</div>
      </>
    );
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
        // Replace, and keep list provenance: the recapture camera has just been torn down, so it
        // must not become the back target.
        navigate({ name: 'receipt-processing', reference }, {
          replace: true,
          ...(fromReportList() ? { state: { fromReportList: true } } : {}),
        });
        if (mode === 'processing') void load(resumeToken);
      }}
    />;
  }

  if (error && !review && !processing) {
    return (
      <section className="receipt-draft-page">
        {backHeader}
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
        {backHeader}
        {needsAttention ? <AlertTriangle size={36} aria-hidden="true" /> : <Clock3 size={36} aria-hidden="true" />}
        <h1>{processing.status}</h1>
        <p>{processing.recapture_reason?.message || processing.message || 'PRICE-Watch is preparing the receipt for your confirmation.'}</p>
        {processing.ready_for_review && (
          <button type="button" className="btn-primary" onClick={openReview}>Review detected items</button>
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

  const structured = review.extraction_provider === 'gemini';
  const totalAmount = peso(review.total ?? review.detected_total);
  const totalUncertain = Boolean(review.total_uncertain) || review.warnings?.some(warning => warning.code === 'TOTAL_MISMATCH');
  const itemPosition = (sequence: number) => items.findIndex(item => item.sequence === sequence) + 1;
  const showUncertaintyNotice = structured
    ? review.manual_review_required || items.some(item => (item.uncertain_fields?.length ?? 0) > 0)
    : review.manual_review_required || review.merchant?.status !== 'matched' || items.some(item => item.ocr_confidence == null || item.ocr_confidence <= 0.8);

  return (
    <section className="receipt-draft-page receipt-review-page">
      {backHeader}
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
          {structured && <div><dt>Receipt no.</dt><dd>{review.receipt_number || 'Not detected'}</dd></div>}
          {!structured && <div><dt>Total</dt><dd>{totalAmount ?? 'Not detected'}{totalUncertain && <span> — Uncertain</span>}</dd></div>}
        </dl>
      <div className="receipt-review-items">
        {items.map((item, index) => {
          const lineTotal = peso(item.line_total ?? item.observed_price);
          const unitPrice = peso(item.unit_price);
          const uncertainFields = structured ? item.uncertain_fields ?? [] : [];
          return (
            <div key={item.sequence} className="receipt-review-item" aria-label={`Item ${index + 1}`}>
              <strong>{item.item_name || 'Name not detected'}</strong>
              <div className="receipt-review-row">
                <span>Qty: {item.quantity ?? 'Not detected'} {item.unit ?? ''}</span>
                {structured && <span>{unitPrice ? `${unitPrice} each` : 'Unit price not detected'}</span>}
                <span>{lineTotal ?? 'Price not detected'}</span>
              </div>
              {uncertainFields.length > 0 && <div className="receipt-uncertain-list">
                {uncertainFields.map(field => <UncertainBadge key={field} label={`${FIELD_LABELS[field] ?? field} unclear — check the photo`} />)}
              </div>}
              {structured && item.possible_duplicate_of != null && <span className="receipt-field-warning">
                May repeat item {itemPosition(item.possible_duplicate_of) || item.possible_duplicate_of + 1} where two photos overlap. DTI will check.
              </span>}
              {!structured && (item.ocr_confidence == null || item.ocr_confidence <= 0.8 || !/[\p{L}]/u.test(item.item_name ?? '')) && <span className="receipt-field-warning">Uncertain — check the photo</span>}
            </div>
          );
        })}
      </div>
      {items.length === 0 && <p>No items detected.</p>}
      {structured && <dl className="receipt-summary receipt-amounts" aria-label="Receipt amounts">
        {(review.subtotal != null || review.subtotal_uncertain) && <div><dt>Subtotal</dt><dd>{peso(review.subtotal) ?? 'Not detected'}{review.subtotal_uncertain && <UncertainBadge />}</dd></div>}
        {(review.discounts ?? []).map((line, index) => <div key={`discount-${index}`}><dt>Discount</dt>
          <dd>{peso(line.amount) ? `−${peso(line.amount)}` : 'Amount not detected'}{line.description ? ` (${line.description})` : ''}{line.uncertain && <UncertainBadge />}</dd></div>)}
        {(review.adjustments ?? []).map((line, index) => <div key={`adjustment-${index}`}><dt>{ADJUSTMENT_LABELS[line.kind ?? ''] ?? 'Adjustment'}</dt>
          <dd>{peso(line.amount) ? `${line.direction === 'subtract' ? '−' : '+'}${peso(line.amount)}` : 'Amount not detected'}{line.uncertain && <UncertainBadge />}</dd></div>)}
        <div><dt>Total</dt><dd>{totalAmount ?? 'Not detected'}{totalUncertain && <UncertainBadge />}</dd></div>
      </dl>}
      {structured && review.reconciliation && <p className={`receipt-reconciliation receipt-reconciliation--${review.reconciliation.status}`}>
        {RECONCILIATION_MESSAGES[review.reconciliation.status] ?? RECONCILIATION_MESSAGES.unavailable}
      </p>}
      {showUncertaintyNotice && <div className="banner-warning"><AlertTriangle size={20} /><span>Some details couldn’t be read reliably. If your photos are clear and complete, you can submit them for DTI review.</span></div>}
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
