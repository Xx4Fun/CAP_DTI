import React from 'react';
import { isWrongStore, type ReceiptReviewData } from '../app/receiptReview';
import { AlertTriangle, Camera, Plus, RefreshCw, ZoomIn } from 'lucide-react';

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

const StoreCheck: React.FC<{ review: ReceiptReviewData }> = ({ review }) => {
  if (review.merchant?.status === 'matched' && review.merchant.uncertain !== true) return <span className="receipt-uncertain-badge receipt-store-check--ok">Matches selected store</span>;
  if (isWrongStore(review)) return <UncertainBadge label="Wrong store?" />;
  return <span className="receipt-uncertain-badge receipt-store-check--neutral">Store not confirmed</span>;
};

interface ReceiptReviewContentProps {
  review: ReceiptReviewData;
  evidenceUrls: Array<{ id: number; sequence: number; url: string | null }>;
  busy: boolean;
  readOnly: boolean;
  onPhotoLoaded: (id: number) => void;
  onPhotoError: (id: number, url: string) => void;
  onViewPhoto: (url: string, sequence: number) => void;
  onRetryPhotos: () => void;
  onRecapture: (action: { replace_sequence?: number; append?: boolean; restart?: boolean }) => void;
}

export const ReceiptReviewContent: React.FC<ReceiptReviewContentProps> = ({
  review, evidenceUrls, busy, readOnly, onPhotoLoaded, onPhotoError, onViewPhoto, onRetryPhotos, onRecapture,
}) => {
  const items = review.items ?? [];
  const structured = review.extraction_provider === 'gemini';
  const totalAmount = peso(review.total ?? review.detected_total);
  const totalUncertain = Boolean(review.total_uncertain) || review.warnings?.some(warning => warning.code === 'TOTAL_MISMATCH');
  const itemPosition = (sequence: number) => items.findIndex(item => item.sequence === sequence) + 1;
  const showUncertaintyNotice = review.merchant?.uncertain === true || review.merchant?.status !== 'matched' || (structured
    ? review.manual_review_required || items.some(item => (item.uncertain_fields?.length ?? 0) > 0)
    : review.manual_review_required || items.some(item => item.ocr_confidence == null || item.ocr_confidence <= 0.8));

  return <>
      <section className="receipt-review-section" aria-labelledby="original-receipt-heading">
        <h2 id="original-receipt-heading">Receipt photos</h2>
        <div className="receipt-evidence-grid">
          {evidenceUrls.map((asset) => <figure key={asset.id} className="receipt-evidence-card">
            {asset.url ? <img src={asset.url} alt={`Original receipt section ${asset.sequence + 1}`}
              onLoad={() => onPhotoLoaded(asset.id)}
              onError={() => onPhotoError(asset.id, asset.url!)} /> : <p>Section {asset.sequence + 1} could not be loaded.</p>}
            <figcaption>Section {asset.sequence + 1}</figcaption>
            <div className="receipt-photo-actions">
            {asset.url && <button type="button" className="btn-secondary" aria-label={`View full size: section ${asset.sequence + 1}`}
              onClick={() => onViewPhoto(asset.url!, asset.sequence)}><ZoomIn size={16} /> View full size</button>}
            {!readOnly && <button type="button" className="btn-secondary" disabled={busy} onClick={() => onRecapture({ replace_sequence: asset.sequence })}>
              <Camera size={16} /> Retake section {asset.sequence + 1}
            </button>}
            </div>
          </figure>)}
        </div>
        {evidenceUrls.length === 0 && <p>Original receipt photos are unavailable.</p>}
        {(!evidenceUrls.length || evidenceUrls.some(asset => !asset.url)) && <button type="button" className="btn-secondary" disabled={busy} onClick={onRetryPhotos}>Retry loading photos</button>}
        {!readOnly && <div className="receipt-evidence-actions">
          <button type="button" className="btn-secondary" disabled={busy || review.evidence.length >= 12} onClick={() => onRecapture({ append: true })}><Plus size={16} /> Add section</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => onRecapture({ restart: true })}><RefreshCw size={16} /> Restart receipt</button>
        </div>}
      </section>
      <section className="receipt-review-section" aria-labelledby="system-extraction-heading">
        <h2 id="system-extraction-heading">Details read from your receipt</h2>
        <dl className="receipt-summary">
          <div><dt>Merchant</dt><dd>{review.merchant?.display_name || 'Not detected'} <StoreCheck review={review} /></dd></div>
          <div><dt>Date</dt><dd>{review.transaction_date || 'Not detected'}</dd></div>
          {structured && <div><dt>Receipt no.</dt><dd>{review.receipt_number || 'Not detected'}</dd></div>}
          {!structured && <div><dt>Total</dt><dd>{totalAmount ?? 'Not detected'}{totalUncertain && <span> — Uncertain</span>}</dd></div>}
        </dl>
        {!readOnly && isWrongStore(review) && <p className="receipt-field-warning" role="alert">
          Receipt shows {review.merchant?.display_name}, but you selected {review.store?.store_name}. Change the selected store or retake the receipt before submitting.
        </p>}
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
      {showUncertaintyNotice && !isWrongStore(review) && <div className="banner-warning"><AlertTriangle size={20} /><span>{readOnly ? 'Some detected details are uncertain and require DTI review.' : 'Some details couldn’t be read reliably. If your photos are clear and complete, you can submit them for DTI review.'}</span></div>}
      </section>
    {review.results_available === false && <p role="status">Saved receipt results are unavailable for this older report.</p>}
  </>;
};
