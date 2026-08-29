import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { SrpManagementPanel } from './AdminPanels'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getSrp: vi.fn(),
    createSrpItem: vi.fn(),
    updateSrpMetadata: vi.fn(),
    batchUpdateSrpPrices: vi.fn(),
    uploadCommodityImage: vi.fn(),
  },
}))

const page = {
  records: [{
    id: 7,
    commodity_name: 'Premium Rice',
    category: 'Rice',
    unit: '1kg',
    regulatory_classification: 'BASIC_NECESSITY',
    commodity_key: 'premium-rice-1kg',
    baseline_price: 48,
    effective_date: '2026-05-11',
    source_reference: 'DTI-SRP-2026-05',
    is_active: true,
  }],
  pagination: {
    current_page: 1,
    last_page: 2,
    per_page: 20,
    total: 26,
    from: 1,
    to: 20,
  },
  capabilities: {
    can_publish: true,
    status: 'AVAILABLE',
  },
}

describe('SRP management workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getSrp).mockResolvedValue(page)
  })

  it('shows the searchable paginated bulletin table before opening modals', async () => {
    render(<SrpManagementPanel />)

    expect(await screen.findByRole('table', { name: 'SRP bulletin records' })).toBeInTheDocument()
    expect(await screen.findByText('Premium Rice')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search SRP bulletins' })).toBeInTheDocument()
    expect(screen.getByText(/entries/i)).toBeInTheDocument()
    expect(adminApi.getSrp).toHaveBeenCalledWith(expect.objectContaining({
      view: 'current',
      page: 1,
      per_page: 10,
    }))
  })

  it('opens the manual item creation modal when clicking Add SRP Item', async () => {
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    await screen.findByText('Premium Rice')
    await user.click(screen.getByRole('button', { name: 'Add SRP Item' }))

    expect(screen.getByRole('dialog', { name: 'Add SRP bulletin item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Commodity Name')).toBeInTheDocument()
    expect(screen.getByLabelText('SRP Baseline (₱)')).toBeInTheDocument()
    expect(screen.getByLabelText('Authoritative Source Reference')).toBeInTheDocument()
  })

  it('opens the edit metadata modal and updates item details', async () => {
    vi.mocked(adminApi.updateSrpMetadata).mockResolvedValue({
      ...page.records[0],
      commodity_name: 'Super Premium Rice',
    })
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    await screen.findByText('Premium Rice')
    await user.click(screen.getByRole('button', { name: 'Edit Premium Rice' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit commodity details' })
    expect(dialog).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Commodity Name'))
    await user.type(screen.getByLabelText('Commodity Name'), 'Super Premium Rice')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(adminApi.updateSrpMetadata).toHaveBeenCalledWith(7, expect.objectContaining({
      commodity_name: 'Super Premium Rice',
    }))
  })

  it('opens the 2-step batch update modal for price revisions', async () => {
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    await screen.findByText('Premium Rice')
    await user.click(screen.getByRole('button', { name: 'Update SRP Prices' }))

    expect(screen.getByRole('dialog', { name: 'Update SRP prices — Step 1: Bulletin Details' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Unified Effective Date'), '2026-08-01')
    await user.type(screen.getByLabelText('Authoritative Source Reference'), 'DTI-SRP-2026-08')
    await user.type(screen.getByLabelText('Change Reason / Bulletin Note'), 'Quarterly bulletin update')
    await user.click(screen.getByRole('button', { name: 'Next: Edit Prices →' }))

    expect(await screen.findByRole('dialog', { name: 'Update SRP prices — Step 2: Revise Prices' })).toBeInTheDocument()
  })
})
