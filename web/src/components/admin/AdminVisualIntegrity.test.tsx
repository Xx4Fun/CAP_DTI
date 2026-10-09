import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'
import { OverviewPanel } from './AdminPanels'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getOverview: vi.fn().mockResolvedValue({ stores: 12, pending_reports: 3, active_emergencies: 0 }),
    getEmergencySummaries: vi.fn().mockResolvedValue([]),
    getAuditEvents: vi.fn().mockResolvedValue([]),
    getLegalNotices: vi.fn(async ({ status }: { status?: string } = {}) => ({
      total: ({ draft: 2, issued: 5, response_received: 1 } as Record<string, number>)[status ?? ''] ?? 0,
      data: status === 'issued' ? [{
        id: 9, notice_type: 'LOI', status: 'issued', control_number: 'LOI-2026-0009', updated_at: '2026-10-08T02:00:00Z', issued_at: '2026-10-07T02:00:00Z',
        due_date_timestamp: '2026-10-12T02:00:00Z', store: { id: 4, store_name: 'Antique Trade Center', address: 'T. Fornier St' }, source_snapshot: { items: [{}, {}, {}] },
      }] : [],
    })),
    getMonitoringRecords: vi.fn().mockResolvedValue({ data: [{
      id: 31, finalized_at: '2026-10-09T03:00:00Z', protocol_mode: 'standard', items_count: 24, anomaly_count: 2, undecided_item_ids: [5, 6],
      officer: { id: 2, name: 'Maria Santos', email: 'maria@dti.test' }, store: { id: 7, store_name: 'Gaisano Grand', address: 'Bantayan Rd' },
    }] }),
  },
}))

describe('Admin visual integrity', () => {
  it('uses readable status and navigation labels without corrupted glyphs', async () => {
    render(
      <AdminShell
        user={{ id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' }}
      />,
    )

    expect(await screen.findByText('Normal Market Protocol')).toBeInTheDocument()
    expect(screen.getByTitle('Collapse Sidebar')).not.toHaveTextContent('â')
    expect(document.body).not.toHaveTextContent('ðŸ')
  })

  it('renders 4 KPI metrics and module preview cards in overview panel', async () => {
    render(<OverviewPanel />)
    expect(await screen.findByText('REGISTERED STORES')).toBeInTheDocument()
    expect(screen.getByText('REPORTS AWAITING DECISION')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE SRP BULLETINS')).toBeInTheDocument()
    // The fourth card totals the open notices across draft, issued and answered.
    await waitFor(() => expect(screen.getByText('ACTIVE LEGAL ACTIONS').closest('article')).toHaveTextContent('8'))
    expect(screen.queryByText('EMERGENCY DECLARATIONS')).not.toBeInTheDocument()
    expect(screen.getByText('Consumer Reports')).toBeInTheDocument()
    expect(screen.getByText('Store Registry')).toBeInTheDocument()
    expect(screen.getByText('Field Monitoring')).toBeInTheDocument()
    expect(screen.getByText('Active Legal Actions')).toBeInTheDocument()
    expect(screen.queryByText('Monitoring Activity')).not.toBeInTheDocument()
  })

  it('lists the latest monitoring visits and open notices with their details', async () => {
    render(<OverviewPanel />)
    const visit = (await screen.findByText('Gaisano Grand')).closest('tr')!
    expect(visit).toHaveTextContent('Bantayan Rd')
    expect(visit).toHaveTextContent('Maria Santos')
    expect(visit).toHaveTextContent('24')
    expect(visit).toHaveTextContent('2 flagged')
    expect(screen.queryByRole('columnheader', { name: 'Review' })).not.toBeInTheDocument()

    const notice = (await screen.findByRole('button', { name: 'LOI LOI-2026-0009' })).closest('tr')!
    expect(notice).toHaveTextContent('Antique Trade Center')
    expect(notice).toHaveTextContent('T. Fornier St')
    expect(notice).toHaveTextContent('3')
    expect(notice).toHaveTextContent('Awaiting response')
    expect(screen.queryByText(/Drafts to finish|Responses to review/)).not.toBeInTheDocument()
  })

})
