import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { VendorSession } from '../../app/types';
import { apiError, apiStatus, vendorApi } from '../../services/vendorApi';

interface VendorLoginProps {
  notice?: string | null;
  onSignedIn: (session: VendorSession) => void;
}

export const VendorLogin: React.FC<VendorLoginProps> = ({ notice, onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      onSignedIn(await vendorApi.login(email.trim(), password));
    } catch (requestError) {
      const status = (requestError as { response?: { status?: number } }).response?.status;
      if (status === 422) setError('The email or password is incorrect.');
      else if (status === 429) setError('Too many sign-in attempts. Please wait and try again.');
      else if (apiStatus(requestError) === 'VENDOR_ACCESS_DENIED') setError(apiError(requestError, 'This account does not have access to the Vendor Portal.'));
      else if (!status) setError('The Vendor Portal could not be reached. Check your connection and try again.');
      else setError('Sign-in is temporarily unavailable. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #0F233D 0%, #1B365D 50%, #23456F 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: 'var(--radius-lg)',
        maxWidth: '460px',
        width: '100%',
        padding: '28px 24px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: '#F8FAFC',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            padding: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            border: '1px solid #E2E8F0',
          }}>
            <img src="/icons/dti-pwa-192x192.png" alt="DTI Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--dti-navy)' }}>
            PRICE-Watch Vendor Portal
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Department of Trade & Industry • Antique Provincial Office
          </p>
        </div>

        {notice && !error && (
          <div role="status" style={{ background: '#EFF6FF', color: '#1E3A8A', padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="portal-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="vendor-email">Business email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
              <input
                id="vendor-email"
                type="email"
                className="form-control"
                placeholder="store@domain.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={{ paddingLeft: '32px' }}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="vendor-password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
              <input
                id="vendor-password"
                type="password"
                className="form-control"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={{ paddingLeft: '32px' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: '100%', marginTop: '8px', padding: '11px 16px', fontSize: '0.92rem' }}
          >
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
            {!submitting && <ArrowRight size={16} />}
          </button>
        </form>

        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '12px', lineHeight: 1.4 }}>
          Accounts are created through an invitation from DTI Antique. Use the link in your invitation email to set your password.
        </p>
      </div>
    </div>
  );
};
