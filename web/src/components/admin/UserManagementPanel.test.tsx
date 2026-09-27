import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { UserManagementPanel } from './UserManagementPanel'
import adminCss from './admin.css?raw'
import { AdminToastHost } from './AdminToastHost'
import type { StoreRecord } from '../../types/admin'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getManagedUsers: vi.fn(),
    createFieldOfficer: vi.fn(),
    updateManagedUser: vi.fn(),
    resetManagedUserPassword: vi.fn(),
    getStores: vi.fn(),
    inviteVendor: vi.fn(),
    getVendorInvitations: vi.fn(),
    cancelVendorInvitation: vi.fn(),
    unlinkStoreVendor: vi.fn(),
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

const store = (overrides: Partial<StoreRecord>): StoreRecord => ({
  id: 1, store_name: 'Store', address: 'San Jose, Antique', latitude: 10, longitude: 121,
  is_active: true, is_verified: true, is_public: true, vendor_user_id: null, ...overrides,
})

const invitationUrl = 'http://vendor.test/vendor-invitation?token=abc'

describe('User Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    vi.mocked(adminApi.getManagedUsers).mockResolvedValue(usersPage)
    vi.mocked(adminApi.getVendorInvitations).mockResolvedValue([])
    vi.mocked(adminApi.getStores).mockResolvedValue([
      store({ id: 4, store_name: 'Antique Market', vendor_user_id: 7 }),
      store({ id: 9, store_name: 'Unlinked Grocery' }),
    ])
    vi.mocked(adminApi.inviteVendor).mockResolvedValue({ invitation_url: invitationUrl, delivery_status: 'queued', invitation: { id: 31, email: 'owner@shop.test', expires_at: '2026-09-15T00:00:00Z' } })
  })

  it('renders a paginated user table and applies role filters', async () => {
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={() => <div>Existing vendor registration</div>} />)

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

  it('uses an accessible status filter without a visible label', async () => {
    render(<><UserManagementPanel /><AdminToastHost /></>)

    await screen.findByText('Maria Vendor')
    expect(screen.getByRole('combobox', { name: 'Filter users by status' })).toBeInTheDocument()
    expect(screen.queryByText('Status', { selector: '.user-status-filter > span' })).not.toBeInTheDocument()
  })

  it('uses one 48px height for each filter toolbar control', () => {
    expect(adminCss).toMatch(/\.user-management-command\s*\{[^}]*--user-toolbar-control-height:\s*48px;/s)
    expect(adminCss).toMatch(/\.user-management-command \.admin-search-field input\s*\{[^}]*height:\s*var\(--user-toolbar-control-height\);/s)
    expect(adminCss).toMatch(/\.user-role-tabs\s*\{[^}]*height:\s*var\(--user-toolbar-control-height\);/s)
    expect(adminCss).toMatch(/\.user-status-filter select\s*\{[^}]*height:\s*var\(--user-toolbar-control-height\);/s)
  })

  it('invites a vendor for an unlinked establishment and shows the invitation link', async () => {
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={() => <div>Existing vendor registration</div>} />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /Vendor account/i }))

    expect(screen.getByRole('heading', { name: 'Invite vendor account' })).toBeInTheDocument()
    const option = await screen.findByRole('radio', { name: /Unlinked Grocery/ })
    expect(screen.queryByRole('radio', { name: /Antique Market/ })).not.toBeInTheDocument()
    await user.click(option)
    await user.type(screen.getByLabelText('Vendor owner email address'), 'Owner@Shop.test')
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))

    expect(adminApi.inviteVendor).toHaveBeenCalledWith(9, 'owner@shop.test')
    const dialog = await screen.findByRole('dialog', { name: 'Vendor invitation created' })
    expect(within(dialog).getByText(invitationUrl)).toBeInTheDocument()
    expect(within(dialog).getByText('owner@shop.test')).toBeInTheDocument()
    expect(within(dialog).getByText(/email accepted by the queue; delivery is not confirmed/i)).toBeInTheDocument()
  })

  it('keeps the link available when invitation email cannot be queued', async () => {
    vi.mocked(adminApi.inviteVendor).mockResolvedValue({ invitation_url: invitationUrl, delivery_status: 'unavailable', invitation: { id: 32, email: 'owner@shop.test', expires_at: '2026-09-15T00:00:00Z' } })
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={() => <div>Existing vendor registration</div>} />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /Vendor account/i }))
    await user.click(await screen.findByRole('radio', { name: /Unlinked Grocery/ }))
    await user.type(screen.getByLabelText('Vendor owner email address'), 'owner@shop.test')
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))

    const dialog = await screen.findByRole('dialog', { name: 'Vendor invitation created' })
    expect(within(dialog).getByText(/email could not be queued/i)).toBeInTheDocument()
    expect(within(dialog).getByText(invitationUrl)).toBeInTheDocument()
  })

  it('continues to the invitation with the store returned by registration', async () => {
    const user = userEvent.setup()
    render(<UserManagementPanel vendorRegistration={({ onCreated }) => (
      <button type="button" onClick={() => onCreated(store({ id: 42, store_name: 'Newly Registered Mart' }))}>Finish registration</button>
    )} />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /Vendor account/i }))
    await user.click(await screen.findByRole('button', { name: 'Register new establishment' }))
    await user.click(screen.getByRole('button', { name: 'Finish registration' }))

    expect(screen.getByRole('radio', { name: /Newly Registered Mart/ })).toBeChecked()
    await user.type(screen.getByLabelText('Vendor owner email address'), 'new@shop.test')
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))
    expect(adminApi.inviteVendor).toHaveBeenCalledWith(42, 'new@shop.test')
  })

  it('shows the server message when the establishment is already linked', async () => {
    vi.mocked(adminApi.inviteVendor).mockRejectedValue({ response: { data: { status: 'STORE_ALREADY_LINKED', message: 'This establishment already has a linked vendor account. Unlink it before inviting someone else.' } } })
    const user = userEvent.setup()
    render(<UserManagementPanel />)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: /Vendor account/i }))
    await user.click(await screen.findByRole('radio', { name: /Unlinked Grocery/ }))
    await user.type(screen.getByLabelText('Vendor owner email address'), 'owner@shop.test')
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already has a linked vendor account')
  })

  it('lists pending invitations with resend and cancel', async () => {
    vi.mocked(adminApi.getVendorInvitations).mockResolvedValue([{
      id: 31, email: 'pending@shop.test', status: 'pending', expires_at: '2026-09-15T00:00:00Z', created_at: '2026-09-14T00:00:00Z',
      is_expired: false, store: { id: 9, store_name: 'Unlinked Grocery' }, inviter: { id: 1, name: 'Evaluator' },
    }])
    vi.mocked(adminApi.cancelVendorInvitation).mockResolvedValue({} as never)
    const user = userEvent.setup()
    render(<><UserManagementPanel /><AdminToastHost /></>)

    const section = await screen.findByRole('region', { name: 'Pending vendor invitations' })
    expect(within(section).getByText('pending@shop.test')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: 'Resend invitation to pending@shop.test' }))
    expect(adminApi.inviteVendor).toHaveBeenCalledWith(9, 'pending@shop.test')
    await user.click(await screen.findByRole('button', { name: 'Done' }))

    await user.click(within(await screen.findByRole('region', { name: 'Pending vendor invitations' })).getByRole('button', { name: 'Cancel invitation to pending@shop.test' }))
    expect(adminApi.cancelVendorInvitation).toHaveBeenCalledWith(31)
  })

  it('unlinks a vendor establishment after confirmation', async () => {
    vi.mocked(adminApi.unlinkStoreVendor).mockResolvedValue(store({ id: 4, store_name: 'Antique Market' }))
    const user = userEvent.setup()
    render(<><UserManagementPanel /><AdminToastHost /></>)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Actions for Maria Vendor' }))
    await user.click(screen.getByRole('button', { name: 'Unlink Antique Market' }))
    await user.click(screen.getByRole('button', { name: 'Confirm unlink' }))

    expect(adminApi.unlinkStoreVendor).toHaveBeenCalledWith(4)
    expect(await screen.findByText('Antique Market was unlinked.')).toBeInTheDocument()
  })

  it('opens the dedicated officer page', async () => {
    const user = userEvent.setup()
    render(<UserManagementPanel />)

    await screen.findByText('Maria Vendor')
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
    render(<><UserManagementPanel /><AdminToastHost /></>)

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
    expect(screen.getByText(/Admin-issued password/i)).toBeInTheDocument()
    expect(screen.queryByText(/temporary password/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/replaces this password/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Field Monitoring PWA address is not configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Field Monitoring PWA' })).not.toBeInTheDocument()
  })

  it('deactivates an account from its row actions', async () => {
    vi.mocked(adminApi.updateManagedUser).mockResolvedValue({ ...usersPage.records[0], is_active: false })
    const user = userEvent.setup()
    render(<><UserManagementPanel /><AdminToastHost /></>)

    await screen.findByText('Maria Vendor')
    await user.click(screen.getByRole('button', { name: 'Actions for Maria Vendor' }))
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    await user.click(screen.getByRole('button', { name: 'Confirm deactivation' }))

    expect(adminApi.updateManagedUser).toHaveBeenCalledWith(7, { is_active: false })
    const notice = await screen.findByText('Maria Vendor was deactivated.')
    expect(notice.closest('[data-sonner-toast]')).toBeInTheDocument()
    expect(screen.queryByText('Maria Vendor was deactivated.', { selector: '.admin-feedback' })).not.toBeInTheDocument()
  })

  it('shows a retryable error instead of an empty list when pending invitations fail to load', async () => {
    vi.mocked(adminApi.getVendorInvitations)
      .mockRejectedValueOnce({ response: { status: 500, data: {} } })
      .mockResolvedValue([{
        id: 31, email: 'pending@shop.test', status: 'pending', expires_at: '2026-09-16T00:00:00Z', created_at: '2026-09-15T00:00:00Z',
        is_expired: false, store: { id: 9, store_name: 'Unlinked Grocery' }, inviter: { id: 1, name: 'Evaluator' },
      }])
    const user = userEvent.setup()
    render(<UserManagementPanel />)

    expect(await screen.findByText('Pending vendor invitations could not load.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pending vendor invitations' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry invitations' }))

    const section = await screen.findByRole('region', { name: 'Pending vendor invitations' })
    expect(within(section).getByText('pending@shop.test')).toBeInTheDocument()
    expect(screen.queryByText('Pending vendor invitations could not load.')).not.toBeInTheDocument()
  })
})
