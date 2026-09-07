import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ClipboardList, Eye, FilePenLine, FileText, Paperclip, Save, Send, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { adminApi } from '../../services/adminApi'
import type { LegalNoticeRecord, MonitoringRecordRecord } from '../../types/admin'

type View = 'queue' | 'prepare' | 'issued'

const messageOf = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { message?: string } } }
  return candidate.response?.data?.message || fallback
}

export const LegalNoticeManager = () => {
  const sourceId = Number(new URLSearchParams(window.location.search).get('source_record')) || null
  const [view, setView] = useState<View>(sourceId ? 'prepare' : 'queue')
  const [record, setRecord] = useState<MonitoringRecordRecord | null>(null)
  const [notices, setNotices] = useState<LegalNoticeRecord[]>([])
  const [notice, setNotice] = useState<LegalNoticeRecord | null>(null)
  const [noticeType, setNoticeType] = useState<'LOI' | 'SCO'>('LOI')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [form, setForm] = useState({ recipient_name: '', recipient_title: '', recipient_email: '', address: '', reason: '', legal_bases: '', intended_delivery_method: '', internal_justification: '' })
  const [preview, setPreview] = useState('')
  const [previewSize, setPreviewSize] = useState<'fit' | 'actual'>('fit')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [deliveryState, setDeliveryState] = useState<'received' | 'refused' | 'failed'>('received')

  const eligible = useMemo(() => record?.items.filter((item) => item.is_anomaly && item.reference_status === 'available' && item.reference_value != null) ?? [], [record])

  useEffect(() => {
    const load = sourceId ? adminApi.getMonitoringRecord(sourceId).then((value) => {
      setRecord(value); setSelectedIds(value.items.filter((item) => item.is_anomaly && item.reference_status === 'available' && item.reference_value != null).map((item) => item.id))
    }) : adminApi.getLegalNotices().then((page) => setNotices(page.data))
    void load.catch((reason) => setError(messageOf(reason, sourceId ? 'The source monitoring record could not be loaded.' : 'Legal actions are unavailable.'))).finally(() => setLoading(false))
  }, [sourceId])

  useEffect(() => {
    if (sourceId && view !== 'prepare' && !notices.length) void adminApi.getLegalNotices().then((page) => setNotices(page.data)).catch((reason) => setError(messageOf(reason, 'Legal actions are unavailable.')))
  }, [view, sourceId, notices.length])

  const openNotice = (value: LegalNoticeRecord) => {
    setNotice(value)
    setForm({
      recipient_name: value.draft_payload.recipient_name || '', recipient_title: value.draft_payload.recipient_title || '', recipient_email: value.draft_payload.recipient_email || '', address: value.draft_payload.address || '',
      reason: value.draft_payload.reason || '', legal_bases: value.draft_payload.legal_bases?.join(', ') || '', intended_delivery_method: value.intended_delivery_method || '', internal_justification: value.internal_justification || '',
    })
    setSaved(false); setView(value.status === 'draft' ? 'prepare' : 'issued')
  }

  const createDraft = async () => {
    if (!record || !selectedIds.length) return
    setBusy(true); setError('')
    try { openNotice(await adminApi.createLegalNotice({ monitoring_record_id: record.id, notice_type: noticeType, item_ids: selectedIds })); toast.success('Draft created.') }
    catch (reason) { setError(messageOf(reason, 'The draft could not be created.')) }
    finally { setBusy(false) }
  }

  const save = async () => {
    if (!notice) return
    setBusy(true); setSaved(false); setError('')
    try {
      const updated = await adminApi.updateLegalNotice(notice.id, { ...form, legal_bases: form.legal_bases.split(',').map((value) => value.trim()).filter(Boolean) })
      setNotice(updated); setSaved(true); toast.success('Draft saved.')
    } catch (reason) { setError(messageOf(reason, 'The draft could not be saved.')) }
    finally { setBusy(false) }
  }

  const showPreview = async () => {
    if (!notice) return
    setBusy(true); setError('')
    try { setPreview(await adminApi.previewLegalNotice(notice.id)) }
    catch (reason) { setError(messageOf(reason, 'The official preview could not be generated.')) }
    finally { setBusy(false) }
  }

  const addAttachment = async (file?: File) => {
    if (!notice || !file) return
    setBusy(true); setError('')
    try { const attachment = await adminApi.addLegalAttachment(notice.id, file); setNotice({ ...notice, attachments: [...(notice.attachments ?? []), attachment] }); toast.success('Supplemental evidence added.') }
    catch (reason) { setError(messageOf(reason, 'The attachment could not be uploaded.')) }
    finally { setBusy(false) }
  }

  const removeAttachment = async (attachmentId: number) => {
    if (!notice) return
    try { await adminApi.deleteLegalAttachment(notice.id, attachmentId); setNotice({ ...notice, attachments: notice.attachments?.filter((item) => item.id !== attachmentId) }) }
    catch (reason) { setError(messageOf(reason, 'The attachment could not be removed.')) }
  }

  const issue = async () => {
    if (!notice || !window.confirm('Issue this immutable official notice?')) return
    setBusy(true); setError('')
    try { openNotice(await adminApi.issueLegalNotice(notice.id)); toast.success('Notice issued.') }
    catch (reason) { setError(messageOf(reason, 'The notice could not be issued.')) }
    finally { setBusy(false) }
  }

  const recordDelivery = async () => {
    if (!notice) return
    setBusy(true); setError('')
    try { const updated = await adminApi.recordLegalDelivery(notice.id, { state: deliveryState, recorded_at: new Date().toISOString() }); setNotice(updated); setNotices(notices.map((item) => item.id === updated.id ? updated : item)); toast.success('Delivery state recorded.') }
    catch (reason) { setError(messageOf(reason, 'Delivery could not be recorded.')) }
    finally { setBusy(false) }
  }

  const openIssuedDocument = async () => {
    if (!notice) return
    try { const url = URL.createObjectURL(await adminApi.getLegalDocument(notice.id)); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60_000) }
    catch (reason) { setError(messageOf(reason, 'The private document could not be opened.')) }
  }

  const readiness = notice?.readiness ?? {}
  const complete = Object.values(readiness).length > 0 && Object.values(readiness).every(Boolean)
  const issueDisabled = !notice || notice.policy.status !== 'LEGAL_POLICY_AVAILABLE' || !complete || busy

  return <div className="legal-workspace">
    <nav className="legal-tabs" aria-label="Legal Actions views">
      <button type="button" aria-current={view === 'queue' ? 'page' : undefined} onClick={() => setView('queue')}><ClipboardList size={18}/>Action Queue</button>
      <button type="button" aria-current={view === 'prepare' ? 'page' : undefined} onClick={() => setView('prepare')}><FilePenLine size={18}/>Prepare Notice</button>
      <button type="button" aria-current={view === 'issued' ? 'page' : undefined} onClick={() => setView('issued')}><FileText size={18}/>Issued & Responses</button>
    </nav>

    {error && <div className="legal-alert" role="alert"><ShieldAlert size={18}/><span>{error}</span></div>}
    {loading ? <div className="legal-loading" aria-label="Loading legal actions"/> : view === 'queue' ? <Queue notices={notices.filter((item) => item.status === 'draft')} onOpen={openNotice}/> : view === 'issued' ? <><Queue notices={notices.filter((item) => item.status !== 'draft')} onOpen={openNotice} issued/>{notice && notice.status !== 'draft' && <section className="legal-issued-detail"><header><div><h3>{notice.control_number || `Notice #${notice.id}`}</h3><p>{notice.notice_type} · {notice.status.replace('_', ' ')}</p></div><button type="button" className="admin-button secondary" onClick={() => void openIssuedDocument()}><FileText size={17}/>Open document</button></header><div className="legal-facts"><Fact label="Establishment" value={notice.store?.store_name}/><Fact label="Delivery" value={notice.delivery_state.replace('_', ' ')}/><Fact label="Deadline" value={notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery'}/></div>{notice.status === 'issued' && <div className="legal-delivery-controls"><label>Record delivery state<select value={deliveryState} onChange={(event) => setDeliveryState(event.target.value as typeof deliveryState)}><option value="received">Received</option><option value="refused">Refused</option><option value="failed">Failed</option></select></label><button type="button" className="admin-button primary" disabled={busy} onClick={() => void recordDelivery()}>Record delivery</button></div>}{!['closed', 'cancelled'].includes(notice.status) && <button type="button" className="admin-button secondary" onClick={() => window.confirm('Close this notice?') && void adminApi.closeLegalNotice(notice.id).then(openNotice)}>Close notice</button>}</section>}</> : <div className="legal-editor-layout">
      <main className="legal-form-stack">
        <header className="legal-view-heading"><div><h2>Prepare Notice</h2><p>Build one evidence-backed notice for one accepted monitoring visit.</p></div><span className="legal-protocol">Evaluator review required</span></header>

        <Section number="1" title="Case Reference" subtitle="Immutable facts from the monitoring record.">
          {record ? <><div className="legal-facts"><Fact label="Establishment" value={record.store.store_name}/><Fact label="Monitoring record" value={`#${record.id}`}/><Fact label="Monitoring date" value={new Date(record.finalized_at).toLocaleDateString()}/><Fact label="Field officer" value={record.officer.name}/><Fact label="Representative" value={[record.representative_name, record.representative_title].filter(Boolean).join(' · ')}/><Fact label="Address" value={record.store.address}/></div><p className="legal-neutral-note">Reference comparison · Observed price above captured reference. Evaluator review required; this is not an automatic legal finding.</p></> : notice ? <><div className="legal-facts"><Fact label="Establishment" value={notice.source_snapshot.store?.store_name}/><Fact label="Monitoring record" value={`#${notice.monitoring_record_id}`}/><Fact label="Monitoring date" value={notice.source_snapshot.monitoring_date ? new Date(notice.source_snapshot.monitoring_date).toLocaleDateString() : null}/><Fact label="Address" value={notice.source_snapshot.store?.address}/></div><p className="legal-neutral-note">Reference comparison · Evaluator review required; this is not an automatic legal finding.</p></> : <p>{sourceId ? 'The linked visit is unavailable or stale.' : 'Open this workspace from an accepted Field Monitoring record.'}</p>}
        </Section>

        <Section number="2" title="Notice Type & Basis" subtitle="Choose the document; policy controls the permitted basis.">
          <fieldset className="legal-choice-row" disabled={!!notice}><legend>Notice type</legend><label><input type="radio" checked={noticeType === 'LOI'} onChange={() => setNoticeType('LOI')}/> LOI (Letter of Inquiry)</label><label><input type="radio" checked={noticeType === 'SCO'} onChange={() => setNoticeType('SCO')}/> SCO (Show Cause Order)</label></fieldset>
          {notice && <div className="legal-input-grid"><label>Reason for issuance<input value={form.reason} onChange={(event) => { setSaved(false); setForm({ ...form, reason: event.target.value }) }}/></label><label>Approved legal bases<input value={form.legal_bases} onChange={(event) => { setSaved(false); setForm({ ...form, legal_bases: event.target.value }) }} placeholder="Configured policy values, comma separated"/></label></div>}
        </Section>

        <Section number="3" title="Recipient & Delivery" subtitle="Prefilled contacts remain visibly editable only in the draft.">
          {notice ? <div className="legal-input-grid"><label>Representative / contact person<input value={form.recipient_name} onChange={(e) => { setSaved(false); setForm({ ...form, recipient_name: e.target.value }) }}/></label><label>Position<input value={form.recipient_title} onChange={(e) => { setSaved(false); setForm({ ...form, recipient_title: e.target.value }) }}/></label><label>Email address<input type="email" value={form.recipient_email} onChange={(e) => { setSaved(false); setForm({ ...form, recipient_email: e.target.value }) }}/></label><label>Intended delivery method<select value={form.intended_delivery_method} onChange={(e) => { setSaved(false); setForm({ ...form, intended_delivery_method: e.target.value }) }}><option value="">Select method</option><option value="portal">Portal only</option><option value="email_and_hand_copy">Email notification and hand copy</option><option value="hand_copy">Hand copy</option></select></label><label className="legal-span-2">Establishment address<input value={form.address} onChange={(e) => { setSaved(false); setForm({ ...form, address: e.target.value }) }}/></label></div> : <p>Create the draft to confirm recipient details. Missing contact data will remain blank.</p>}
        </Section>

        <Section number="4" title="Evidence & Attachments" subtitle="Monitoring evidence is immutable; supplemental files are removable only in draft.">
          <div className="legal-evidence-list">
            {eligible.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={!!notice} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))}/><span><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><small>Observed ₱{Number(item.recorded_price).toFixed(2)} · captured reference ₱{Number(item.reference_value).toFixed(2)} · {item.reference_label || 'Reference label not recorded'}</small></span><span className="legal-locked">Original</span></label>)}
            {!record && notice?.source_snapshot.items.map((item, index) => <div className="legal-snapshot-evidence" key={String(item.id ?? index)}><span><strong>{String(item.commodity_name || `Item #${item.id || index + 1}`)}</strong><small>Observed ₱{Number(item.observed_price).toFixed(2)} · captured reference ₱{Number(item.reference_value).toFixed(2)} · {String(item.reference_label || 'Reference label not recorded')}</small></span><span className="legal-locked">Original</span></div>)}
          </div>
          {notice && <><label className="legal-upload"><Paperclip size={18}/>Add supplemental PDF, JPEG, or PNG<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => void addAttachment(event.target.files?.[0])}/></label>{notice.attachments?.map((attachment) => <div className="legal-attachment" key={attachment.id}><span>{attachment.original_name}</span><button type="button" aria-label={`Remove ${attachment.original_name}`} onClick={() => void removeAttachment(attachment.id)}><X size={16}/></button></div>)}</>}
        </Section>

        <Section number="5" title="Internal Justification" subtitle="Internal evaluator rationale; never shown as an automatic finding.">
          <label>Internal justification<textarea rows={4} disabled={!notice} value={form.internal_justification} onChange={(e) => { setSaved(false); setForm({ ...form, internal_justification: e.target.value }) }} maxLength={2000}/></label>
        </Section>
        {!notice && <button type="button" className="admin-button primary legal-create" disabled={!record || !selectedIds.length || busy} onClick={() => void createDraft()}>{busy ? 'Creating…' : 'Create draft'}</button>}
      </main>

      <aside className="legal-issuance-panel" aria-label="Issuance Panel"><h3>Issuance Panel</h3><p>Track completion and issue the notice.</p><div className="legal-status"><span>Status</span><strong>{notice?.status === 'draft' ? 'Drafting' : notice ? notice.status.replace('_', ' ') : 'Not started'}</strong></div><h4>Required fields</h4><ul>{['case_reference', 'notice_type_and_basis', 'recipient_and_delivery', 'evidence_and_attachments', 'internal_justification'].map((key) => <li key={key} className={readiness[key] ? 'done' : ''}>{readiness[key] ? <Check size={16}/> : <span/>}{key.replaceAll('_', ' ')}</li>)}</ul><div className="legal-panel-meta"><span>Assigned evaluator</span><strong>{notice?.preparer?.name || record?.officer.name || 'Not assigned'}</strong><span>Last saved</span><strong>{notice ? new Date(notice.updated_at).toLocaleString() : 'Not saved'}</strong>{saved && <em><Check size={14}/>All changes saved</em>}</div><button type="button" className="admin-button secondary" disabled={!notice || busy} onClick={() => void save()}><Save size={17}/>Save Draft</button><button type="button" className="admin-button secondary" disabled={!notice || busy} onClick={() => void showPreview()}><Eye size={17}/>Open Official Preview</button><button type="button" className="admin-button primary" disabled={issueDisabled} onClick={() => void issue()}><Send size={17}/>Issue Notice</button>{notice?.policy.status === 'LEGAL_POLICY_UNAVAILABLE' && <div className="legal-policy-lock"><strong>LEGAL_POLICY_UNAVAILABLE</strong><span>Issuance stays disabled until a complete approved policy is deployed.</span></div>}</aside>
    </div>}

    {preview && <div className="legal-preview" role="dialog" aria-modal="true" aria-label="Official notice preview"><header><strong>Official A4 preview</strong><div><button type="button" onClick={() => setPreviewSize('fit')}>Fit width</button><button type="button" onClick={() => setPreviewSize('actual')}>Actual size</button><button type="button" onClick={() => window.print()}>Print preview</button><button type="button" onClick={() => { const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([preview],{type:'text/html'})); link.download='watermarked-notice-preview.html'; link.click(); URL.revokeObjectURL(link.href) }}>Download watermarked</button><button type="button" onClick={() => setPreview('')} aria-label="Close preview"><X/></button></div></header><iframe className={previewSize} sandbox="" title="Watermarked legal draft preview" srcDoc={preview}/></div>}
  </div>
}

