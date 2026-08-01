import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'
import { OverviewPanel } from './AdminPanels'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getOverview: vi.fn().mockResolvedValue({ stores: 12, pending_reports: 3, active_emergencies: 0 }),
    getEmergencies: vi.fn().mockResolvedValue([]),
    getAuditEvents: vi.fn().mockResolvedValue([]),
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
    expect(screen.getByText('EMERGENCY DECLARATIONS')).toBeInTheDocument()
    expect(screen.getByText('Receipt review status')).toBeInTheDocument()
    expect(screen.getByText('Store registry status')).toBeInTheDocument()
    expect(screen.getByText('Monitoring Activity')).toBeInTheDocument()
    expect(screen.getByText('Active Legal Actions')).toBeInTheDocument()
  })
})
