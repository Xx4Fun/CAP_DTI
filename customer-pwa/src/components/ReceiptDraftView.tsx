import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Clock3, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { apiClient, type CaptureSessionResponse } from '../api/client';
import { deleteReceiptResumeToken, getReceiptResumeToken } from '../app/receiptResumeStore';
import { navigate } from '../app/routing';
import { GuidedReceiptCapture } from './GuidedReceiptCapture';
import { ReceiptPhotoViewer } from './ReceiptPhotoViewer';
import { ReceiptReviewContent } from './ReceiptReviewContent';
import { isWrongStore, type ReceiptReviewData, type ReceiptEvidence } from '../app/receiptReview';
import { ReceiptStoreSelector } from './ReceiptStoreSelector';
import { getReportTrackingToken } from '../app/reportTrackingStore';
import { addRecentStore } from '../app/recentStores';
import { useBackLayer } from '../hooks/useBackLayer';
// Reuses the back-control styling that ReportDetail already imports from this stylesheet.
import './TrackReport.css';

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
  mode: 'processing' | 'review' | 'submitted';
  onSubmitted?: (result: ReceiptConfirmationResult) => void;
  onStatus?: (status: string) => void;
  onBack?: () => void;
  onStoreChanged?: (storeName: string) => void;
  backLabel?: string;
}

