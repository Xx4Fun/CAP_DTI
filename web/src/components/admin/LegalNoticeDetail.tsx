import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, BellRing, CalendarClock, FileText, Paperclip, PenLine, UserRound } from 'lucide-react'
import type { LegalNoticeOutcome, LegalNoticeRecord } from '../../types/admin'
import { COMPARISONS, DELIVERY_METHODS, humanize, overReference, snapshotProducts } from './legalNotice'
import type { CitedProduct, DeliveryState, IssueOutcome, OfflineResponse } from './legalNotice'

const RESPONSE_REASONS: Record<string, string> = {
  WHOLESALE_HIKE: 'Distributor or manufacturer wholesale price increase',
  FREIGHT_SURCHARGE: 'Logistics or inter-island freight surcharge',
  ENCODING_ERROR: 'POS or shelf tag clerical error',
  PACKAGING_DISCREPANCY: 'Grammage or packaging variant mismatch',
  FORCE_MAJEURE: 'Supply chain interruption',
}
const OUTCOME_LABELS: Record<LegalNoticeOutcome, string> = {
  explanation_accepted: 'Explanation accepted', no_violation: 'No violation found', violation_confirmed: 'Violation confirmed',
  partially_confirmed: 'Partly confirmed', escalated_to_sco: 'Escalated to a Show Cause Order', withdrawn: 'Withdrawn by DTI',
}
const STATUS_CHIPS: Record<string, string> = { draft: 'muted', issued: 'neutral', response_received: 'compliant', closed: 'muted', cancelled: 'muted' }

/** Current local time in the format a datetime-local input expects. */
const localNow = () => { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16) }
const peso = (value: number) => `₱${value.toFixed(2)}`
export const Fact = ({ label, value }: { label: string; value?: string | null }) => <div><span>{label}</span><strong>{value || 'Not recorded'}</strong></div>
export const StatusChip = ({ notice }: { notice: Pick<LegalNoticeRecord, 'status' | 'overdue'> }) => <span className={`monitor-observation ${notice.overdue ? 'attention' : STATUS_CHIPS[notice.status] ?? 'neutral'}`}>{notice.overdue ? 'Overdue' : humanize(notice.status)}</span>

/** The cited products with the price each was compared against. */
function CitedProducts({ items }: { items: CitedProduct[] }) {
  return <div className="legal-table-wrap"><table className="admin-data-table legal-evidence-table">
    <thead><tr><th>Product</th><th>Observed</th><th>Reference</th><th>Difference</th><th>Comparison</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.key}>
      <td><strong>{item.name}</strong></td>
      <td>{peso(item.observed)}</td>
      <td>{peso(item.reference)}<small>{item.label || 'Reference label not recorded'}</small></td>
      <td>{overReference(item.observed, item.reference)}</td>
      <td><span className="monitor-observation attention">{COMPARISONS[item.type ?? ''] ?? 'Above reference'}</span></td>
    </tr>)}</tbody>
  </table></div>
}

function IssueResult({ result, onRecordDelivery }: { result: IssueOutcome; onRecordDelivery?: () => void }) {
  return <div className="legal-issue-result" role="status">
    <strong>Notice issued. How it reaches the vendor:</strong>
    <ul>
      <li>{result.portal ? 'Visible in the linked vendor’s portal. The response period starts when they first open the official document.' : 'No active vendor account is linked, so it is not in any portal.'}</li>
      <li>No email is sent; delivery is through the portal.</li>
    </ul>
    {onRecordDelivery && <button type="button" className="admin-button secondary" onClick={onRecordDelivery}>Next: record when the vendor received it</button>}
  </div>
}

