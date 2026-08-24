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
    getManagedUsers: vi.fn().mockResolvedValue({
      records: [],
      pagination: { current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null },
      counts: { total: 0, field_officer: 0, vendor: 0, inactive: 0 },
    }),
  },
}))

describe('AdminShell', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('groups evaluator modules by workflow while keeping Dashboard and Audit Trail standalone', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    const navigation = screen.getByRole('navigation', { name: /DTI Admin modules/i })
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Dashboard',
      'Monitoring',
      'Establishments',
      'Enforcement',
      'Communications',
      'Audit Trail',
    ])
    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Establishments' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Enforcement' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Communications' })).not.toHaveAttribute('aria-expanded')
    expect(screen.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-expanded')
    expect(screen.getByRole('button', { name: 'Audit Trail' })).not.toHaveAttribute('aria-expanded')
  })

  it('classifies related modules into a one-group-open accordion without navigating from parent buttons', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Monitoring' }))
    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Consumer Reports' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Field Monitoring' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('module')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Establishments' }))
    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Consumer Reports' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'User Management' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GIS Monitoring' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enforcement' }))
    expect(screen.getByRole('button', { name: 'Establishments' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'GIS Monitoring' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Price Regulation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Legal Actions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emergency Protocol' })).toBeInTheDocument()
  })

  it('limits a field officer to Dashboard and Field Monitoring', () => {
    render(<AdminShell user={{ id: 2, name: 'Officer', email: 'officer@dti.test', role: 'field_officer' }} />)

    const navigation = screen.getByRole('navigation', { name: /DTI Admin modules/i })
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Dashboard',
      'Field Monitoring',
    ])
  })

  it('moves focus to the selected panel heading', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)
    await user.click(screen.getByRole('button', { name: 'Monitoring' }))
    await user.click(screen.getByRole('button', { name: 'Consumer Reports' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Consumer Reports' })).toHaveFocus()
  })

  it('uses the sticky header as the single active page heading', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('button', { name: 'Enforcement' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('heading', { name: 'Dashboard' })).toHaveLength(1)
    expect(within(screen.getByRole('banner')).getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getAllByText('DTI Officer Portal')).toHaveLength(1)
  })

  it('uses group parents only as toggles and child modules as navigation', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Enforcement' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('module')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Price Regulation' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Price Regulation' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('module')).toBe('price_regulation')
  })

  it('restores legacy module aliases and writes canonical routes on navigation', async () => {
    window.history.replaceState({}, '', '/?module=reports')
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Consumer Reports' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: /^Dashboard$/i }))
    expect(new URLSearchParams(window.location.search).get('module')).toBe('overview')
    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses canonical routes for Dashboard workflow shortcuts', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(await screen.findByRole('button', { name: /View receipt queue/i }))

    expect(new URLSearchParams(window.location.search).get('module')).toBe('consumer_reports')
    expect(screen.getByRole('heading', { level: 1, name: 'Consumer Reports' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows truthful unavailable states for modules without backend support', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Establishments' }))
    await user.click(screen.getByRole('button', { name: 'User Management' }))
    expect(await screen.findByRole('table', { name: 'Managed user accounts' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Communications' }))
    expect(screen.getByText(/Two-way store conversations are not connected yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send message|Approve document|Reject document/i })).not.toBeInTheDocument()
  })

  it('expands the sidebar and opens a selected group from collapsed mode', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Collapse Sidebar' }))
    await user.click(screen.getByRole('button', { name: 'Monitoring' }))

    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Consumer Reports' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /DTI Admin Sidebar Navigation/i })).not.toHaveClass('collapsed')
  })

  it('keeps section labels out of the collapsed sidebar', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Collapse Sidebar' }))

    expect(screen.queryByText('Main Menu')).not.toBeInTheDocument()
    expect(screen.queryByText('General')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders the accessible logout button while the sidebar is collapsed', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Collapse Sidebar' }))

    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
    expect(screen.queryByText('DTI Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('evaluator@dti.test')).not.toBeInTheDocument()
  })

  it('closes an open navigation group when the sidebar is collapsed', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Monitoring' }))
    await user.click(screen.getByRole('button', { name: 'Collapse Sidebar' }))

    expect(screen.getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Consumer Reports')).not.toBeInTheDocument()
  })

  it('renders a direct logout button in the bottom sidebar and confirms logout via modal', async () => {
    const onLogoutMock = vi.fn()
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} onLogout={onLogoutMock} />)

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

  it('renders bottom sidebar items: Settings, Help & Support, and Logout', () => {
    render(<AdminShell user={{ id: 1, name: 'Officer Juan', email: 'juan@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Help & Support' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })
})
