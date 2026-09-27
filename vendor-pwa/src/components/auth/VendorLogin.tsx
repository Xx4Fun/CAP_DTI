import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, LoaderCircle, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import type { VendorSession } from '../../app/types';
import { apiError, apiStatus, vendorApi } from '../../services/vendorApi';

interface VendorLoginProps {
  notice?: string | null;
  onSignedIn: (session: VendorSession) => void;
}

export const VendorLogin: React.FC<VendorLoginProps> = ({ notice, onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="login-container">
      {/* Left Column: Official Illustration Artwork (Desktop / Landscape) */}
      <div className="login-left-column" aria-hidden="true">
        <img
          src="/branding/login-artwork.webp"
          alt="DTI fair trade and consumer protection illustration"
          className="login-artwork-img"
        />
      </div>

      {/* Right Column: Centered Authentication Card */}
      <div className="login-right-column">
        <div className="login-card">
          <header className="login-header">
            <img
              src="/branding/dti-logo.svg"
              alt="DTI Official Logo"
              className="login-dti-logo"
            />
            <h1 className="login-title">
              PRICE-<span className="login-title-highlight">Watch</span>
            </h1>
            <div className="login-subtitle-row" aria-label="DTI Vendor Portal">
              <span className="login-subtitle-line" />
              <span>— DTI Vendor Portal —</span>
              <span className="login-subtitle-line" />
            </div>
          </header>

          {notice && !error && (
            <div role="status" className="login-notice-badge">
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div role="alert" className="login-error-badge">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="vendor-email">Business email</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  id="vendor-email"
                  type="email"
                  autoComplete="username"
                  className="login-input"
                  placeholder="store@domain.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="vendor-password">Password</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="vendor-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="login-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="login-password-toggle"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="login-button-spinner"
                    aria-hidden="true"
                  />
                  <span>Signing in…</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="login-invite-note">
            Accounts are created through an invitation from DTI Antique. Use the link in your invitation email to set your password.
          </p>

          <footer className="login-footer">
            <div className="login-footer-guarantee">
              <ShieldCheck size={18} className="login-shield-icon" />
              <span>Secure. Official. Committed to Fair Trade.</span>
            </div>
            <div className="login-footer-tagline">
              Protecting Consumers. Supporting Businesses.
            </div>
            <div className="login-ph-bar" aria-hidden="true">
              <span className="login-ph-blue" />
              <span className="login-ph-yellow" />
              <span className="login-ph-red" />
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
};
