import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreDetailOverlay } from './StoreDetailOverlay'
import { adminApi } from '../../services/adminApi'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getAnalyticsOptions: vi.fn(),
    getAnalytics: vi.fn(),
  },
}))

describe('StoreDetailOverlay regulatory integrity', () => {
  it('does not attach fabricated legal actions or consumer tips to a store', async () => {
    vi.mocked(adminApi.getAnalyticsOptions).mockResolvedValue({ commodities: [] } as any)
    vi.mocked(adminApi.getAnalytics).mockResolvedValue({ table_rows: [] } as any)
    const user = userEvent.setup()

    render(
      <StoreDetailOverlay
        store={{
          id: 9,
          store_name: 'Verified Market',
          address: 'San Jose, Antique',
          latitude: 10.74,
          longitude: 121.94,
          is_active: true,
          is_verified: true,
          is_public: true,
          recidivism_index: 1,
          image_path: '/stores/robinsons.webp',
        }}
        onClose={vi.fn()}
        onCenterMap={vi.fn()}
      />,
    )

    const hero = screen.getByRole('img', { name: /Verified Market establishment/i }) as HTMLImageElement
    expect(hero.getAttribute('src')).toBe('/stores/robinsons.webp')
    fireEvent.error(hero)
    expect(hero.getAttribute('src')).toBe('/stores/store.webp')
    expect(screen.queryByRole('button', { name: /Invite Vendor/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Legal Audit/i }))
    expect(screen.getByText(/No authoritative legal action records are available/i)).toBeInTheDocument()
    expect(screen.queryByText(/Letter of Inquiry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Show Cause Order/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Tips Log/i }))
    expect(screen.getByText(/No consumer report records are available/i)).toBeInTheDocument()
    expect(screen.queryByText(/Super Do/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Refined Sugar/i)).not.toBeInTheDocument()
  })
})
