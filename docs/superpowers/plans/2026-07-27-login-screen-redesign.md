# PRICE-Watch DTI Admin Login Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 2-column split login screen matching `login.png` and `login-left.png`: left column image panel + right column login form with official DTI logo, PRICE-Watch title, Mail & Lock icon input fields, Eye password toggle, `Sign in` button, and bottom tri-color official shield footer (omitting remember me & forgot password).

**Architecture:** Update `web/src/components/Login.tsx` with Lucide SVG icons (`Mail`, `Lock`, `Eye`, `EyeOff`, `ShieldCheck`) and flexbox split 2-column styling.

**Tech Stack:** React, TypeScript, Lucide Icons, Vite, Vitest.

---

### Task 1: Refactor `web/src/components/Login.tsx` to 2-Column Layout

**Files:**
- Modify: `web/src/components/Login.tsx`

- [ ] **Step 1: Refactor `Login.tsx` markup and styles**

```tsx
import React, { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import api from '../services/api'

interface LoginProps {
  onLoginSuccess: (user: any) => void
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
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
    <div className="login-split-wrapper" style={{ minHeight: '100vh', display: 'flex', width: '100vw', background: '#ffffff', overflow: 'hidden' }}>
      {/* Left Column: Image Background */}
      <div
        className="login-left-column"
        style={{
          flex: 1,
          minHeight: '100vh',
          backgroundImage: "url('/login-left.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Right Column: Form Container */}
      <div
        className="login-right-column"
        style={{
          flex: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem 1.5rem',
          background: '#ffffff',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Official DTI Logo */}
          <img src="/dti-logo.svg" alt="DTI Philippines Logo" style={{ height: '90px', width: 'auto', objectFit: 'contain', marginBottom: '1.25rem' }} />

          {/* PRICE-Watch Title */}
          <h1 style={{ margin: 0, fontSize: '2.1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', textAlign: 'center' }}>
            PRICE-<span style={{ color: '#0052cc' }}>Watch</span>
          </h1>

          {/* Subtitle with Side Lines */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', justifyContent: 'center', margin: '0.5rem 0 2rem' }}>
            <div style={{ flex: 1, height: '1px', background: '#cbd5e1', maxWidth: '40px' }} />
            <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>DTI Admin Portal</span>
            <div style={{ flex: 1, height: '1px', background: '#cbd5e1', maxWidth: '40px' }} />
          </div>

          {/* Error Badge */}
          {error && (
            <div
              className="error-badge"
              style={{
                width: '100%',
                marginBottom: '1.25rem',
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
                boxSizing: 'border-box',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 500, color: '#1e293b', marginBottom: '0.4rem' }}>
                Email address
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={18} style={{ position: 'absolute', left: '1rem', color: '#64748b', pointerEvents: 'none' }} />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your official email"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.6rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password" style={{ display: 'block', fontSize: '0.88rem', fontWeight: 500, color: '#1e293b', marginBottom: '0.4rem' }}>
                Password
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={18} style={{ position: 'absolute', left: '1rem', color: '#64748b', pointerEvents: 'none' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 2.6rem 0.75rem 2.6rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.85rem',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.2rem',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.85rem',
                marginTop: '0.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#0052cc',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(0, 82, 204, 0.25)',
                transition: 'background-color 0.2s ease',
              }}
            >
              {loading ? 'Authenticating...' : 'Sign in'}
            </button>
          </form>

          {/* Footer Official Seal */}
          <div style={{ width: '100%', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.85rem', justifyContent: 'center' }}>
            <ShieldCheck size={32} style={{ color: '#0052cc', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                Secure. Official. Committed to Fair Trade.
              </span>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Protecting Consumers. Supporting Businesses.
              </span>
            </div>
          </div>

          {/* Tri-Color Accent Line */}
          <div style={{ height: '4px', width: '120px', margin: '0.85rem auto 0', display: 'flex', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ flex: 1, background: '#0038a8' }} />
            <div style={{ flex: 1, background: '#fcd116' }} />
            <div style={{ flex: 1, background: '#ce1126' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add responsive media queries to `admin.css`**

Ensure on screens smaller than `900px`, the left column hides (`display: none`) so mobile login remains clean.

```css
@media (max-width: 900px) {
  .login-left-column {
    display: none !important;
  }
  .login-right-column {
    flex: 1 !important;
    width: 100% !important;
  }
}
```

- [ ] **Step 3: Commit Task 1**

```bash
git add web/src/components/Login.tsx web/src/components/admin/admin.css web/public/login-left.png
git commit -m "feat(admin): implement 2-column split login screen matching login.png and login-left.png"
```

---

### Task 2: Build Verification, Unit Tests & Production Deployment

**Files:**
- Build: `web/`

- [ ] **Step 1: Test production build**

```bash
npm run build
```

- [ ] **Step 2: Run Vitest unit tests**

```bash
npm test -- --run
```

- [ ] **Step 3: Push commits to GitHub `main`**

```bash
git push origin main
```

- [ ] **Step 4: Deploy to Vercel Production**

```bash
npx -y vercel --prod --yes
```

- [ ] **Step 5: Verify Live Vercel Production Deployment**
Verify `https://web-plum-sigma-99.vercel.app` returns 200 OK.
