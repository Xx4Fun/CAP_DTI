import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ClipboardList, Eye, FilePenLine, FileText, Paperclip, Save, Send, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { adminApi } from '../../services/adminApi'
import type { LegalNoticeRecord, MonitoringRecordRecord } from '../../types/admin'

type View = 'queue' | 'prepare' | 'issued'

const RESPONSE_REASONS: Record<string, string> = {
  WHOLESALE_HIKE: 'Distributor or manufacturer wholesale price increase',
  FREIGHT_SURCHARGE: 'Logistics or inter-island freight surcharge',
  ENCODING_ERROR: 'POS or shelf tag clerical error',
  PACKAGING_DISCREPANCY: 'Grammage or packaging variant mismatch',
  FORCE_MAJEURE: 'Supply chain interruption',
}

/** Current local time in the format a datetime-local input expects. */
const localNow = () => { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16) }

const messageOf = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { message?: string } } }
  return candidate.response?.data?.message || fallback
}

export const LegalNoticeManager = () => {
  const sourceId = Number(new URLSearchParams(window.location.search).get('source_record')) || null
  // Opened from a Store Communications notice card.
  const sourceNoticeId = Number(new URLSearchParams(window.location.search).get('source_notice')) || null
  const [view, setView] = useState<View>(sourceId ? 'prepare' : 'queue')
  const [record, setRecord] = useState<MonitoringRecordRecord | null>(null)
  const [notices, setNotices] = useState<LegalNoticeRecord[]>([])
  const [notice, setNotice] = useState<LegalNoticeRecord | null>(null)
  const [noticeType, setNoticeType] = useState<'LOI' | 'SCO'>('LOI')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [form, setForm] = useState({ recipient_name: '', recipient_title: '', recipient_email: '', address: '', reason: '', legal_bases: [] as string[], intended_delivery_method: '', internal_justification: '' })
  const [preview, setPreview] = useState('')
  const [previewSize, setPreviewSize] = useState<'fit' | 'actual'>('fit')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  // Snapshot of the form as last loaded or saved; issue and preview use the saved draft, so edits must be saved first.
  const [savedForm, setSavedForm] = useState('')
  const [error, setError] = useState('')
  const [deliveryState, setDeliveryState] = useState<'received' | 'refused' | 'failed'>('received')
  const [deliveredAt, setDeliveredAt] = useState('')
  const [applySignature, setApplySignature] = useState(false)
  const [offline, setOffline] = useState({ channel: 'email' as 'email' | 'paper', received_at: '', response_text: '', evidence: null as File | null })
  // Bumped whenever the selected notice may change by another path, so a slower detail response cannot replace it.
  const detailRequest = useRef(0)
  useEffect(() => { detailRequest.current++ }, [view])

  const eligible = useMemo(() => record?.items.filter((item) => item.is_anomaly && item.reference_status === 'available' && item.reference_value != null) ?? [], [record])

  useEffect(() => {
    const load = sourceId ? adminApi.getMonitoringRecord(sourceId).then((value) => {
      setRecord(value); setSelectedIds(value.items.filter((item) => item.is_anomaly && item.reference_status === 'available' && item.reference_value != null).map((item) => item.id))
    }) : adminApi.getLegalNotices().then((page) => setNotices(page.data))
    void load.catch((reason) => setError(messageOf(reason, sourceId ? 'The source monitoring record could not be loaded.' : 'Legal actions are unavailable.'))).finally(() => setLoading(false))
    if (sourceNoticeId) void adminApi.getLegalNotice(sourceNoticeId).then(openNotice).catch((reason) => setError(messageOf(reason, 'The notice could not be opened.')))
  }, [sourceId, sourceNoticeId])

  useEffect(() => {
    if (sourceId && view !== 'prepare' && !notices.length) void adminApi.getLegalNotices().then((page) => setNotices(page.data)).catch((reason) => setError(messageOf(reason, 'Legal actions are unavailable.')))
  }, [view, sourceId, notices.length])

  const openNotice = (value: LegalNoticeRecord) => {
    setNotice(value)
    const next = {
      recipient_name: value.draft_payload.recipient_name || '', recipient_title: value.draft_payload.recipient_title || '', recipient_email: value.draft_payload.recipient_email || '', address: value.draft_payload.address || '',
      reason: value.draft_payload.reason || '', legal_bases: value.draft_payload.legal_bases ?? [], intended_delivery_method: value.intended_delivery_method || '', internal_justification: value.internal_justification || '',
    }
    setForm(next); setSavedForm(JSON.stringify(next))
    setSaved(false); setApplySignature(false); setView(value.status === 'draft' ? 'prepare' : 'issued')
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
      const updated = await adminApi.updateLegalNotice(notice.id, { ...form, reason: form.reason || null })
      setNotice(updated); setSaved(true); setSavedForm(JSON.stringify(form)); toast.success('Draft saved.')
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
    const signed = applySignature && !!notice?.signatory?.has_signature
    const question = signed
      ? `Issue this immutable official notice with the e-signature of ${notice?.signatory?.name ?? 'the signatory'}?`
      : 'Issue this immutable official notice? It prints the signatory name without an e-signature.'
    if (!notice || !window.confirm(question)) return
    setBusy(true); setError('')
    try {
      const issued = await adminApi.issueLegalNotice(notice.id, signed)
      openNotice(issued); toast.success('Notice issued.')
      if (issued.notification === 'failed') toast.warning('The notice was issued, but the vendor email could not be queued. Deliver the hand copy and tell the vendor directly.')
    }
    catch (reason) { setError(messageOf(reason, 'The notice could not be issued.')) }
    finally { setBusy(false) }
  }

  const recordDelivery = async () => {
    if (!notice) return
    detailRequest.current++
    setBusy(true); setError('')
    if (!deliveredAt) { setError('Enter when the notice was actually delivered.'); setBusy(false); return }
    if (!window.confirm(`Record ${deliveryState} at ${new Date(deliveredAt).toLocaleString()}? A recorded receipt or refusal starts the legal deadline and cannot be changed.`)) { setBusy(false); return }
    try { const updated = await adminApi.recordLegalDelivery(notice.id, { state: deliveryState, recorded_at: new Date(deliveredAt).toISOString() }); setNotice(updated); setNotices(notices.map((item) => item.id === updated.id ? updated : item)); toast.success('Delivery state recorded.') }
    catch (reason) { setError(messageOf(reason, 'Delivery could not be recorded.')) }
    finally { setBusy(false) }
  }

  const recordOffline = async () => {
    if (!notice || !window.confirm('Record this response? The notice will count as answered.')) return
    detailRequest.current++
    setBusy(true); setError('')
    try {
      if (!offline.evidence) return
      const updated = await adminApi.recordOfflineResponse(notice.id, { channel: offline.channel, received_at: new Date(offline.received_at).toISOString(), response_text: offline.response_text.trim(), evidence: offline.evidence })
      replaceInList(updated); openNotice(updated); setOffline({ channel: 'email', received_at: '', response_text: '', evidence: null }); toast.success('Response recorded.')
    } catch (reason) { setError(messageOf(reason, 'The response could not be recorded.')) }
    finally { setBusy(false) }
  }

  const confirmLinkedVendor = async () => {
    if (!notice) return
    setBusy(true); setError('')
    try { setNotice(await adminApi.updateLegalNotice(notice.id, { confirm_linked_vendor: true })); toast.success('Recipient confirmed against the linked vendor account.') }
    catch (reason) { setError(messageOf(reason, 'The recipient could not be confirmed.')) }
    finally { setBusy(false) }
  }

  const replaceInList = (updated: LegalNoticeRecord) => setNotices((current) => current.some((item) => item.id === updated.id) ? current.map((item) => item.id === updated.id ? updated : item) : [updated, ...current])

  const closeNotice = async () => {
    if (!notice || !window.confirm('Close this notice? Use Escalate instead if an SCO should follow.')) return
    detailRequest.current++
    setBusy(true); setError('')
    try { const closed = await adminApi.closeLegalNotice(notice.id); replaceInList(closed); openNotice(closed); toast.success('Notice closed.') }
    catch (reason) { setError(messageOf(reason, 'The notice could not be closed.')) }
    finally { setBusy(false) }
  }

  const escalate = async () => {
    if (!notice || !window.confirm('Close this LOI and prepare a Show Cause Order for the same visit and items?')) return
    detailRequest.current++
    setBusy(true); setError('')
    try {
      const sco = await adminApi.escalateLegalNotice(notice.id)
      const closed = await adminApi.getLegalNotice(notice.id)
      replaceInList(closed); replaceInList(sco); setNoticeType('SCO'); openNotice(sco); toast.success('SCO draft prepared.')
    } catch (reason) { setError(messageOf(reason, 'The notice could not be escalated.')) }
    finally { setBusy(false) }
  }

  const openIssuedDocument = async () => {
    if (!notice) return
    try { const url = URL.createObjectURL(await adminApi.getLegalDocument(notice.id)); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60_000) }
    catch (reason) { setError(messageOf(reason, 'The private document could not be opened.')) }
  }

  const openAttachment = async (attachmentId: number) => {
    if (!notice) return
    // Open the window during the click; opening it after the download finishes is blocked as a popup by many browsers.
    const opened = window.open('', '_blank')
    if (!opened) { setError('Allow pop-ups for this site to open vendor attachments.'); return }
    opened.opener = null
    try { const url = URL.createObjectURL(await adminApi.downloadLegalAttachment(notice.id, attachmentId)); opened.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60_000) }
    catch (reason) { opened.close(); setError(messageOf(reason, 'The vendor attachment could not be opened.')) }
  }

  const reviewIssued = (value: LegalNoticeRecord) => {
    const request = ++detailRequest.current
    openNotice(value)
    void adminApi.getLegalNotice(value.id)
      .then((detail) => { if (request === detailRequest.current) openNotice(detail) })
      .catch((reason) => { if (request === detailRequest.current) setError(messageOf(reason, 'The notice details could not be refreshed.')) })
  }

  const readiness = notice?.readiness ?? {}
  const complete = Object.values(readiness).length > 0 && Object.values(readiness).every(Boolean)
  const dirty = !!notice && notice.status === 'draft' && JSON.stringify(form) !== savedForm
  const issueDisabled = !notice || notice.policy?.status !== 'LEGAL_POLICY_AVAILABLE' || !complete || busy || dirty

  return <div className="legal-workspace">
    <nav className="legal-tabs" aria-label="Legal Actions views">
      <button type="button" aria-current={view === 'queue' ? 'page' : undefined} onClick={() => setView('queue')}><ClipboardList size={18}/>Action Queue</button>
      <button type="button" aria-current={view === 'prepare' ? 'page' : undefined} onClick={() => setView('prepare')}><FilePenLine size={18}/>Prepare Notice</button>
      <button type="button" aria-current={view === 'issued' ? 'page' : undefined} onClick={() => setView('issued')}><FileText size={18}/>Issued & Responses</button>
    </nav>

    {error && <div className="legal-alert" role="alert"><ShieldAlert size={18}/><span>{error}</span></div>}
    {loading ? <div className="legal-loading" aria-label="Loading legal actions"/> : view === 'queue' ? <Queue notices={notices.filter((item) => item.status === 'draft')} onOpen={openNotice}/> : view === 'issued' ? <><Queue notices={notices.filter((item) => item.status !== 'draft')} onOpen={reviewIssued} issued/>{notice && notice.status !== 'draft' && <section className="legal-issued-detail"><header><div><h3>{notice.control_number || `Notice #${notice.id}`}</h3><p>{notice.notice_type} · {notice.status.replace('_', ' ')}</p></div><button type="button" className="admin-button secondary" onClick={() => void openIssuedDocument()}><FileText size={17}/>Open document</button></header><div className="legal-facts"><Fact label="Establishment" value={notice.store?.store_name}/><Fact label="Delivery" value={notice.delivery_state.replace('_', ' ')}/><Fact label="Deadline" value={notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery'}/>{notice.signatory_snapshot && <Fact label="Signed by" value={`${notice.signatory_snapshot.name ?? 'Not recorded'} · ${notice.signatory_snapshot.signature_applied ? 'e-signature applied' : 'hand signature'}`}/>}</div>{notice.legacy && <div className="legal-policy-lock"><strong>Legacy notice · offline handling</strong><span>Issued before deadline rules were recorded. It is not shown in the vendor portal; record delivery and the response on paper, then close or cancel it here.</span></div>}{notice.status === 'issued' && !notice.legacy && ['not_recorded', 'failed'].includes(notice.delivery_state) && <div className="legal-delivery-controls"><label>Record delivery state<select value={deliveryState} onChange={(event) => setDeliveryState(event.target.value as typeof deliveryState)}><option value="received">Received</option><option value="refused">Refused</option><option value="failed">Failed</option></select></label><label>Actual date and time<input type="datetime-local" value={deliveredAt} max={localNow()} onChange={(event) => setDeliveredAt(event.target.value)}/></label><button type="button" className="admin-button primary" disabled={busy} onClick={() => void recordDelivery()}>Record delivery</button></div>}{notice.status === 'issued' && !notice.legacy && ['received', 'refused'].includes(notice.delivery_state) && <section className="legal-offline-response" aria-labelledby="legal-offline-title"><h4 id="legal-offline-title">Record an emailed or paper response</h4><p>The printed notice asks the vendor to reply by email. Record that reply here so it counts as answered.</p><div className="legal-delivery-controls"><label>Received by<select value={offline.channel} onChange={(event) => setOffline({ ...offline, channel: event.target.value as 'email' | 'paper' })}><option value="email">Email</option><option value="paper">Paper</option></select></label><label>Received at<input type="datetime-local" value={offline.received_at} max={localNow()} onChange={(event) => setOffline({ ...offline, received_at: event.target.value })}/></label></div><label>Response summary<textarea rows={3} maxLength={10000} value={offline.response_text} onChange={(event) => setOffline({ ...offline, response_text: event.target.value })}/></label><label>Received email or scan (PDF, JPEG, PNG)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setOffline({ ...offline, evidence: event.target.files?.[0] ?? null })}/></label><button type="button" className="admin-button secondary" disabled={busy || !offline.received_at || offline.response_text.trim().length < 20 || !offline.evidence} onClick={() => void recordOffline()}>Record response</button></section>}{notice.response_received_at && <section className="legal-vendor-response" aria-labelledby="legal-vendor-response-title"><h4 id="legal-vendor-response-title">Vendor response</h4><div className="legal-facts"><Fact label="Received" value={new Date(notice.response_received_at).toLocaleString()}/><Fact label="Channel" value={notice.response_channel === 'portal' ? 'Vendor Portal (sworn)' : notice.response_channel ? `${notice.response_channel === 'email' ? 'Email' : 'Paper'} · recorded by DTI` : null}/><Fact label="Stated reason" value={notice.response_reason_category ? RESPONSE_REASONS[notice.response_reason_category] ?? notice.response_reason_category : null}/><Fact label="Certified true and correct" value={notice.response_certified_at ? new Date(notice.response_certified_at).toLocaleString() : null}/></div>{notice.response_text && <p className="legal-response-text">{notice.response_text}</p>}<div className="legal-response-attachments">{notice.attachments?.filter((attachment) => ['vendor_response', 'offline_response'].includes(attachment.kind)).map((attachment) => <button type="button" key={attachment.id} className="admin-button secondary" onClick={() => void openAttachment(attachment.id)}><Paperclip size={16}/>{attachment.original_name}{attachment.category ? ` · ${attachment.category.replaceAll('_', ' ').toLowerCase()}` : ''}</button>)}</div></section>}{!['closed', 'cancelled'].includes(notice.status) && <div className="legal-delivery-controls">{notice.can_escalate && <button type="button" className="admin-button primary" disabled={busy} onClick={() => void escalate()}>Escalate to SCO</button>}<button type="button" className="admin-button secondary" disabled={busy} onClick={() => void closeNotice()}>Close notice</button></div>}</section>}</> : <div className="legal-editor-layout">
      <main className="legal-form-stack">
        <header className="legal-view-heading"><div><h2>Prepare Notice</h2><p>Build one evidence-backed notice for one accepted monitoring visit.</p></div><span className="legal-protocol">Evaluator review required</span></header>

        <Section number="1" title="Case Reference" subtitle="Immutable facts from the monitoring record.">
          {record ? <><div className="legal-facts"><Fact label="Establishment" value={record.store.store_name}/><Fact label="Monitoring record" value={`#${record.id}`}/><Fact label="Monitoring date" value={new Date(record.finalized_at).toLocaleDateString()}/><Fact label="Field officer" value={record.officer.name}/><Fact label="Representative" value={[record.representative_name, record.representative_title].filter(Boolean).join(' · ')}/><Fact label="Address" value={record.store.address}/></div><p className="legal-neutral-note">Reference comparison · Observed price above captured reference. Evaluator review required; this is not an automatic legal finding.</p></> : notice ? <><div className="legal-facts"><Fact label="Establishment" value={notice.source_snapshot.store?.store_name}/><Fact label="Monitoring record" value={`#${notice.monitoring_record_id}`}/><Fact label="Monitoring date" value={notice.source_snapshot.monitoring_date ? new Date(notice.source_snapshot.monitoring_date).toLocaleDateString() : null}/><Fact label="Address" value={notice.source_snapshot.store?.address}/></div><p className="legal-neutral-note">Reference comparison · Evaluator review required; this is not an automatic legal finding.</p></> : <p>{sourceId ? 'The linked visit is unavailable or stale.' : 'Open this workspace from an accepted Field Monitoring record.'}</p>}
        </Section>

        <Section number="2" title="Notice Type & Basis" subtitle="Choose the document; policy controls the permitted basis.">
          <fieldset className="legal-choice-row" disabled={!!notice}><legend>Notice type</legend><label><input type="radio" checked={noticeType === 'LOI'} onChange={() => setNoticeType('LOI')}/> LOI (Letter of Inquiry)</label><label><input type="radio" checked={noticeType === 'SCO'} onChange={() => setNoticeType('SCO')}/> SCO (Show Cause Order)</label></fieldset>
          {notice && <div className="legal-input-grid"><label>Reason for issuance<select value={form.reason} onChange={(event) => { setSaved(false); setForm({ ...form, reason: event.target.value }) }}><option value="">Select reason</option>{(notice.policy?.reasons ?? []).map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label><fieldset className="legal-basis-options"><legend>Approved legal bases</legend>{(notice.policy?.legal_bases ?? []).map((basis) => <label key={basis}><input type="checkbox" checked={form.legal_bases.includes(basis)} onChange={(event) => { setSaved(false); setForm({ ...form, legal_bases: event.target.checked ? [...form.legal_bases, basis] : form.legal_bases.filter((value) => value !== basis) }) }}/>{basis}</label>)}</fieldset></div>}
        </Section>

        <Section number="3" title="Recipient & Delivery" subtitle="Prefilled contacts remain visibly editable only in the draft.">
          {notice?.recipient_review_required && <div className="legal-policy-lock" role="status"><strong>Vendor link changed · review recipient</strong><span>The store's vendor account changed after this draft was prepared. Check the recipient details below, then confirm.</span><button type="button" className="admin-button secondary" disabled={busy} onClick={() => void confirmLinkedVendor()}>Use linked vendor</button></div>}
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

      <aside className="legal-issuance-panel" aria-label="Issuance Panel"><h3>Issuance Panel</h3><p>Track completion and issue the notice.</p><div className="legal-status"><span>Status</span><strong>{notice?.status === 'draft' ? 'Drafting' : notice ? notice.status.replace('_', ' ') : 'Not started'}</strong></div><h4>Required fields</h4><ul>{['case_reference', 'notice_type_and_basis', 'recipient_and_delivery', 'evidence_and_attachments', 'internal_justification'].map((key) => <li key={key} className={readiness[key] ? 'done' : ''}>{readiness[key] ? <Check size={16}/> : <span/>}{key.replaceAll('_', ' ')}</li>)}</ul><div className="legal-panel-meta"><span>Assigned evaluator</span><strong>{notice?.preparer?.name || record?.officer.name || 'Not assigned'}</strong><span>Last saved</span><strong>{notice ? new Date(notice.updated_at).toLocaleString() : 'Not saved'}</strong>{saved && <em><Check size={14}/>All changes saved</em>}</div><button type="button" className="admin-button secondary" disabled={!notice || busy} onClick={() => void save()}><Save size={17}/>Save Draft</button><button type="button" className="admin-button secondary" disabled={!notice || busy || dirty} onClick={() => void showPreview()}><Eye size={17}/>Open Official Preview</button>{dirty && <p className="legal-unsaved" role="status">Save the draft first: preview and issue use the saved version.</p>}{notice?.status === 'draft' && <div className="legal-signature-choice"><span>Signatory</span><strong>{notice.signatory?.name || 'Not set in Settings'}</strong>{notice.signatory?.has_signature ? <label><input type="checkbox" checked={applySignature} onChange={(event) => setApplySignature(event.target.checked)}/>Apply this official&apos;s e-signature</label> : <small>No e-signature uploaded; the printed copy is signed by hand.</small>}</div>}<button type="button" className="admin-button primary" disabled={issueDisabled} onClick={() => void issue()}><Send size={17}/>Issue Notice</button>{notice?.policy?.status === 'LEGAL_POLICY_UNAVAILABLE' && <div className="legal-policy-lock"><strong>LEGAL_POLICY_UNAVAILABLE</strong><span>Issuance stays disabled until a complete approved policy is deployed.</span></div>}</aside>
    </div>}

    {preview && <div className="legal-preview" role="dialog" aria-modal="true" aria-label="Official notice preview"><header><strong>Official A4 preview</strong><div><button type="button" onClick={() => setPreviewSize('fit')}>Fit width</button><button type="button" onClick={() => setPreviewSize('actual')}>Actual size</button><button type="button" onClick={() => window.print()}>Print preview</button><button type="button" onClick={() => { const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([preview],{type:'text/html'})); link.download='watermarked-notice-preview.html'; link.click(); URL.revokeObjectURL(link.href) }}>Download watermarked</button><button type="button" onClick={() => setPreview('')} aria-label="Close preview"><X/></button></div></header><iframe className={previewSize} sandbox="" title="Watermarked legal draft preview" srcDoc={preview}/></div>}
  </div>
}

const Section = ({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: ReactNode }) => <section className="legal-section"><header><span>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>
const Fact = ({ label, value }: { label: string; value?: string | null }) => <div><span>{label}</span><strong>{value || 'Not recorded'}</strong></div>
const Queue = ({ notices, onOpen, issued = false }: { notices: LegalNoticeRecord[]; onOpen: (notice: LegalNoticeRecord) => void; issued?: boolean }) => <section className="legal-queue"><header><h2>{issued ? 'Issued & Responses' : 'Action Queue'}</h2><p>{issued ? 'Issued notices, delivery records, deadlines, and vendor responses.' : 'Drafts awaiting evaluator preparation.'}</p></header>{notices.length ? <div className="legal-table-wrap"><table><thead><tr><th>Reference</th><th>Establishment</th><th>Type</th><th>Preparer</th><th>Current state</th><th>Last saved / issued</th><th>Delivery</th><th>Deadline</th><th>Action</th></tr></thead><tbody>{notices.map((notice) => <tr key={notice.id}><td>{notice.control_number || `Draft #${notice.id}`}</td><td>{notice.store?.store_name || notice.source_snapshot.store?.store_name || 'Not recorded'}</td><td>{notice.notice_type}</td><td>{notice.preparer?.name || 'Not assigned'}</td><td>{notice.overdue ? 'Overdue' : notice.status.replace('_', ' ')}</td><td>{new Date(notice.issued_at || notice.updated_at).toLocaleString()}</td><td>{notice.delivery_state.replace('_', ' ')}</td><td>{notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery'}</td><td><button type="button" onClick={() => onOpen(notice)}>{notice.status === 'draft' ? 'Continue' : 'Review'}</button></td></tr>)}</tbody></table></div> : <div className="legal-empty"><FileText size={28}/><strong>{issued ? 'No issued notices' : 'No drafts in the queue'}</strong><span>{issued ? 'Issued notices will appear here after policy-authorized issuance.' : 'Open an accepted monitoring record to prepare a notice.'}</span></div>}</section>
