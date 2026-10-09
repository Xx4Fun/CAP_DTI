import { useMemo, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, Eye, X } from 'lucide-react'
import { DtiMonitoringSheet } from './DtiMonitoringSheet'
import type { Bulletin, RoutineRecordView, VisitDraft } from '../types'

const steps = ['Choose Store', 'Record Prices', 'Review & Sign']

// The submitted visit, shown in the visit form layout. Nothing here writes to a draft or the vault.
export function ReadOnlyVisit({ record, onClose }: { record: RoutineRecordView; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)

  // Rows come from the submitted items, not today's catalogue, so replaced commodities still show.
  const bulletins = useMemo<Bulletin[]>(() => record.items.map((item) => ({
    id: item.srp_id,
    commodity_name: item.commodity_name ?? `Item #${item.srp_id}`,
    unit: item.unit,
    category: item.category,
    regulatory_classification: item.regulatory_classification,
    baseline_price: item.reference_value ?? 0,
    effective_date: item.reference_effective_date,
    source_reference: item.reference_source,
  })), [record.items])

  // The previous price captured at submission, not today's, so the second basis reads as it did on the day.
  const previousPrices = useMemo(() => new Map<number, number | null>(
    record.items.map((item) => [item.srp_id, item.previous_price === null ? null : Number(item.previous_price)]),
  ), [record.items])

  // Display-only draft: never synced or persisted. Legacy visits have no reference version, kept as ''.
  const draft = useMemo<VisitDraft>(() => ({
    client_uuid: record.client_uuid,
    store_id: record.store.id,
    offline_lease_id: '',
    started_at: record.started_at,
    finalized_at: record.finalized_at,
    items: record.items.map((item) => ({
      srp_id: item.srp_id,
      recorded_price: Number(item.recorded_price),
      reference_snapshot: {
        status: item.reference_status, type: item.reference_type, source_id: item.reference_source_id,
        value: item.reference_value === null ? null : Number(item.reference_value), label: item.reference_label ?? '',
        source_reference: item.reference_source, effective_date: item.reference_effective_date,
        reference_version: item.reference_version ?? '',
      },
    })),
    representative: { name: record.representative.name, title: record.representative.title ?? '' },
    signatures: { officer_png_base64: '', representative_png_base64: '' },
    location: record.location,
    sync_source: 'offline_queue',
    client_version: '',
  }), [record])

  const finalized = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.finalized_at))
  const accuracy = Number(record.location.accuracy_meters)

  return (
    <div className="visit-page read-only-visit">
      <div className="visit-top-bar">
        <div className="visit-top-left">
          <button type="button" className="visit-back-btn" aria-label="Close view-only visit" onClick={onClose}>
            <X size={16} />
            <span>Close</span>
          </button>
          <div className="visit-top-store-title">
            <strong title={record.store.store_name}>{record.store.store_name}</strong>
          </div>
        </div>
        <div className="visit-top-actions">
          <span className="network-chip read-only-chip"><Eye size={14} />View only</span>
        </div>
      </div>

      <ol className="stepper">
        {steps.map((label, index) => (
          <li key={label} className={index === step ? 'current' : index < step ? 'done' : ''}>
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>

      <section className="visit-workspace">
        {step === 1 && (
          <div className="step-content dti-step-content">
            <DtiMonitoringSheet
              readOnly
              store={record.store}
              draft={draft}
              bulletins={bulletins}
              regulatoryPrices={[]}
              monitoringReferences={[]}
              previousPrices={previousPrices}
              onUpdatePrice={() => {}}
              onPrevious={onClose}
              onProceedToReview={() => setStep(2)}
            />
          </div>
        )}

        {step === 2 && (
          <div className="step-content signatures-step-content">
            <h2>Store Representative & Dual Signatures</h2>
            <p>Submitted by {record.officer.name || 'a field officer'} · {finalized}</p>
            <div className="representative-fields">
              <label>
                Store representative name
                <input value={record.representative.name} readOnly aria-readonly />
              </label>
              <label>
                Position / Title (optional)
                <input value={record.representative.title ?? ''} readOnly aria-readonly />
              </label>
            </div>

            <div className="signature-grid">
              <SignatureImage label="Store representative signature" src={record.signature_images.representative_png_base64} />
              <SignatureImage label="DTI field monitoring officer signature" src={record.signature_images.officer_png_base64} />
            </div>

            <div className="final-checks">
              <div className={record.items.length > 0 ? 'okay' : ''}>
                {record.items.length > 0 ? <CheckCircle2 /> : <span className="open-check" />}
                <span>{record.items.length} commodity line{record.items.length === 1 ? '' : 's'} recorded</span>
              </div>
              <div className={accuracy <= 100 ? 'okay' : ''}>
                {accuracy <= 100 ? <CheckCircle2 /> : <span className="open-check" />}
                <span>GPS Location locked ({Number(record.location.latitude).toFixed(4)}, {Number(record.location.longitude).toFixed(4)} · ±{Math.round(accuracy)}m)</span>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="dti-floating-bottom-bar">
            <div className="dti-floating-bottom-bar-inner dti-signatures-bar-inner">
              <button type="button" className="secondary-button bottom-prev-btn" aria-label="Back to Record Prices" onClick={() => setStep(1)}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button type="button" className="primary-button proceed-review-btn" onClick={onClose}>
                <span>Close</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function SignatureImage({ label, src }: { label: string; src: string | null }) {
  return (
    <figure className="signature-field read-only-signature">
      <figcaption className="signature-label">{label}</figcaption>
      {src ? <img src={src} alt={label} /> : <span className="read-only-signature-missing">Signature unavailable</span>}
    </figure>
  )
}
