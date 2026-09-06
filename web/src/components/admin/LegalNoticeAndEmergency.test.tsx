import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { EmergencyToggle } from './EmergencyToggle'
import { LegalNoticeManager } from './LegalNoticeManager'
import { AdminToastHost } from './AdminToastHost'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    legalDraft: vi.fn(),
    getMonitoringRecord: vi.fn(),
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
    window.history.replaceState({}, '', '/?module=legal_actions')
  })

  it('prefills captured monitoring evidence and still requires an action choice', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', items_count: 1, anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' },
      store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose', dti_sec_number: 'SEC-2' },
      protocol_mode: 'standard', protocol_reference: null,
      items: [{ id: 1, srp_id: 3, recorded_price: 62, baseline_price: 999, reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 999 } }],
    })

    render(<LegalNoticeManager />)

    expect(await screen.findByText('Source monitoring record #14')).toBeInTheDocument()
    expect(screen.getByLabelText('Target Establishment')).toHaveValue('Antique Central Market')
    expect(screen.getByTitle('SRP Baseline Price')).toHaveValue(50)
    expect(screen.getByTitle('Recorded Shelf Price')).toHaveValue(62)
    expect(screen.getByText('SELECT A REGULATORY ACTION')).toBeInTheDocument()
  })

  it('renders the draft letterhead and switches between LOI and SCO', async () => {
    const user = userEvent.setup()
    render(<><LegalNoticeManager /><AdminToastHost /></>)

    expect(screen.getByText('Department of Trade and Industry')).toBeInTheDocument()
    expect(screen.getByText('SELECT A REGULATORY ACTION')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'LOI (Letter of Inquiry)' }))
    expect(screen.getByText('DRAFT NOTICE OF INQUIRY (LOI)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'SCO (Show Cause Order)' }))

    expect(screen.getByText('DRAFT SHOW CAUSE ORDER (SCO)')).toBeInTheDocument()
  })

  it('keeps official dispatch unavailable and sandboxes draft HTML', async () => {
    vi.mocked(adminApi.legalDraft).mockResolvedValue('<h1>DRAFT - NOT AN OFFICIAL NOTICE</h1>')
    const user = userEvent.setup()

    render(<><LegalNoticeManager /><AdminToastHost /></>)

    expect(screen.queryByRole('button', { name: /Authorize & Issue Legal Notice/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /dispatch authorization/i })).not.toBeInTheDocument()
    expect(screen.getByText(/No notice, deadline, notification, or vendor state change/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'LOI (Letter of Inquiry)' }))
    await user.click(screen.getByRole('button', { name: /Preview watermarked draft/i }))
    expect(await screen.findByTitle('Watermarked legal draft preview')).toHaveAttribute('sandbox', '')
    expect(adminApi.dispatchLegal).not.toHaveBeenCalled()
  })

  it('renders only API-backed emergency records and exposes no simulated SCO action', async () => {
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([{
      id: 7,
      location: 'San Jose, Antique',
      declaration_reference: 'PDRRMC-2026-07',
      starts_on: '2026-07-26',
      ends_on: null,
      status: 'active',
    }])

    render(<><EmergencyToggle /><AdminToastHost /></>)

    expect(await screen.findByText('State of Calamity Regulatory Command Bar')).toBeInTheDocument()
    expect(screen.getAllByText('PDRRMC-2026-07').length).toBeGreaterThan(0)
    expect(screen.getByText('Authoritative APC Ceiling & Price Freeze Lookup Table')).toBeInTheDocument()
    expect(screen.queryByText('rice-well-milled-1kg')).not.toBeInTheDocument()
    expect(screen.getByText(/No authoritative emergency price records are available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SCO.*Sweep/i })).not.toBeInTheDocument()
  })

  it('shows an unavailable state when emergency declarations cannot be loaded', async () => {
    vi.mocked(adminApi.getEmergencies).mockRejectedValue(new Error('offline'))

    render(<EmergencyToggle />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load emergency declarations/i)
    expect(screen.queryByText(/NORMAL MARKET PROTOCOL/i)).not.toBeInTheDocument()
  })

  it('keeps a failed declaration visible as an error and does not claim success', async () => {
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([])
    vi.mocked(adminApi.createEmergency).mockRejectedValue({ response: { data: { message: 'Audit storage unavailable.' } } })
    const user = userEvent.setup()

    render(<><EmergencyToggle /><AdminToastHost /></>)
    await screen.findByText('No emergency declarations recorded.')
    await user.type(screen.getByLabelText('Location'), 'Antique')
    await user.type(screen.getByLabelText('Declaration reference'), 'DECL-7')
    await user.type(screen.getByLabelText('Start date'), '2026-08-29')
    await user.click(screen.getByRole('checkbox', { name: /I confirm this declaration/i }))
    await user.click(screen.getByRole('button', { name: 'Record declaration' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Audit storage unavailable.')
    expect(screen.queryByText('Emergency declaration recorded.')).not.toBeInTheDocument()
    expect(adminApi.getEmergencies).toHaveBeenCalledTimes(1)
  })
})
