import React, { useEffect, useState } from 'react';
import { X, Bell, Smartphone, Mail, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import type { NotificationSettings } from '../../app/types';
import { apiError, isSessionInvalid } from '../../services/vendorApi';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  load: () => Promise<NotificationSettings>;
  onClose: () => void;
  onSave: (settings: NotificationSettings) => Promise<void>;
}

const TRIGGERS: Array<{ key: keyof NotificationSettings; label: string }> = [
  { key: 'alert_on_loi', label: 'When a Letter of Inquiry is issued' },
  { key: 'alert_on_sco', label: 'When a Show Cause Order is issued' },
  { key: 'alert_deadline_24h', label: '24 hours before a response deadline' },
  { key: 'alert_price_freeze', label: 'When a price freeze is declared' },
  { key: 'alert_srp_bulletin', label: 'When SRP references are updated' },
];

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ isOpen, load, onClose, onSave }) => {
  const [form, setForm] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(null);
    setError('');
    load().then(setForm).catch((requestError) => {
      if (!isSessionInvalid(requestError)) setError(apiError(requestError, 'Notification preferences could not load.'));
    });
  }, [isOpen, load]);

  if (!isOpen) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (requestError) {
      if (!isSessionInvalid(requestError)) setError(apiError(requestError, 'Preferences could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" onClick={onClose}>
      <form className="modal-dialog" onClick={(event) => event.stopPropagation()} onSubmit={save} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={20} color="var(--dti-navy)" />
            <h2 id="notification-settings-title">Notification Settings</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', background: '#EFF6FF', padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>Your preferences are saved to your account. SMS and email alerts are not yet delivered; check this portal for new notices.</span>
          </p>

          {error && <div role="alert" className="portal-error"><AlertTriangle size={16} /><span>{error}</span></div>}
          {!form && !error && <p role="status">Loading preferences…</p>}

          {form && (
            <>
              <div className="v-card" style={{ padding: '14px', background: '#F8FAFC', marginBottom: '14px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: form.sms_enabled ? '10px' : 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Smartphone size={18} color="var(--dti-navy)" />
                    <strong style={{ fontSize: '0.88rem' }}>SMS text alerts</strong>
                  </span>
                  <input type="checkbox" checked={form.sms_enabled} onChange={(event) => setForm({ ...form, sms_enabled: event.target.checked })} style={{ width: '18px', height: '18px' }} />
                </label>
                {form.sms_enabled && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="sms-mobile">Mobile number</label>
                    <input id="sms-mobile" type="tel" inputMode="numeric" className="form-control" placeholder="09XXXXXXXXX" pattern="09[0-9]{9}" required value={form.sms_mobile_number} onChange={(event) => setForm({ ...form, sms_mobile_number: event.target.value.trim() })} />
                  </div>
                )}
              </div>

              <div className="v-card" style={{ padding: '14px', background: '#F8FAFC', marginBottom: '16px' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: form.email_enabled ? '10px' : 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={18} color="var(--dti-navy)" />
                    <strong style={{ fontSize: '0.88rem' }}>Email alerts</strong>
                  </span>
                  <input type="checkbox" checked={form.email_enabled} onChange={(event) => setForm({ ...form, email_enabled: event.target.checked })} style={{ width: '18px', height: '18px' }} />
                </label>
                {form.email_enabled && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="alert-email">Email address</label>
                    <input id="alert-email" type="email" className="form-control" required value={form.email_address} onChange={(event) => setForm({ ...form, email_address: event.target.value })} />
                  </div>
                )}
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Alert me</legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                  {TRIGGERS.map((trigger) => (
                    <label key={trigger.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={Boolean(form[trigger.key])} onChange={(event) => setForm({ ...form, [trigger.key]: event.target.checked })} />
                      <span>{trigger.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form || saving}>
            <ShieldCheck size={15} />
            <span>{saving ? 'Saving…' : 'Save Preferences'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
