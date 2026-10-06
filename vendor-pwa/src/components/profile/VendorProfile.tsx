import React, { useState } from 'react';
import { AlertTriangle, Bell, LockKeyhole, LogOut, Store as StoreIcon, UserRound } from 'lucide-react';
import type { VendorStore, VendorUser } from '../../app/types';
import { formatDate, initials } from '../../app/rules';
import { apiError, isSessionInvalid } from '../../services/vendorApi';
import { RepresentativeCard, type SaveRepresentative } from './RepresentativeCard';

// Mirrors the backend rule (VendorAuthController::password).
const MIN_PASSWORD_LENGTH = 12;

interface VendorProfileProps {
  user: VendorUser;
  store: VendorStore | null;
  onOpenNotifications: () => void;
  onChangePassword: (currentPassword: string, password: string) => Promise<void>;
  onLogout: () => void;
  onSaveRepresentative: SaveRepresentative;
}

export const VendorProfile: React.FC<VendorProfileProps> = ({ user, store, onOpenNotifications, onChangePassword, onLogout, onSaveRepresentative }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
    if (password !== confirmation) return setError('The new passwords do not match.');
    setSaving(true);
    setError('');
    try {
      await onChangePassword(currentPassword, password);
      setCurrentPassword(''); setPassword(''); setConfirmation('');
    } catch (requestError) {
      if (!isSessionInvalid(requestError)) setError(apiError(requestError, 'The password could not be changed. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <section className="profile-identity" aria-label="Account">
        <span className="profile-avatar" aria-hidden="true">{initials(user.name)}</span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span>Vendor account</span>
        </div>
      </section>

      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="profile-establishment-title">
          <div className="profile-card-heading">
            <span><StoreIcon size={20} /></span>
            <div>
              <h2 id="profile-establishment-title">Establishment</h2>
              <p>The establishment this account currently manages.</p>
            </div>
          </div>
          {store ? (
            <dl>
              <div><dt>Name</dt><dd>{store.store_name}</dd></div>
              <div><dt>Address</dt><dd>{store.address}</dd></div>
              <div><dt>DTI / SEC number</dt><dd>{store.dti_sec_number ?? 'Not recorded'}</dd></div>
              <div><dt>Last inspected</dt><dd>{formatDate(store.last_inspected_at)}</dd></div>
            </dl>
          ) : (
            <p className="profile-card-empty">No establishment is linked to this account. Ask DTI Antique to send an invitation for your establishment.</p>
          )}
        </section>

        {store ? (
          <RepresentativeCard store={store} onSave={onSaveRepresentative} />
        ) : (
          <section className="profile-card" aria-labelledby="representative-title">
            <div className="profile-card-heading">
              <span><UserRound size={20} /></span>
              <div>
                <h2 id="representative-title">Current establishment representative</h2>
                <p>Used to prefill monitoring visits. The field officer confirms who is present.</p>
              </div>
            </div>
            <p className="profile-card-empty">No establishment is linked to configure a representative.</p>
          </section>
        )}

        <section className="profile-card" aria-labelledby="profile-notifications-title">
          <div className="profile-card-heading">
            <span><Bell size={20} /></span>
            <div>
              <h2 id="profile-notifications-title">Notification settings</h2>
              <p>Choose which notices, deadlines and price updates you want to be alerted about.</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary profile-card-action" onClick={onOpenNotifications}>Manage notification settings</button>
        </section>

        <section className="profile-card" aria-labelledby="profile-password-title">
          <div className="profile-card-heading">
            <span><LockKeyhole size={20} /></span>
            <div>
              <h2 id="profile-password-title">Password</h2>
              <p>Changing your password signs out your other devices. This device stays signed in.</p>
            </div>
          </div>
          <form className="profile-password-form" onSubmit={submit}>
            {error && <div role="alert" className="portal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
            <div className="form-group">
              <label className="form-label" htmlFor="profile-current-password">Current password</label>
              <input id="profile-current-password" type="password" autoComplete="current-password" className="form-control" required disabled={saving} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-new-password">New password</label>
              <input id="profile-new-password" type="password" autoComplete="new-password" className="form-control" required disabled={saving} aria-describedby="profile-password-hint" value={password} onChange={(event) => setPassword(event.target.value)} />
              <small id="profile-password-hint" className="profile-field-hint">At least {MIN_PASSWORD_LENGTH} characters.</small>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-confirm-password">Confirm new password</label>
              <input id="profile-confirm-password" type="password" autoComplete="new-password" className="form-control" required disabled={saving} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary profile-card-action" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
          </form>
        </section>
      </div>

      <div className="profile-signout">
        <button type="button" className="profile-signout-btn" onClick={onLogout}>
          <LogOut size={18} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
};
