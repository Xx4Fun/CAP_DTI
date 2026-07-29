import React, { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react'
import api from '../services/api'

interface LoginProps {
  onLoginSuccess: (result: {
    token: string
    user: any
    session?: {
      expires_at: string | null
      idle_timeout_seconds: number
      absolute_timeout_seconds: number
    }
  }) => void
  notice?: string
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, notice }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/login', { email, password })
      onLoginSuccess(response.data)
    } catch (err: any) {
      if (err.response?.status === 422) {
        setError('The email or password is incorrect.')
      } else if (err.response?.status === 429) {
        setError('Too many sign-in attempts. Please wait and try again.')
      } else {
        setError('Sign-in is temporarily unavailable. Please try again later.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="login-container"
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        background: '#ffffff',
      }}
    >
      {/* Left Column - Decorative Cover */}
      <div
        className="login-left-column"
        style={{
          flex: 1,
          minHeight: '100vh',
        }}
      >
        <img
          src="/login-left1.png"
          alt="DTI fair trade and consumer protection illustration"
          style={{
            display: 'block',
            width: '100%',
            height: '100vh',
            objectFit: 'cover',
          }}
        />
      </div>

      {/* Right Column - Authentication Form */}
      <div
        className="login-right-column"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 1.5rem',
          background: '#ffffff',
          overflowY: 'auto',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center' }}>
            <img
              src="/dti-logo.svg"
              alt="DTI Official Logo"
              style={{ width: '90px', height: 'auto', marginBottom: '1rem' }}
            />
            <h1
              style={{
                margin: 0,
                fontSize: '2.2rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#0f172a',
                lineHeight: 1.2,
              }}
            >
              PRICE-<span style={{ color: '#0052cc' }}>Watch</span>
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                marginTop: '0.75rem',
                color: '#64748b',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
              <span>— DTI Admin Portal —</span>
              <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
            </div>
          </div>

          {notice && (
            <div
              role="status"
              className="login-notice-badge"
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderLeft: '4px solid #2563eb',
                color: '#1e3a8a',
                padding: '0.75rem 1rem',
                borderRadius: '0 8px 8px 0',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {notice}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="error-badge"
              style={{
                background: '#fef2f2',
                borderLeft: '4px solid #dc2626',
                borderTop: '1px solid #fecaca',
                borderRight: '1px solid #fecaca',
                borderBottom: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '0.75rem 1rem',
                borderRadius: '0 8px 8px 0',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="login-form"
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="email"
                style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}
              >
                Email address
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail
                  size={18}
                  style={{ position: 'absolute', left: '12px', color: '#64748b', pointerEvents: 'none' }}
                />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your official email"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.875rem 0.75rem 2.5rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.925rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="password"
                style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}
              >
                Password
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock
                  size={18}
                  style={{ position: 'absolute', left: '12px', color: '#64748b', pointerEvents: 'none' }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.925rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
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
              style={{
                marginTop: '0.5rem',
                width: '100%',
                padding: '0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: '#0052cc',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(0, 82, 204, 0.25)',
                transition: 'background-color 0.2s ease',
              }}
            >
              {loading ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="login-button-spinner"
                    aria-hidden="true"
                  />
                  <span>Signing in...</span>
                </>
              ) : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <div
            style={{
              marginTop: '1rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid #e2e8f0',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#475569',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={18} style={{ color: '#0052cc', flexShrink: 0 }} />
              <span>Secure. Official. Committed to Fair Trade.</span>
            </div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
              Protecting Consumers. Supporting Businesses.
            </div>
            <div
              style={{
                width: '100%',
                height: '4px',
                display: 'flex',
                borderRadius: '2px',
                overflow: 'hidden',
                marginTop: '0.25rem',
              }}
            >
              <div style={{ flex: 1, background: '#0038a8' }} />
              <div style={{ flex: 1, background: '#fcd116' }} />
              <div style={{ flex: 1, background: '#ce1126' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

