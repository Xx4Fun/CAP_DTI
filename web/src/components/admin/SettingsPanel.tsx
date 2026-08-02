import React, { useEffect, useState } from 'react'
import {
  User,
  Bell,
  Sliders,
  Palette,
  ShieldCheck,
  Check,
  Lock,
  Save,
  AlertTriangle,
  RefreshCw,
  Clock,
  MapPin,
  FileText,
  Key,
} from 'lucide-react'
import { adminApi } from '../../services/adminApi'
import type { AdminUser } from '../../types/admin'

interface SettingsPanelProps {
  user: AdminUser
  onUserUpdate?: (updatedUser: Partial<AdminUser>) => void
}

type SettingsTab = 'profile' | 'notifications' | 'system' | 'appearance'

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ user, onUserUpdate }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  // Profile Form State
  const [name, setName] = useState(user.name || '')
  const [email, setEmail] = useState(user.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  // Preferences Form State
  const [notifyAnomalies, setNotifyAnomalies] = useState(true)
  const [notifyReceipts, setNotifyReceipts] = useState(true)
  const [notifyLoiExpiry, setNotifyLoiExpiry] = useState(true)
  const [uiDensity, setUiDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [inactivityTimeout, setInactivityTimeout] = useState<number>(15)
  const [prefMessage, setPrefMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [prefSaving, setPrefSaving] = useState(false)

  // System Settings Form State
  const [anomalyThreshold, setAnomalyThreshold] = useState('10.00')
  const [gisLat, setGisLat] = useState('10.7431')
  const [gisLng, setGisLng] = useState('121.9427')
  const [gisZoom, setGisZoom] = useState('14')
  const [loiHours, setLoiHours] = useState('48')
  const [systemMessage, setSystemMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [systemSaving, setSystemSaving] = useState(false)

  const isSuperAdmin = user.role === 'super_admin'

  useEffect(() => {
    setName(user.name || '')
    setEmail(user.email || '')
  }, [user])

  useEffect(() => {
    let isMounted = true
    void adminApi.getSettings().then((res) => {
      if (!isMounted || !res) return
      if (res.profile) {
        if (res.profile.name) setName(res.profile.name)
        if (res.profile.email) setEmail(res.profile.email)
      }
      if (res.preferences) {
        if (typeof res.preferences.notify_anomalies === 'boolean') setNotifyAnomalies(res.preferences.notify_anomalies)
        if (typeof res.preferences.notify_receipts === 'boolean') setNotifyReceipts(res.preferences.notify_receipts)
        if (typeof res.preferences.notify_loi_expiry === 'boolean') setNotifyLoiExpiry(res.preferences.notify_loi_expiry)
        if (res.preferences.ui_density) setUiDensity(res.preferences.ui_density)
        if (res.preferences.inactivity_timeout_minutes) setInactivityTimeout(res.preferences.inactivity_timeout_minutes)
      }
      if (res.system) {
        if (res.system.anomaly_threshold_percent) setAnomalyThreshold(res.system.anomaly_threshold_percent)
        if (res.system.gis_default_lat) setGisLat(res.system.gis_default_lat)
        if (res.system.gis_default_lng) setGisLng(res.system.gis_default_lng)
        if (res.system.gis_default_zoom) setGisZoom(res.system.gis_default_zoom)
        if (res.system.loi_rebuttal_hours) setLoiHours(res.system.loi_rebuttal_hours)
      }
    }).catch(() => {
      // Local storage fallback if offline
      const savedPrefs = localStorage.getItem('price_watch_user_prefs')
      if (savedPrefs) {
        try {
          const parsed = JSON.parse(savedPrefs)
          if (parsed.uiDensity) setUiDensity(parsed.uiDensity)
          if (parsed.inactivityTimeout) setInactivityTimeout(parsed.inactivityTimeout)
        } catch { /* ignore */ }
      }
    })
    return () => { isMounted = false }
  }, [])

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMessage(null)

    if (newPassword && newPassword !== confirmPassword) {
      setProfileMessage({ type: 'error', text: 'New password and confirmation do not match.' })
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
      setProfileMessage({ type: 'success', text: res.message || 'Profile details updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      if (onUserUpdate) {
        onUserUpdate({ name, email })
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.current_password?.[0] || 'Failed to update profile details.'
      setProfileMessage({ type: 'error', text: msg })
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePreferencesSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPrefMessage(null)
    setPrefSaving(true)

    try {
      const payload = {
        notify_anomalies: notifyAnomalies,
        notify_receipts: notifyReceipts,
        notify_loi_expiry: notifyLoiExpiry,
        ui_density: uiDensity,
        inactivity_timeout_minutes: Number(inactivityTimeout),
      }
      const res = await adminApi.updatePreferences(payload)
      setPrefMessage({ type: 'success', text: res.message || 'Preferences saved successfully.' })
      localStorage.setItem('price_watch_user_prefs', JSON.stringify({ uiDensity, inactivityTimeout }))
    } catch {
      localStorage.setItem('price_watch_user_prefs', JSON.stringify({ uiDensity, inactivityTimeout }))
      setPrefMessage({ type: 'success', text: 'Preferences saved locally.' })
    } finally {
      setPrefSaving(false)
    }
  }

  const handleSystemSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSystemMessage(null)
    setSystemSaving(true)

    try {
      const payload = {
        anomaly_threshold_percent: anomalyThreshold,
        gis_default_lat: gisLat,
        gis_default_lng: gisLng,
        gis_default_zoom: gisZoom,
        loi_rebuttal_hours: loiHours,
      }
      const res = await adminApi.updateSystemSettings(payload)
      setSystemMessage({ type: 'success', text: res.message || 'System configuration updated successfully.' })
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to save system configuration.'
      setSystemMessage({ type: 'error', text: msg })
    } finally {
      setSystemSaving(false)
    }
  }

  return (
    <div className="admin-panel-container">
      {/* Header Banner */}
      <div className="panel-header-banner">
        <div className="panel-header-title-group">
          <span className="panel-eyebrow">DTI Governance & Administration</span>
          <h1 id="settings-heading" className="panel-title">System &amp; Profile Settings</h1>
          <p className="panel-subtitle">
            Configure your officer credentials, alert preferences, regional GIS parameters, and regulatory thresholds.
          </p>
        </div>
      </div>

      {/* Main Settings Layout Grid */}
      <div className="settings-workspace">
        {/* Navigation Tabs (Sidebar) */}
        <nav className="settings-tabs-sidebar" aria-label="Settings Categories">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={18} aria-hidden="true" />
            <div className="settings-tab-labels">
              <span className="settings-tab-title">My Profile &amp; Security</span>
              <span className="settings-tab-sub">Credentials &amp; Password</span>
            </div>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <Bell size={18} aria-hidden="true" />
            <div className="settings-tab-labels">
              <span className="settings-tab-title">Notifications &amp; Alerts</span>
              <span className="settings-tab-sub">Real-time alerts &amp; digest</span>
            </div>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            <Sliders size={18} aria-hidden="true" />
            <div className="settings-tab-labels">
              <span className="settings-tab-title">System Configuration</span>
              <span className="settings-tab-sub">Thresholds &amp; GIS Defaults</span>
            </div>
          </button>

          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={18} aria-hidden="true" />
            <div className="settings-tab-labels">
              <span className="settings-tab-title">Appearance &amp; Display</span>
              <span className="settings-tab-sub">Table density &amp; theme</span>
            </div>
          </button>
        </nav>

        {/* Content Body Panel */}
        <main className="settings-content-card">
          {/* TAB 1: PROFILE & SECURITY */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="settings-form-section">
              <div className="settings-section-header">
                <h3>My Profile &amp; Security</h3>
                <p>Manage your account credentials, official email, and authentication security.</p>
              </div>

              {profileMessage && (
                <div className={`settings-alert-badge ${profileMessage.type === 'success' ? 'success' : 'error'}`} role="alert">
                  {profileMessage.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                  <span>{profileMessage.text}</span>
                </div>
              )}

              <div className="settings-form-grid">
                <div className="settings-form-group">
                  <label htmlFor="settings-name">Official Name</label>
                  <input
                    id="settings-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="settings-form-group">
                  <label htmlFor="settings-email">Official Email Address</label>
                  <input
                    id="settings-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Enter your official email"
                  />
                </div>

                <div className="settings-form-group full-width">
                  <label>Assigned Regulatory Role</label>
                  <div className="settings-role-badge">
                    <ShieldCheck size={18} className="role-icon" />
                    <span>{user.role === 'super_admin' ? 'Super Administrator' : user.role === 'field_officer' ? 'Field Inspection Officer' : 'DTI Evaluator'}</span>
                  </div>
                  <span className="settings-hint">Roles are managed centrally by the DTI Administrator.</span>
                </div>
              </div>

              <hr className="settings-divider" />

              <div className="settings-section-header">
                <div className="header-with-icon">
                  <Key size={18} />
                  <h4>Change Password</h4>
                </div>
                <p>Leave blank if you do not wish to change your current password.</p>
              </div>

              <div className="settings-form-grid">
                <div className="settings-form-group full-width">
                  <label htmlFor="settings-current-password">Current Password</label>
                  <input
                    id="settings-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Required only when setting a new password"
                    autoComplete="current-password"
                  />
                </div>

                <div className="settings-form-group">
                  <label htmlFor="settings-new-password">New Password</label>
                  <input
                    id="settings-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                </div>

                <div className="settings-form-group">
                  <label htmlFor="settings-confirm-password">Confirm New Password</label>
                  <input
                    id="settings-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="settings-action-bar">
                <button type="submit" className="session-btn-primary" disabled={profileSaving}>
                  {profileSaving ? <RefreshCw size={16} className="spin-icon" /> : <Save size={16} />}
                  <span>{profileSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: NOTIFICATIONS & ALERTS */}
          {activeTab === 'notifications' && (
            <form onSubmit={handlePreferencesSubmit} className="settings-form-section">
              <div className="settings-section-header">
                <h3>Notifications &amp; Alert Preferences</h3>
                <p>Customize real-time dashboard notifications for regulatory events and inspections.</p>
              </div>

              {prefMessage && (
                <div className={`settings-alert-badge ${prefMessage.type === 'success' ? 'success' : 'error'}`} role="alert">
                  {prefMessage.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                  <span>{prefMessage.text}</span>
                </div>
              )}

              <div className="settings-toggles-list">
                <label className="settings-toggle-card">
                  <div className="toggle-info">
                    <span className="toggle-title">Real-Time Price Anomaly Alerts</span>
                    <span className="toggle-desc">Receive immediate alerts when offline inspections report prices &gt;10% above SRP baseline.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyAnomalies}
                    onChange={(e) => setNotifyAnomalies(e.target.checked)}
                  />
                </label>

                <label className="settings-toggle-card">
                  <div className="toggle-info">
                    <span className="toggle-title">Consumer Receipt OCR Scan Submissions</span>
                    <span className="toggle-desc">Notify when citizens submit receipt scans requiring manual evaluation.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyReceipts}
                    onChange={(e) => setNotifyReceipts(e.target.checked)}
                  />
                </label>

                <label className="settings-toggle-card">
                  <div className="toggle-info">
                    <span className="toggle-title">LOI Rebuttal Expiration Warnings</span>
                    <span className="toggle-desc">Alert when a store owner's 48-hour Letter of Inquiry rebuttal window is expiring.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifyLoiExpiry}
                    onChange={(e) => setNotifyLoiExpiry(e.target.checked)}
                  />
                </label>
              </div>

              <hr className="settings-divider" />

              <div className="settings-section-header">
                <div className="header-with-icon">
                  <Clock size={18} />
                  <h4>Inactivity Lock Screen Timeout</h4>
                </div>
                <p>Automatically lock your DTI session after a period of inactivity to prevent unauthorized access.</p>
              </div>

              <div className="settings-form-group" style={{ maxWidth: '320px' }}>
                <label htmlFor="settings-inactivity-timeout">Inactivity Timeout Period</label>
                <select
                  id="settings-inactivity-timeout"
                  value={inactivityTimeout}
                  onChange={(e) => setInactivityTimeout(Number(e.target.value))}
                >
                  <option value={5}>5 Minutes</option>
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes (Default)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div className="settings-action-bar">
                <button type="submit" className="session-btn-primary" disabled={prefSaving}>
                  {prefSaving ? <RefreshCw size={16} className="spin-icon" /> : <Save size={16} />}
                  <span>{prefSaving ? 'Saving...' : 'Save Notification Preferences'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: SYSTEM CONFIGURATION */}
          {activeTab === 'system' && (
            <form onSubmit={handleSystemSubmit} className="settings-form-section">
              <div className="settings-section-header">
                <h3>System &amp; Regulatory Parameters</h3>
                <p>Define nationwide baseline anomaly thresholds, legal rebuttal windows, and GIS map defaults.</p>
              </div>

              {systemMessage && (
                <div className={`settings-alert-badge ${systemMessage.type === 'success' ? 'success' : 'error'}`} role="alert">
                  {systemMessage.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                  <span>{systemMessage.text}</span>
                </div>
              )}

              {!isSuperAdmin && (
                <div className="settings-info-callout">
                  <Lock size={18} />
                  <span>Viewing system parameters. Modifications require <strong>Super Administrator</strong> authorization.</span>
                </div>
              )}

              <div className="settings-form-grid">
                <div className="settings-form-group">
                  <label htmlFor="settings-anomaly-threshold">
                    <FileText size={16} className="input-icon" />
                    Price Anomaly Threshold (%)
                  </label>
                  <input
                    id="settings-anomaly-threshold"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={anomalyThreshold}
                    onChange={(e) => setAnomalyThreshold(e.target.value)}
                    disabled={!isSuperAdmin}
                    placeholder="10.00"
                  />
                  <span className="settings-hint">Percentage above SRP baseline to trigger automatic anomaly flags during normal market protocols.</span>
                </div>

                <div className="settings-form-group">
                  <label htmlFor="settings-loi-hours">
                    <Clock size={16} className="input-icon" />
                    LOI Rebuttal Expiration Window (Hours)
                  </label>
                  <input
                    id="settings-loi-hours"
                    type="number"
                    min="1"
                    max="168"
                    value={loiHours}
                    onChange={(e) => setLoiHours(e.target.value)}
                    disabled={!isSuperAdmin}
                    placeholder="48"
                  />
                  <span className="settings-hint">Hours granted to store owners to submit documentary evidence before automatic SCO escalation.</span>
                </div>

                <div className="settings-form-group full-width">
                  <label>
                    <MapPin size={16} className="input-icon" />
                    Regional GIS Map Initial Coordinates
                  </label>
                  <div className="settings-inline-inputs">
                    <div>
                      <span className="inline-label">Latitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={gisLat}
                        onChange={(e) => setGisLat(e.target.value)}
                        disabled={!isSuperAdmin}
                      />
                    </div>
                    <div>
                      <span className="inline-label">Longitude</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={gisLng}
                        onChange={(e) => setGisLng(e.target.value)}
                        disabled={!isSuperAdmin}
                      />
                    </div>
                    <div>
                      <span className="inline-label">Zoom Level</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={gisZoom}
                        onChange={(e) => setGisZoom(e.target.value)}
                        disabled={!isSuperAdmin}
                      />
                    </div>
                  </div>
                  <span className="settings-hint">Default map view centered on San Jose de Buenavista, Antique Provincial Office.</span>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="settings-action-bar">
                  <button type="submit" className="session-btn-primary" disabled={systemSaving}>
                    {systemSaving ? <RefreshCw size={16} className="spin-icon" /> : <Save size={16} />}
                    <span>{systemSaving ? 'Saving System Controls...' : 'Save System Parameters'}</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* TAB 4: APPEARANCE & DISPLAY */}
          {activeTab === 'appearance' && (
            <div className="settings-form-section">
              <div className="settings-section-header">
                <h3>Appearance &amp; Workspace Display</h3>
                <p>Adjust data density and interface options for administrative workflows.</p>
              </div>

              <div className="settings-form-group" style={{ maxWidth: '360px' }}>
                <label htmlFor="settings-ui-density">Table Data Density</label>
                <select
                  id="settings-ui-density"
                  value={uiDensity}
                  onChange={(e) => setUiDensity(e.target.value as 'comfortable' | 'compact')}
                >
                  <option value="comfortable">Comfortable (Standard Padding)</option>
                  <option value="compact">Compact (High Information Density)</option>
                </select>
                <span className="settings-hint">Applies to SRP Bulletin tables and Store Registry views.</span>
              </div>

              <hr className="settings-divider" />

              <div className="settings-section-header">
                <h4>System Color Palette &amp; Branding</h4>
                <p>Official Department of Trade &amp; Industry Executive Blue Theme.</p>
              </div>

              <div className="settings-theme-preview-card">
                <div className="theme-swatch-row">
                  <div className="theme-swatch" style={{ background: 'linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%)' }}>
                    <span>Sidebar Gradient</span>
                  </div>
                  <div className="theme-swatch" style={{ background: '#1d4ed8' }}>
                    <span>Primary Royal Blue</span>
                  </div>
                  <div className="theme-swatch" style={{ background: '#dc2626' }}>
                    <span>Alert Red / Emergency</span>
                  </div>
                </div>
                <div className="theme-description">
                  <strong>PRICE-Watch Executive Theme</strong>: Optimized for high legibility, accessibility, and offline field compliance.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
