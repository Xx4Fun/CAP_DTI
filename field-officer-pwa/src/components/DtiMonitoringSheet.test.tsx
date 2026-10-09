// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DtiMonitoringSheet } from './DtiMonitoringSheet'
import type { Bulletin, MonitoringReference, StoreRecord, VisitDraft } from '../types'

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
    comparability_key: 'c1|350ml',
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
    comparability_key: 'c2|500ml',
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
    comparability_key: 'c3|150g',
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
    { srp_id: 1, recorded_price: 12.0 }, // Within reference: 12 is not above the ₱12.00 SRP
    { srp_id: 2, recorded_price: 20.0 }, // For review: 20 is above the ₱17.00 SRP
  ],
  representative: { name: '', title: '' },
  signatures: { officer_png_base64: '', representative_png_base64: '' },
  location: null,
  sync_source: 'offline_queue',
  client_version: '1.0.0',
}

describe('DtiMonitoringSheet (FM-PSM-02 Digital Form)', () => {
  afterEach(cleanup)

  it('renders store identity strip with live stats and 6-column table structure', () => {
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
    expect(screen.queryByText('DTI Verified')).not.toBeInTheDocument()
    expect(screen.getByText(/prices recorded/i)).toHaveTextContent('2 prices recorded')
    expect(screen.queryByText(/Enter prices only for commodities checked in this store/i)).not.toBeInTheDocument()
    expect(screen.getByText(/1 for review/i)).toBeInTheDocument()

    // 4 Review Filter Pills in Row 2
    expect(screen.getByRole('tab', { name: /All \(3\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Recorded \(2\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Within reference \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /For review \(1\)/i })).toBeInTheDocument()

    // 6 Columns, one per basis
    expect(screen.getByText('BASIC NECESSITIES AND PRIME COMMODITIES')).toBeInTheDocument()
    expect(screen.getByText('UNIT')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE REFERENCE')).toBeInTheDocument()
    expect(screen.getByText('MONITORED PRICE')).toBeInTheDocument()
    expect(screen.getByText('SRP DIFF')).toBeInTheDocument()
    expect(screen.getByText('PREVIOUS DIFF')).toBeInTheDocument()

    // Legend naming both bases
    expect(screen.getByRole('list', { name: /What each price status means/i })).toBeInTheDocument()
    expect(screen.getByText(/Above the SRP/i)).toBeInTheDocument()
    expect(screen.getByText(/more than 10% over this store's last record/i)).toBeInTheDocument()

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
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('compares against a listed provisional SRP when its source is missing', () => {
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
    expect(screen.getByText('+8.3%')).toBeInTheDocument()
    expect(screen.queryByText('Reference unavailable')).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByText('Previous'))
    expect(onPrev).toHaveBeenCalled()
  })

  it('falls back to draft store_name and address when store record is not directly found', () => {
    render(
      <DtiMonitoringSheet
        store={undefined}
        draft={{
          ...mockDraft,
          store_name: 'Antique Supermart Branch 2',
          store_address: 'Bantayan, San Jose de Buenavista',
        }}
        bulletins={mockBulletins}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByText('Antique Supermart Branch 2')).toBeInTheDocument()
    expect(screen.getByText(/Bantayan, San Jose de Buenavista/i)).toBeInTheDocument()
    expect(screen.queryByText('Selected Establishment')).not.toBeInTheDocument()
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

  it('submits the exact server-issued APC reference with a newly entered price', () => {
    const updatePrice = vi.fn()
    const reference: MonitoringReference = {
      srp_id: 3, commodity_key: null, covered_by_price_freeze: true,
      status: 'available', type: 'emergency_ceiling', source_id: 91, value: 45,
      label: 'Official APC / Price Freeze', source: 'DECL-7', effective_date: '2026-09-09', reference_version: 'refs-v2',
    }
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={{ ...mockDraft, items: [] }}
        bulletins={[mockBulletins[2]]}
        protocol={{ labels_are_provisional: true, standard_review_threshold_percent: 10, emergency_review_rule: 'recorded_price_above_ceiling', mode: 'emergency', declaration_reference: 'DECL-7', starts_on: '2026-09-09', ends_on: null }}
        monitoringReferences={[reference]}
        onUpdatePrice={updatePrice}
      />
    )

    fireEvent.change(screen.getByLabelText('Observed shelf price for Argentina Corned Beef (150g)'), { target: { value: '46' } })

    expect(screen.getByText(/45\.00/)).toBeInTheDocument()
    expect(updatePrice).toHaveBeenCalledWith(3, 46, {
      status: 'available', type: 'emergency_ceiling', source_id: 91, value: 45,
      label: 'Official APC / Price Freeze', source_reference: 'DECL-7', effective_date: '2026-09-09', reference_version: 'refs-v2',
    })
  })

  it('keeps a draft line compared with the reference originally pinned to it', () => {
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={{ ...mockDraft, items: [{ srp_id: 3, recorded_price: 44, reference_snapshot: { status: 'available', type: 'standard_srp', source_id: 3, value: 41, label: 'Current SRP', source_reference: 'SRP-2026', effective_date: '2026-08-01', reference_version: 'refs-v1' } }] }}
        bulletins={[mockBulletins[2]]}
        monitoringReferences={[{ srp_id: 3, commodity_key: null, covered_by_price_freeze: true, status: 'available', type: 'emergency_ceiling', source_id: 91, value: 45, label: 'Official APC / Price Freeze', source: 'DECL-7', effective_date: '2026-09-09', reference_version: 'refs-v2' }]}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByText(/41\.00/)).toBeInTheDocument()
    expect(screen.getByText('+7.3%')).toBeInTheDocument()
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

  it('renders centered empty state when search filter has no matching commodities and resets filters on click', () => {
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
    fireEvent.change(searchInput, { target: { value: 'NonExistentBrand123' } })

    expect(screen.getByText('No commodities found matching current filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.queryByText('No commodities found matching current filters')).not.toBeInTheDocument()
    expect(screen.getByText('Argentina Corned Beef (150g)')).toBeInTheDocument()
  })

  it('flags a price within the SRP that rose more than ten percent over the store previous record', () => {
    const draft: VisitDraft = {
      ...mockDraft,
      // ₱11.00 is below the ₱12.00 SRP, but ₱9.00 last visit makes it a 22.2% increase.
      items: [{ srp_id: 1, recorded_price: 11.0 }],
    }
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={draft}
        bulletins={mockBulletins}
        previousPrices={new Map([['c1|350ml', 9.0]])}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByText('-8.3%')).toBeInTheDocument() // within the SRP
    expect(screen.getByText('+22.2%')).toBeInTheDocument() // over the previous record
    expect(screen.getByText('from ₱9.00')).toBeInTheDocument() // the comparison value, not hidden in a tooltip
    expect(screen.getByRole('tab', { name: /For review \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Within reference \(0\)/i })).toBeInTheDocument()
  })

  it('shows no previous-price movement for a commodity the store has never had recorded', () => {
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={{ ...mockDraft, items: [{ srp_id: 1, recorded_price: 11.0 }] }}
        bulletins={[mockBulletins[0]]}
        previousPrices={new Map()}
        onUpdatePrice={vi.fn()}
      />
    )

    // Readable without hover, and 'comparable' is load-bearing: a record may exist on a different unit.
    const cell = screen.getByText('No comparable record').closest('.dti-previous-none')!
    expect(cell).toBeVisible()
    // Rendered on two lines, so textContent carries no separator between them.
    expect(cell).toHaveTextContent(/No comparable record\s*in the current or previous monitoring period/)
    expect(screen.getByRole('tab', { name: /For review \(0\)/i })).toBeInTheDocument()
  })
})

describe('DtiMonitoringSheet read-only', () => {
  afterEach(cleanup)

  it('locks recorded prices and labels the reference as captured', () => {
    const onUpdatePrice = vi.fn()
    const draft: VisitDraft = {
      client_uuid: 'view-1', store_id: 1, offline_lease_id: '', started_at: '2026-09-01T00:00:00Z',
      items: [{ srp_id: 1, recorded_price: 13, reference_snapshot: {
        status: 'available', type: 'standard_srp', source_id: 1, value: 12, label: 'SRP',
        source_reference: 'DTI SRP Bulletin 2026-08', effective_date: '2026-08-01', reference_version: '',
      } }],
      representative: { name: '', title: '' }, signatures: { officer_png_base64: '', representative_png_base64: '' },
      location: null, sync_source: 'offline_queue', client_version: '',
    }
    render(<DtiMonitoringSheet readOnly store={mockStore} draft={draft} bulletins={[mockBulletins[0]]} onUpdatePrice={onUpdatePrice} />)

    const input = screen.getByRole('spinbutton', { name: `Observed shelf price for ${mockBulletins[0].commodity_name}` })
    expect(input).toHaveAttribute('readonly')
    expect(input).toHaveValue(13)
    fireEvent.change(input, { target: { value: '20' } })
    expect(onUpdatePrice).not.toHaveBeenCalled()
    expect(screen.getByText('CAPTURED REFERENCE')).toBeInTheDocument()
    expect(screen.queryByText('ACTIVE REFERENCE')).not.toBeInTheDocument()
  })

  const capturedDraft = (recordedPrice: number): VisitDraft => ({
    ...mockDraft,
    items: [{ srp_id: 1, recorded_price: recordedPrice, reference_snapshot: {
      status: 'available', type: 'standard_srp', source_id: 1, value: 12, label: 'SRP',
      source_reference: 'DTI SRP Bulletin 2026-08', effective_date: '2026-08-01', reference_version: '',
    } }],
  })

  // A visit accepted before a rule changed must render as it was signed, not as today's rules would judge it.
  it('renders the captured classification instead of recomputing under current rules', () => {
    render(
      <DtiMonitoringSheet
        readOnly
        store={mockStore}
        draft={capturedDraft(11)}
        bulletins={[mockBulletins[0]]}
        capturedStatus={new Map([[1, {
          is_anomaly: false, variance_percent: -8.33, previous_price: 9,
          previous_price_variance_percent: null, is_previous_price_spike: false, finding_basis: null,
        }]])}
        onUpdatePrice={vi.fn()}
      />
    )

    // Today's rule would call 11 vs 9 a 22.2% spike; the visit recorded no such assessment.
    expect(screen.getByRole('tab', { name: /For review \(0\)/i })).toBeInTheDocument()
    expect(screen.getByTitle('Previous-price assessment was not captured')).toBeInTheDocument()
    expect(screen.getByText('was ₱9.00')).toBeInTheDocument()
  })

  it('styles a captured spike-only row as a previous-record finding, not an above-reference one', () => {
    render(
      <DtiMonitoringSheet
        readOnly
        store={mockStore}
        draft={capturedDraft(11)}
        bulletins={[mockBulletins[0]]}
        capturedStatus={new Map([[1, {
          is_anomaly: true, variance_percent: -8.33, previous_price: 9,
          previous_price_variance_percent: 22.22, is_previous_price_spike: true,
          finding_basis: 'previous_price_spike',
        }]])}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByRole('tab', { name: /For review \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText('+22.2%')).toBeInTheDocument()
    // The SRP pill must not claim a breach: the price was under its reference.
    expect(screen.getByText('-8.3%')).toHaveClass('pill-discount')
    expect(screen.getByText('+22.2%')).toHaveClass('pill-spike')
  })

  it('treats a captured flag with no recorded basis as an above-reference finding', () => {
    render(
      <DtiMonitoringSheet
        readOnly
        store={mockStore}
        draft={capturedDraft(15)}
        bulletins={[mockBulletins[0]]}
        // What the seeders and pre-2026-10-09 visits produce: flagged, with no finding_basis.
        capturedStatus={new Map([[1, {
          is_anomaly: true, variance_percent: 25, previous_price: null,
          previous_price_variance_percent: null, is_previous_price_spike: false, finding_basis: null,
        }]])}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByRole('tab', { name: /For review \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText('+25.0%')).toHaveClass('pill-anomaly')
  })

  it('renders a captured previous variance with no captured price without throwing', () => {
    render(
      <DtiMonitoringSheet
        readOnly
        store={mockStore}
        draft={capturedDraft(11)}
        bulletins={[mockBulletins[0]]}
        capturedStatus={new Map([[1, {
          is_anomaly: true, variance_percent: -8.33, previous_price: null,
          previous_price_variance_percent: 22.22, is_previous_price_spike: true,
          finding_basis: 'previous_price_spike',
        }]])}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByText('+22.2%')).toBeInTheDocument()
    expect(screen.queryByText(/from ₱/)).not.toBeInTheDocument()
  })

  it('claims no comparator for a bulletin the server did not key, rather than guessing one', () => {
    // A payload cached before the server emitted comparability_key. Guessing a key here is what reproduced the
    // reported +81.2%: the cached observation was chosen under the old, unbounded window.
    const unkeyed = { ...mockBulletins[0], comparability_key: undefined }
    render(
      <DtiMonitoringSheet
        store={mockStore}
        draft={{ ...mockDraft, items: [{ srp_id: 1, recorded_price: 11.0 }] }}
        bulletins={[unkeyed]}
        previousPrices={new Map([['id:1', 9.0], ['c1|350ml', 9.0]])}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.queryByText('+22.2%')).not.toBeInTheDocument()
    expect(screen.getByText('No comparable record')).toBeVisible()
    expect(screen.getByRole('tab', { name: /For review \(0\)/i })).toBeInTheDocument()
  })

  it('names the captured price ceiling when the visit ran under an emergency protocol', () => {
    render(
      <DtiMonitoringSheet
        readOnly
        store={mockStore}
        draft={capturedDraft(11)}
        bulletins={[mockBulletins[0]]}
        protocol={{
          labels_are_provisional: true, standard_review_rule: 'recorded_price_above_srp',
          emergency_review_rule: 'recorded_price_above_ceiling', previous_price_review_threshold_percent: 10,
          mode: 'emergency', declaration_reference: 'PF-2026-01', starts_on: null, ends_on: null,
        }}
        onUpdatePrice={vi.fn()}
      />
    )

    expect(screen.getByText('CEILING DIFF')).toBeInTheDocument()
    expect(screen.queryByText('SRP DIFF')).not.toBeInTheDocument()
  })
})
