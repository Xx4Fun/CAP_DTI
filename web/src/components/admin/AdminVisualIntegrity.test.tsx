import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getOverview: vi.fn().mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 0 }),
    getEmergencies: vi.fn().mockResolvedValue([]),
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
})
