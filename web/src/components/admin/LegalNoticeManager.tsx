import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ClipboardList, Eye, FilePenLine, FileText, Paperclip, Save, Search, Send, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { adminApi } from '../../services/adminApi'
import type { LegalNoticeRecord, MonitoringRecordPage, MonitoringRecordRecord } from '../../types/admin'

type View = 'queue' | 'prepare' | 'issued'
type DeliveryMethod = 'portal' | 'email_and_hand_copy' | 'hand_copy'
type Confirmation = { title: string; body: ReactNode; confirmLabel: string; run: () => Promise<void> | void }

const RESPONSE_REASONS: Record<string, string> = {
  WHOLESALE_HIKE: 'Distributor or manufacturer wholesale price increase',
  FREIGHT_SURCHARGE: 'Logistics or inter-island freight surcharge',
  ENCODING_ERROR: 'POS or shelf tag clerical error',
  PACKAGING_DISCREPANCY: 'Grammage or packaging variant mismatch',
  FORCE_MAJEURE: 'Supply chain interruption',
}

/** Server readiness keys, in form order, with the section that fixes each one. */
const READINESS = [
  { key: 'case_reference', label: 'Case reference', section: 'legal-section-1' },
  { key: 'notice_type_and_basis', label: 'Reason and legal basis', section: 'legal-section-2' },
  { key: 'recipient_and_delivery', label: 'Recipient and delivery method', section: 'legal-section-3' },
  { key: 'evidence_and_attachments', label: 'Evidence', section: 'legal-section-4' },
  { key: 'internal_justification', label: 'Internal justification', section: 'legal-section-5' },
] as const

const DELIVERY_METHODS: Record<DeliveryMethod, { label: string; help: string }> = {
  portal: { label: 'Vendor portal only', help: 'The vendor sees and answers it in their portal. Needs an active linked vendor account.' },
  email_and_hand_copy: { label: 'Portal + email + printed copy', help: 'Shown in the portal, the vendor gets an email, and you hand over a printed copy.' },
  hand_copy: { label: 'Printed copy only', help: 'Print and hand-deliver it. It still appears in the portal if the store has a linked vendor.' },
}

const POLICY_OFF = 'Issuing is turned off until an approved legal policy is configured for this notice type.'

