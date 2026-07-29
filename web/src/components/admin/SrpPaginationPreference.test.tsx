import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { SrpManagementPanel } from './SrpManagementPanel'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getSrp: vi.fn(),
    previewSrp: vi.fn(),
    importSrp: vi.fn(),
    previewSrpRevision: vi.fn(),
    createSrpRevision: vi.fn(),
  },
}))

describe('SRP rows per page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getSrp).mockResolvedValue({
      records: [],
      pagination: {
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
        from: null,
        to: null,
      },
      capabilities: {
        can_publish: true,
        status: 'AVAILABLE',
      },
    })
  })

  it('defaults to 20 and accepts an administrator-entered value from 1 to 100', async () => {
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    const rows = await screen.findByRole('spinbutton', { name: 'Rows per page' })
    expect(rows).toHaveValue(20)
    expect(adminApi.getSrp).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      per_page: 20,
    }))

    await user.click(rows)
    await user.keyboard('{Control>}a{/Control}37')

    await waitFor(() => expect(adminApi.getSrp).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, per_page: 37 }),
    ))
  })

  it('allows direct page jump using the editable page input', async () => {
    vi.mocked(adminApi.getSrp).mockResolvedValue({
      records: [],
      pagination: {
        current_page: 1,
        last_page: 5,
        per_page: 20,
        total: 100,
        from: 1,
        to: 20,
      },
      capabilities: {
        can_publish: true,
        status: 'AVAILABLE',
      },
    })

    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    const pageJump = await screen.findByRole('spinbutton', { name: 'Jump to page' })
    expect(pageJump).toHaveValue(1)

    await user.click(pageJump)
    await user.keyboard('{Control>}a{/Control}3{Enter}')

    await waitFor(() => expect(adminApi.getSrp).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 3 }),
    ))
  })
})
