import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, PenLine, RefreshCw, RotateCcw, Save, Signature, Trash2, Upload, X } from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import { adminToast } from '../../services/adminToast'
import type { LegalSignatoryRecord } from '../../types/admin'

type NoticeType = 'LOI' | 'SCO'
const TYPES: Array<{ type: NoticeType; title: string; hint: string }> = [
  { type: 'LOI', title: 'Letter of Inquiry (LOI)', hint: 'Printed under the closing line of every LOI.' },
  { type: 'SCO', title: 'Show Cause Order (SCO)', hint: 'Printed on the signature line of every SCO.' },
]
const MAX_BYTES = 1024 * 1024

const messageOf = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
  return (response?.data?.errors && Object.values(response.data.errors).flat()[0]) || response?.data?.message || fallback
}

/** Settings › Legal Signatories. DTI evaluators and Super Admins set who signs and upload the e-signature. */
export function LegalSignatoriesSettings({ canEdit }: { canEdit: boolean }) {
  const [records, setRecords] = useState<Record<NoticeType, LegalSignatoryRecord> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.getLegalSignatories().then(setRecords).catch((reason) => setError(messageOf(reason, 'Legal signatories could not be loaded.')))
  }, [])

  return (
    <section className="settings-form-section" aria-labelledby="legal-signatories-title">
      <div className="settings-section-header">
        <h3 id="legal-signatories-title">Legal Signatories</h3>
        <p>The official printed as signatory on issued LOIs and SCOs. {canEdit ? 'Changes ask for your password again and are recorded in the audit trail.' : 'Only DTI staff can change these.'}</p>
      </div>
      {error && <div className="settings-alert-badge error" role="alert">{error}</div>}
      {records && TYPES.map(({ type, title, hint }) => (
        <SignatoryCard key={type} type={type} title={title} hint={hint} record={records[type]} canEdit={canEdit}
          onSaved={(next) => setRecords((current) => current && { ...current, [type]: next })} />
      ))}
    </section>
  )
}

function SignatoryCard({ type, title, hint, record, canEdit, onSaved }: {
  type: NoticeType; title: string; hint: string; record: LegalSignatoryRecord; canEdit: boolean; onSaved: (next: LegalSignatoryRecord) => void
}) {
  const [name, setName] = useState(record.name ?? '')
  const [office, setOffice] = useState(record.office ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  // Bumped on every successful change: two uploads within one second share an updated_at.
  const [revision, setRevision] = useState(0)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => {
    if (!record.has_signature) { setPreview(null); return }
    let active = true
    let url: string | null = null
    setPreview(null)
    adminApi.getLegalSignatureImage(type)
      .then((blob) => { if (!active) return; url = URL.createObjectURL(blob); setPreview(url) })
      .catch(() => { if (active) setPreview(null) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [type, record.has_signature, record.updated_at, revision])

  const run = async (action: () => Promise<LegalSignatoryRecord>, done: string) => {
    setBusy(true); setError('')
    try { onSaved(await action()); setRevision((value) => value + 1); adminToast.success(done, { id: `signatory-${type}` }) }
    catch (reason) { setError(messageOf(reason, 'The change could not be saved.')) }
    finally { setBusy(false) }
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    void run(() => adminApi.updateLegalSignatory(type, { name: name.trim(), office: office.trim() }), `${type} signatory saved.`)
  }

  const upload = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setError('Upload a PNG or JPEG image. A PNG with a transparent background prints best.'); return }
    if (file.size > MAX_BYTES) { setError('The signature image must be 1 MB or smaller.'); return }
    void run(() => adminApi.uploadLegalSignature(type, file), `${type} e-signature uploaded.`)
  }

  const remove = () => {
    if (!window.confirm(`Remove the ${type} e-signature? Notices already issued keep the signature they were issued with.`)) return
    void run(() => adminApi.removeLegalSignature(type), `${type} e-signature removed.`)
  }

  return (
    <form className="legal-signatory-card" onSubmit={save} aria-label={`${type} signatory`}>
      <header>
        <PenLine size={18} aria-hidden="true" />
        <div><h4>{title}</h4><p>{hint}</p></div>
        <span className={`legal-signatory-source ${record.name ? '' : 'missing'}`}>
          {record.name ? (record.source === 'settings' ? 'Set in Settings' : 'From server configuration') : canEdit ? 'Not set: issuing is disabled' : 'Not set: ask DTI staff'}
        </span>
      </header>
      {error && <div className="settings-alert-badge error" role="alert">{error}</div>}
      <div className="settings-form-grid">
        <div className="settings-form-group">
          <label htmlFor={`signatory-${type}-name`}>Signatory name</label>
          <input id={`signatory-${type}-name`} value={name} maxLength={80} required disabled={!canEdit || busy} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="settings-form-group">
          <label htmlFor={`signatory-${type}-office`}>Position printed under the name</label>
          <input id={`signatory-${type}-office`} value={office} maxLength={80} required disabled={!canEdit || busy} onChange={(event) => setOffice(event.target.value)} />
        </div>
      </div>
      <div className="legal-signatory-image">
        <div className="legal-signatory-preview">
          {preview ? <img src={preview} alt={`${type} e-signature`} />
            : record.has_signature ? <span>E-signature on file. Loading preview…</span>
            : <span>No e-signature uploaded. Notices print the name only and are signed by hand.</span>}
        </div>
        {canEdit && (
          <div className="legal-signatory-image-actions">
            <label className="session-btn-secondary legal-signatory-upload">
              <Upload size={15} aria-hidden="true" /><span>{record.has_signature ? 'Replace e-signature' : 'Upload e-signature'}</span>
              <input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = '' }} />
            </label>
            <button type="button" className="session-btn-secondary" disabled={busy || drawing} onClick={() => setDrawing(true)}>
              <Signature size={15} aria-hidden="true" /><span>Draw e-signature</span>
            </button>
            {record.has_signature && <button type="button" className="session-btn-secondary" disabled={busy} onClick={remove}><Trash2 size={15} aria-hidden="true" /><span>Remove</span></button>}
          </div>
        )}
      </div>
      {canEdit && drawing && (
        <SignatureDrawPad type={type} disabled={busy} onCancel={() => setDrawing(false)} onUse={(file) => { setDrawing(false); upload(file) }} />
      )}
      {record.updated_by && <p className="settings-hint">Last changed by {record.updated_by}{record.updated_at ? ` on ${new Date(record.updated_at).toLocaleString()}` : ''}.</p>}
      {canEdit && (
        <div className="settings-action-bar">
          <button type="submit" className="session-btn-primary" disabled={busy || !name.trim() || !office.trim()}>
            {busy ? <RefreshCw size={16} className="spin-icon" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            <span>Save {type} signatory</span>
          </button>
        </div>
      )}
    </form>
  )
}