/** One issued, answered, closed or cancelled notice, as its own page. */
export function LegalNoticeDetail({ notice, busy, issueResult, visitLink, onBack, onOpenDocument, onOpenAttachment, onRecordDelivery, onRecordOffline, onEscalate, onRemind, onClose, onCancel }: {
  notice: LegalNoticeRecord; busy: boolean; issueResult: IssueOutcome | null; visitLink: ReactNode
  onBack: () => void; onOpenDocument: () => void; onOpenAttachment: (attachmentId: number) => void
  onRecordDelivery: (state: DeliveryState, deliveredAt: string) => void; onRecordOffline: (response: OfflineResponse) => void
  onEscalate: () => void; onRemind: () => void; onClose: () => void; onCancel: () => void
}) {
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('received')
  const [deliveredAt, setDeliveredAt] = useState('')
  const [offline, setOffline] = useState({ channel: 'email' as 'email' | 'paper', received_at: '', response_text: '', evidence: null as File | null })
  const deliveryField = useRef<HTMLSelectElement>(null)
  const portal = notice.intended_delivery_method === 'portal'
  const delivered = ['received', 'refused'].includes(notice.delivery_state)
  const open = !['closed', 'cancelled'].includes(notice.status)
  const bases = notice.draft_payload.legal_bases ?? []
  const responseFiles = notice.attachments?.filter((attachment) => ['vendor_response', 'offline_response'].includes(attachment.kind)) ?? []

  return <article className="legal-page">
    <header className="visit-review-topbar">
      <div className="visit-review-title">
        <button type="button" className="visit-review-back" onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>Back to Issued &amp; Responses</button>
        <h2 tabIndex={-1}>{notice.control_number || `Notice #${notice.id}`}</h2>
        <span className="legal-page-type">{notice.notice_type === 'LOI' ? 'Letter of Inquiry' : 'Show Cause Order'}</span>
        <StatusChip notice={notice}/>
      </div>
      <div className="legal-page-actions"><button type="button" className="admin-button secondary" onClick={onOpenDocument}><FileText size={17}/>Open document</button></div>
    </header>

    <div className="visit-review-layout">
      <div className="visit-review-main">
        {issueResult?.id === notice.id && <IssueResult result={issueResult} onRecordDelivery={portal ? undefined : () => deliveryField.current?.focus()}/>}
        {notice.legacy && <div className="legal-policy-lock"><strong>Legacy notice · offline handling</strong><span>Issued before deadline rules were recorded. It is not shown in the vendor portal; record delivery and the response on paper, then close or cancel it here.</span></div>}
        {(notice.outcome || notice.outcome_reason) && <div className="legal-outcome" role="status"><strong>{notice.outcome ? OUTCOME_LABELS[notice.outcome] : 'Withdrawn'}</strong>{notice.outcome_reason && <span>{notice.outcome_reason}</span>}</div>}
        {notice.status === 'issued' && portal && !delivered && <p className="legal-neutral-note">Waiting for the vendor to open it in the portal. Their first open is the receipt and starts the response period; staff cannot record it.</p>}

        <section className="legal-card" aria-labelledby="legal-cited-title">
          <h3 id="legal-cited-title">Cited products</h3>
          {notice.source_snapshot.items.length ? <CitedProducts items={snapshotProducts(notice)}/> : <p className="legal-placeholder">This notice records no cited products.</p>}
        </section>

        {notice.response_received_at && <section className="legal-vendor-response" aria-labelledby="legal-vendor-response-title">
          <h3 id="legal-vendor-response-title">Vendor response</h3>
          <div className="legal-facts"><Fact label="Received" value={new Date(notice.response_received_at).toLocaleString()}/><Fact label="Channel" value={notice.response_channel === 'portal' ? 'Vendor Portal (sworn)' : notice.response_channel ? `${notice.response_channel === 'email' ? 'Email' : 'Paper'} · recorded by DTI` : null}/><Fact label="Stated reason" value={notice.response_reason_category ? RESPONSE_REASONS[notice.response_reason_category] ?? notice.response_reason_category : null}/><Fact label="Certified true and correct" value={notice.response_certified_at ? new Date(notice.response_certified_at).toLocaleString() : null}/></div>
          {notice.response_text && <p className="legal-response-text">{notice.response_text}</p>}
          {responseFiles.length > 0 && <div className="legal-response-attachments">{responseFiles.map((attachment) => <button type="button" key={attachment.id} className="admin-button secondary" onClick={() => onOpenAttachment(attachment.id)}><Paperclip size={16}/>{attachment.original_name}{attachment.category ? ` · ${attachment.category.replaceAll('_', ' ').toLowerCase()}` : ''}</button>)}</div>}
        </section>}

        {notice.status === 'issued' && !notice.legacy && !portal && ['not_recorded', 'failed'].includes(notice.delivery_state) && <section className="legal-card" aria-labelledby="legal-delivery-title">
          <h3 id="legal-delivery-title">Record delivery</h3>
          <div className="legal-delivery-controls">
            <label>Record delivery state<select ref={deliveryField} value={deliveryState} onChange={(event) => setDeliveryState(event.target.value as DeliveryState)}><option value="received">Received</option><option value="refused">Refused</option><option value="failed">Failed</option></select></label>
            <label>Actual date and time<input type="datetime-local" value={deliveredAt} max={localNow()} onChange={(event) => setDeliveredAt(event.target.value)}/></label>
            <button type="button" className="admin-button primary" disabled={busy} onClick={() => onRecordDelivery(deliveryState, deliveredAt)}>Record delivery</button>
          </div>
        </section>}

        {notice.status === 'issued' && !notice.legacy && delivered && <section className="legal-offline-response" aria-labelledby="legal-offline-title">
          <h3 id="legal-offline-title">Record an emailed or paper response</h3>
          <p>The printed notice asks the vendor to reply by email. Record that reply here so it counts as answered.</p>
          <div className="legal-delivery-controls"><label>Received by<select value={offline.channel} onChange={(event) => setOffline({ ...offline, channel: event.target.value as 'email' | 'paper' })}><option value="email">Email</option><option value="paper">Paper</option></select></label><label>Received at<input type="datetime-local" value={offline.received_at} max={localNow()} onChange={(event) => setOffline({ ...offline, received_at: event.target.value })}/></label></div>
          <label>Response summary<textarea rows={3} maxLength={10000} aria-describedby="legal-offline-summary-hint" value={offline.response_text} onChange={(event) => setOffline({ ...offline, response_text: event.target.value })}/></label><small id="legal-offline-summary-hint" className="legal-field-hint">At least 20 characters.</small>
          <label>Received email or scan (PDF, JPEG, PNG)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setOffline({ ...offline, evidence: event.target.files?.[0] ?? null })}/></label>
          <button type="button" className="admin-button secondary" disabled={busy || !offline.received_at || offline.response_text.trim().length < 20 || !offline.evidence}
            onClick={() => offline.evidence && onRecordOffline({ channel: offline.channel, received_at: offline.received_at, response_text: offline.response_text.trim(), evidence: offline.evidence })}>Record response</button>
        </section>}

        {open && <div className="legal-page-footer">
          {notice.can_escalate && <button type="button" className="admin-button primary" disabled={busy} onClick={onEscalate}>Escalate to SCO</button>}
          {notice.can_remind && <button type="button" className="admin-button secondary" disabled={busy} onClick={onRemind}><BellRing size={16}/>Send reminder</button>}
          <button type="button" className="admin-button secondary" disabled={busy} onClick={onClose}>Close notice</button>
          <button type="button" className="admin-button secondary legal-danger-button" disabled={busy} onClick={onCancel}>Cancel notice</button>
        </div>}
      </div>

      <aside className="visit-review-aside" aria-label="Notice record">
        <section className="visit-info-card">
          <h3><FileText size={18} aria-hidden="true"/>Notice</h3>
          <div className="visit-info-grid">
            <div><span>Establishment</span><strong>{notice.store?.store_name || notice.source_snapshot.store?.store_name || 'Not recorded'}</strong></div>
            <div><span>Reason for issuance</span><strong>{notice.draft_payload.reason || 'Not recorded'}</strong></div>
            <div><span>Legal bases</span><strong>{bases.length ? bases.join('; ') : 'None recorded'}</strong></div>
            <div><span>Issued</span><strong>{notice.issued_at ? new Date(notice.issued_at).toLocaleString() : 'Not recorded'}</strong>{notice.preparer?.name && <small>Prepared by {notice.preparer.name}</small>}</div>
          </div>
          {visitLink}
        </section>
        <section className="visit-info-card">
          <h3><CalendarClock size={18} aria-hidden="true"/>Delivery and deadline</h3>
          <div className="visit-info-grid">
            <div><span>Method</span><strong>{notice.intended_delivery_method ? DELIVERY_METHODS[notice.intended_delivery_method].label : 'Not recorded'}</strong></div>
            <div><span>Delivery</span><strong>{portal && notice.delivery_state === 'received' ? 'Opened by the vendor in the portal' : humanize(notice.delivery_state)}</strong></div>
            <div><span>Deadline</span><strong>{notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : portal ? 'Starts when the vendor first opens it' : 'Starts after delivery'}</strong></div>
          </div>
        </section>
        <section className="visit-info-card">
          <h3><UserRound size={18} aria-hidden="true"/>Recipient</h3>
          <div className="visit-info-grid">
            <div><span>Addressee</span><strong>{[notice.draft_payload.recipient_name, notice.draft_payload.recipient_title].filter(Boolean).join(' · ') || 'Not recorded'}</strong></div>
            <div><span>Email</span><strong className="visit-info-email">{notice.draft_payload.recipient_email || 'Not recorded'}</strong></div>
            <div><span>Address</span><strong>{notice.draft_payload.address || 'Not recorded'}</strong></div>
          </div>
        </section>
        {notice.signatory_snapshot && <section className="visit-info-card">
          <h3><PenLine size={18} aria-hidden="true"/>Signatory</h3>
          <div className="visit-info-grid">
            <div><span>Signed by</span><strong>{notice.signatory_snapshot.name ?? 'Not recorded'}</strong><small>{notice.signatory_snapshot.signature_applied ? 'e-signature applied' : 'hand signature'}</small></div>
          </div>
        </section>}
      </aside>
    </div>
  </article>
}
