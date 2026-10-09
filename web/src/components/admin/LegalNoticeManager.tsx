import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Check, ClipboardList, Eye, FilePenLine, FileSearch, FileText, Paperclip, Save, Search, Send, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { adminApi } from '../../services/adminApi'
import type { ItemDecision, LegalNoticeOutcome, LegalNoticePage, LegalNoticeRecord, MonitoringRecordPage, MonitoringRecordRecord } from '../../types/admin'
import type { NavigateTo } from './AdminShell'
import { Fact, LegalNoticeDetail, StatusChip } from './LegalNoticeDetail'
import { basisOf, COMPARISONS, DELIVERY_METHODS, humanize, overReference } from './legalNotice'
import type { DeliveryMethod, DeliveryState, IssueOutcome, OfflineResponse } from './legalNotice'

type View = 'review' | 'queue' | 'prepare' | 'issued' | 'detail'
type IssuedStatus = '' | 'issued' | 'response_received' | 'closed' | 'cancelled'
const ISSUED_STATUSES: { value: IssuedStatus; label: string }[] = [
  { value: '', label: 'All issued notices' }, { value: 'issued', label: 'Issued' }, { value: 'response_received', label: 'Response received' },
  { value: 'closed', label: 'Closed' }, { value: 'cancelled', label: 'Cancelled' },
]
const OPEN_STATUSES = ['draft', 'issued', 'response_received']
type Confirmation = { title: string; body: ReactNode; confirmLabel: string; run: () => Promise<void> | void }

/** How the approved legal bases are grouped (policy.basis_groups); a basis with no group is listed under "Other law". */
const BASIS_GROUPS = [
  { key: 'applicable_law', label: 'Applicable law', hint: 'The law the price comparison falls under.' },
  { key: 'penalty_procedure', label: 'Penalty and procedure', hint: 'The schedule of fines and the enforcement procedure.' },
  { key: 'other_law', label: 'Other law', hint: 'Select only if the evidence supports it. The system does not record price-tag or deceptive-sale findings.' },
]

/** Server readiness keys, in form order, with the section that fixes each one. */
const READINESS = [
  { key: 'case_reference', label: 'Case reference', section: 'legal-section-1' },
  { key: 'notice_type_and_basis', label: 'Reason and legal basis', section: 'legal-section-2' },
  { key: 'recipient_and_delivery', label: 'Recipient and delivery method', section: 'legal-section-3' },
  { key: 'evidence_and_attachments', label: 'Evidence', section: 'legal-section-4' },
  { key: 'internal_justification', label: 'Internal justification', section: 'legal-section-5' },
] as const

type CloseOutcome = Exclude<LegalNoticeOutcome, 'escalated_to_sco' | 'withdrawn'>
/** DTI's closure outcomes and the item decisions each one implies (an accepted explanation is not a confirmed finding). */
const CLOSE_OUTCOMES: Record<CloseOutcome, { label: string; decision: ItemDecision | null }> = {
  explanation_accepted: { label: 'Explanation accepted', decision: 'not_confirmed' },
  no_violation: { label: 'No violation found', decision: 'not_confirmed' },
  violation_confirmed: { label: 'Violation confirmed', decision: 'confirmed' },
  partially_confirmed: { label: 'Partly confirmed (decide each product)', decision: null },
}

/** Printed addressee field length (LegalNoticeController::FORM_LIMITS). */
const RECIPIENT_NAME_LIMIT = 70
const POLICY_OFF = 'Issuing is turned off until an approved legal policy is configured for this notice type.'

const eligibleItems = (value: MonitoringRecordRecord) => value.items.filter((item) => item.is_anomaly
  && (basisOf(item) === 'previous_price_spike'
    ? item.previous_price != null
    : item.reference_status === 'available' && item.reference_value != null))
const missingReadiness = (readiness: Record<string, boolean> = {}) => READINESS.filter((item) => !readiness[item.key])
// Scroll only the Admin panel; scrollIntoView/focus would also scroll the overflow-hidden shell and body,
// shoving the whole layout up. Then focus the section's first field without any further scrolling.
const focusSection = (id: string) => {
  const section = document.getElementById(id)
  if (!section) return
  const panel = section.closest<HTMLElement>('.admin-panel')
  panel?.scrollBy?.({ top: section.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16, behavior: 'smooth' })
  section.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')?.focus({ preventScroll: true })
}

const adminPanel = () => document.querySelector<HTMLElement>('.admin-panel')
/** The current URL with the open notice set or removed; every other parameter is kept. */
const noticeUrl = (id: number | null, list: 'queue' | 'issued' = 'issued', visit?: number | null) => {
  const url = new URL(window.location.href)
  if (id) { url.searchParams.set('view', list); url.searchParams.set('source_notice', String(id)) } else url.searchParams.delete('source_notice')
  // source_record names the visit a new notice starts from; kept beside a notice of another visit, a reload would load both.
  if (id && visit && Number(url.searchParams.get('source_record')) !== visit) url.searchParams.delete('source_record')
  return `${url.pathname}${url.search}${url.hash}`
}
const urlNotice = () => Number(new URLSearchParams(window.location.search).get('source_notice')) || null

const messageOf = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { message?: string } } }
  return candidate.response?.data?.message || fallback
}

/** Finds the open notice for a visit by paging that store's notices; a page-1 scan misses older ones. */
const findOpenNotice = async (record: MonitoringRecordRecord) => {
  for (let page = 1, last = 1; page <= last; page++) {
    const result = await adminApi.getLegalNotices({ store_id: record.store.id, page })
    const match = result.data.find((item) => item.monitoring_record_id === record.id && OPEN_STATUSES.includes(item.status))
    if (match) return match
    last = result.last_page
  }
  return undefined
}

