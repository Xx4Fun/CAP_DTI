import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
  it('shows all management modules to a DTI evaluator', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('navigation', { name: /DTI Admin modules/i })).toBeInTheDocument()
    for (const label of ['Overview', 'Stores', 'SRP', 'Receipt review', 'Emergency', 'Notice drafts', 'Audit']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('limits a field officer to read-only overview and analytics', () => {
    render(<AdminShell user={{ id: 2, name: 'Officer', email: 'officer@dti.test', role: 'field_officer' }} />)

    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analytics' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Emergency' })).not.toBeInTheDocument()
  })

  it('moves focus to the selected panel heading', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)
    await user.click(screen.getByRole('button', { name: 'Receipt review' }))
    expect(screen.getByRole('heading', { name: 'Formal receipt review' })).toHaveFocus()
  })
})
