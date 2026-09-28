import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PenLine, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
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

/** Settings › Legal Signatories. Everyone who issues notices can see who signs; only a Super Admin can change it. */
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
        <p>The official printed as signatory on issued LOIs and SCOs. {canEdit ? 'Changes ask for your password again and are recorded in the audit trail.' : 'Only a Super Admin can change these.'}</p>
      </div>
      {error && <div className="settings-alert-badge error" role="alert">{error}</div>}
      {records && TYPES.map(({ type, title, hint }) => (
        <SignatoryCard key={type} type={type} title={title} hint={hint} record={records[type]} canEdit={canEdit}
          onSaved={(next) => setRecords({ ...records, [type]: next })} />
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

  useEffect(() => {
    if (!record.has_signature) { setPreview(null); return }
    let url: string | null = null
    adminApi.getLegalSignatureImage(type).then((blob) => { url = URL.createObjectURL(blob); setPreview(url) }).catch(() => setPreview(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [type, record.has_signature, record.updated_at])

  const run = async (action: () => Promise<LegalSignatoryRecord>, done: string) => {
    setBusy(true); setError('')
    try { onSaved(await action()); adminToast.success(done, { id: `signatory-${type}` }) }
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
          {record.name ? (record.source === 'settings' ? 'Set in Settings' : 'From server configuration') : 'Not set: issuing is disabled'}
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
          {preview ? <img src={preview} alt={`${type} e-signature`} /> : <span>No e-signature uploaded. Notices print the name only and are signed by hand.</span>}
        </div>
        {canEdit && (
          <div className="legal-signatory-image-actions">
            <label className="session-btn-secondary legal-signatory-upload">
              <Upload size={15} aria-hidden="true" /><span>{record.has_signature ? 'Replace e-signature' : 'Upload e-signature'}</span>
              <input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = '' }} />
            </label>
            {record.has_signature && <button type="button" className="session-btn-secondary" disabled={busy} onClick={remove}><Trash2 size={15} aria-hidden="true" /><span>Remove</span></button>}
          </div>
        )}
      </div>
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
