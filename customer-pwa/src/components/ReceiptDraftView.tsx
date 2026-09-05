import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, LoaderCircle, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
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
  observed_price: number;
  ocr_confidence: number | null;
}

type ReceiptEvidence = { id: number; sequence: number; mime_type: string; size_bytes: number };

interface ReceiptReviewData {
  report_reference: string;
  status: string;
  store: { id: number; store_name: string; address: string } | null;
  items: ReceiptReviewItem[];
  continuity: { status: string; continuity_score?: number; reasons?: string[] } | null;
  merchant: { status: string; observed?: string[] } | null;
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
  const [evidenceUrls, setEvidenceUrls] = useState<Array<{ id: number; sequence: number; url: string }>>([]);
  const evidenceUrlsRef = React.useRef<string[]>([]);

  const loadEvidence = useCallback(async (assets: ReceiptEvidence[], token: string) => {
    evidenceUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const results = await Promise.allSettled(assets.map(async (asset) => {
      const evidence = await apiClient.get(
        `/public/reports/${encodeURIComponent(reference)}/evidence-assets/${asset.id}`,
        { headers: { 'X-Report-Resume-Token': token }, responseType: 'blob' },
      );
      return { id: asset.id, sequence: asset.sequence, url: URL.createObjectURL(evidence.data as Blob) };
    }));
    const originals = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    evidenceUrlsRef.current = originals.map((asset) => asset.url);
    setEvidenceUrls(originals);
    if (originals.length !== assets.length) setError('One or more original receipt images are temporarily unavailable.');
  }, [reference]);

