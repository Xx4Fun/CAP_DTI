import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { AdminShell } from './AdminShell'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getOverview: vi.fn().mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 0 }),
    getStores: vi.fn().mockResolvedValue([]),
    getReports: vi.fn().mockResolvedValue([]),
    getReportPage: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 4, total: 0 } }),
    getEmergencies: vi.fn().mockResolvedValue([]),
    getAuditEvents: vi.fn().mockResolvedValue([]),
    getConversations: vi.fn().mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0 }),
    getManagedUsers: vi.fn().mockResolvedValue({
      records: [],
      pagination: { current_page: 1, last_page: 1, per_page: 10, total: 0, from: null, to: null },
      counts: { total: 0, field_officer: 0, vendor: 0, inactive: 0 },
    }),
  },
}))

describe('AdminShell', () => {
  it('refreshes the header after a declaration changes and discards the old active status', async () => {
    vi.mocked(adminApi.getOverview).mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 1 })
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)
    expect(await screen.findByText('State of Calamity Active')).toBeInTheDocument()
    vi.mocked(adminApi.getOverview).mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 0 })
    act(() => { window.dispatchEvent(new Event('regulatory-data-changed')) })
    expect(await screen.findByText('Normal Market Protocol')).toBeInTheDocument()
  })
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('renders all 10 evaluator modules in a 1-click flat hierarchy without accordions', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    const navigation = screen.getByRole('navigation', { name: /DTI Admin modules/i })
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Dashboard',
      'Field Monitoring',
      'Consumer Reports',
      'GIS Monitoring',
      'Price Regulation',
      'Legal Actions',
      'Emergency Protocol',
      'User Management',
      'Store Communications',
      'Audit Trail',
    ])

    // Verify none of the items are collapsible accordions
    within(navigation).getAllByRole('button').forEach((button) => {
      expect(button).not.toHaveAttribute('aria-expanded')
    })
  })

  it('shows a skeleton, not loading text, while a lazy module chunk loads', () => {
    window.history.replaceState({}, '', '/?module=consumer_reports')
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    const loader = screen.getByRole('status', { name: 'Loading Admin module' })
    expect(loader.querySelectorAll('.admin-skeleton-block').length).toBeGreaterThan(0)
    expect(within(loader).getByText('Loading Admin module...')).toHaveClass('sr-only')
  })

  it('navigates directly to any module in a single click', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    const priceRegBtn = screen.getByRole('button', { name: 'Price Regulation' })
    await user.click(priceRegBtn)

    expect(screen.getByRole('heading', { level: 1, name: 'Price Regulation' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('module')).toBe('price_regulation')
    expect(priceRegBtn).toHaveAttribute('aria-current', 'page')

    const fieldMonBtn = screen.getByRole('button', { name: 'Field Monitoring' })
    await user.click(fieldMonBtn)

    expect(screen.getByRole('heading', { level: 1, name: 'Field Monitoring' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('module')).toBe('field_monitoring')
    expect(fieldMonBtn).toHaveAttribute('aria-current', 'page')
  })

  it('drops the previous module state from the URL so it cannot reopen later', async () => {
    window.history.replaceState({}, '', '/?module=audit_trail&record=12&store=2&source_record=14&monitor_tab=records')
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(window.location.search).toBe('?module=overview')
  })

  it('collapses the sidebar while a wide view is open and restores it afterwards', () => {
    const { container } = render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)
    const sidebar = container.querySelector('.admin-sidebar')!
    expect(sidebar).not.toHaveClass('collapsed')

    act(() => { window.dispatchEvent(new CustomEvent('admin:sidebar-focus', { detail: true })) })
    expect(sidebar).toHaveClass('collapsed')

    act(() => { window.dispatchEvent(new CustomEvent('admin:sidebar-focus', { detail: false })) })
    expect(sidebar).not.toHaveClass('collapsed')
  })

  it('does not expose Admin navigation to a field officer', () => {
    render(<AdminShell user={{ id: 2, name: 'Officer', email: 'officer@dti.test', role: 'field_officer' }} />)

    expect(screen.getByRole('heading', { name: 'Use the Field Monitoring PWA' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /DTI Admin modules/i })).not.toBeInTheDocument()
  })

  it('moves focus to the selected panel heading on navigation', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'Consumer Reports' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Consumer Reports' })).toHaveFocus()
  })

  it('uses the sticky header as the single active page heading', () => {
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getAllByRole('heading', { name: 'Dashboard' })).toHaveLength(1)
    expect(within(screen.getByRole('banner')).getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getAllByText('DTI Officer Portal')).toHaveLength(1)
  })

  it('restores legacy module aliases and writes canonical routes on navigation', async () => {
    window.history.replaceState({}, '', '/?module=reports')
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Consumer Reports' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Dashboard$/i }))
    expect(new URLSearchParams(window.location.search).get('module')).toBe('overview')
  })

  it('uses canonical routes for Dashboard workflow shortcuts', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(await screen.findByRole('button', { name: /View receipt queue/i }))

    expect(new URLSearchParams(window.location.search).get('module')).toBe('consumer_reports')
    expect(screen.getByRole('heading', { level: 1, name: 'Consumer Reports' })).toBeInTheDocument()
  })

  it('opens the store conversation workspace from the sidebar', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: 'User Management' }))
    expect(await screen.findByRole('table', { name: 'Managed user accounts' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Store Communications' }))
    expect(await screen.findByRole('complementary', { name: 'Store conversations' })).toBeInTheDocument()
    expect(await screen.findByText(/Stores appear here once a vendor account is linked/i)).toBeInTheDocument()
    expect(screen.queryByText(/not connected yet/i)).not.toBeInTheDocument()
  })

  it('toggles sidebar collapse state without breaking navigation', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    const sidebar = screen.getByRole('complementary', { name: /DTI Admin Sidebar Navigation/i })
    expect(sidebar).not.toHaveClass('collapsed')

    await user.click(screen.getByRole('button', { name: 'Collapse Sidebar' }))
    expect(sidebar).toHaveClass('collapsed')

    // In collapsed mode, 1-click navigation buttons still work
    await user.click(screen.getByRole('button', { name: 'Price Regulation' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Price Regulation' })).toBeInTheDocument()
    expect(sidebar).not.toHaveClass('collapsed')
  })

  it('renders the Header Account Profile trigger and toggles menu options on click', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Officer Juan', email: 'juan@dti.test', role: 'dti_evaluator' }} />)

    const profileTrigger = screen.getByRole('button', { name: /Officer account profile and options/i })
    expect(profileTrigger).toBeInTheDocument()
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'false')

    // Open account dropdown
    await user.click(profileTrigger)
    expect(profileTrigger).toHaveAttribute('aria-expanded', 'true')

    const menu = screen.getByRole('menu', { name: 'Account options' })
    expect(menu).toBeInTheDocument()

    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Help & Support' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument()
  })

  it('navigates to Settings from the Header Account Profile menu', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Officer Juan', email: 'juan@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: /Officer account profile and options/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }))

    expect(screen.getByRole('heading', { level: 1, name: 'System & Profile Settings' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('module')).toBe('settings')
    expect(screen.queryByRole('menu', { name: 'Account options' })).not.toBeInTheDocument()
  })

  it('opens Help & Support modal from the Header Account Profile menu', async () => {
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Officer Juan', email: 'juan@dti.test', role: 'dti_evaluator' }} />)

    await user.click(screen.getByRole('button', { name: /Officer account profile and options/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Help & Support' }))

    expect(screen.getByRole('heading', { name: 'Help & Operating Manual' })).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Account options' })).not.toBeInTheDocument()
  })

  it('opens Logout modal from the Header Account Profile menu and confirms logout', async () => {
    const onLogoutMock = vi.fn()
    const user = userEvent.setup()
    render(<AdminShell user={{ id: 1, name: 'Officer Juan', email: 'juan@dti.test', role: 'dti_evaluator' }} onLogout={onLogoutMock} />)

    await user.click(screen.getByRole('button', { name: /Officer account profile and options/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }))

    expect(screen.getByText(/You will be signed out of your current session/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Log Out/i }))
    expect(onLogoutMock).toHaveBeenCalledTimes(1)
  })

  it('does not label an unavailable emergency status as normal market protocol', async () => {
    vi.mocked(adminApi.getOverview).mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: null, availability: { regulatory_emergencies: false } })

    render(<AdminShell user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }} />)

    expect(await screen.findByText('Emergency status unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Normal Market Protocol')).not.toBeInTheDocument()
    vi.mocked(adminApi.getOverview).mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 0 })
  })
})