/** Current local time in the format a datetime-local input expects. */
const localNow = () => { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16) }
const humanize = (value: string) => { const text = value.replaceAll('_', ' '); return text.charAt(0).toUpperCase() + text.slice(1) }
const eligibleItems = (value: MonitoringRecordRecord) => value.items.filter((item) => item.is_anomaly && item.reference_status === 'available' && item.reference_value != null)
const missingReadiness = (readiness: Record<string, boolean> = {}) => READINESS.filter((item) => !readiness[item.key])
const focusSection = (id: string) => {
  const section = document.getElementById(id)
  section?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  section?.focus()
}

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
  // Snapshot of the form as last loaded or saved; preview and issue save pending edits first.
  const [savedForm, setSavedForm] = useState('')
  const [error, setError] = useState('')
  const [deliveryState, setDeliveryState] = useState<'received' | 'refused' | 'failed'>('received')
  const [deliveredAt, setDeliveredAt] = useState('')
  const [applySignature, setApplySignature] = useState(false)
  const [offline, setOffline] = useState({ channel: 'email' as 'email' | 'paper', received_at: '', response_text: '', evidence: null as File | null })
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [issueResult, setIssueResult] = useState<{ id: number; notification: LegalNoticeRecord['notification']; portal: boolean } | null>(null)
  const [visits, setVisits] = useState<MonitoringRecordPage | null>(null)
  const [visitSearch, setVisitSearch] = useState('')
  const deliveryField = useRef<HTMLSelectElement>(null)
  // Bumped whenever the selected notice may change by another path, so a slower detail response cannot replace it.
  const detailRequest = useRef(0)
  useEffect(() => { detailRequest.current++ }, [view])

  const eligible = useMemo(() => record ? eligibleItems(record) : [], [record])
  const choosingVisit = view === 'prepare' && !record && !notice && !sourceId

  useEffect(() => {
    const load = sourceId ? adminApi.getMonitoringRecord(sourceId).then((value) => {
      setRecord(value); setSelectedIds(eligibleItems(value).map((item) => item.id))
    }) : adminApi.getLegalNotices().then((page) => setNotices(page.data))
    void load.catch((reason) => setError(messageOf(reason, sourceId ? 'The source monitoring record could not be loaded.' : 'Legal actions are unavailable.'))).finally(() => setLoading(false))
    if (sourceNoticeId) void adminApi.getLegalNotice(sourceNoticeId).then(openNotice).catch((reason) => setError(messageOf(reason, 'The notice could not be opened.')))
  }, [sourceId, sourceNoticeId])

  useEffect(() => {
    if (sourceId && view !== 'prepare' && !notices.length) void adminApi.getLegalNotices().then((page) => setNotices(page.data)).catch((reason) => setError(messageOf(reason, 'Legal actions are unavailable.')))
  }, [view, sourceId, notices.length])

  // Prepare opened without a source visit: list accepted visits that have observations.
  useEffect(() => {
    if (!choosingVisit) return
    const timer = window.setTimeout(() => {
      void adminApi.getMonitoringRecords({ anomaly: 'yes', search: visitSearch.trim() || undefined, per_page: 10 })
        .then(setVisits)
        .catch((reason) => setError(messageOf(reason, 'Monitoring visits could not be loaded.')))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [choosingVisit, visitSearch])

  const chooseVisit = async (id: number) => {
    setBusy(true); setError('')
    try { const value = await adminApi.getMonitoringRecord(id); setRecord(value); setSelectedIds(eligibleItems(value).map((item) => item.id)) }
    catch (reason) { setError(messageOf(reason, 'The monitoring visit could not be loaded.')) }
    finally { setBusy(false) }
  }

  const openNotice = (value: LegalNoticeRecord) => {
    setNotice(value)
    const next = {
      recipient_name: value.draft_payload.recipient_name || '', recipient_title: value.draft_payload.recipient_title || '', recipient_email: value.draft_payload.recipient_email || '', address: value.draft_payload.address || '',
      reason: value.draft_payload.reason || '', legal_bases: value.draft_payload.legal_bases ?? [], intended_delivery_method: value.intended_delivery_method || '', internal_justification: value.internal_justification || '',
    }
    setForm(next); setSavedForm(JSON.stringify(next))
    setSaved(false); setApplySignature(false); setView(value.status === 'draft' ? 'prepare' : 'issued')
  }

  const edit = (changes: Partial<typeof form>) => { setSaved(false); setForm({ ...form, ...changes }) }

  const createDraft = async () => {
    if (!record || !selectedIds.length) return
    setBusy(true); setError('')
    try { openNotice(await adminApi.createLegalNotice({ monitoring_record_id: record.id, notice_type: noticeType, item_ids: selectedIds })); toast.success('Draft started. Fill in the recipient and reason, then issue.') }
    catch (reason) { setError(messageOf(reason, 'The draft could not be created.')) }
    finally { setBusy(false) }
  }

  /** Saves the draft and returns the server copy (with fresh readiness), or null when it failed. */
  const save = async (): Promise<LegalNoticeRecord | null> => {
    if (!notice) return null
    setBusy(true); setSaved(false); setError('')
    try {
      const updated = await adminApi.updateLegalNotice(notice.id, { ...form, reason: form.reason || null })
      setNotice(updated); setSaved(true); setSavedForm(JSON.stringify(form)); toast.success('Draft saved.')
      return updated
    } catch (reason) { setError(messageOf(reason, 'The draft could not be saved.')); return null }
    finally { setBusy(false) }
  }

  const readiness = notice?.readiness ?? {}
  const dirty = !!notice && notice.status === 'draft' && JSON.stringify(form) !== savedForm
  const saveIfDirty = async () => dirty ? save() : notice

  const showPreview = async () => {
    const current = await saveIfDirty()
    if (!current) return
    setBusy(true); setError('')
    try { setPreview(await adminApi.previewLegalNotice(current.id)) }
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

  const requestIssue = async () => {
    const current = await saveIfDirty()
    if (!current) return
    const missing = missingReadiness(current.readiness)
    if (missing.length) { setError(`Complete "${missing[0].label}" before issuing.`); focusSection(missing[0].section); return }
    const signed = applySignature && !!current.signatory?.has_signature
    const method = current.intended_delivery_method ? DELIVERY_METHODS[current.intended_delivery_method].label : 'Not selected'
    setConfirmation({
      title: `Issue this ${current.notice_type === 'LOI' ? 'Letter of Inquiry' : 'Show Cause Order'}?`,
      confirmLabel: 'Issue notice',
      body: <>
        <dl className="legal-confirm-summary">
          <div><dt>Establishment</dt><dd>{current.store?.store_name || current.source_snapshot.store?.store_name || 'Not recorded'}</dd></div>
          <div><dt>Recipient</dt><dd>{[current.draft_payload.recipient_name, current.draft_payload.recipient_email].filter(Boolean).join(' · ') || 'Not recorded'}</dd></div>
          <div><dt>Delivery</dt><dd>{method}</dd></div>
          <div><dt>Signature</dt><dd>{signed ? `e-signature of ${current.signatory?.name ?? 'the signatory'}` : 'Printed name only, signed by hand'}</dd></div>
        </dl>
        <p>An issued notice is final and cannot be edited.</p>
      </>,
      run: () => issue(current, signed),
    })
  }

  const issue = async (current: LegalNoticeRecord, signed: boolean) => {
    setBusy(true); setError('')
    try {
      const issued = await adminApi.issueLegalNotice(current.id, signed)
      replaceInList(issued); openNotice(issued)
      setIssueResult({ id: issued.id, notification: issued.notification, portal: !!issued.vendor_user_id })
      toast.success('Notice issued.')
    }
    catch (reason) { setError(messageOf(reason, 'The notice could not be issued.')) }
    finally { setBusy(false) }
  }

  const recordDelivery = () => {
    if (!notice) return
    if (!deliveredAt) { setError('Enter when the notice was actually delivered.'); return }
    setConfirmation({
      title: `Record delivery as ${deliveryState}?`,
      body: <p>{`Delivered ${new Date(deliveredAt).toLocaleString()}. A recorded receipt or refusal starts the legal deadline and cannot be changed.`}</p>,
      confirmLabel: 'Record delivery',
      run: async () => {
        detailRequest.current++
        setBusy(true); setError('')
        try { const updated = await adminApi.recordLegalDelivery(notice.id, { state: deliveryState, recorded_at: new Date(deliveredAt).toISOString() }); setNotice(updated); setNotices(notices.map((item) => item.id === updated.id ? updated : item)); setIssueResult(null); toast.success('Delivery recorded.') }
        catch (reason) { setError(messageOf(reason, 'Delivery could not be recorded.')) }
        finally { setBusy(false) }
      },
    })
  }

  const recordOffline = () => {
    if (!notice || !offline.evidence) return
    const evidence = offline.evidence
    setConfirmation({
      title: 'Record this response?', body: <p>The notice will count as answered.</p>, confirmLabel: 'Record response',
      run: async () => {
        detailRequest.current++
        setBusy(true); setError('')
        try {
          const updated = await adminApi.recordOfflineResponse(notice.id, { channel: offline.channel, received_at: new Date(offline.received_at).toISOString(), response_text: offline.response_text.trim(), evidence })
          replaceInList(updated); openNotice(updated); setOffline({ channel: 'email', received_at: '', response_text: '', evidence: null }); toast.success('Response recorded.')
        } catch (reason) { setError(messageOf(reason, 'The response could not be recorded.')) }
        finally { setBusy(false) }
      },
    })
  }

  const confirmLinkedVendor = async () => {
    if (!notice) return
    setBusy(true); setError('')
    try { setNotice(await adminApi.updateLegalNotice(notice.id, { confirm_linked_vendor: true })); toast.success('Recipient confirmed against the linked vendor account.') }
    catch (reason) { setError(messageOf(reason, 'The recipient could not be confirmed.')) }
    finally { setBusy(false) }
  }

  const replaceInList = (updated: LegalNoticeRecord) => setNotices((current) => current.some((item) => item.id === updated.id) ? current.map((item) => item.id === updated.id ? updated : item) : [updated, ...current])

  const closeNotice = () => {
    if (!notice) return
    setConfirmation({
      title: 'Close this notice?', body: <p>Use Escalate instead if a Show Cause Order should follow.</p>, confirmLabel: 'Close notice',
      run: async () => {
        detailRequest.current++
        setBusy(true); setError('')
        try { const closed = await adminApi.closeLegalNotice(notice.id); replaceInList(closed); openNotice(closed); toast.success('Notice closed.') }
        catch (reason) { setError(messageOf(reason, 'The notice could not be closed.')) }
        finally { setBusy(false) }
      },
    })
  }

  const escalate = () => {
    if (!notice) return
    setConfirmation({
      title: 'Escalate to a Show Cause Order?', body: <p>This closes the LOI and prepares an SCO draft for the same visit and products.</p>, confirmLabel: 'Escalate',
      run: async () => {
        detailRequest.current++
        setBusy(true); setError('')
        try {
          const sco = await adminApi.escalateLegalNotice(notice.id)
          const closed = await adminApi.getLegalNotice(notice.id)
          replaceInList(closed); replaceInList(sco); setNoticeType('SCO'); openNotice(sco); toast.success('SCO draft prepared.')
        } catch (reason) { setError(messageOf(reason, 'The notice could not be escalated.')) }
        finally { setBusy(false) }
      },
    })
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

  const goTo = (next: View) => {
    if (next === view) return
    // Prepare edits drafts only; leaving an issued notice selected would show it as an editable form.
    if (next === 'prepare' && notice && notice.status !== 'draft') setNotice(null)
    if (!dirty) { setView(next); return }
    setConfirmation({
      title: 'Discard unsaved changes?', body: <p>Your latest edits to this draft have not been saved.</p>, confirmLabel: 'Discard changes',
      run: () => { setForm(JSON.parse(savedForm)); setView(next) },
    })
  }

  const policyOff = !!notice && notice.policy?.status !== 'LEGAL_POLICY_AVAILABLE'
  const missing = notice ? missingReadiness(readiness) : []
  const issueHint = !notice ? 'Start a draft first.' : policyOff ? POLICY_OFF : missing.length ? `Still needed: ${missing[0].label}.` : dirty ? 'Unsaved edits are saved automatically when you issue.' : 'Ready to issue.'

  return <div className="legal-workspace">
    <nav className="legal-tabs" aria-label="Legal Actions views">
      <button type="button" aria-current={view === 'queue' ? 'page' : undefined} onClick={() => goTo('queue')}><ClipboardList size={18}/>Action Queue</button>
      <button type="button" aria-current={view === 'prepare' ? 'page' : undefined} onClick={() => goTo('prepare')}><FilePenLine size={18}/>Prepare Notice</button>
      <button type="button" aria-current={view === 'issued' ? 'page' : undefined} onClick={() => goTo('issued')}><FileText size={18}/>Issued & Responses</button>
    </nav>

    {error && <div className="legal-alert" role="alert"><ShieldAlert size={18}/><span>{error}</span></div>}
    {loading ? <div className="legal-loading" aria-label="Loading legal actions"/>
      : view === 'queue' ? <Queue notices={notices.filter((item) => item.status === 'draft')} onOpen={openNotice} onStart={() => { setNotice(null); if (!sourceId) setRecord(null); setView('prepare') }}/>
      : view === 'issued' ? <>
        <Queue notices={notices.filter((item) => item.status !== 'draft')} onOpen={reviewIssued} issued/>
        {notice && notice.status !== 'draft' && <section className="legal-issued-detail">
          <header><div><h3>{notice.control_number || `Notice #${notice.id}`}</h3><p>{notice.notice_type} · {humanize(notice.status)}</p></div><button type="button" className="admin-button secondary" onClick={() => void openIssuedDocument()}><FileText size={17}/>Open document</button></header>
          {issueResult?.id === notice.id && <IssueResult result={issueResult} onRecordDelivery={() => deliveryField.current?.focus()}/>}
          <div className="legal-facts"><Fact label="Establishment" value={notice.store?.store_name}/><Fact label="Delivery" value={humanize(notice.delivery_state)}/><Fact label="Deadline" value={notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery'}/>{notice.signatory_snapshot && <Fact label="Signed by" value={`${notice.signatory_snapshot.name ?? 'Not recorded'} · ${notice.signatory_snapshot.signature_applied ? 'e-signature applied' : 'hand signature'}`}/>}</div>
          {notice.legacy && <div className="legal-policy-lock"><strong>Legacy notice · offline handling</strong><span>Issued before deadline rules were recorded. It is not shown in the vendor portal; record delivery and the response on paper, then close or cancel it here.</span></div>}
          {notice.status === 'issued' && !notice.legacy && ['not_recorded', 'failed'].includes(notice.delivery_state) && <div className="legal-delivery-controls">
            <label>Record delivery state<select ref={deliveryField} value={deliveryState} onChange={(event) => setDeliveryState(event.target.value as typeof deliveryState)}><option value="received">Received</option><option value="refused">Refused</option><option value="failed">Failed</option></select></label>
            <label>Actual date and time<input type="datetime-local" value={deliveredAt} max={localNow()} onChange={(event) => setDeliveredAt(event.target.value)}/></label>
            <button type="button" className="admin-button primary" disabled={busy} onClick={recordDelivery}>Record delivery</button>
          </div>}
          {notice.status === 'issued' && !notice.legacy && ['received', 'refused'].includes(notice.delivery_state) && <section className="legal-offline-response" aria-labelledby="legal-offline-title">
            <h4 id="legal-offline-title">Record an emailed or paper response</h4>
            <p>The printed notice asks the vendor to reply by email. Record that reply here so it counts as answered.</p>
            <div className="legal-delivery-controls"><label>Received by<select value={offline.channel} onChange={(event) => setOffline({ ...offline, channel: event.target.value as 'email' | 'paper' })}><option value="email">Email</option><option value="paper">Paper</option></select></label><label>Received at<input type="datetime-local" value={offline.received_at} max={localNow()} onChange={(event) => setOffline({ ...offline, received_at: event.target.value })}/></label></div>
            <label>Response summary<textarea rows={3} maxLength={10000} aria-describedby="legal-offline-summary-hint" value={offline.response_text} onChange={(event) => setOffline({ ...offline, response_text: event.target.value })}/></label><small id="legal-offline-summary-hint" className="legal-field-hint">At least 20 characters.</small>
            <label>Received email or scan (PDF, JPEG, PNG)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setOffline({ ...offline, evidence: event.target.files?.[0] ?? null })}/></label>
            <button type="button" className="admin-button secondary" disabled={busy || !offline.received_at || offline.response_text.trim().length < 20 || !offline.evidence} onClick={recordOffline}>Record response</button>
          </section>}
          {notice.response_received_at && <section className="legal-vendor-response" aria-labelledby="legal-vendor-response-title">
            <h4 id="legal-vendor-response-title">Vendor response</h4>
            <div className="legal-facts"><Fact label="Received" value={new Date(notice.response_received_at).toLocaleString()}/><Fact label="Channel" value={notice.response_channel === 'portal' ? 'Vendor Portal (sworn)' : notice.response_channel ? `${notice.response_channel === 'email' ? 'Email' : 'Paper'} · recorded by DTI` : null}/><Fact label="Stated reason" value={notice.response_reason_category ? RESPONSE_REASONS[notice.response_reason_category] ?? notice.response_reason_category : null}/><Fact label="Certified true and correct" value={notice.response_certified_at ? new Date(notice.response_certified_at).toLocaleString() : null}/></div>
            {notice.response_text && <p className="legal-response-text">{notice.response_text}</p>}
            <div className="legal-response-attachments">{notice.attachments?.filter((attachment) => ['vendor_response', 'offline_response'].includes(attachment.kind)).map((attachment) => <button type="button" key={attachment.id} className="admin-button secondary" onClick={() => void openAttachment(attachment.id)}><Paperclip size={16}/>{attachment.original_name}{attachment.category ? ` · ${attachment.category.replaceAll('_', ' ').toLowerCase()}` : ''}</button>)}</div>
          </section>}
          {!['closed', 'cancelled'].includes(notice.status) && <div className="legal-delivery-controls">{notice.can_escalate && <button type="button" className="admin-button primary" disabled={busy} onClick={escalate}>Escalate to SCO</button>}<button type="button" className="admin-button secondary" disabled={busy} onClick={closeNotice}>Close notice</button></div>}
        </section>}
      </>
      : choosingVisit ? <VisitPicker page={visits} search={visitSearch} busy={busy} onSearch={setVisitSearch} onChoose={(id) => void chooseVisit(id)}/>
      : <div className="legal-editor-layout">
        <main className="legal-form-stack">
          <header className="legal-view-heading"><div><h2>Prepare Notice</h2><p>Build one evidence-backed notice for one accepted monitoring visit.</p></div><span className="legal-protocol">Evaluator review required</span></header>

          <Section id="legal-section-1" number="1" title="Case Reference" subtitle="Facts from the monitoring visit. These cannot be edited.">
            {record ? <><div className="legal-facts"><Fact label="Establishment" value={record.store.store_name}/><Fact label="Monitoring record" value={`#${record.id}`}/><Fact label="Monitoring date" value={new Date(record.finalized_at).toLocaleDateString()}/><Fact label="Field officer" value={record.officer.name}/><Fact label="Representative" value={[record.representative_name, record.representative_title].filter(Boolean).join(' · ')}/><Fact label="Address" value={record.store.address}/></div><p className="legal-neutral-note">Reference comparison · Observed price above captured reference. Evaluator review required; this is not an automatic legal finding.</p>{!notice && !sourceId && <button type="button" className="text-button" onClick={() => setRecord(null)}>Choose a different visit</button>}</>
              : notice ? <><div className="legal-facts"><Fact label="Establishment" value={notice.source_snapshot.store?.store_name}/><Fact label="Monitoring record" value={`#${notice.monitoring_record_id}`}/><Fact label="Monitoring date" value={notice.source_snapshot.monitoring_date ? new Date(notice.source_snapshot.monitoring_date).toLocaleDateString() : null}/><Fact label="Address" value={notice.source_snapshot.store?.address}/></div><p className="legal-neutral-note">Reference comparison · Evaluator review required; this is not an automatic legal finding.</p></>
              : <p>The linked visit is unavailable or stale.</p>}
          </Section>

          <Section id="legal-section-2" number="2" title="Notice Type & Basis" subtitle="Choose the document; the legal policy controls the permitted reasons and bases.">
            <fieldset className="legal-choice-row" disabled={!!notice}><legend>Notice type</legend><label><input type="radio" name="legal-notice-type" checked={noticeType === 'LOI'} onChange={() => setNoticeType('LOI')}/>LOI (Letter of Inquiry)</label><label><input type="radio" name="legal-notice-type" checked={noticeType === 'SCO'} onChange={() => setNoticeType('SCO')}/>SCO (Show Cause Order)</label></fieldset>
            {!notice && <div className="legal-start">
              <p>{selectedIds.length ? `Uses the ${selectedIds.length} selected product${selectedIds.length === 1 ? '' : 's'} in Evidence below.` : 'Select at least one product in Evidence below.'}</p>
              <button type="button" className="admin-button primary" disabled={!record || !selectedIds.length || busy} onClick={() => void createDraft()}>{busy ? 'Starting…' : `Start ${noticeType} draft`}</button>
            </div>}
            {notice && <div className="legal-input-grid"><label>Reason for issuance<select value={form.reason} onChange={(event) => edit({ reason: event.target.value })}><option value="">Select reason</option>{(notice.policy?.reasons ?? []).map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label><fieldset className="legal-basis-options"><legend>Approved legal bases</legend>{(notice.policy?.legal_bases ?? []).map((basis) => <label key={basis}><input type="checkbox" checked={form.legal_bases.includes(basis)} onChange={(event) => edit({ legal_bases: event.target.checked ? [...form.legal_bases, basis] : form.legal_bases.filter((value) => value !== basis) })}/>{basis}</label>)}</fieldset></div>}
          </Section>

          <Section id="legal-section-3" number="3" title="Recipient & Delivery" subtitle="Prefilled from the visit and linked vendor; edit if needed.">
            {notice?.recipient_review_required && <div className="legal-policy-lock" role="status"><strong>Vendor link changed · review recipient</strong><span>The store's vendor account changed after this draft was prepared. Check the recipient details below, then confirm.</span><button type="button" className="admin-button secondary" disabled={busy} onClick={() => void confirmLinkedVendor()}>Use linked vendor</button></div>}
            {notice ? <div className="legal-input-grid">
              <label>Representative / contact person<input value={form.recipient_name} onChange={(e) => edit({ recipient_name: e.target.value })}/></label>
              <label>Position<input value={form.recipient_title} onChange={(e) => edit({ recipient_title: e.target.value })}/></label>
              <label>Email address<input type="email" value={form.recipient_email} onChange={(e) => edit({ recipient_email: e.target.value })}/></label>
              <label>How the vendor receives it<select value={form.intended_delivery_method} onChange={(e) => edit({ intended_delivery_method: e.target.value })}><option value="">Select method</option>{(Object.keys(DELIVERY_METHODS) as DeliveryMethod[]).map((method) => <option key={method} value={method}>{DELIVERY_METHODS[method].label}</option>)}</select>{form.intended_delivery_method && <small className="legal-field-hint">{DELIVERY_METHODS[form.intended_delivery_method as DeliveryMethod].help}</small>}</label>
              <label className="legal-span-2">Establishment address<input value={form.address} onChange={(e) => edit({ address: e.target.value })}/></label>
            </div> : <p className="legal-placeholder">Available after you start the draft. Contacts are prefilled from the visit.</p>}
          </Section>

          <Section id="legal-section-4" number="4" title="Evidence & Attachments" subtitle="Monitoring evidence is original; supplemental files can be removed while drafting.">
            <div className="legal-evidence-list">
              {eligible.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={!!notice} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))}/><span><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><small>Observed ₱{Number(item.recorded_price).toFixed(2)} · captured reference ₱{Number(item.reference_value).toFixed(2)} · {item.reference_label || 'Reference label not recorded'}</small></span><span className="legal-locked">Original</span></label>)}
              {!record && notice?.source_snapshot.items.map((item, index) => <div className="legal-snapshot-evidence" key={String(item.id ?? index)}><span><strong>{String(item.commodity_name || `Item #${item.id || index + 1}`)}</strong><small>Observed ₱{Number(item.observed_price).toFixed(2)} · captured reference ₱{Number(item.reference_value).toFixed(2)} · {String(item.reference_label || 'Reference label not recorded')}</small></span><span className="legal-locked">Original</span></div>)}
            </div>
            {notice && <><label className="legal-upload"><Paperclip size={18}/>Add supplemental PDF, JPEG, or PNG<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => void addAttachment(event.target.files?.[0])}/></label>{notice.attachments?.map((attachment) => <div className="legal-attachment" key={attachment.id}><span>{attachment.original_name}</span><button type="button" aria-label={`Remove ${attachment.original_name}`} onClick={() => void removeAttachment(attachment.id)}><X size={16}/></button></div>)}</>}
          </Section>

          <Section id="legal-section-5" number="5" title="Internal Justification" subtitle="Your internal rationale; not printed on the notice.">
            {notice ? <label>Internal justification<textarea rows={4} value={form.internal_justification} onChange={(e) => edit({ internal_justification: e.target.value })} maxLength={2000}/></label> : <p className="legal-placeholder">Available after you start the draft.</p>}
          </Section>
        </main>

        <aside className="legal-issuance-panel" aria-label="Issuance Panel">
          <h3>Issuance Panel</h3>
          <div className="legal-status"><span>Status</span><strong>{notice?.status === 'draft' ? 'Drafting' : notice ? humanize(notice.status) : 'Not started'}</strong></div>
          {!notice && <button type="button" className="admin-button primary" disabled={!record || !selectedIds.length || busy} onClick={() => void createDraft()}>{`Start ${noticeType} draft`}</button>}
          {notice && <>
            <h4>Checklist</h4>
            <ul className="legal-checklist">{READINESS.map((item) => <li key={item.key} className={readiness[item.key] ? 'done' : ''}>{readiness[item.key] ? <><Check size={16}/>{item.label}</> : <button type="button" onClick={() => focusSection(item.section)}><span aria-hidden="true"/>{item.label}</button>}</li>)}</ul>
            <div className="legal-panel-meta"><span>Assigned evaluator</span><strong>{notice.preparer?.name || record?.officer.name || 'Not assigned'}</strong><span>Last saved</span><strong>{new Date(notice.updated_at).toLocaleString()}</strong>{saved && !dirty && <em><Check size={14}/>All changes saved</em>}</div>
            <button type="button" className="admin-button secondary" disabled={busy} onClick={() => void save()}><Save size={17}/>Save Draft</button>
            <button type="button" className="admin-button secondary" disabled={busy} onClick={() => void showPreview()}><Eye size={17}/>Open Official Preview</button>
            {notice.status === 'draft' && <div className="legal-signature-choice"><span>Signatory</span><strong>{notice.signatory?.name || 'Not set in Settings'}</strong>{notice.signatory?.has_signature ? <label><input type="checkbox" checked={applySignature} onChange={(event) => setApplySignature(event.target.checked)}/>Apply this official&apos;s e-signature</label> : <small>No e-signature uploaded; the printed copy is signed by hand.</small>}</div>}
          </>}
          {error && view === 'prepare' && <p className="legal-panel-error" aria-live="polite">{error}</p>}
          <button type="button" className="admin-button primary" disabled={!notice || policyOff || busy} onClick={() => void requestIssue()}><Send size={17}/>Issue Notice</button>
          <p className="legal-issue-hint">{issueHint}</p>
        </aside>
      </div>}

    {preview && <div className="legal-preview" role="dialog" aria-modal="true" aria-label="Official notice preview"><header><strong>Official A4 preview</strong><div><button type="button" onClick={() => setPreviewSize('fit')}>Fit width</button><button type="button" onClick={() => setPreviewSize('actual')}>Actual size</button><button type="button" onClick={() => window.print()}>Print preview</button><button type="button" onClick={() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([preview], { type: 'text/html' })); link.download = 'watermarked-notice-preview.html'; link.click(); URL.revokeObjectURL(link.href) }}>Download watermarked</button><button type="button" onClick={() => setPreview('')} aria-label="Close preview"><X/></button></div></header><iframe className={previewSize} sandbox="" title="Watermarked legal draft preview" srcDoc={preview}/></div>}

    {confirmation && <ConfirmDialog confirmation={confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { const { run } = confirmation; setConfirmation(null); await run() }}/>}
  </div>
}

