import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { apiError, vendorApi } from '../../services/vendorApi';

interface InvitationAcceptProps {
  token: string;
  onDone: (notice: string) => void;
}

export const InvitationAccept: React.FC<InvitationAcceptProps> = ({ token, onDone }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ existing: boolean } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 12) return setError('Use at least 12 characters for your password.');
    if (password !== confirmation) return setError('The passwords do not match.');
    setSubmitting(true);
    setError('');
    try {
      const response = await vendorApi.acceptInvitation(token, { name: name.trim(), password, password_confirmation: confirmation });
      setResult({ existing: response.existing_account });
    } catch (requestError) {
      setError(apiError(requestError, 'This invitation is invalid, expired, or already used.'));
    } finally {
      setSubmitting(false);
    }
  };

  const doneNotice = result?.existing
    ? 'Establishment added to your account. Sign in with your existing password.'
    : 'Account created. Sign in with the password you just set.';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, #0F233D 0%, #1B365D 50%, #23456F 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
      <div className="v-card" style={{ maxWidth: '460px', width: '100%', padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <KeyRound size={22} color="var(--dti-navy)" />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--dti-navy)' }}>Accept store invitation</h1>
        </div>

        {result ? (
          <div role="status">
            <p style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.88rem', marginBottom: '18px' }}>
              <CheckCircle2 size={18} color="var(--success-color)" />
              <span>{doneNotice}</span>
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => onDone(doneNotice)}>Go to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              DTI Antique invited you to manage your establishment in the Vendor Portal. If you already have a vendor account, your existing password stays unchanged.
            </p>
            {error && <div role="alert" className="portal-error"><AlertCircle size={16} /><span>{error}</span></div>}
            <div className="form-group">
              <label className="form-label" htmlFor="invite-name">Full name</label>
              <input id="invite-name" className="form-control" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="invite-password">Password</label>
              <input id="invite-password" type="password" className="form-control" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="invite-confirmation">Confirm password</label>
              <input id="invite-confirmation" type="password" className="form-control" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
              {submitting ? 'Accepting…' : 'Accept invitation'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
