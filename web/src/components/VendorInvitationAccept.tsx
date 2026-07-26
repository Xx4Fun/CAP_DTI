import { useState } from 'react'
import api from '../services/api'

export function VendorInvitationAccept({ token }: { token: string }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  return <main className="invitation-page">
    <section className="invitation-card">
      <p className="admin-kicker">DTI Antique Vendor Portal</p>
      <h1>Accept store invitation</h1>
      <p>Create your own password. PRICE-Watch never sends or stores a permanent plaintext password.</p>
      <form className="admin-form" onSubmit={async (event) => {
        event.preventDefault()
        if (password !== confirmation) {
          setError('Passwords do not match.')
          return
        }
        setLoading(true)
        setError('')
        try {
          const response = await api.post(`/vendor-invitations/${token}/accept`, {
            name,
            password,
            password_confirmation: confirmation,
          })
          setMessage(response.data.message || 'Vendor account activated.')
        } catch (requestError: any) {
          setError(requestError.response?.data?.message || 'This invitation is invalid, expired, or already used.')
        } finally {
          setLoading(false)
        }
      }}>
        <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Create password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required /></label>
        <label>Confirm password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} required /></label>
        <button type="submit" disabled={loading || Boolean(message)}>{loading ? 'Activating...' : 'Activate vendor account'}</button>
      </form>
      {message && <p role="status" className="success-badge">{message} You can now return to sign in.</p>}
      {error && <p role="alert" className="error-badge">{error}</p>}
    </section>
  </main>
}