  const load = useCallback(async (token: string) => {
    setError('');
    try {
      if (mode === 'review') {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/review`, {
          headers: { 'X-Report-Resume-Token': token },
        });
        const data = response.data.data as ReceiptReviewData;
        setReview(data);
        setItems(data.items);
        await loadEvidence(data.evidence ?? [], token);
        onStatus?.(data.status);
      } else {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/processing`, {
          headers: { 'X-Report-Resume-Token': token },
        });
        const data = response.data.data as ReceiptProcessingData;
        setProcessing(data);
        if (['Needs recapture', 'Processing failed'].includes(data.status)) {
          await loadEvidence(data.evidence ?? [], token);
        }
        onStatus?.(data.status);
      }
    } catch (caught: unknown) {
      const message = caught && typeof caught === 'object' && 'response' in caught
        ? (caught as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || 'Unable to load this receipt draft. Use Track Report with your recovery token.');
    } finally {
      setLoading(false);
    }
  }, [loadEvidence, mode, onStatus, reference]);

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
    return () => { active = false; };
  }, [load, reference]);

  useEffect(() => () => {
    evidenceUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (mode !== 'processing' || !resumeToken || !processing || processing.ready_for_review) return;
    if (!['Processing receipt'].includes(processing.status)) return;
    const interval = window.setInterval(() => void load(resumeToken), 8000);
    return () => window.clearInterval(interval);
  }, [load, mode, processing, resumeToken]);

  const submit = async () => {
    if (!resumeToken || !confirmed) return;
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
      const message = caught && typeof caught === 'object' && 'response' in caught
        ? (caught as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || 'The report was not submitted. Review the items and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startRecapture = async (action: { replace_sequence?: number; append?: boolean; restart?: boolean } = {}) => {
    if (!resumeToken) return;
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
      const message = caught && typeof caught === 'object' && 'response' in caught
        ? (caught as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || 'A new receipt capture could not be started. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const retryProcessing = async () => {
    if (!resumeToken) return;
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
      const message = caught && typeof caught === 'object' && 'response' in caught
        ? (caught as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || 'Receipt processing could not be retried. Try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="receipt-draft-page receipt-draft-success" aria-live="polite">
        <CheckCircle2 size={42} aria-hidden="true" />
        <h1>Report submitted to DTI</h1>
        <p>Your confirmed receipt items are now available to authorized DTI evaluators. This does not automatically confirm a violation.</p>
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
      onDraftCreated={() => { onStatus?.('Processing receipt'); navigate({ name: 'receipt-processing', reference }); }}
      onCheckStatus={() => navigate({ name: 'receipt-processing', reference })}
    />;
  }

  if (error && !review && !processing) {
    return (
      <section className="receipt-draft-page">
        <AlertTriangle size={34} aria-hidden="true" />
        <h1>Receipt status unavailable</h1>
        <p role="alert">{error}</p>
        {resumeToken && <button type="button" className="btn-secondary" onClick={() => void load(resumeToken)}><RefreshCw size={17} /> Try again</button>}
      </section>
    );
  }

  if (mode === 'processing' && processing) {
    const needsRecapture = processing.status === 'Needs recapture';
    const failed = processing.status === 'Processing failed';
    const needsAttention = needsRecapture || failed;
    return (
      <section className="receipt-draft-page">
        {needsAttention ? <AlertTriangle size={36} aria-hidden="true" /> : <Clock3 size={36} aria-hidden="true" />}
        <p className="receipt-draft-eyebrow">Receipt {processing.report_reference}</p>
        <h1>{processing.status}</h1>
        <p>{processing.recapture_reason?.message || processing.message || 'PRICE-Watch is preparing the receipt for your confirmation.'}</p>
        {processing.ready_for_review && (
          <button type="button" className="btn-primary" onClick={() => navigate({ name: 'receipt-review', reference })}>Review detected items</button>
        )}
        {needsRecapture && evidenceUrls.length > 0 && <section className="receipt-review-section" aria-labelledby="recapture-evidence-heading">
          <h2 id="recapture-evidence-heading">Original captured receipt evidence</h2>
          <div className="receipt-evidence-grid">
            {evidenceUrls.map((asset) => <figure key={asset.id} className="receipt-evidence-card">
              <img src={asset.url} alt={`Original receipt section ${asset.sequence + 1}`} />
              <figcaption>Section {asset.sequence + 1}</figcaption>
              <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void startRecapture({ replace_sequence: asset.sequence })}>
                <Camera size={16} /> Retake section {asset.sequence + 1}
              </button>
            </figure>)}
          </div>
          <div className="receipt-evidence-actions">
            <button type="button" className="btn-secondary" disabled={submitting || evidenceUrls.length >= 12} onClick={() => void startRecapture({ append: true })}><Plus size={16} /> Add another section</button>
            <button type="button" className="btn-primary" disabled={submitting} onClick={() => void startRecapture({ restart: true })}><RefreshCw size={16} /> Retake entire receipt</button>
          </div>
        </section>}
        {needsRecapture && processing.can_recapture && evidenceUrls.length === 0 && (
          <button type="button" className="btn-primary" disabled={submitting} onClick={() => void startRecapture({ restart: true })}>
            {submitting ? 'Starting camera…' : 'Scan receipt again'}
          </button>
        )}
        {failed && <div className="banner-warning">Processing failed on the server. Your receipt is not marked as a bad capture; refresh to retry the status check.</div>}
        {failed && <button type="button" className="btn-primary" disabled={submitting} onClick={() => void retryProcessing()}>
          {submitting ? 'Retrying processing…' : 'Retry processing'}
        </button>}
        {!processing.ready_for_review && !needsAttention && <p className="receipt-draft-muted">You may leave this page. This status also appears under Recent Reports.</p>}
        {resumeToken && <button type="button" className="btn-secondary" onClick={() => void load(resumeToken)}><RefreshCw size={17} /> Refresh status</button>}
      </section>
    );
  }

  if (!review) return null;

  return (
    <section className="receipt-draft-page receipt-review-page">
      <p className="receipt-draft-eyebrow">Ready for your confirmation</p>
      <h1>Review receipt evidence and extraction</h1>
      <p>The original images and system-extracted values are read-only. Retake evidence if an image is poor; do not submit OCR values you cannot support from the receipt.</p>
      <div className="receipt-review-store"><strong>{review.store?.store_name || 'Selected store unavailable'}</strong><span>{review.store?.address}</span></div>
      <section className="receipt-review-section" aria-labelledby="original-receipt-heading">
        <h2 id="original-receipt-heading">Original captured receipt evidence</h2>
        <div className="receipt-evidence-grid">
          {evidenceUrls.map((asset) => <figure key={asset.id} className="receipt-evidence-card">
            <img src={asset.url} alt={`Original receipt section ${asset.sequence + 1}`} />
            <figcaption>Section {asset.sequence + 1}</figcaption>
            <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void startRecapture({ replace_sequence: asset.sequence })}>
              <Camera size={16} /> Retake section {asset.sequence + 1}
            </button>
          </figure>)}
        </div>
        {evidenceUrls.length === 0 && <div className="banner-warning">Original receipt evidence is unavailable. Do not submit this report.</div>}
        <div className="receipt-evidence-actions">
          <button type="button" className="btn-secondary" disabled={submitting || evidenceUrls.length >= 12} onClick={() => void startRecapture({ append: true })}><Plus size={16} /> Add another section</button>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={() => void startRecapture({ restart: true })}><RefreshCw size={16} /> Retake entire receipt</button>
        </div>
      </section>
      {(review.manual_review_required || review.merchant?.status !== 'matched') && <div className="banner-warning"><AlertTriangle size={20} /><span>The images are reviewable, but some OCR results are uncertain. DTI will verify them against the originals.</span></div>}
      {review.warnings?.map((warning) => <div key={warning.code} className="receipt-field-warning">{warning.message}</div>)}
      <section className="receipt-review-section" aria-labelledby="system-extraction-heading">
        <h2 id="system-extraction-heading">Raw OCR and system-extracted information</h2>
      <div className="receipt-review-store">
        <strong>Merchant OCR: {review.merchant?.observed?.join(' / ') || 'Not detected'}</strong>
        <span>Detected total: {review.detected_total !== null && review.detected_total !== undefined ? `₱${Number(review.detected_total).toFixed(2)}` : 'Not detected'}</span>
      </div>
      <div className="receipt-review-items">
        {items.map((item, index) => (
          <fieldset key={item.sequence} className="receipt-review-item">
            <legend>Item {index + 1}</legend>
            <strong>{item.item_name}</strong>
            <div className="receipt-review-row">
              {(item.quantity !== null || item.unit) && <span>{item.quantity ?? ''} {item.unit ?? ''}</span>}
              <span>₱{Number(item.observed_price).toFixed(2)}</span>
            </div>
            {item.ocr_confidence !== null && item.ocr_confidence < 0.75 && <span className="receipt-field-warning">Check this item—the scan confidence was low.</span>}
          </fieldset>
        ))}
      </div>
      {items.length === 0 && <div className="banner-warning">No item lines were extracted. If the original images are clear and complete, you may submit them for DTI review.</div>}
      <details className="receipt-raw-ocr"><summary>View raw OCR text</summary><pre>{review.lines?.length ? review.lines.join('\n') : 'No OCR text was extracted.'}</pre></details>
      </section>
      <label className="receipt-confirmation-check">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I reviewed the original receipt evidence and system extraction and want to submit them unchanged.</span>
      </label>
      <div className="banner-info"><ShieldCheck size={20} /><span>DTI will still review the receipt evidence. Confirmation does not automatically establish overpricing or a violation.</span></div>
      {error && <p className="receipt-form-error" role="alert">{error}</p>}
      <button type="button" className="btn-primary" disabled={!confirmed || submitting || evidenceUrls.length === 0} onClick={() => void submit()}>
        {submitting ? 'Submitting report…' : 'Submit report to DTI'}
      </button>
    </section>
  );
};

export default ReceiptDraftView;