// Max size the backend accepts (LegalSignatoryController::uploadSignature).
const MAX_WIDTH = 2400
const MAX_HEIGHT = 1200

/** Sign with mouse, pen or finger. Saved as a transparent PNG trimmed to the ink, through the same upload as a file. */
function SignatureDrawPad({ type, disabled, onCancel, onUse }: { type: NoticeType; disabled: boolean; onCancel: () => void; onUse: (file: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ratio = useRef(1)
  const active = useRef(false)
  const bounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    ratio.current = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio.current)
    canvas.height = Math.round(rect.height * ratio.current)
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio.current, ratio.current)
    context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = 2.6; context.strokeStyle = '#0b1f44'
  }, [])

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const p = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const b = bounds.current
    bounds.current = b ? { minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) } : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
    return p
  }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    active.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const p = point(event)
    const context = event.currentTarget.getContext('2d')
    context?.beginPath(); context?.moveTo(p.x, p.y); context?.lineTo(p.x + 0.1, p.y + 0.1); context?.stroke()
    setHasInk(true)
  }
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active.current) return
    const p = point(event)
    const context = event.currentTarget.getContext('2d')
    context?.lineTo(p.x, p.y); context?.stroke()
  }
  const finish = () => { active.current = false }

  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    bounds.current = null
    setHasInk(false)
  }

  const use = () => {
    const canvas = canvasRef.current
    const b = bounds.current
    if (!canvas || !b) return
    // Crop to the ink plus a small margin, so the printed signature isn't shrunk by empty space.
    const r = ratio.current, pad = 10 * r
    const x = Math.max(0, Math.floor(b.minX * r - pad)), y = Math.max(0, Math.floor(b.minY * r - pad))
    const w = Math.max(1, Math.min(canvas.width, Math.ceil(b.maxX * r + pad)) - x), h = Math.max(1, Math.min(canvas.height, Math.ceil(b.maxY * r + pad)) - y)
    const scale = Math.min(1, MAX_WIDTH / w, MAX_HEIGHT / h)
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(w * scale)); out.height = Math.max(1, Math.round(h * scale))
    out.getContext('2d')?.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height)
    out.toBlob((blob) => { if (blob) onUse(new File([blob], `${type}-signature.png`, { type: 'image/png' })) }, 'image/png')
  }

  return (
    <div className="legal-signature-draw">
      <p className="settings-hint">Sign inside the box with a mouse, pen, or finger. It is saved as a transparent PNG.</p>
      <canvas ref={canvasRef} aria-label={`${type} signature drawing area`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={finish} />
      <div className="legal-signatory-image-actions">
        <button type="button" className="session-btn-secondary" onClick={clear} disabled={!hasInk || disabled}><RotateCcw size={15} aria-hidden="true" /><span>Clear</span></button>
        <button type="button" className="session-btn-secondary" onClick={onCancel}><X size={15} aria-hidden="true" /><span>Cancel</span></button>
        <button type="button" className="session-btn-primary" onClick={use} disabled={!hasInk || disabled}><Check size={15} aria-hidden="true" /><span>Use this signature</span></button>
      </div>
    </div>
  )
}