export const ReceiptDraftView: React.FC<ReceiptDraftViewProps> = ({ reference, mode, onSubmitted, onStatus, onBack, onStoreChanged, backLabel = 'Back to My Reports' }) => {
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<ReceiptProcessingData | null>(null);
  const [review, setReview] = useState<ReceiptReviewData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState<ReceiptConfirmationResult | null>(null);
  const [recaptureSession, setRecaptureSession] = useState<CaptureSessionResponse | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState<Array<{ id: number; sequence: number; url: string | null }>>([]);
  const [decodedIds, setDecodedIds] = useState<number[]>([]);
  const [viewer, setViewer] = useState<{ url: string; sequence: number } | null>(null);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [choosingStore, setChoosingStore] = useState(false);
  const credentialHeaderRef = React.useRef('X-Report-Resume-Token');
  useBackLayer('receipt-store-selection', choosingStore, () => { if (!submitting) setChoosingStore(false); });
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

  const loadEvidence = useCallback(async (assets: ReceiptEvidence[], token: string, signal: AbortSignal) => {
    const cache = evidenceUrlsRef.current;
    for (const [id, url] of cache) {
      if (!assets.some(asset => asset.id === id)) { URL.revokeObjectURL(url); cache.delete(id); }
    }
    const results = await Promise.allSettled(assets.map(async (asset) => {
      if (cache.has(asset.id)) return { ...asset, url: cache.get(asset.id)! };
      const evidence = await apiClient.get(
        `/public/reports/${encodeURIComponent(reference)}/evidence-assets/${asset.id}`,
        { headers: { [credentialHeaderRef.current]: token }, responseType: 'blob', signal },
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
      if (mode !== 'processing') {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/review`, {
          headers: { [credentialHeaderRef.current]: token }, signal: controller.signal,
        });
        const data = response.data.data as ReceiptReviewData;
        if (controller.signal.aborted) return;
        const attempt = `${data.store?.id ?? ''}:${data.attempt_number ?? ''}:${(data.evidence ?? []).map(asset => asset.id).join(',')}`;
        if (attemptRef.current !== attempt) {
          attemptRef.current = attempt;
          setConfirmed(false);
          setDecodedIds([]);
        }
        setReview(data);
        await loadEvidence(data.evidence ?? [], token, controller.signal);
        if (!controller.signal.aborted) onStatusRef.current?.(data.status);
      } else {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/processing`, {
          headers: { [credentialHeaderRef.current]: token }, signal: controller.signal,
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
    const readCredential = async () => {
      credentialHeaderRef.current = mode === 'submitted' ? 'X-Tracking-Token' : 'X-Report-Resume-Token';
      return mode === 'submitted' ? getReportTrackingToken(reference) : getReceiptResumeToken(reference);
    };
    void readCredential().then((token) => {
      if (!active) return;
      setResumeToken(token);
      if (!token) {
        setError('This device no longer has the secure report credential. Use Track Report with your report reference and recovery token.');
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
  }, [load, mode, reference]);

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

  const readOnly = mode === 'submitted' || review?.read_only === true;
  const canSubmit = !readOnly && Boolean(review) && review?.can_submit !== false && !isWrongStore(review!);

  const changeStore = async (storeId: number) => {
    if (!resumeToken || !review || readOnly || busy || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post(`/public/reports/${encodeURIComponent(reference)}/store`, {
        store_id: storeId, expected_store_id: review.store?.id ?? null, expected_attempt_number: review.attempt_number ?? 1,
      }, { headers: { [credentialHeaderRef.current]: resumeToken }, signal: controller.signal });
      if (controller.signal.aborted) return;
      const data = response.data.data as ReceiptReviewData;
      setReview(data);
      setConfirmed(false);
      setChoosingStore(false);
      addRecentStore(storeId);
      onStoreChanged?.(data.store?.store_name ?? 'Unspecified Store');
    } catch (caught) {
      if (!controller.signal.aborted) reportError(caught, 'The store was not changed. Your receipt is still available; try again.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || !resumeToken || !confirmed || !evidenceComplete || busy || cooldownUntil.current > Date.now()) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/confirm-ocr`,
        {
          consumer_confirmed: true,
        },
        { headers: { [credentialHeaderRef.current]: resumeToken } },
      );
      const result = response.data.data as ReceiptConfirmationResult;
      // The server has revoked this credential; local cleanup must not hide an accepted report.
      await deleteReceiptResumeToken(reference).catch(() => undefined);
      setSubmitted(result);
      onSubmitted?.(result);
    } catch (caught: unknown) {
      reportError(caught, 'The report was not submitted. Your receipt is still available; try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startRecapture = async (action: { replace_sequence?: number; append?: boolean; restart?: boolean } = {}) => {
    if (readOnly || !resumeToken || busy || cooldownUntil.current > Date.now()) return;
    if (action.restart && !window.confirm('Restart this receipt capture? Your previous uploaded evidence will remain in the report history.')) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/recapture-session`,
        action,
        { headers: { [credentialHeaderRef.current]: resumeToken } },
      );
      setRecaptureSession(response.data.data as CaptureSessionResponse);
    } catch (caught: unknown) {
      reportError(caught, 'A new receipt capture could not be started. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const retryProcessing = async () => {
    if (readOnly || !resumeToken || busy || cooldownUntil.current > Date.now()) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/retry-processing`,
        {},
        { headers: { [credentialHeaderRef.current]: resumeToken } },
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

  // Icon-only: every branch below renders the page h1 next to it, so a labelled control would
  // introduce a second heading on the same row.
  const backButton = onBack ? (
    <button type="button" className="track-report-back" aria-label={backLabel} onClick={onBack}>
      <ArrowLeft size={21} aria-hidden="true" />
    </button>
  ) : null;

  // Back control, status icon and title share the card's first row, so the card opens on content
  // instead of three stacked rows of chrome.
  const pageHead = (icon: React.ReactNode, title: string) => (
    <div className="receipt-draft-head">{backButton}{icon}<h1>{title}</h1></div>
  );

  const layout = (card: React.ReactNode) => (
    <div className="receipt-draft-layout">{card}</div>
  );

  if (submitted) {
    return layout(
      <section className="receipt-draft-page receipt-draft-success" aria-live="polite">
        {pageHead(<CheckCircle2 size={36} aria-hidden="true" />, 'Report submitted to DTI')}
        <p>Your receipt and system results are available for DTI review. Submission does not establish a violation.</p>
        <strong>{submitted.report_reference}</strong>
        <button type="button" className="btn-primary" onClick={() => navigate({ name: 'receipt-view', reference }, {
          replace: true, ...(fromReportList() ? { state: { fromReportList: true } } : {}),
        })}>View receipt and results</button>
      </section>
    );
  }

  if (loading) {
    return layout(
      <div className="receipt-draft-loading" role="status">{backButton}<LoaderCircle className="spin" size={22} /> Loading receipt status…</div>
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
    return layout(
      <section className="receipt-draft-page">
        {pageHead(<AlertTriangle size={34} aria-hidden="true" />, 'Receipt status unavailable')}
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
    return layout(
      <section className="receipt-draft-page">
        {pageHead(needsAttention ? <AlertTriangle size={36} aria-hidden="true" /> : <Clock3 size={36} aria-hidden="true" />, processing.status)}
        <p>{processing.recapture_reason?.message || processing.failure_reason?.message || processing.message || 'PRICE-Watch is preparing the receipt for your confirmation.'}</p>
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
        {failed && !retryable && !processing.failure_reason?.message && <div className="banner-warning">This receipt cannot be processed again. Capture the receipt again from the start.</div>}
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

  if (choosingStore && !readOnly) return layout(<>
    <ReceiptStoreSelector busy={busy} onCancel={() => setChoosingStore(false)} onSelect={(store) => void changeStore(store.id)} />
    {errorNotice}
  </>);

  return layout(
    <section className="receipt-draft-page receipt-review-page">
      {pageHead(null, readOnly ? 'Receipt and results' : 'Review your receipt')}
      <p>{readOnly ? 'Your submitted receipt and saved system results. These results do not establish a violation.' : 'Check that every section is clear and complete.'}</p>
      {readOnly && <p><strong>{reference}</strong> · {review.status}{review.submitted_at && <> · Submitted {new Date(review.submitted_at).toLocaleString()}</>}</p>}
      <div className="receipt-review-store"><span>Selected store</span><strong>{review.store?.store_name || 'Unavailable'}</strong><span>{review.store?.address}</span></div>
      {!readOnly && review.can_change_store !== false && <button type="button" className="btn-secondary" disabled={busy} onClick={() => setChoosingStore(true)}>Change store</button>}
      <ReceiptReviewContent review={review} evidenceUrls={evidenceUrls} busy={busy} readOnly={readOnly}
        onPhotoLoaded={(id) => setDecodedIds(ids => ids.includes(id) ? ids : [...ids, id])}
        onPhotoError={(id, url) => {
          URL.revokeObjectURL(url);
          evidenceUrlsRef.current.delete(id);
          setDecodedIds(ids => ids.filter(value => value !== id));
          setConfirmed(false);
          setEvidenceUrls(assets => assets.map(entry => entry.id === id ? { ...entry, url: null } : entry));
          setError('A receipt photo could not be displayed. Retry loading photos.');
        }}
        onViewPhoto={(url, sequence) => setViewer({ url, sequence })}
        onRetryPhotos={() => { if (resumeToken) void load(resumeToken); }}
        onRecapture={(action) => void startRecapture(action)} />
      {!readOnly && <label className="receipt-confirmation-check">
        <input type="checkbox" checked={confirmed} disabled={!canSubmit || !evidenceComplete || busy} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I reviewed the receipt photos and want to submit this report.</span>
      </label>}
      {errorNotice}
      {error && !evidenceUrls.some(asset => !asset.url) && <button type="button" className="btn-secondary" disabled={busy} onClick={() => resumeToken && void load(resumeToken)}>Refresh receipt</button>}
      {!readOnly && <button type="button" className="btn-primary" disabled={!canSubmit || !confirmed || !evidenceComplete || busy} onClick={() => void submit()}>
        {submitting ? 'Submitting report…' : 'Submit report to DTI'}
      </button>}
      <ReceiptPhotoViewer photo={viewer} onClose={() => setViewer(null)} />
    </section>
  );
};

export default ReceiptDraftView;
