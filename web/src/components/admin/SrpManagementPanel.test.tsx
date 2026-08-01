import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { SrpManagementPanel } from './AdminPanels'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getSrp: vi.fn(),
    previewSrp: vi.fn(),
    importSrp: vi.fn(),
    previewSrpRevision: vi.fn(),
    createSrpRevision: vi.fn(),
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

  it('shows the searchable paginated bulletin table before the import workflow', async () => {
    render(<SrpManagementPanel />)

    expect(await screen.findByRole('table', { name: 'SRP bulletin records' })).toBeInTheDocument()
    expect(screen.getByText('Premium Rice')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search SRP bulletins' })).toBeInTheDocument()
    expect(screen.getByText(/entries/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'SRP JSON' })).not.toBeInTheDocument()
    expect(adminApi.getSrp).toHaveBeenCalledWith(expect.objectContaining({
      view: 'current',
      page: 1,
      per_page: 10,
    }))
  })

  it('opens the existing JSON preview workflow in an accessible modal', async () => {
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    await screen.findByText('Premium Rice')
    await user.click(screen.getByRole('button', { name: 'Add SRP bulletin' }))

    expect(screen.getByRole('dialog', { name: 'Add SRP bulletin' })).toBeInTheDocument()
    expect(screen.getByLabelText('Upload SRP JSON')).toBeInTheDocument()
    expect(screen.getByLabelText('Authoritative source reference')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'SRP JSON' })).toBeInTheDocument()
  })

  it('requests the next server page and previews an append-only revision', async () => {
    vi.mocked(adminApi.previewSrpRevision).mockResolvedValue({
      original: page.records[0],
      proposed: { ...page.records[0], baseline_price: 50, effective_date: '2026-08-01' },
      changed_fields: ['baseline_price', 'effective_date', 'source_reference'],
      becomes_public_on: '2026-08-01',
      historical_resolution_preserved: true,
    })
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    await screen.findByText('Premium Rice')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(adminApi.getSrp).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ))

    await user.click(screen.getByRole('button', { name: /Revise Premium Rice/i }))
    const dialog = screen.getByRole('dialog', { name: 'Create SRP revision' })
    expect(dialog).toBeInTheDocument()

    await user.clear(screen.getByRole('spinbutton', { name: 'Revised SRP' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Revised SRP' }), '50')
    await user.type(screen.getByLabelText('Effective date'), '2026-08-01')
    await user.clear(screen.getByLabelText('Authoritative source reference'))
    await user.type(screen.getByLabelText('Authoritative source reference'), 'DTI-SRP-2026-08')
    await user.type(screen.getByLabelText('Change reason'), 'Approved August bulletin.')
    await user.click(screen.getByRole('button', { name: 'Preview revision' }))

    expect(await screen.findByText(/Customer PWA update scheduled for 2026-08-01/i)).toBeInTheDocument()
    expect(adminApi.previewSrpRevision).toHaveBeenCalledWith(7, expect.objectContaining({
      baseline_price: 50,
      effective_date: '2026-08-01',
    }))
  })
})