function ConfirmDialog({ confirmation, onCancel, onConfirm }: { confirmation: Confirmation; onCancel: () => void; onConfirm: () => Promise<void> }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])
  return <div className="admin-modal-backdrop">
    <section className="admin-modal user-action-dialog legal-confirm" role="dialog" aria-modal="true" aria-labelledby="legal-confirm-title">
      <header><h2 id="legal-confirm-title">{confirmation.title}</h2></header>
      <div className="legal-confirm-body">{confirmation.body}</div>
      <footer><button type="button" className="admin-button secondary" onClick={onCancel}>Cancel</button><button type="button" className="admin-button primary" autoFocus onClick={() => void onConfirm()}>{confirmation.confirmLabel}</button></footer>
    </section>
  </div>
}

function IssueResult({ result, onRecordDelivery }: { result: { notification: LegalNoticeRecord['notification']; portal: boolean }; onRecordDelivery: () => void }) {
  const email = result.notification === 'queued' ? 'Email notification queued to the vendor.'
    : result.notification === 'failed' ? 'The email could not be queued. Hand over the printed copy and tell the vendor directly.'
      : 'No email sent for this delivery method.'
  return <div className="legal-issue-result" role="status">
    <strong>Notice issued. How it reaches the vendor:</strong>
    <ul>
      <li>{result.portal ? 'Visible in the linked vendor’s portal.' : 'No active vendor account is linked, so it is not in any portal. Deliver the printed copy.'}</li>
      <li>{email}</li>
    </ul>
    <button type="button" className="admin-button secondary" onClick={onRecordDelivery}>Next: record when the vendor received it</button>
  </div>
}

