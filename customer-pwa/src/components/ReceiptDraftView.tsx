import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient } from '../api/client';
import { deleteReceiptResumeToken, getReceiptResumeToken } from '../app/receiptResumeStore';
import { navigate } from '../app/routing';

interface ReceiptReviewItem {
  sequence: number;
  raw_text: string | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  observed_price: number;
  ocr_confidence: number | null;
}

interface ReceiptReviewData {
  report_reference: string;
  status: string;
  store: { id: number; store_name: string; address: string } | null;
  items: ReceiptReviewItem[];
  continuity: { status: string; continuity_score?: number; reasons?: string[] } | null;
  merchant: { status: string } | null;
  manual_review_required: boolean;
}

interface ReceiptProcessingData {
  report_reference: string;
  status: string;
  processing_status: string;
  message: string | null;
  ready_for_review: boolean;
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
        onStatus?.(data.status);
      } else {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/processing`, {
          headers: { 'X-Report-Resume-Token': token },
        });
        const data = response.data.data as ReceiptProcessingData;
        setProcessing(data);
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
  }, [mode, onStatus, reference]);

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

  useEffect(() => {
    if (mode !== 'processing' || !resumeToken || !processing || processing.ready_for_review) return;
    if (!['Processing receipt'].includes(processing.status)) return;
    const interval = window.setInterval(() => void load(resumeToken), 8000);
    return () => window.clearInterval(interval);
  }, [load, mode, processing, resumeToken]);

  const updateItem = (sequence: number, field: keyof ReceiptReviewItem, value: string) => {
    setItems((current) => current.map((item) => item.sequence === sequence ? {
      ...item,
      [field]: field === 'observed_price' || field === 'quantity'
        ? (value === '' ? null : Number(value))
        : value,
    } : item));
  };

  const submit = async () => {
    if (!resumeToken || !confirmed || items.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiClient.post(
        `/public/reports/${encodeURIComponent(reference)}/confirm-ocr`,
        {
          consumer_confirmed: true,
          confirmed_items: items.map((item) => ({
            sequence: item.sequence,
            item_name: item.item_name.trim(),
            quantity: item.quantity,
            unit: item.unit?.trim() || null,
            observed_price: Number(item.observed_price),
          })),
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
    const needsAttention = processing.status === 'Needs recapture' || processing.status === 'Processing failed';
    return (
      <section className="receipt-draft-page">
        {needsAttention ? <AlertTriangle size={36} aria-hidden="true" /> : <Clock3 size={36} aria-hidden="true" />}
        <p className="receipt-draft-eyebrow">Receipt {processing.report_reference}</p>
        <h1>{processing.status}</h1>
        <p>{processing.message || 'PRICE-Watch is preparing the receipt for your confirmation.'}</p>
        {processing.ready_for_review && (
          <button type="button" className="btn-primary" onClick={() => navigate({ name: 'receipt-review', reference })}>Review detected items</button>
        )}
        {needsAttention && (
          <button type="button" className="btn-primary" onClick={() => navigate({ name: 'reports' })}>Scan receipt again</button>
        )}
        {!processing.ready_for_review && !needsAttention && <p className="receipt-draft-muted">You may leave this page. This status also appears under Recent Reports.</p>}
        {resumeToken && <button type="button" className="btn-secondary" onClick={() => void load(resumeToken)}><RefreshCw size={17} /> Refresh status</button>}
      </section>
    );
  }

  if (!review) return null;

  return (
    <section className="receipt-draft-page receipt-review-page">
      <p className="receipt-draft-eyebrow">Ready for your confirmation</p>
      <h1>Check the detected receipt items</h1>
      <p>Correct anything the scanner read incorrectly. The report will not be sent to DTI until you confirm it.</p>
      <div className="receipt-review-store"><strong>{review.store?.store_name || 'Selected store unavailable'}</strong><span>{review.store?.address}</span></div>
      {(review.manual_review_required || review.merchant?.status !== 'matched') && (
        <div className="banner-warning"><AlertTriangle size={20} /><span>Some receipt details are uncertain. Check every item carefully before submitting.</span></div>
      )}
      <div className="receipt-review-items">
        {items.map((item, index) => (
          <fieldset key={item.sequence} className="receipt-review-item">
            <legend>Item {index + 1}</legend>
            <label>Item name<input aria-label={`Item ${index + 1} name`} value={item.item_name} onChange={(event) => updateItem(item.sequence, 'item_name', event.target.value)} required /></label>
            <div className="receipt-review-row">
              <label>Quantity<input aria-label={`Item ${index + 1} quantity`} type="number" min="0" step="0.001" value={item.quantity ?? ''} onChange={(event) => updateItem(item.sequence, 'quantity', event.target.value)} /></label>
              <label>Unit<input aria-label={`Item ${index + 1} unit`} value={item.unit ?? ''} onChange={(event) => updateItem(item.sequence, 'unit', event.target.value)} /></label>
              <label>Price<input aria-label={`Item ${index + 1} price`} type="number" min="0" step="0.01" value={item.observed_price} onChange={(event) => updateItem(item.sequence, 'observed_price', event.target.value)} required /></label>
            </div>
            {item.ocr_confidence !== null && item.ocr_confidence < 0.75 && <span className="receipt-field-warning">Check this item—the scan confidence was low.</span>}
          </fieldset>
        ))}
      </div>
      {items.length === 0 && <div className="banner-warning">No item prices were detected. Capture the receipt again.</div>}
      <label className="receipt-confirmation-check">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I confirm the items shown came from this receipt and the selected store.</span>
      </label>
      <div className="banner-info"><ShieldCheck size={20} /><span>DTI will still review the receipt evidence. Confirmation does not automatically establish overpricing or a violation.</span></div>
      {error && <p className="receipt-form-error" role="alert">{error}</p>}
      <button type="button" className="btn-primary" disabled={!confirmed || submitting || items.length === 0 || items.some((item) => !item.item_name.trim() || item.observed_price === null)} onClick={() => void submit()}>
        {submitting ? 'Submitting report…' : 'Submit report to DTI'}
      </button>
    </section>
  );
};

export default ReceiptDraftView;
