// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DtiMonitoringSheet } from './DtiMonitoringSheet'
import type { Bulletin, StoreRecord, VisitDraft } from '../types'

const mockStore: StoreRecord = {
  id: 1,
  store_name: 'Gaisano Grand Antique',
  address: 'San Jose de Buenavista, Antique',
  latitude: 10.74,
  longitude: 121.98,
  is_active: true,
}

const mockBulletins: Bulletin[] = [
  {
    id: 1,
    commodity_name: 'ABSOLUTE PURE Distilled Drinking Water (350ml)',
    category: 'Bottled Water- Distilled Water',
    unit: '350ml',
    baseline_price: 12.0,
    source_reference: 'DTI SRP Bulletin 2026-08',
    effective_date: '2026-08-01',
    regulatory_classification: 'BASIC_NECESSITY',
  },
  {
    id: 2,
    commodity_name: 'WILKINS Distilled (500mL)',
    category: 'Bottled Water- Distilled Water',
    unit: '500mL',
    baseline_price: 17.0,
    source_reference: 'DTI SRP Bulletin 2026-08',
    effective_date: '2026-08-01',
    regulatory_classification: 'BASIC_NECESSITY',
  },
  {
    id: 3,
    commodity_name: 'Argentina Corned Beef (150g)',
    category: 'Canned Meat',
    unit: '150g',
    baseline_price: 42.0,
    source_reference: 'DTI SRP Bulletin 2026-08',
    effective_date: '2026-08-01',
    regulatory_classification: 'PRIME_COMMODITY',
  },
]

const mockDraft: VisitDraft = {
  client_uuid: 'draft-1',
  store_id: 1,
  offline_lease_id: 'lease-1',
  started_at: '2026-08-30T00:00:00Z',
  items: [
    { srp_id: 1, recorded_price: 12.0 }, // Compliant: 12 <= 12 * 1.1
    { srp_id: 2, recorded_price: 20.0 }, // Anomaly: 20 > 17 * 1.1 (18.70)
  ],
  representative: { name: '', title: '' },
  signatures: { officer_png_base64: '', representative_png_base64: '' },
  location: null,
  sync_source: 'offline_queue',
  client_version: '1.0.0',
}

