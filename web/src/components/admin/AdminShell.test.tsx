import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getOverview: vi.fn().mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 0 }),
    getStores: vi.fn().mockResolvedValue([]),
    getReports: vi.fn().mockResolvedValue([]),
    getEmergencies: vi.fn().mockResolvedValue([]),
    getAuditEvents: vi.fn().mockResolvedValue([]),
  },
}))

describe('AdminShell', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('shows all management modules to a DTI evaluator', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('navigation', { name: /DTI Admin modules/i })).toBeInTheDocument()
    for (const label of ['Dashboard Overview', 'GIS Store Registry', 'Price Regulation', 'Consumer OCR Queue', 'Legal Engine', 'Emergency Protocol']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
  })

  it('limits a field officer to read-only overview and analytics', () => {
    render(<AdminShell user={{ id: 2, name: 'Officer', email: 'officer@dti.test', role: 'field_officer' }} />)

    expect(screen.getByRole('button', { name: /Dashboard Overview/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Price Regulation/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Emergency Protocol/i })).not.toBeInTheDocument()
  })

  it('moves focus to the selected panel heading', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)
    await user.click(screen.getByRole('button', { name: /Consumer OCR Queue/i }))
    expect(screen.getByRole('heading', { level: 1, name: 'Formal receipt review' })).toHaveFocus()
  })

  it('opens Overview with grouped navigation collapsed and one page title', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('button', { name: /Price Regulation/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('heading', { name: 'Regulatory Overview' })).toHaveLength(1)
    expect(screen.getByRole('banner')).toHaveTextContent('DTI Officer Portal')
  })

  it('expands a navigation group without leaving the current page', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: /Price Regulation/i }))

    expect(screen.getByRole('button', { name: /Price Regulation/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { level: 1, name: 'Regulatory Overview' })).toBeInTheDocument()
  })

  it('restores an authorized module from the URL and updates it on navigation', async () => {
    window.history.replaceState({}, '', '/?module=reports')
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Formal receipt review' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Dashboard Overview/i }))
    expect(new URLSearchParams(window.location.search).get('module')).toBe('overview')
  })

  it('uses a real account menu instead of unsupported message and online controls', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} onLogout={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Messages/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Evaluator account/i }))
    expect(screen.getByRole('button', { name: /Lock session/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Logout/i })).toBeInTheDocument()
  })
})
