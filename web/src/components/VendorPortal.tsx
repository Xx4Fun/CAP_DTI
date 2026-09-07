import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Download, FileText, Send } from 'lucide-react'
import api from '../services/api'

type Notice = { id: number; control_number?: string | null; notice_type: 'LOI' | 'SCO'; status: string; issued_at?: string | null; delivery_state: string; due_date_timestamp?: string | null; response_received_at?: string | null }

export const VendorPortal = () => {
  const [notices, setNotices] = useState<Notice[]>([])
  const [selected, setSelected] = useState<Notice | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/notices').then(({ data }) => setNotices(data)).catch(() => setMessage('Notices could not be loaded. Try again.'))
  useEffect(() => { void load() }, [])

  const openDocument = async () => {
    if (!selected) return
    setMessage('')
    try {
      const response = await api.get(`/notices/${selected.id}/document`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data); window.open(url, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch { setMessage('The official document could not be opened.') }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || (!text.trim() && !files.length)) return
    const body = new FormData(); body.append('response_text', text); files.forEach((file) => body.append('attachments[]', file))
    setBusy(true); setMessage('')
    try { await api.post(`/notices/${selected.id}/response`, body, { headers: { 'Content-Type': 'multipart/form-data' } }); setMessage('Response submitted.'); setSelected(null); setText(''); setFiles([]); await load() }
    catch (error) { const candidate = error as { response?: { data?: { message?: string } } }; setMessage(candidate.response?.data?.message || 'The response could not be submitted.') }
    finally { setBusy(false) }
  }

  const expired = !!selected?.due_date_timestamp && new Date(selected.due_date_timestamp) < new Date()
  const canRespond = selected?.status === 'issued' && ['received', 'refused'].includes(selected.delivery_state) && !!selected.due_date_timestamp && !expired

  return <div className="onboarding-grid">
    <section className="glass onboarding-card"><h2 className="section-title">Official Notices</h2><p className="section-subtitle">Notice availability, recorded delivery, and response submission are separate events.</p><div className="queue-list">{notices.length ? notices.map((notice) => <button type="button" key={notice.id} className={`queue-item ${selected?.id === notice.id ? 'active' : ''}`} onClick={() => setSelected(notice)}><div className="queue-item-meta"><span className={`status-badge ${notice.notice_type}`}>{notice.notice_type}</span><span className={`status-pill ${notice.status}`}>{notice.status.replace('_', ' ')}</span></div><strong>{notice.control_number || `Notice #${notice.id}`}</strong><small>Available in portal {notice.issued_at ? new Date(notice.issued_at).toLocaleString() : ''}</small></button>) : <div className="empty-queue">No issued notices for your establishment.</div>}</div></section>
    <section className="glass map-container-card">{selected ? <div className="notice-details-pane"><div className="map-header"><h3>Notice & Response</h3><span className="map-badge">Private access</span></div><div className="notice-summary-box"><p><strong>Reference:</strong> {selected.control_number || `#${selected.id}`}</p><p><strong>Issued:</strong> {selected.issued_at ? new Date(selected.issued_at).toLocaleString() : 'Not recorded'}</p><p><strong>Delivery:</strong> {selected.delivery_state === 'not_recorded' ? 'Not yet recorded' : selected.delivery_state}</p><p><strong>Response deadline:</strong> {selected.due_date_timestamp ? new Date(selected.due_date_timestamp).toLocaleString() : 'Starts only after the policy-defined delivery event'}</p><p><strong>Response:</strong> {selected.response_received_at ? `Submitted ${new Date(selected.response_received_at).toLocaleString()}` : 'Not submitted'}</p><button type="button" className="btn-secondary view-pdf-link" onClick={() => void openDocument()}><Download size={17}/>Open official document</button></div>{message && <div role="status" className="input-desc">{message}</div>}{canRespond ? <form onSubmit={(event) => void submit(event)} className="rebuttal-upload-form"><label className="input-group">Response text<textarea value={text} onChange={(event) => setText(event.target.value)} rows={5}/></label><label className="input-group">Supporting attachments (up to five PDF, JPEG, or PNG files)<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))}/></label><button type="submit" className="btn-primary" disabled={busy || (!text.trim() && !files.length)}><Send size={17}/>{busy ? 'Submitting…' : 'Submit response'}</button></form> : <div className="empty-queue"><FileText size={22}/><span>{expired ? 'The response period has expired.' : selected.response_received_at ? 'A response has already been submitted.' : 'Response controls open after delivery is recorded.'}</span></div>}</div> : <div className="no-notice-selected"><p>Select a notice to review its delivery and response status.</p></div>}</section>
  </div>
}
