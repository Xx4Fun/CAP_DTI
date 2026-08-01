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

  it('renders 4 KPI metrics and quick action shortcuts in overview panel', async () => {
    render(<OverviewPanel />)
    expect(await screen.findByText('Commercial Establishments')).toBeInTheDocument()
    expect(screen.getByText('Formal Receipts Queue')).toBeInTheDocument()
    expect(screen.getByText('Price Volatility Alerts')).toBeInTheDocument()
    expect(screen.getByText('Market Protocol Status')).toBeInTheDocument()
    expect(screen.getByText('Quick Actions')).toBeInTheDocument()
    expect(screen.getByText('+ Add / Revise SRP Bulletin')).toBeInTheDocument()
    expect(screen.getByText('Review Formal Receipts')).toBeInTheDocument()
    expect(screen.getByText('GIS Establishment Map')).toBeInTheDocument()
    expect(screen.getByText('Emergency Protocol')).toBeInTheDocument()
  })
})