function VisitPicker({ page, search, busy, onSearch, onChoose }: { page: MonitoringRecordPage | null; search: string; busy: boolean; onSearch: (value: string) => void; onChoose: (id: number) => void }) {
  return <section className="legal-queue legal-visit-picker" aria-labelledby="legal-visit-picker-title">
    <header><h2 id="legal-visit-picker-title">Choose a monitoring visit</h2><p>Notices are prepared from an accepted visit with price observations.</p></header>
    <label className="legal-visit-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Search visits" placeholder="Search store or officer…" value={search} onChange={(event) => onSearch(event.target.value)}/></label>
    {!page ? <div className="legal-loading" aria-label="Loading visits"/> : page.data.length ? <div className="legal-table-wrap"><table><thead><tr><th>Establishment</th><th>Visit</th><th>Observations</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{page.data.map((visit) => <tr key={visit.id}><td><strong>{visit.store.store_name}</strong><small>{visit.store.address}</small></td><td>#{visit.id} · {new Date(visit.finalized_at).toLocaleDateString()}<small>{visit.officer.name}</small></td><td>{visit.anomaly_count ?? 0}</td><td><button type="button" disabled={busy} onClick={() => onChoose(visit.id)}>Use this visit</button></td></tr>)}</tbody></table></div>
      : <div className="legal-empty"><FileText size={28}/><strong>No visits with observations</strong><span>Accepted Field Monitoring visits with price observations appear here.</span></div>}
  </section>
}

const Section = ({ id, number, title, subtitle, children }: { id: string; number: string; title: string; subtitle: string; children: ReactNode }) => <section id={id} tabIndex={-1} className="legal-section"><header><span>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>
const Fact = ({ label, value }: { label: string; value?: string | null }) => <div><span>{label}</span><strong>{value || 'Not recorded'}</strong></div>
const Queue = ({ notices, onOpen, onStart, issued = false }: { notices: LegalNoticeRecord[]; onOpen: (notice: LegalNoticeRecord) => void; onStart?: () => void; issued?: boolean }) => <section className="legal-queue">
  <header><div><h2>{issued ? 'Issued & Responses' : 'Action Queue'}</h2><p>{issued ? 'Issued notices, delivery, deadlines, and vendor responses.' : 'Drafts waiting to be finished and issued.'}</p></div>{onStart && <button type="button" className="admin-button primary" onClick={onStart}><FilePenLine size={16}/>New notice</button>}</header>
  {notices.length ? <div className="legal-table-wrap"><table><thead><tr><th>Reference</th><th>Establishment</th><th>Type</th><th>Status</th><th>{issued ? 'Deadline' : 'Delivery'}</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{notices.map((notice) => <tr key={notice.id}>
    <td><strong>{notice.control_number || `Draft #${notice.id}`}</strong><small>{notice.preparer?.name || 'Not assigned'} · {new Date(notice.issued_at || notice.updated_at).toLocaleDateString()}</small></td>
    <td>{notice.store?.store_name || notice.source_snapshot.store?.store_name || 'Not recorded'}</td>
    <td>{notice.notice_type}</td>
    <td>{notice.overdue ? 'Overdue' : humanize(notice.status)}{issued && <small>{humanize(notice.delivery_state)}</small>}</td>
    <td>{issued ? (notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery') : humanize(notice.delivery_state)}</td>
    <td><button type="button" onClick={() => onOpen(notice)}>{notice.status === 'draft' ? 'Continue draft' : 'Open'}</button></td>
  </tr>)}</tbody></table></div>
    : <div className="legal-empty"><FileText size={28}/><strong>{issued ? 'No issued notices' : 'No drafts in the queue'}</strong><span>{issued ? 'Issued notices appear here.' : 'Start a new notice from an accepted monitoring visit.'}</span></div>}
</section>
