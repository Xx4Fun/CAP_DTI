import React, { useState } from 'react'
import api from '../services/api'

interface LoginProps {
  onLoginSuccess: (user: any) => void
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/login', { email, password })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      onLoginSuccess(user)
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message)
      } else if (err.response?.data?.errors) {
        setError(Object.values(err.response.data.errors).flat().join(' '))
      } else {
        setError('Connection failed. Please check your network or server status.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="login-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: '1.5rem',
      }}
    >
      <div
        className="login-card"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '2.5rem 2rem',
          boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
          display: 'grid',
          gap: '1.25rem',
        }}
      >
        <div className="login-logo-container" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
              color: '#ffffff',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 800,
              margin: '0 auto 0.75rem',
              boxShadow: '0 4px 14px rgba(29, 78, 216, 0.35)',
            }}
          >
            DTI
          </div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>
            PRICE-Watch
          </h1>
          <p className="login-subtitle" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
            Department of Trade and Industry | Antique Provincial Office
          </p>
        </div>

        {error && (
          <div
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

        <form onSubmit={handleSubmit} className="login-form" style={{ display: 'grid', gap: '1.1rem' }}>
          <div className="input-group">
            <label htmlFor="email" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
              Official Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. evaluator@dti.gov.ph"
              required
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter secure credentials"
              required
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            className="login-btn btn-primary"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.8rem',
              borderRadius: '8px',
              border: 'none',
              background: '#1d4ed8',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(29, 78, 216, 0.3)',
              transition: 'background-color 0.2s ease',
            }}
          >
            {loading ? 'Authenticating Official Session...' : 'Sign In to Executive Portal'}
          </button>
        </form>

        <div style={{ textAlign: 'center', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#94a3b8' }}>
          PRICE-Watch Regulatory System • R.A. 7581 Price Act Enforcement
        </div>
      </div>
    </div>
  )
}
