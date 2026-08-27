import React, { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, LoaderCircle, Lock, Mail, ShieldCheck } from 'lucide-react'
import { apiError, fieldApi } from '../services/fieldApi'
import type { FieldSession } from '../types'

interface LoginProps {
  onAuthenticated: (session: FieldSession) => void
}

export const Login: React.FC<LoginProps> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fieldApi.login(email, password)
      onAuthenticated(response)
    } catch (err: unknown) {
      setError(apiError(err, 'Sign-in failed. Check your credentials and connection, then try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      {/* Left Column Artwork (Active on Landscape & Desktop) */}
      <div className="login-left-column">
        <img
          src="/branding/login-artwork.webp"
          alt="DTI fair trade and consumer protection illustration"
          className="login-artwork-img"
        />
      </div>

      {/* Right Column / Centered Authentication Panel */}
      <div className="login-right-column">
        <div className="login-card">
          {/* Header */}
          <div className="login-header">
            <img
              src="/branding/dti-logo.svg"
              alt="DTI Official Logo"
              className="login-dti-logo"
            />
            <h1 className="login-title">
              PRICE-<span className="login-title-highlight">Watch</span>
            </h1>
            <div className="login-subtitle-row">
              <div className="login-subtitle-line" />
              <span>— DTI Field Monitoring —</span>
              <div className="login-subtitle-line" />
            </div>
          </div>

          {error && (
            <div role="alert" className="error-badge login-error-badge">
              ⚠️ {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="email">Email address</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  type="email"
                  id="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your official email"
                  required
                  className="login-input"
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="login-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
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
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="login-button-spinner spin"
                    aria-hidden="true"
                  />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="login-footer">
            <div className="login-footer-guarantee">
              <ShieldCheck size={18} className="login-shield-icon" />
              <span>Secure. Official. Committed to Fair Trade.</span>
            </div>
            <div className="login-footer-tagline">
              Protecting Consumers. Supporting Businesses.
            </div>
            <div className="login-ph-bar">
              <div className="login-ph-blue" />
              <div className="login-ph-yellow" />
              <div className="login-ph-red" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