const Section = ({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: ReactNode }) => <section className="legal-section"><header><span>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>
const Fact = ({ label, value }: { label: string; value?: string | null }) => <div><span>{label}</span><strong>{value || 'Not recorded'}</strong></div>
const Queue = ({ notices, onOpen, issued = false }: { notices: LegalNoticeRecord[]; onOpen: (notice: LegalNoticeRecord) => void; issued?: boolean }) => <section className="legal-queue"><header><h2>{issued ? 'Issued & Responses' : 'Action Queue'}</h2><p>{issued ? 'Issued notices, delivery records, deadlines, and vendor responses.' : 'Drafts awaiting evaluator preparation.'}</p></header>{notices.length ? <div className="legal-table-wrap"><table><thead><tr><th>Reference</th><th>Establishment</th><th>Type</th><th>Preparer</th><th>Current state</th><th>Last saved / issued</th><th>Delivery</th><th>Deadline</th><th>Action</th></tr></thead><tbody>{notices.map((notice) => <tr key={notice.id}><td>{notice.control_number || `Draft #${notice.id}`}</td><td>{notice.store?.store_name || notice.source_snapshot.store?.store_name || 'Not recorded'}</td><td>{notice.notice_type}</td><td>{notice.preparer?.name || 'Not assigned'}</td><td>{notice.overdue ? 'Overdue' : notice.status.replace('_', ' ')}</td><td>{new Date(notice.issued_at || notice.updated_at).toLocaleString()}</td><td>{notice.delivery_state.replace('_', ' ')}</td><td>{notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery'}</td><td><button type="button" onClick={() => onOpen(notice)}>{notice.status === 'draft' ? 'Continue' : 'Review'}</button></td></tr>)}</tbody></table></div> : <div className="legal-empty"><FileText size={28}/><strong>{issued ? 'No issued notices' : 'No drafts in the queue'}</strong><span>{issued ? 'Issued notices will appear here after policy-authorized issuance.' : 'Open an accepted monitoring record to prepare a notice.'}</span></div>}</section>
