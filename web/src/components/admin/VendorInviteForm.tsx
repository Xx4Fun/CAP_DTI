import { useState } from 'react'
import type { FormEvent } from 'react'
import { Copy, Send } from 'lucide-react'
import { adminApi } from '../../services/adminApi'

type InviteError = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }

export function VendorInviteForm({ store, onInvited, onCancel }: {
  store: { id: number; store_name: string }
  onInvited?: (invitationUrl: string, email: string) => void
  onCancel?: () => void
}) {
  const [email, setEmail] = useState('')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const normalized = email.trim().toLowerCase()
      const result = await adminApi.inviteVendor(store.id, normalized)
      setLink(result.invitation_url)
      onInvited?.(result.invitation_url, normalized)
    } catch (requestError) {
      const data = (requestError as InviteError).response?.data
      setError(data?.message || data?.errors?.email?.[0] || 'The vendor invitation could not be queued.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="vendor-invite-form" onSubmit={submit} aria-label={`Invite vendor for ${store.store_name}`}>
      <div className="admin-field-group">
        <label htmlFor={`vendor-invite-email-${store.id}`} className="required-field">Vendor owner email address</label>
        <input
          id={`vendor-invite-email-${store.id}`}
          type="email"
          required
          autoComplete="email"
          placeholder="owner@establishment.ph"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <small className="field-helper-text">The vendor receives a one-time link, valid for 24 hours, to set their own password in the Vendor Portal.</small>
      </div>

      {link && (
        <div className="admin-field-group">
          <label htmlFor={`vendor-invite-link-${store.id}`}>One-time invitation link</label>
          <span className="vendor-invite-link">
            <input id={`vendor-invite-link-${store.id}`} readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className="admin-button secondary" aria-label="Copy invitation link" onClick={() => void navigator.clipboard?.writeText(link)}><Copy size={16} />Copy</button>
          </span>
        </div>
      )}
      {error && <p role="alert" className="admin-feedback error">{error}</p>}

      <footer className="vendor-invite-actions">
        {onCancel && <button type="button" className="admin-button secondary" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="admin-button primary" disabled={sending}>
          <Send size={16} aria-hidden="true" />{sending ? 'Queueing invitation…' : 'Send invitation'}
        </button>
      </footer>
    </form>
  )
}