export const LegalNoticeManager = ({ onNavigate }: { onNavigate?: NavigateTo } = {}) => {
  const params = new URLSearchParams(window.location.search)
  const sourceId = Number(params.get('source_record')) || null
  // Opened from a Store Communications, Field Monitoring or GIS notice link. Read once: opening a notice from the
  // list puts it in the URL too, and that must not start a second load.
  const [sourceNoticeId] = useState(() => Number(params.get('source_notice')) || null)
  // Opened from Field Monitoring for a store: the lists show only that store's notices until cleared.
  const [storeFilter, setStoreFilter] = useState<number | null>(Number(params.get('source_store')) || null)
  // ?view= opens a list directly (the dashboard links its counts this way); otherwise Needs review comes first.
  const requestedView = params.get('view')
  const [view, setView] = useState<View>(sourceId ? 'prepare' : requestedView === 'queue' || requestedView === 'issued' ? requestedView : 'review')
  const [record, setRecord] = useState<MonitoringRecordRecord | null>(null)
  const [notices, setNotices] = useState<LegalNoticeRecord[]>([])
  const [listPage, setListPage] = useState<Pick<LegalNoticePage, 'current_page' | 'last_page' | 'total'>>({ current_page: 1, last_page: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [issuedStatus, setIssuedStatus] = useState<IssuedStatus>(() => {
    const requested = params.get('status')
    return ISSUED_STATUSES.some((option) => option.value === requested) ? requested as IssuedStatus : ''
  })
  const [listSearch, setListSearch] = useState('')
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
  const [applySignature, setApplySignature] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [issueResult, setIssueResult] = useState<IssueOutcome | null>(null)
  const [visits, setVisits] = useState<MonitoringRecordPage | null>(null)
  const [visitSearch, setVisitSearch] = useState('')
  const [visitPage, setVisitPage] = useState(1)
  // Bumped after a change that can move rows between lists (issue, close, cancel, escalate, no action, new draft).
  const [reload, setReload] = useState(0)
  const refreshLists = () => setReload((value) => value + 1)
  const [listError, setListError] = useState('')
  const [closing, setClosing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [noActionFor, setNoActionFor] = useState<MonitoringRecordRecord | null>(null)
  // Bumped whenever the selected notice changes or closes, so a slower detail response cannot replace it. Every
  // detail fetch goes through loadNotice, which owns the number.
  const detailRequest = useRef(0)
  // A backstop for views left by a plain setView. Entering the detail page must not drop the request that opened it.
  useEffect(() => { if (view !== 'detail') detailRequest.current++ }, [view])
  /**
   * Starts a change to the open notice. Its result always updates the lists, but reaches the page only if nothing
   * else was opened or closed while it ran (browser Back, another tab, another notice).
   */
  const begin = () => { const request = ++detailRequest.current; return () => request === detailRequest.current }
  // The visit of the open notice, for responses that arrive after it opened.
  const noticeVisit = useRef<number | null>(null)
  // Whether the detail page added a history entry (opened from the list), and where the list was scrolled.
  const pushedDetail = useRef(false)
  const listScroll = useRef(0)

  const eligible = useMemo(() => record ? eligibleItems(record) : [], [record])
  // Products a new notice may cite: eligible and not already decided by DTI (a no-action triage may still be cited).
  const citable = (value: MonitoringRecordRecord) => eligibleItems(value).filter((item) => !value.undecided_item_ids || value.undecided_item_ids.includes(item.id) || item.finding?.decision === 'no_action')
  const selectedBases = useMemo(() => [...new Set(eligible.filter((item) => selectedIds.includes(item.id)).map(basisOf))], [eligible, selectedIds])
  const mixedBases = selectedBases.length > 1
  const choosingVisit = (view === 'prepare' && !record && !notice && !sourceId) || view === 'review'
  // An SCO without a preceding LOI only for a price-freeze visit citing price ceilings; otherwise escalate an LOI.
  const scoAllowed = !!record && record.protocol_mode === 'emergency' && selectedIds.length > 0
    && selectedBases.every((basis) => basis === 'emergency_ceiling')
  useEffect(() => { if (!notice && noticeType === 'SCO' && !scoAllowed) setNoticeType('LOI') }, [notice, noticeType, scoAllowed])

  useEffect(() => {
    if (!sourceId) return
    void adminApi.getMonitoringRecord(sourceId).then((value) => {
      // A notice of another visit opened meanwhile (both named in the URL on reload): its own snapshot stays.
      if (noticeVisit.current && noticeVisit.current !== value.id) return
      setRecord(value)
      const groups = new Map<string | null, number[]>()
      citable(value).forEach((item) => groups.set(basisOf(item), [...(groups.get(basisOf(item)) ?? []), item.id]))
      setSelectedIds([...groups.values()].sort((left, right) => right.length - left.length)[0] ?? [])
    }).catch((reason) => setError(messageOf(reason, 'The source monitoring record could not be loaded.'))).finally(() => setLoading(false))
  }, [sourceId])

  useEffect(() => {
    if (sourceNoticeId) loadNotice(sourceNoticeId, 'The notice could not be opened.')
    // loadNotice only reads refs and sets state; the notice is opened once per source id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNoticeId])

  // Each list asks the server for one page. Drafts use status=draft; issued notices use the chosen status, or every
  // status with drafts left out of the rows (the API takes one status value).
  // The detail page belongs to the issued list: opening a notice must not switch the list to drafts or reset its page.
  const listKind = view === 'issued' || view === 'detail' ? 'issued' : 'queue'
  const listRequest = useRef(0)
  useEffect(() => { setPage(1) }, [listKind, issuedStatus, listSearch, storeFilter])
  useEffect(() => {
    if (view === 'prepare' || view === 'review' || view === 'detail') { if (!sourceId) setLoading(false); return }
    const status = listKind === 'queue' ? 'draft' : issuedStatus || undefined
    const request = ++listRequest.current
    const timer = window.setTimeout(() => {
      void adminApi.getLegalNotices({ status, page, search: listSearch.trim() || undefined, store_id: storeFilter ?? undefined, ...(listKind === 'issued' && !status ? { exclude_drafts: 1 as const } : {}) })
        .then((result) => {
          if (request !== listRequest.current) return
          // A change elsewhere can empty the last page; move to the last page that still exists.
          if (page > result.last_page) { setPage(result.last_page); return }
          setListError('')
          setNotices(result.data); setListPage({ current_page: result.current_page, last_page: result.last_page, total: result.total })
        })
        .catch((reason) => { if (request === listRequest.current) setListError(messageOf(reason, 'Legal actions are unavailable.')) })
        .finally(() => { if (!sourceId) setLoading(false) })
    }, listSearch ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [view, listKind, issuedStatus, page, listSearch, storeFilter, sourceId, reload])

  // Needs review: accepted visits with flagged products DTI has not decided yet, across all establishments.
  useEffect(() => { setVisitPage(1) }, [visitSearch])
  const visitRequest = useRef(0)
  useEffect(() => {
    if (!choosingVisit) return
    const request = ++visitRequest.current
    const timer = window.setTimeout(() => {
      void adminApi.getMonitoringRecords({ review: 'pending', search: visitSearch.trim() || undefined, store_id: storeFilter ?? undefined, per_page: 10, page: visitPage })
        .then((result) => { if (request === visitRequest.current) { setListError(''); setVisits(result) } })
        .catch((reason) => { if (request === visitRequest.current) setListError(messageOf(reason, 'Monitoring visits could not be loaded.')) })
    }, visitSearch ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [choosingVisit, visitSearch, visitPage, storeFilter, reload])

  const chooseVisit = async (id: number) => {
    setBusy(true); setError('')
    try { const value = await adminApi.getMonitoringRecord(id); setRecord(value); setSelectedIds(citable(value).map((item) => item.id)); setView('prepare') }
    catch (reason) { setError(messageOf(reason, 'The monitoring visit could not be loaded.')) }
    finally { setBusy(false) }
  }

  const formFrom = (value: LegalNoticeRecord) => ({
    recipient_name: value.draft_payload.recipient_name || '', recipient_title: value.draft_payload.recipient_title || '', recipient_email: value.draft_payload.recipient_email || '', address: value.draft_payload.address || '',
    reason: value.draft_payload.reason || '', legal_bases: value.draft_payload.legal_bases ?? [], intended_delivery_method: value.intended_delivery_method || '', internal_justification: value.internal_justification || '',
  })

  // A draft's reason follows its evidence. One saved with another reason (or none) opens with the derived reason and
  // unsaved, so the ordinary audited save records the correction.
  const withDerived = (next: typeof form, value: LegalNoticeRecord) => value.status === 'draft' && value.policy?.derived ? { ...next, reason: value.policy.derived.reason } : next

  const openNotice = (value: LegalNoticeRecord) => {
    setNotice(value)
    noticeVisit.current = value.monitoring_record_id ?? null
    // The editor shows the chosen visit while there is one; a notice from another visit shows its own snapshot.
    setRecord((current) => current && current.id !== value.monitoring_record_id ? null : current)
    const stored = formFrom(value)
    setForm(withDerived(stored, value)); setSavedForm(JSON.stringify(stored))
    setSaved(false); setApplySignature(false); setView(value.status === 'draft' ? 'prepare' : 'detail')
  }

  // The list endpoint omits readiness, policy and attachments, so a draft opened from a list row would show
  // done items unticked and Issue turned off. Open the row at once, then swap in the full record.
  const openedId = useRef<number | null>(null)
  useEffect(() => { openedId.current = notice?.id ?? null; noticeVisit.current = notice?.monitoring_record_id ?? null }, [notice])
  const openDraft = (value: LegalNoticeRecord) => {
    openNotice(value)
    const listForm = JSON.stringify(formFrom(value))
    void adminApi.getLegalNotice(value.id).then((detail) => {
      if (openedId.current !== value.id) return
      const detailForm = formFrom(detail)
      setNotice(detail)
      setSavedForm(JSON.stringify(detailForm))
      // Keep anything typed while the detail was loading.
      setForm((current) => withDerived(JSON.stringify(current) === listForm ? detailForm : current, detail))
    }).catch((reason) => { if (openedId.current === value.id) setError(messageOf(reason, 'The draft details could not be loaded.')) })
  }

  const edit = (changes: Partial<typeof form>) => { setSaved(false); setForm({ ...form, ...changes }) }

  const createDraft = async () => {
    if (!record || !selectedIds.length) return
    setBusy(true); setError('')
    try { openNotice(await adminApi.createLegalNotice({ monitoring_record_id: record.id, notice_type: noticeType, item_ids: selectedIds })); refreshLists(); toast.success('Draft started. Fill in the recipient and reason, then issue.') }
    catch (reason) {
      // 409: this visit already has an open notice. Open it instead of stopping at an error.
      const response = (reason as { response?: { status?: number; data?: { existing_notice_id?: number } } }).response
      const existingId = response?.status === 409 ? response.data?.existing_notice_id : undefined
      const existing = response?.status !== 409 ? undefined
        : existingId ? await adminApi.getLegalNotice(existingId).catch(() => undefined)
          : await findOpenNotice(record).catch(() => undefined)
      if (existing) {
        replaceInList(existing)
        if (existing.status === 'draft') openDraft(existing); else reviewIssued(existing)
        toast.info(`This visit already has an open ${existing.notice_type}; it is opened here.`)
      } else setError(messageOf(reason, 'The draft could not be created.'))
    }
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

  // Server readiness reflects the last save; for a draft, re-evaluate the form-driven items live with the
  // server's rules so the checklist ticks while typing. Issue still saves and re-checks on the server.
  const readiness = useMemo(() => {
    const saved = notice?.readiness ?? {}
    if (!notice || notice.status !== 'draft') return saved
    const basesRequired = notice.policy?.required_fields?.includes('legal_bases') ?? notice.notice_type === 'SCO'
    return {
      ...saved,
      // Same facts the server checks; known from any record, so they never flicker off while details load.
      case_reference: !!notice.monitoring_record_id,
      evidence_and_attachments: (notice.source_snapshot?.items?.length ?? 0) > 0,
      notice_type_and_basis: !!form.reason && (!basesRequired || form.legal_bases.length > 0),
      recipient_and_delivery: !!form.recipient_name.trim() && !!form.address.trim() && !!form.intended_delivery_method,
      internal_justification: !!form.internal_justification.trim(),
    }
  }, [notice, form])
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
    const stillOpen = begin()
    setBusy(true); setError('')
    try {
      const issued = await adminApi.issueLegalNotice(current.id, signed)
      replaceInList(issued); refreshLists()
      if (stillOpen()) { openNotice(issued); setIssueResult({ id: issued.id, notification: issued.notification, portal: !!issued.vendor_user_id }) }
      toast.success('Notice issued.')
    }
    catch (reason) { setError(messageOf(reason, 'The notice could not be issued.')) }
    finally { setBusy(false) }
  }

  const recordDelivery = (deliveryState: DeliveryState, deliveredAt: string) => {
    if (!notice) return
    if (!deliveredAt) { setError('Enter when the notice was actually delivered.'); return }
    setConfirmation({
      title: `Record delivery as ${deliveryState}?`,
      body: <p>{`Delivered ${new Date(deliveredAt).toLocaleString()}. A recorded receipt or refusal starts the legal deadline and cannot be changed.`}</p>,
      confirmLabel: 'Record delivery',
      run: async () => {
        const stillOpen = begin()
        setBusy(true); setError('')
        try {
          const updated = await adminApi.recordLegalDelivery(notice.id, { state: deliveryState, recorded_at: new Date(deliveredAt).toISOString() })
          replaceInList(updated)
          if (stillOpen()) { setNotice(updated); setIssueResult(null) }
          toast.success('Delivery recorded.')
        }
        catch (reason) { setError(messageOf(reason, 'Delivery could not be recorded.')) }
        finally { setBusy(false) }
      },
    })
  }

  const recordOffline = (offline: OfflineResponse) => {
    if (!notice) return
    setConfirmation({
      title: 'Record this response?', body: <p>The notice will count as answered.</p>, confirmLabel: 'Record response',
      run: async () => {
        const stillOpen = begin()
        setBusy(true); setError('')
        try {
          const updated = await adminApi.recordOfflineResponse(notice.id, { channel: offline.channel, received_at: new Date(offline.received_at).toISOString(), response_text: offline.response_text, evidence: offline.evidence })
          replaceInList(updated); refreshLists(); if (stillOpen()) openNotice(updated)
          toast.success('Response recorded.')
        } catch (reason) { setError(messageOf(reason, 'The response could not be recorded.')) }
        finally { setBusy(false) }
      },
    })
  }

  const confirmLinkedVendor = async () => {
    if (!notice) return
    setBusy(true); setError('')
    try {
      const updated = await adminApi.updateLegalNotice(notice.id, { confirm_recipient: true })
      setNotice(updated); setForm((current) => ({ ...current, recipient_email: updated.draft_payload.recipient_email || '' }))
      toast.success('Recipient confirmed against the store record.')
    }
    catch (reason) { setError(messageOf(reason, 'The recipient could not be confirmed.')) }
    finally { setBusy(false) }
  }

  const openVisit = (recordId: number | null | undefined) => recordId && onNavigate ? <button type="button" className="text-button" onClick={() => onNavigate('field_monitoring', { record: recordId })}>Open visit #{recordId} in Field Monitoring</button> : null
  const listControls = <ListControls kind={listKind} status={issuedStatus} search={listSearch} storeFilter={storeFilter} page={listPage}
    onStatus={setIssuedStatus} onSearch={setListSearch} onClearStore={() => setStoreFilter(null)} onPage={setPage}/>

  const replaceInList = (updated: LegalNoticeRecord) => setNotices((current) => current.some((item) => item.id === updated.id) ? current.map((item) => item.id === updated.id ? updated : item) : [updated, ...current])

  // Notices are legal records, so "delete" cancels: the row and audit history stay, the queue and the
  // one-open-notice-per-visit lock release, and the visit can get a new notice.
  const cancelNotice = (target: LegalNoticeRecord) => {
    const draft = target.status === 'draft'
    if (!draft) { setWithdrawing(true); return }
    setConfirmation({
      title: draft ? 'Discard this draft?' : 'Cancel this issued notice?',
      body: <p>{draft
        ? 'It leaves the Action Queue and the visit can get a new notice. The draft is kept as Cancelled in the audit record.'
        : 'The vendor may already have this notice. Cancelling withdraws it and stops its deadline. The notice and its document are kept, marked Cancelled.'}</p>,
      confirmLabel: draft ? 'Discard draft' : 'Cancel notice',
      run: async () => {
        const stillOpen = begin()
        setBusy(true); setError('')
        try {
          const cancelled = await adminApi.cancelLegalNotice(target.id)
          replaceInList(cancelled); refreshLists()
          if (stillOpen() && notice?.id === target.id) {
            if (draft) { window.history.replaceState(window.history.state, '', noticeUrl(null)); setNotice(null); setView('queue') } else openNotice(cancelled)
          }
          toast.success(draft ? 'Draft discarded.' : 'Notice cancelled.')
        } catch (reason) { setError(messageOf(reason, draft ? 'The draft could not be discarded.' : 'The notice could not be cancelled.')) }
        finally { setBusy(false) }
      },
    })
  }

  const closeNotice = async (payload: Parameters<typeof adminApi.closeLegalNotice>[1]) => {
    if (!notice) return
    const stillOpen = begin()
    setBusy(true); setError('')
    try {
      const closed = await adminApi.closeLegalNotice(notice.id, payload)
      replaceInList(closed); refreshLists()
      if (stillOpen()) { setClosing(false); openNotice(closed) }
      toast.success('Notice closed.')
    }
    catch (reason) { setError(messageOf(reason, 'The notice could not be closed.')) }
    finally { setBusy(false) }
  }

  const withdrawNotice = async (reason: string) => {
    if (!notice) return
    const stillOpen = begin()
    setBusy(true); setError('')
    try {
      const cancelled = await adminApi.cancelLegalNotice(notice.id, reason)
      replaceInList(cancelled); refreshLists()
      if (stillOpen()) { setWithdrawing(false); openNotice(cancelled) }
      toast.success('Notice withdrawn.')
    }
    catch (failure) { setError(messageOf(failure, 'The notice could not be withdrawn.')) }
    finally { setBusy(false) }
  }

  const sendReminder = () => {
    if (!notice) return
    setConfirmation({
      title: 'Send a reminder to the vendor?', confirmLabel: 'Send reminder',
      body: <p>A message from DTI is posted to this store's conversation. It does not change the notice or its deadline.</p>,
      run: async () => {
        setBusy(true); setError('')
        try { await adminApi.remindLegalNotice(notice.id); toast.success('Reminder sent to the vendor.') }
        catch (reason) { setError(messageOf(reason, 'The reminder could not be sent.')) }
        finally { setBusy(false) }
      },
    })
  }

  const recordNoAction = async (target: MonitoringRecordRecord, reason: string) => {
    setBusy(true); setError('')
    try { await adminApi.recordNoAction(target.id, reason); setNoActionFor(null); refreshLists(); toast.success('No action recorded for this visit.') }
    catch (failure) { setError(messageOf(failure, 'The decision could not be recorded.')) }
    finally { setBusy(false) }
  }

  const escalate = () => {
    if (!notice) return
    setConfirmation({
      title: 'Escalate to a Show Cause Order?', body: <p>This closes the LOI and prepares an SCO draft for the same visit and products.</p>, confirmLabel: 'Escalate',
      run: async () => {
        const stillOpen = begin()
        setBusy(true); setError('')
        try {
          const sco = await adminApi.escalateLegalNotice(notice.id)
          const closed = await adminApi.getLegalNotice(notice.id)
          replaceInList(closed); replaceInList(sco); refreshLists()
          if (stillOpen()) { setNoticeType('SCO'); openNotice(sco) }
          toast.success('SCO draft prepared.')
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

  /** Every detail fetch: a list row, a notice named in the URL, and browser Back or Forward. The latest one wins. */
  const loadNotice = (id: number, failure = 'The notice details could not be refreshed.') => {
    const request = ++detailRequest.current
    void adminApi.getLegalNotice(id)
      .then((detail) => { if (request === detailRequest.current) openNotice(detail) })
      .catch((reason) => { if (request === detailRequest.current) setError(messageOf(reason, failure)) })
  }

  /** Opens a notice from a list row as its own page: the row shows at once, the full record follows. */
  const reviewIssued = (value: LegalNoticeRecord) => {
    if (view === 'issued') listScroll.current = adminPanel()?.scrollTop ?? 0
    if (urlNotice() !== value.id) {
      window.history.pushState({ legalNotice: true }, '', noticeUrl(value.id))
      pushedDetail.current = true
    }
    openNotice(value)
    loadNotice(value.id)
    adminPanel()?.scrollTo?.({ top: 0 })
  }

  const closeDetail = () => {
    detailRequest.current++
    pushedDetail.current = false
    // Dialogs belong to the notice being left; one left open would reappear on the next notice.
    setClosing(false); setWithdrawing(false); setConfirmation(null)
    setNotice(null); setView('issued')
    window.requestAnimationFrame(() => adminPanel()?.scrollTo?.({ top: listScroll.current }))
  }

  // Browser Back from a draft's entry lands on a list URL. The editor closes to that list; unsaved edits are never
  // dropped silently, so the draft's entry is put back and the evaluator is asked first.
  const leaveDraft = (id: number) => {
    const list = new URLSearchParams(window.location.search).get('view') === 'issued' ? 'issued' : 'queue'
    const close = () => { setConfirmation(null); setNotice(null); setView(list) }
    if (!dirty) { close(); return }
    window.history.pushState({ legalNotice: true }, '', noticeUrl(id, 'queue'))
    setConfirmation({
      title: 'Discard unsaved changes?', body: <p>Your latest edits to this draft have not been saved.</p>, confirmLabel: 'Discard changes',
      run: () => { setForm(JSON.parse(savedForm)); window.history.replaceState(window.history.state, '', noticeUrl(null)); close() },
    })
  }

  // Back from the page it opened returns through history, so browser Back and this button agree.
  const backToList = () => {
    if (pushedDetail.current) { window.history.back(); return }
    window.history.replaceState(window.history.state, '', noticeUrl(null))
    closeDetail()
  }

  // Browser Back and Forward: the URL says which notice, if any, is open.
  useEffect(() => {
    const restore = () => {
      const id = urlNotice()
      // A load still running belongs to the history entry just left (Forward, then Back before it finished).
      if (!id) {
        detailRequest.current++
        if (view === 'detail') closeDetail()
        else if (view === 'prepare' && notice) leaveDraft(notice.id)
        return
      }
      if (view === 'detail' && notice?.id === id) return
      pushedDetail.current = false
      loadNotice(id, 'The notice could not be opened.')
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
    // closeDetail, leaveDraft and loadNotice only read refs and set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, notice, dirty, savedForm])

  // The detail page replaces the list, so move focus to its heading.
  const detailId = view === 'detail' ? notice?.id : undefined
  useEffect(() => { if (detailId) document.querySelector<HTMLElement>('.legal-page h2')?.focus({ preventScroll: true }) }, [detailId])

  // The URL names the notice on screen however it was opened (issue, escalation, a waiting visit, a draft), so a
  // reload shows the same one. A notice opened from the list has already pushed its entry; nothing changes then.
  const shownId = view === 'detail' || view === 'prepare' ? notice?.id ?? null : null
  const shownList = view === 'detail' ? 'issued' : 'queue'
  const shownVisit = shownId ? notice?.monitoring_record_id ?? null : null
  useEffect(() => {
    if (view !== 'detail' && view !== 'prepare') return
    const next = noticeUrl(shownId, shownId ? shownList : undefined, shownVisit)
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next)
  }, [view, shownId, shownList, shownVisit])

  const goTo = (next: View) => {
    if (next === view) return
    const leave = () => {
      if (urlNotice()) window.history.replaceState(window.history.state, '', noticeUrl(null))
      if (view === 'detail') closeDetail()
      setView(next)
    }
    if (!dirty) { leave(); return }
    setConfirmation({
      title: 'Discard unsaved changes?', body: <p>Your latest edits to this draft have not been saved.</p>, confirmLabel: 'Discard changes',
      run: () => { setForm(JSON.parse(savedForm)); leave() },
    })
  }

  // What the cited products support (policy.derived). Without it (an older draft or API) the reason stays a choice.
  const derived = notice?.status === 'draft' ? notice.policy?.derived ?? null : null
  const reasonCorrected = !!derived && !!notice && (notice.draft_payload.reason || '') !== derived.reason
  const suggestedBases = !!derived && derived.legal_bases.length === form.legal_bases.length && derived.legal_bases.every((basis) => form.legal_bases.includes(basis))
  const basisGroups = notice?.policy?.basis_groups
  const cited = notice?.source_snapshot.items ?? []
  const basisOption = (basis: string) => <label key={basis}><input type="checkbox" checked={form.legal_bases.includes(basis)} onChange={(event) => edit({ legal_bases: event.target.checked ? [...form.legal_bases, basis] : form.legal_bases.filter((value) => value !== basis) })}/>{basis}{derived?.legal_bases.includes(basis) && <em className="legal-derived-tag">Suggested from evidence</em>}</label>

  const policyOff = !!notice && notice.policy?.status !== 'LEGAL_POLICY_AVAILABLE'
  const missing = notice ? missingReadiness(readiness) : []
  const issueHint = !notice ? 'Start a draft first.'
    : policyOff ? (notice.signatory?.name ? POLICY_OFF : `Issuing needs a ${notice.notice_type} signatory. Set the name in Settings → Legal Signatories.`)
    : missing.length ? `Still needed: ${missing[0].label}.` : dirty ? 'Unsaved edits are saved automatically when you issue.' : 'Ready to issue.'

  return <div className="legal-workspace">
    <nav className="legal-tabs" aria-label="Legal Actions views">
      <button type="button" aria-current={choosingVisit ? 'page' : undefined} onClick={() => goTo('review')}><FileSearch size={18}/>Needs Review</button>
      <button type="button" aria-current={view === 'queue' ? 'page' : undefined} onClick={() => goTo('queue')}><ClipboardList size={18}/>Action Queue</button>
      {/* A notice is prepared for one visit or draft, so this tab only marks the open editor; it is not a way in. */}
      {view === 'prepare' && !choosingVisit && <button type="button" aria-current="page"><FilePenLine size={18}/>Prepare Notice</button>}
      <button type="button" aria-current={view === 'issued' || view === 'detail' ? 'page' : undefined} onClick={() => goTo('issued')}><FileText size={18}/>Issued & Responses</button>
    </nav>

    {(error || listError) && <div className="legal-alert" role="alert"><ShieldAlert size={18}/><span>{error || listError}</span></div>}
    {loading ? <div className="legal-loading" aria-label="Loading legal actions"/>
      : view === 'queue' ? <Queue notices={notices.filter((item) => item.status === 'draft')} controls={listControls} onOpen={openDraft} onDiscard={cancelNotice} onStart={() => { setNotice(null); if (!sourceId) setRecord(null); setView('review') }}/>
      : view === 'issued' ? <Queue notices={notices.filter((item) => item.status !== 'draft')} controls={listControls} onOpen={reviewIssued} issued/>
      : view === 'detail' && notice ? <LegalNoticeDetail notice={notice} busy={busy} issueResult={issueResult} visitLink={openVisit(notice.monitoring_record_id)}
        onBack={backToList} onOpenDocument={() => void openIssuedDocument()} onOpenAttachment={(id) => void openAttachment(id)}
        onRecordDelivery={recordDelivery} onRecordOffline={recordOffline} onEscalate={escalate} onRemind={sendReminder}
        onClose={() => setClosing(true)} onCancel={() => cancelNotice(notice)}/>
      : choosingVisit ? <VisitPicker page={visits} search={visitSearch} busy={busy} onSearch={setVisitSearch} onPage={setVisitPage} onChoose={(id) => void chooseVisit(id)} onNoAction={setNoActionFor}
        onOpenExisting={(id) => loadNotice(id, 'The notice could not be opened.')}/>
      : <div className="legal-editor-layout">
        <main className="legal-form-stack">
          <header className="legal-view-heading">
            <div className="visit-review-title">
              <button type="button" className="visit-review-back" onClick={() => goTo(notice ? 'queue' : 'review')}><ArrowLeft size={17} aria-hidden="true"/>{notice ? 'Back to drafts' : 'Back to visits'}</button>
              <h2>Prepare Notice</h2>
              {notice ? <StatusChip notice={notice}/> : <span className="monitor-observation muted">Not started</span>}
            </div>
            <span className="legal-protocol">Evaluator review required</span>
          </header>

          <Section id="legal-section-1" number="1" title="Case Reference" subtitle="Facts from the monitoring visit. These cannot be edited.">
            {record ? <><div className="legal-facts"><Fact label="Establishment" value={record.store.store_name}/><Fact label="Monitoring record" value={`#${record.id}`}/><Fact label="Monitoring date" value={new Date(record.finalized_at).toLocaleDateString()}/><Fact label="Field officer" value={record.officer.name}/><Fact label="Representative" value={[record.representative_name, record.representative_title].filter(Boolean).join(' · ')}/><Fact label="Address" value={record.store.address}/></div><p className="legal-neutral-note">Reference comparison · Observed price above captured reference. Evaluator review required; this is not an automatic legal finding.</p>{openVisit(record.id)}{!notice && !sourceId && <button type="button" className="text-button" onClick={() => setRecord(null)}>Choose a different visit</button>}</>
              : notice ? <><div className="legal-facts"><Fact label="Establishment" value={notice.source_snapshot.store?.store_name}/><Fact label="Monitoring record" value={`#${notice.monitoring_record_id}`}/><Fact label="Monitoring date" value={notice.source_snapshot.monitoring_date ? new Date(notice.source_snapshot.monitoring_date).toLocaleDateString() : null}/><Fact label="Address" value={notice.source_snapshot.store?.address}/></div><p className="legal-neutral-note">Reference comparison · Evaluator review required; this is not an automatic legal finding.</p>{(notice.source_snapshot.prior_triage ?? []).slice(0, 1).map((triage) => <p key={triage.item_id} className="legal-neutral-note">Previously triaged: no action by {triage.decided_by_name ?? 'a DTI evaluator'}{triage.decided_at ? ` on ${new Date(triage.decided_at).toLocaleDateString()}` : ''}: {triage.reason}</p>)}{openVisit(notice.monitoring_record_id)}</>
              : <p>The linked visit is unavailable or stale.</p>}
          </Section>

          <Section id="legal-section-2" number="2" title="Notice Type & Basis" subtitle="Choose the document. The reason and the suggested legal basis come from the cited products.">
            <fieldset className="legal-choice-row" disabled={!!notice}><legend>Notice type</legend><label><input type="radio" name="legal-notice-type" checked={noticeType === 'LOI'} onChange={() => setNoticeType('LOI')}/>LOI (Letter of Inquiry)</label><label><input type="radio" name="legal-notice-type" checked={noticeType === 'SCO'} disabled={!notice && !scoAllowed} onChange={() => setNoticeType('SCO')}/>SCO (Show Cause Order)</label></fieldset>
            {!notice && !scoAllowed && <small className="legal-field-hint">An SCO is issued by escalating an LOI, or directly during a price freeze for price-ceiling products.</small>}
            {!notice && <div className="legal-start">
              <p>{selectedIds.length ? `Uses the ${selectedIds.length} selected product${selectedIds.length === 1 ? '' : 's'} in Evidence below.` : 'Select at least one product in Evidence below.'}</p>
              {mixedBases && <p role="alert">One notice states one claim. Products above the reference and products that only rose over the store's previous record need separate notices.</p>}
              <button type="button" className="admin-button primary" disabled={!record || !selectedIds.length || mixedBases || busy} onClick={() => void createDraft()}>{busy ? 'Starting…' : `Start ${noticeType} draft`}</button>
            </div>}
            {notice && <div className="legal-input-grid">
              {derived ? <div className="legal-derived" role="group" aria-label="Reason for issuance">
                <span>Reason for issuance</span>
                <strong>{form.reason}<em className="legal-derived-tag">Determined from evidence</em></strong>
                <small className="legal-field-hint">{`${cited.length === 1 ? 'The cited product was' : `All ${cited.length} cited products were`} compared against the ${cited[0]?.reference_type === 'emergency_ceiling' ? 'price ceiling' : 'SRP'}; see Evidence below. A notice cannot state a different reason.`}</small>
                {reasonCorrected && <small className="legal-unsaved">Corrected from the saved reason; save to record it.</small>}
              </div>
                : <label>Reason for issuance<select value={form.reason} onChange={(event) => edit({ reason: event.target.value })}><option value="">Select reason</option>{(notice.policy?.reasons ?? []).map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>}
              <fieldset className="legal-basis-options"><legend>Approved legal bases</legend>
                <small className="legal-field-hint">{notice.notice_type === 'SCO' ? 'Printed on the order.' : 'Kept on the record. The LOI form does not print legal bases.'}</small>
                {basisGroups ? BASIS_GROUPS.map((group) => {
                  const bases = (notice.policy?.legal_bases ?? []).filter((basis) => (basisGroups[basis] ?? 'other_law') === group.key)
                  return bases.length > 0 && <div key={group.key} className="legal-basis-group" role="group" aria-label={group.label}><strong>{group.label}</strong><small>{group.hint}</small>{bases.map(basisOption)}</div>
                }) : (notice.policy?.legal_bases ?? []).map(basisOption)}
                {derived && !suggestedBases && <button type="button" className="text-button" onClick={() => edit({ legal_bases: derived.legal_bases })}>Reset to suggested</button>}
              </fieldset>
            </div>}
          </Section>

          <Section id="legal-section-3" number="3" title="Recipient & Delivery" subtitle="Addressed to the establishment's registered owner and delivered through the vendor portal.">
            {notice?.recipient_review_required && <div className="legal-policy-lock" role="status"><strong>Store record changed · review recipient</strong><span>The store's vendor account or registered owner changed after this draft was prepared. Check the recipient details below, then confirm.</span><button type="button" className="admin-button secondary" disabled={busy} onClick={() => void confirmLinkedVendor()}>Confirm recipient</button></div>}
            {notice && !notice.linked_vendor_user_id && <div className="legal-policy-lock" role="status"><strong>No vendor account linked</strong><span>Notices are delivered through the vendor portal only. Invite a vendor account for this establishment before issuing.</span>{onNavigate && <button type="button" className="admin-button secondary" onClick={() => onNavigate('establishments_access')}>Open User Management</button>}</div>}
            {notice ? <div className="legal-input-grid">
              <label>Addressee (registered owner)<input value={form.recipient_name} aria-describedby="legal-owner-hint" onChange={(e) => edit({ recipient_name: e.target.value })}/></label>
              {form.recipient_name.length > RECIPIENT_NAME_LIMIT && <div className="legal-policy-lock legal-span-2" role="status"><strong>Too long for the printed form</strong><span>{`The printed addressee holds ${RECIPIENT_NAME_LIMIT} characters; this is ${form.recipient_name.length}. Enter the form representation of the registered name. The full registered name stays on record.`}</span></div>}
              <small id="legal-owner-hint" className="legal-field-hint legal-span-2">{notice.registered_owner_name ? `Registered owner on record: ${notice.registered_owner_name}. Edit only to fit or correct the printed form.` : 'The store record has no registered owner. Enter the addressee from the official registration.'}</small>
              <label>Position<input value={form.recipient_title} onChange={(e) => edit({ recipient_title: e.target.value })}/></label>
              <label>Email address<input type="email" value={form.recipient_email} readOnly aria-describedby="legal-email-hint"/></label>
              <small id="legal-email-hint" className="legal-field-hint legal-span-2">The linked vendor account's email is printed on the notice.</small>
              <label>How the vendor receives it<select value={form.intended_delivery_method} onChange={(e) => edit({ intended_delivery_method: e.target.value })}><option value="">Select method</option><option value="portal">{DELIVERY_METHODS.portal.label}</option></select>{form.intended_delivery_method && <small className="legal-field-hint">{DELIVERY_METHODS[form.intended_delivery_method as DeliveryMethod]?.help}</small>}</label>
              <label className="legal-span-2">Establishment address<input value={form.address} onChange={(e) => edit({ address: e.target.value })}/></label>
            </div> : <p className="legal-placeholder">Available after you start the draft. Contacts are prefilled from the visit.</p>}
          </Section>

          <Section id="legal-section-4" number="4" title="Evidence & Attachments" subtitle="Monitoring evidence is original; supplemental files can be removed while drafting.">
            <div className="legal-evidence-list">
              {!notice && eligible.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={!citable(record!).includes(item)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))}/><span><strong>{item.bulletin?.commodity_name || `SRP #${item.srp_id}`}</strong><small>Observed ₱{Number(item.recorded_price).toFixed(2)} · captured reference ₱{Number(item.reference_value).toFixed(2)} · {item.reference_label || 'Reference label not recorded'}</small><small>{overReference(Number(item.recorded_price), Number(item.reference_value))}</small></span><span className="legal-evidence-tags"><span className="monitor-observation attention">{COMPARISONS[basisOf(item) ?? ''] ?? 'Above reference'}</span><span className="legal-locked">{item.finding && item.finding.decision !== 'no_action' ? 'Decided' : 'Original'}</span></span></label>)}
              {notice?.source_snapshot.items.map((item, index) => <div className="legal-snapshot-evidence" key={String(item.id ?? index)}><span><strong>{String(item.commodity_name || `Item #${item.id || index + 1}`)}</strong><small>Observed ₱{Number(item.observed_price).toFixed(2)} · captured reference ₱{Number(item.reference_value).toFixed(2)} · {String(item.reference_label || 'Reference label not recorded')}</small><small>{overReference(Number(item.observed_price), Number(item.reference_value))}</small></span><span className="legal-evidence-tags"><span className="monitor-observation attention">{COMPARISONS[String(item.finding_basis ?? item.reference_type ?? '')] ?? 'Above reference'}</span><span className="legal-locked">Original</span></span></div>)}
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
          {!notice && <button type="button" className="admin-button primary" disabled={!record || !selectedIds.length || mixedBases || busy} onClick={() => void createDraft()}>{`Start ${noticeType} draft`}</button>}
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
          {notice?.status === 'draft' && <button type="button" className="text-button legal-discard" disabled={busy} onClick={() => cancelNotice(notice)}>Discard draft</button>}
        </aside>
      </div>}

    {preview && <div className="legal-preview" role="dialog" aria-modal="true" aria-label="Official notice preview"><header><strong>Official A4 preview</strong><div><button type="button" onClick={() => setPreviewSize('fit')}>Fit width</button><button type="button" onClick={() => setPreviewSize('actual')}>Actual size</button><button type="button" onClick={() => window.print()}>Print preview</button><button type="button" onClick={() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([preview], { type: 'text/html' })); link.download = 'watermarked-notice-preview.html'; link.click(); URL.revokeObjectURL(link.href) }}>Download watermarked</button><button type="button" onClick={() => setPreview('')} aria-label="Close preview"><X/></button></div></header><iframe className={previewSize} sandbox="" title="Watermarked legal draft preview" srcDoc={preview}/></div>}

    {closing && notice && <CloseDialog notice={notice} busy={busy} onCancel={() => setClosing(false)} onConfirm={(payload) => void closeNotice(payload)}/>}
    {withdrawing && notice && <ReasonDialog title="Withdraw this issued notice?" label="Reason shown to the vendor" confirmLabel="Withdraw notice" busy={busy}
      note="The vendor may already have this notice. Withdrawing stops its deadline; the notice and its document are kept, marked Withdrawn by DTI." onCancel={() => setWithdrawing(false)} onConfirm={(reason) => void withdrawNotice(reason)}/>}
    {noActionFor && <ReasonDialog title={`No action for visit #${noActionFor.id}?`} label="Why no regulatory action is needed" confirmLabel="Record no action" busy={busy}
      note="Records DTI's review of every undecided flagged product on this visit. It is not a legal finding and is kept in the audit trail." onCancel={() => setNoActionFor(null)} onConfirm={(reason) => void recordNoAction(noActionFor, reason)}/>}
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

/** Needs review: visits with flagged products DTI has not decided yet. A visit with an open notice waits on it. */
function VisitPicker({ page, search, busy, onSearch, onPage, onChoose, onNoAction, onOpenExisting }: {
  page: MonitoringRecordPage | null; search: string; busy: boolean
  onSearch: (value: string) => void; onPage: (page: number) => void; onChoose: (id: number) => void
  onNoAction: (visit: MonitoringRecordRecord) => void; onOpenExisting: (noticeId: number) => void
}) {
  return <section className="legal-queue legal-visit-picker" aria-labelledby="legal-visit-picker-title">
    <header><div><h2 id="legal-visit-picker-title">Needs review</h2><p>Accepted visits with flagged products DTI has not decided yet. Start a notice, or record that no action is needed.</p></div></header>
    <label className="legal-visit-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Search visits" placeholder="Search store or officer…" value={search} onChange={(event) => onSearch(event.target.value)}/></label>
    {!page ? <div className="legal-loading" aria-label="Loading visits"/> : page.data.length ? <>
      <div className="legal-table-card"><div className="legal-table-wrap"><table className="admin-data-table"><thead><tr><th>Establishment</th><th>Visit</th><th>Undecided products</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{page.data.map((visit) => <tr key={visit.id}>
        <td><strong>{visit.store.store_name}</strong><small>{visit.store.address}</small></td>
        <td>#{visit.id} · {new Date(visit.finalized_at).toLocaleDateString()}<small>{visit.officer.name}</small></td>
        <td>{visit.undecided_item_ids?.length ?? visit.anomaly_count ?? 0}</td>
        <td><div className="legal-row-actions">{visit.open_notice
          // One open notice per visit: both actions wait until it is closed or cancelled.
          ? <button type="button" className="legal-waiting-btn" onClick={() => onOpenExisting(visit.open_notice!.id)}>{`Waiting on ${visit.open_notice.control_number || `${visit.open_notice.notice_type} draft`}`}</button>
          : <><button type="button" className="legal-primary-btn" disabled={busy} onClick={() => onChoose(visit.id)}>Start notice</button><button type="button" disabled={busy} onClick={() => onNoAction(visit)}>No action needed</button></>}</div></td>
      </tr>)}</tbody></table></div></div>
      {page.last_page > 1 && <nav className="legal-pager" aria-label="Visit pages"><button type="button" disabled={page.current_page <= 1} onClick={() => onPage(page.current_page - 1)}>Previous</button><span>Page {page.current_page} of {page.last_page}</span><button type="button" disabled={page.current_page >= page.last_page} onClick={() => onPage(page.current_page + 1)}>Next</button></nav>}
    </>
      : <div className="legal-empty"><FileText size={28}/><strong>Nothing needs review</strong><span>Every flagged product on accepted visits has a DTI decision.</span></div>}
  </section>
}

/**
 * Close with DTI's outcome and a decision for every cited product. The outcome pre-fills the decisions; changing one
 * product switches to "Partly confirmed". The server enforces the same agreement.
 */
function CloseDialog({ notice, busy, onCancel, onConfirm }: {
  notice: LegalNoticeRecord; busy: boolean; onCancel: () => void
  onConfirm: (payload: { outcome: CloseOutcome; outcome_reason: string; item_decisions: Array<{ item_id: number; decision: ItemDecision }> }) => void
}) {
  const items = notice.source_snapshot.items.map((item) => ({ id: Number(item.id), name: String(item.commodity_name || `Item #${item.id}`) })).filter((item) => item.id > 0)
  const [outcome, setOutcome] = useState<CloseOutcome | ''>('')
  const [reason, setReason] = useState('')
  const [decisions, setDecisions] = useState<Record<number, ItemDecision>>({})
  const choose = (next: CloseOutcome | '') => {
    setOutcome(next)
    if (!next) { setDecisions({}); return }
    const decision = CLOSE_OUTCOMES[next].decision
    if (decision) setDecisions(Object.fromEntries(items.map((item) => [item.id, decision])))
  }
  const decide = (id: number, decision: ItemDecision) => { setDecisions({ ...decisions, [id]: decision }); setOutcome('partially_confirmed') }
  const values = items.map((item) => decisions[item.id])
  const agrees = !!outcome && values.every(Boolean) && (CLOSE_OUTCOMES[outcome].decision
    ? values.every((value) => value === CLOSE_OUTCOMES[outcome].decision)
    : values.includes('confirmed') && values.includes('not_confirmed'))
  const ready = agrees && reason.trim().length >= 10
  return <div className="admin-modal-backdrop">
    <section className="admin-modal user-action-dialog legal-confirm" role="dialog" aria-modal="true" aria-labelledby="legal-close-title">
      <header><h2 id="legal-close-title">Close this notice</h2></header>
      <div className="legal-confirm-body legal-close-form">
        <p>Record DTI's outcome. Use Escalate instead if a Show Cause Order should follow.</p>
        <label>Outcome<select value={outcome} onChange={(event) => choose(event.target.value as CloseOutcome | '')}><option value="">Select outcome</option>{(Object.keys(CLOSE_OUTCOMES) as CloseOutcome[]).map((key) => <option key={key} value={key}>{CLOSE_OUTCOMES[key].label}</option>)}</select></label>
        {items.length > 0 && <fieldset className="legal-close-items"><legend>Decision for each cited product</legend>{items.map((item) => <div key={item.id} className="legal-close-item">
          <span>{item.name}</span>
          <label><input type="radio" name={`decision-${item.id}`} checked={decisions[item.id] === 'confirmed'} onChange={() => decide(item.id, 'confirmed')}/>Confirmed</label>
          <label><input type="radio" name={`decision-${item.id}`} checked={decisions[item.id] === 'not_confirmed'} onChange={() => decide(item.id, 'not_confirmed')}/>Not confirmed</label>
        </div>)}</fieldset>}
        <label>Reason shown to the vendor<textarea rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)}/></label>
        <small className="legal-field-hint">At least 10 characters. An accepted explanation is not counted as a confirmed finding.</small>
        {outcome && !agrees && values.every(Boolean) && <p className="legal-panel-error">The outcome does not match the product decisions.</p>}
      </div>
      <footer><button type="button" className="admin-button secondary" onClick={onCancel}>Cancel</button><button type="button" className="admin-button primary" disabled={!ready || busy}
        onClick={() => outcome && onConfirm({ outcome, outcome_reason: reason.trim(), item_decisions: items.map((item) => ({ item_id: item.id, decision: decisions[item.id] })) })}>Close notice</button></footer>
    </section>
  </div>
}

function ReasonDialog({ title, label, note, confirmLabel, busy, onCancel, onConfirm }: {
  title: string; label: string; note: string; confirmLabel: string; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return <div className="admin-modal-backdrop">
    <section className="admin-modal user-action-dialog legal-confirm" role="dialog" aria-modal="true" aria-labelledby="legal-reason-title">
      <header><h2 id="legal-reason-title">{title}</h2></header>
      <div className="legal-confirm-body legal-close-form"><p>{note}</p><label>{label}<textarea rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)}/></label><small className="legal-field-hint">At least 10 characters.</small></div>
      <footer><button type="button" className="admin-button secondary" onClick={onCancel}>Cancel</button><button type="button" className="admin-button primary" disabled={reason.trim().length < 10 || busy} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</button></footer>
    </section>
  </div>
}

const Section = ({ id, number, title, subtitle, children }: { id: string; number: string; title: string; subtitle: string; children: ReactNode }) => <section id={id} className="legal-section"><header><span>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>{children}</section>
function ListControls({ kind, status, search, storeFilter, page, onStatus, onSearch, onClearStore, onPage }: {
  kind: 'queue' | 'issued'; status: IssuedStatus; search: string; storeFilter: number | null; page: Pick<LegalNoticePage, 'current_page' | 'last_page' | 'total'>
  onStatus: (value: IssuedStatus) => void; onSearch: (value: string) => void; onClearStore: () => void; onPage: (page: number) => void
}) {
  return <div className="legal-list-controls">
    <label className="legal-visit-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Search notices" placeholder="Search control number or store…" value={search} onChange={(event) => onSearch(event.target.value)}/></label>
    {kind === 'issued' && <label>Status<select value={status} onChange={(event) => onStatus(event.target.value as IssuedStatus)}>{ISSUED_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
    {storeFilter && <span className="legal-filter-chip">One establishment only<button type="button" className="text-button" onClick={onClearStore}>Show all</button></span>}
    {page.last_page > 1 && <nav className="legal-pager" aria-label="Notice pages">
      <button type="button" disabled={page.current_page <= 1} onClick={() => onPage(page.current_page - 1)}>Previous</button>
      {/* An unfiltered issued list also counts drafts, which its rows leave out, so its total would mislead. */}
      <span>Page {page.current_page} of {page.last_page}{kind === 'issued' && !status ? '' : ` · ${page.total} notices`}</span>
      <button type="button" disabled={page.current_page >= page.last_page} onClick={() => onPage(page.current_page + 1)}>Next</button>
    </nav>}
  </div>
}

const Queue = ({ notices, controls, onOpen, onStart, onDiscard, issued = false }: { notices: LegalNoticeRecord[]; controls?: ReactNode; onOpen: (notice: LegalNoticeRecord) => void; onStart?: () => void; onDiscard?: (notice: LegalNoticeRecord) => void; issued?: boolean }) => <section className="legal-queue">
  <header><div><h2>{issued ? 'Issued & Responses' : 'Action Queue'}</h2><p>{issued ? 'Issued notices, delivery, deadlines, and vendor responses.' : 'Drafts waiting to be finished and issued.'}</p></div>{onStart && <button type="button" className="admin-button primary" onClick={onStart}><FilePenLine size={16}/>New notice</button>}</header>
  {controls}
  {notices.length ? <div className="legal-table-card"><div className="legal-table-wrap"><table className="admin-data-table"><thead><tr><th>Reference</th><th>Establishment</th><th>Type</th><th>Status</th><th>{issued ? 'Deadline' : 'Delivery'}</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{notices.map((notice) => <tr key={notice.id}>
    <td><strong>{notice.control_number || `Draft #${notice.id}`}</strong><small>{notice.preparer?.name || 'Not assigned'} · {new Date(notice.issued_at || notice.updated_at).toLocaleDateString()}</small></td>
    <td>{notice.store?.store_name || notice.source_snapshot.store?.store_name || 'Not recorded'}</td>
    <td>{notice.notice_type}</td>
    <td><StatusChip notice={notice}/>{issued && <small>{humanize(notice.delivery_state)}</small>}</td>
    <td>{issued ? (notice.due_date_timestamp ? new Date(notice.due_date_timestamp).toLocaleString() : 'Starts after delivery') : humanize(notice.delivery_state)}</td>
    <td><div className="legal-row-actions"><button type="button" onClick={() => onOpen(notice)}>{notice.status === 'draft' ? 'Continue draft' : 'Open'}</button>{onDiscard && notice.status === 'draft' && <button type="button" className="legal-danger-button" aria-label={`Discard ${notice.control_number || `Draft #${notice.id}`}`} onClick={() => onDiscard(notice)}>Discard</button>}</div></td>
  </tr>)}</tbody></table></div></div>
    : <div className="legal-empty"><FileText size={28}/><strong>{issued ? 'No issued notices' : 'No drafts in the queue'}</strong><span>{issued ? 'Issued notices appear here.' : 'Start a new notice from an accepted monitoring visit.'}</span></div>}
</section>
