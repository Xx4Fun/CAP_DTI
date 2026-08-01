import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { EmergencyToggle } from './EmergencyToggle'
import { LegalNoticeManager } from './LegalNoticeManager'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    legalDraft: vi.fn(),
    dispatchLegal: vi.fn(),
    getEmergencies: vi.fn(),
    createEmergency: vi.fn(),
    createEmergencyPrice: vi.fn(),
    updateEmergency: vi.fn(),
  },
}))

describe('Legal Notice Engine & Emergency Protocol Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders official DTI DOM letterhead previewer and toggles between LOI and SCO', async () => {
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    // Verify official DTI Antique letterhead components
    expect(screen.getByText('Department of Trade and Industry')).toBeInTheDocument()
    expect(screen.getByText('OFFICIAL NOTICE OF INQUIRY (LOI)')).toBeInTheDocument()
    expect(screen.getByText(/48-Hour Rebuttal Window/i)).toBeInTheDocument()

    // Toggle template to SCO
    const scoButton = screen.getByRole('button', { name: 'SCO (Show Cause Order)' })
    await user.click(scoButton)

    expect(screen.getByText('FORMAL SHOW CAUSE ORDER (SCO)')).toBeInTheDocument()
    expect(screen.getByText(/Mandatory Emergency Escalation Triggered/i)).toBeInTheDocument()
  })

  it('requires certification before authorizing legal notice dispatch', async () => {
    vi.mocked(adminApi.dispatchLegal).mockResolvedValue({} as any)
    const user = userEvent.setup()

    render(<LegalNoticeManager />)

    const dispatchBtn = screen.getByRole('button', { name: /Authorize & Issue Legal Notice/i })
    expect(dispatchBtn).toBeDisabled()

    const certifyCheckbox = screen.getByRole('checkbox', { name: /Certify evaluator review & dispatch authorization/i })
    await user.click(certifyCheckbox)

    expect(dispatchBtn).toBeEnabled()
    await user.click(dispatchBtn)

    expect(adminApi.dispatchLegal).toHaveBeenCalled()
    expect(await screen.findByText(/Notice LOI-2026-0801-042 successfully authorized/i)).toBeInTheDocument()
  })

  it('renders emergency command bar, date range indicators, APC lookup table, and SCO escalation triggers', async () => {
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([
      {
        id: 7,
        location: 'San Jose, Antique',
        declaration_reference: 'PDRRMC-2026-07',
        starts_on: '2026-07-26',
        ends_on: null,
        status: 'active',
      },
    ])
    const user = userEvent.setup()

    render(<EmergencyToggle />)

    // Verify Emergency Command Bar
    expect(await screen.findByText('State of Calamity Regulatory Command Bar')).toBeInTheDocument()
    expect(screen.getByText('CALAMITY PROTOCOL ACTIVE 🚨')).toBeInTheDocument()

    // Verify Active Freeze Date Range Indicators
    expect(screen.getAllByText('PDRRMC-2026-07').length).toBeGreaterThan(0)
    expect(screen.getByText(/ACTIVE \(Day/i)).toBeInTheDocument()

    // Verify APC Ceiling Lookup Table
    expect(screen.getByText('Authoritative APC Ceiling & Price Freeze Lookup Table')).toBeInTheDocument()
    expect(screen.getByText('rice-well-milled-1kg')).toBeInTheDocument()
    expect(screen.getByText('₱45.50')).toBeInTheDocument()

    // Filter APC Table
    const searchInput = screen.getByPlaceholderText('Filter commodity key...')
    await user.type(searchInput, 'sardines')
    expect(screen.getByText('canned-sardines-155g')).toBeInTheDocument()
    expect(screen.queryByText('rice-well-milled-1kg')).not.toBeInTheDocument()

    // Execute SCO Escalation Sweep
    const sweepBtn = screen.getByRole('button', { name: /Execute Automated SCO Escalation Sweep/i })
    await user.click(sweepBtn)
    expect(await screen.findByText(/Automated SCO Escalation Sweep executed/i)).toBeInTheDocument()
  })
})
