import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { UserManagementPanel } from './UserManagementPanel'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getManagedUsers: vi.fn(),
    createFieldOfficer: vi.fn(),
    updateManagedUser: vi.fn(),
    resetManagedUserPassword: vi.fn(),
  },
}))

const usersPage = {
  records: [{
    id: 7,
    name: 'Maria Vendor',
    email: 'maria@example.test',
    role: 'vendor' as const,
    is_active: true,
    created_at: '2026-08-23T08:00:00Z',
    stores: [{ id: 4, store_name: 'Antique Market' }],
  }],
  pagination: { current_page: 1, last_page: 3, per_page: 10, total: 21, from: 1, to: 10 },
  counts: { total: 21, field_officer: 8, vendor: 13, inactive: 2 },
}

describe('User Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    vi.mocked(adminApi.getManagedUsers).mockResolvedValue(usersPage)
  })

  it('renders a paginated user table and applies role filters', async () => {
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={<div>Existing vendor registration</div>} />)

    expect(await screen.findByRole('table', { name: 'Managed user accounts' })).toBeInTheDocument()
    expect(screen.getByText('Maria Vendor')).toBeInTheDocument()
    expect(screen.getByText('Antique Market')).toBeInTheDocument()
    expect(screen.getByText('Managed users').closest('span')).toHaveTextContent('21')

    await user.click(screen.getByRole('button', { name: 'DTI Field Monitoring' }))
    await waitFor(() => expect(adminApi.getManagedUsers).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'field_officer',
      page: 1,
      per_page: 10,
    })))
  })

  it('uses the existing vendor flow and opens the dedicated officer page', async () => {
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={<div>Existing vendor registration</div>} />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /Vendor account/i }))
    expect(screen.getByText('Existing vendor registration')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to User Management' }))
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /DTI Field Monitoring account/i }))
    expect(screen.getByRole('heading', { name: 'Create field monitoring officer' })).toBeInTheDocument()
  })

  it('creates a field officer and presents the one-time PWA credential handoff', async () => {
    vi.mocked(adminApi.createFieldOfficer).mockResolvedValue({
      id: 22,
      name: 'Ana Officer',
      email: 'ana@dti.gov.ph',
      role: 'field_officer',
      is_active: true,
      created_at: '2026-08-24T08:00:00Z',
      stores: [],
    })
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={<div />} />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /DTI Field Monitoring account/i }))
    await user.type(screen.getByLabelText('Full name'), 'Ana Officer')
    await user.type(screen.getByLabelText('DTI email address'), 'ana@dti.gov.ph')
    await user.type(screen.getByLabelText('Password'), 'permanent-password')
    await user.type(screen.getByLabelText('Confirm password'), 'permanent-password')
    await user.click(screen.getByRole('button', { name: 'Create field officer' }))

    expect(adminApi.createFieldOfficer).toHaveBeenCalledWith({
      name: 'Ana Officer',
      email: 'ana@dti.gov.ph',
      password: 'permanent-password',
      password_confirmation: 'permanent-password',
      is_active: true,
    })
    expect(await screen.findByRole('heading', { name: 'Field officer access is ready' })).toBeInTheDocument()
    expect(screen.getByText('ana@dti.gov.ph')).toBeInTheDocument()
    expect(screen.getByText('permanent-password')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Field Monitoring PWA' })).toHaveAttribute('href')
  })

  it('deactivates an account from its row actions', async () => {
    vi.mocked(adminApi.updateManagedUser).mockResolvedValue({ ...usersPage.records[0], is_active: false })
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={<div />} />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Actions for Maria Vendor' }))
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    await user.click(screen.getByRole('button', { name: 'Confirm deactivation' }))

    expect(adminApi.updateManagedUser).toHaveBeenCalledWith(7, { is_active: false })
  })
})