describe('DtiMonitoringSheet (FM-PSM-02 Digital Form)', () => {
  afterEach(cleanup)

  it('renders store identity strip with live stats and 5-column table structure', () => {
    const updatePrice = vi.fn()
    const onPrev = vi.fn()
    const onProceed = vi.fn()
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={mockDraft}
        bulletins={mockBulletins}
        onUpdatePrice={updatePrice}
        onPrevious={onPrev}
        onProceedToReview={onProceed}
      />
    )

    // Store Header with Restored Live Stats
    expect(screen.getByText('Gaisano Grand Antique')).toBeInTheDocument()
    expect(screen.getByText('DTI Verified')).toBeInTheDocument()
    expect(screen.getByText(/prices recorded/i)).toHaveTextContent('2 prices recorded')
    expect(screen.getByText(/Enter prices only for commodities checked in this store/i)).toBeInTheDocument()
    expect(screen.getByText(/1 for review/i)).toBeInTheDocument()

    // 4 Review Filter Pills in Row 2
    expect(screen.getByRole('tab', { name: /All \(3\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Recorded \(2\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Within reference \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /For review \(1\)/i })).toBeInTheDocument()

    // 5 Columns
    expect(screen.getByText('BASIC NECESSITIES AND PRIME COMMODITIES')).toBeInTheDocument()
    expect(screen.getByText('UNIT')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE REFERENCE')).toBeInTheDocument()
    expect(screen.getByText('MONITORED PRICE')).toBeInTheDocument()
    expect(screen.getByText('VARIANCE')).toBeInTheDocument()

    // Category dropdown
    expect(screen.getByRole('combobox', { name: /Filter by commodity category/i })).toBeInTheDocument()

    // Banners
    expect(screen.getByText('BASIC NECESSITIES')).toBeInTheDocument()
    expect(screen.getByText('PRIME COMMODITIES')).toBeInTheDocument()
    expect(screen.getAllByText(/Bottled Water- Distilled Water/i).length).toBeGreaterThan(0)

    // Items
    expect(screen.getByText('ABSOLUTE PURE Distilled Drinking Water (350ml)')).toBeInTheDocument()
    expect(screen.getByText('₱12.00')).toBeInTheDocument()
    expect(screen.getByText('WILKINS Distilled (500mL)')).toBeInTheDocument()
    expect(screen.getByText('₱17.00')).toBeInTheDocument()

    // Dedicated Compact Variance Badges
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    expect(screen.getByText('+17.6%')).toBeInTheDocument()

    // Bottom Action Buttons
    expect(screen.getByText('Back to Choose Store')).toBeInTheDocument()
    expect(screen.getByText('Review visit evidence')).toBeInTheDocument()
  })

  it('shows a listed SRP while keeping comparison unavailable when its source is missing', () => {
    const bulletin = { ...mockBulletins[0], source_reference: null }
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={{ ...mockDraft, items: [{ srp_id: bulletin.id, recorded_price: 13 }] }}
        bulletins={[bulletin]}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByText('₱12.00')).toBeInTheDocument()
    expect(screen.getByText('Reference unavailable')).toBeInTheDocument()
  })

  it('filters items correctly using the 4 review filter pills', () => {
    const updatePrice = vi.fn()
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={mockDraft}
        bulletins={mockBulletins}
        onUpdatePrice={updatePrice}
      />
    )

    // Click 'Within reference' pill
    fireEvent.click(screen.getByRole('tab', { name: /Within reference/i }))
    expect(screen.getByText('ABSOLUTE PURE Distilled Drinking Water (350ml)')).toBeInTheDocument()
    expect(screen.queryByText('WILKINS Distilled (500mL)')).not.toBeInTheDocument()
    expect(screen.queryByText('Argentina Corned Beef (150g)')).not.toBeInTheDocument()

    // Click 'For review' pill
    fireEvent.click(screen.getByRole('tab', { name: /For review/i }))
    expect(screen.getByText('WILKINS Distilled (500mL)')).toBeInTheDocument()
    expect(screen.queryByText('ABSOLUTE PURE Distilled Drinking Water (350ml)')).not.toBeInTheDocument()
    expect(screen.queryByText('Argentina Corned Beef (150g)')).not.toBeInTheDocument()

    // Click 'Recorded' pill
    fireEvent.click(screen.getByRole('tab', { name: /Recorded/i }))
    expect(screen.getByText('ABSOLUTE PURE Distilled Drinking Water (350ml)')).toBeInTheDocument()
    expect(screen.getByText('WILKINS Distilled (500mL)')).toBeInTheDocument()
    expect(screen.queryByText('Argentina Corned Beef (150g)')).not.toBeInTheDocument()
  })

  it('triggers onPrevious when bottom previous button is clicked', () => {
    const updatePrice = vi.fn()
    const onPrev = vi.fn()
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={mockDraft}
        bulletins={mockBulletins}
        onUpdatePrice={updatePrice}
        onPrevious={onPrev}
      />
    )

    fireEvent.click(screen.getByText('Back to Choose Store'))
    expect(onPrev).toHaveBeenCalled()
  })

  it('allows direct price input and triggers onUpdatePrice', () => {
    const updatePrice = vi.fn()
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={mockDraft}
        bulletins={mockBulletins}
        onUpdatePrice={updatePrice}
      />
    )

    const input = screen.getByLabelText('Observed shelf price for Argentina Corned Beef (150g)')
    fireEvent.change(input, { target: { value: '44.50' } })

    expect(updatePrice).toHaveBeenCalledWith(3, 44.5)
  })

  it('filters items by search query', () => {
    const updatePrice = vi.fn()
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={mockDraft}
        bulletins={mockBulletins}
        onUpdatePrice={updatePrice}
      />
    )

    const searchInput = screen.getByPlaceholderText(/Search commodity or brand/i)
    fireEvent.change(searchInput, { target: { value: 'Wilkins' } })

    expect(screen.getByText('WILKINS Distilled (500mL)')).toBeInTheDocument()
    expect(screen.queryByText('Argentina Corned Beef (150g)')).not.toBeInTheDocument()
  })
})
