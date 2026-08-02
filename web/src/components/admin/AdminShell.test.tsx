import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
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
    for (const label of ['Dashboard Overview', 'Store Management', 'Price Regulation', 'Consumer OCR Queue', 'Legal Engine', 'Emergency Protocol']) {
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

  it('uses the sticky header as the single active page heading', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('button', { name: /Price Regulation/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('heading', { name: 'Regulatory Overview' })).toHaveLength(1)
    expect(within(screen.getByRole('banner')).getByRole('heading', { level: 1, name: 'Regulatory Overview' })).toBeInTheDocument()
    expect(screen.getAllByText('DTI Officer Portal')).toHaveLength(1)
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

  it('uses a red logout menu item and confirms logout via modal', async () => {
    const onLogoutMock = vi.fn()
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} onLogout={onLogoutMock} />)

    expect(screen.queryByRole('button', { name: /Messages/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Evaluator account/i }))
    expect(screen.queryByRole('button', { name: /Lock session/i })).not.toBeInTheDocument()
    
    const logoutBtn = screen.getByRole('button', { name: /Logout/i })
    expect(logoutBtn).toBeInTheDocument()
    await user.click(logoutBtn)

    expect(screen.getByText(/You will be signed out of your current session/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Log Out/i }))
    expect(onLogoutMock).toHaveBeenCalledTimes(1)
  })

  it('does not label an unavailable emergency status as normal market protocol', async () => {
    vi.mocked(adminApi.getEmergencies).mockRejectedValueOnce(new Error('schema unavailable'))

    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(await screen.findByText('Emergency status unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Normal Market Protocol')).not.toBeInTheDocument()
  })

  it('renders DTI Admin title and user email with role badge initial in sidebar account showcase', () => {
    const { rerender } = render(<AdminShell user={{ id: 1, name: 'Officer Juan', email: 'juan@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByText('DTI Admin')).toBeInTheDocument()
    expect(screen.getByText('juan@dti.test')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()

    rerender(<AdminShell user={{ id: 2, name: 'Admin Boss', email: 'admin@dti.test', role: 'super_admin' }} />)
    expect(screen.getByText('admin@dti.test')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()

    rerender(<AdminShell user={{ id: 3, name: 'Field Inspector', email: 'field@dti.test', role: 'field_officer' }} />)
    expect(screen.getByText('field@dti.test')).toBeInTheDocument()
    expect(screen.getByText('F')).toBeInTheDocument()
  })
})
