import React, { useEffect, useState } from 'react'
import { Key, PenLine, RefreshCw, Save, ShieldCheck, User } from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import { adminToast } from '../../services/adminToast'
import type { AdminUser } from '../../types/admin'
import { LegalSignatoriesSettings } from './LegalSignatoriesSettings'

interface SettingsPanelProps {
  user: AdminUser
  onUserUpdate?: (updatedUser: Partial<AdminUser>) => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ user, onUserUpdate }) => {
  const [name, setName] = useState(user.name || '')
  const [email, setEmail] = useState(user.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [tab, setTab] = useState<'profile' | 'signatories'>('profile')

  useEffect(() => {
    setName(user.name || '')
    setEmail(user.email || '')
  }, [user])

  useEffect(() => {
    let isMounted = true
    void adminApi.getSettings().then((res) => {
      if (!isMounted || !res?.profile) return
      if (res.profile.name) setName(res.profile.name)
      if (res.profile.email) setEmail(res.profile.email)
    }).catch(() => {
      if (isMounted) setLoadWarning('The latest profile settings could not be loaded. The signed-in account details are shown instead.')
    })
    return () => { isMounted = false }
  }, [])

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileError(null)

    if (newPassword && newPassword.length < 12) {
      setProfileError('New password must be at least 12 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setProfileError('New password and confirmation do not match.')
      return
    }
    if (newPassword && !currentPassword) {
      setProfileError('Enter your current password before setting a new password.')
      return
    }

    setProfileSaving(true)
    try {
      const res = await adminApi.updateProfile({
        name,
        email,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      })
      adminToast.success(res.message || 'Profile details updated successfully.', { id: 'settings-profile-saved' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onUserUpdate?.({ name, email })
    } catch (error: any) {
      const message = error.response?.data?.message
        || error.response?.data?.errors?.current_password?.[0]
        || error.response?.data?.errors?.new_password?.[0]
        || 'Failed to update profile details.'
      setProfileError(message)
      adminToast.error(message, { id: 'settings-profile-error' })
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="admin-panel-container">
      <div className="settings-workspace">
        <nav className="settings-tabs-sidebar" aria-label="Settings Categories">
          <button type="button" className={`settings-tab-btn ${tab === 'profile' ? 'active' : ''}`} aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>
            <User size={18} aria-hidden="true" />
            <div className="settings-tab-labels">
              <span className="settings-tab-title">My Profile &amp; Security</span>
              <span className="settings-tab-sub">Credentials &amp; Password</span>
            </div>
          </button>
          <button type="button" className={`settings-tab-btn ${tab === 'signatories' ? 'active' : ''}`} aria-current={tab === 'signatories' ? 'page' : undefined} onClick={() => setTab('signatories')}>
            <PenLine size={18} aria-hidden="true" />
            <div className="settings-tab-labels">
              <span className="settings-tab-title">Legal Signatories</span>
              <span className="settings-tab-sub">LOI &amp; SCO signatory and e-signature</span>
            </div>
          </button>
        </nav>

        <main className="settings-content-card">
          {tab === 'signatories' ? <LegalSignatoriesSettings canEdit={user.role === 'super_admin' || user.role === 'dti_evaluator'} /> : <>
          <form onSubmit={handleProfileSubmit} className="settings-form-section">
            <div className="settings-section-header">
              <h3>My Profile &amp; Security</h3>
              <p>Manage your official account details and password.</p>
            </div>

            {loadWarning && <div className="settings-info-callout" role="status">{loadWarning}</div>}
            {profileError && <div className="settings-alert-badge error" role="alert">{profileError}</div>}

            <div className="settings-form-grid">
              <div className="settings-form-group">
                <label htmlFor="settings-name">Official Name</label>
                <input id="settings-name" type="text" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div className="settings-form-group">
                <label htmlFor="settings-email">Official Email Address</label>
                <input id="settings-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div className="settings-form-group full-width">
                <label>Assigned Regulatory Role</label>
                <div className="settings-role-badge">
                  <ShieldCheck size={18} className="role-icon" aria-hidden="true" />
                  <span>{user.role === 'super_admin' ? 'Super Administrator' : 'DTI Evaluator'}</span>
                </div>
                <span className="settings-hint">Roles are managed centrally by a DTI Administrator.</span>
              </div>
            </div>

            <hr className="settings-divider" />
            <div className="settings-section-header">
              <div className="header-with-icon"><Key size={18} aria-hidden="true" /><h4>Change Password</h4></div>
              <p>Leave all password fields blank to keep your current password.</p>
            </div>
            <div className="settings-form-grid">
              <div className="settings-form-group full-width">
                <label htmlFor="settings-current-password">Current Password</label>
                <input id="settings-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
              </div>
              <div className="settings-form-group">
                <label htmlFor="settings-new-password">New Password</label>
                <input id="settings-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Minimum 12 characters" autoComplete="new-password" />
              </div>
              <div className="settings-form-group">
                <label htmlFor="settings-confirm-password">Confirm New Password</label>
                <input id="settings-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <div className="settings-action-bar">
              <button type="submit" className="session-btn-primary" disabled={profileSaving}>
                {profileSaving ? <RefreshCw size={16} className="spin-icon" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                <span>{profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>

          <section className="settings-form-section" aria-labelledby="unavailable-settings-title">
            <div className="settings-section-header">
              <h3 id="unavailable-settings-title">Unavailable settings</h3>
              <p>Notifications, display density, inactivity timeout, and GIS defaults are unavailable until they are connected to runtime behavior.</p>
            </div>
          </section>

          <section className="settings-form-section" aria-labelledby="review-threshold-title">
            <div className="settings-section-header">
              <h3 id="review-threshold-title">Price review threshold</h3>
              <p>Fixed by policy and not editable here: a field price is flagged for DTI review when it is more than 10% above the SRP, or above the price ceiling during a price freeze. A flag is an observation for review, not a legal finding.</p>
            </div>
          </section>
          </>}
        </main>
      </div>
    </div>
  )
}
