import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EvidenceSectionNav, ReceiptExtractionPanel } from './ReceiptExtractionPanel'
import type { ReceiptEvidenceAssetRecord, ReceiptExtractionResult } from '../../types/admin'

const result: ReceiptExtractionResult = {
  status: 'ready',
  engine: { provider: 'gemini', model: 'gemini-3.8-flash', route: 'primary' },
  merchant: { status: 'matched', display_name: 'GAISANO GRAND MALL OF ANTIQUE', uncertain: false },
  transaction_date: null,
  receipt_number: null,
  evidence_assessment: { legibility: 'partially_readable', is_receipt: true, problems: ['glare'], total_region_visible: true },
  items: [
    { sequence: 0, item_name: 'POS HYDRATING GLOW', raw_text: '003644049 1 15.50 15.50T\nPOS HYDRATING GLOW', quantity: 1, unit_price: 15.5, line_total: 15.5, uncertain_fields: null, section: 1, possible_duplicate_of: null },
    { sequence: 1, item_name: 'POS HYDRATING GLOW', raw_text: '003644049 1 15.50 15.50T', quantity: 1, unit_price: null, line_total: 15.5, uncertain_fields: ['unit_price'], section: 2, possible_duplicate_of: 0 },
  ],
  item_flags: [[], { unit_price: 'unparseable' }],
  rejected_item_lines: ['VATable Sales 27.68'],
  subtotal: null,
  discounts: [{ description: 'PROMO', amount: '1.00', uncertain: true }],
  adjustments: [{ kind: 'rounding', direction: 'add', amount: '0.50', uncertain: false }],
  total: '31.00',
  total_uncertain: false,
  reconciliation: { status: 'mismatch', checks: { line_arithmetic: 'unavailable', items_vs_subtotal: 'unavailable', expected_vs_total: 'mismatch' }, items_sum: '15.50', duplicates_are_likely_genuine: true },
  warnings: [{ code: 'POSSIBLE_DUPLICATE_LINES', message: 'Some item lines may repeat across overlapping receipt sections.' }],
}

describe('ReceiptExtractionPanel', () => {
  it('shows every validated value read-only with uncertainty, duplicates, amounts, and reconciliation', () => {
    render(<ReceiptExtractionPanel result={result} />)

    const panel = screen.getByRole('region', { name: 'System extraction' })
    expect(within(panel).getByText('gemini-3.8-flash')).toBeInTheDocument()
    expect(within(panel).getByText('GAISANO GRAND MALL OF ANTIQUE')).toBeInTheDocument()
    expect(within(panel).getAllByText('Not available').length).toBeGreaterThanOrEqual(3)
    const duplicate = screen.getByRole('row', { name: 'Extracted item 2' })
    expect(within(duplicate).getByText('unit price uncertain (unparseable)')).toBeInTheDocument()
    expect(within(duplicate).getByText('possible duplicate of #1')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: 'Extracted item 1' })).getByText(/003644049 1 15\.50 15\.50T/)).toBeInTheDocument()
    expect(within(panel).getByText('1 line(s) not treated as items')).toBeInTheDocument()
    expect(within(panel).getByText(/−₱1\.00 \(PROMO\)/)).toBeInTheDocument()
    expect(within(panel).getByText('Rounding')).toBeInTheDocument()
    expect(within(panel).getByText('₱31.00')).toBeInTheDocument()
    const reconciliation = within(panel).getByLabelText('Reconciliation')
    expect(within(reconciliation).getByText('mismatch')).toBeInTheDocument()
    expect(within(reconciliation).getByText('Expected vs total: mismatch')).toBeInTheDocument()
    expect(within(reconciliation).getByText(/may be genuine repeat purchases/)).toBeInTheDocument()
    expect(within(panel).getByText('POSSIBLE_DUPLICATE_LINES')).toBeInTheDocument()
    expect(within(panel).getByText('glare')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders nothing for OCR results that are not structured extractions', () => {
    const { container } = render(<ReceiptExtractionPanel result={{ engine: { provider: 'tesseract' }, passes: {} }} />)
    expect(container).toBeEmptyDOMElement()
    const { container: empty } = render(<ReceiptExtractionPanel result={null} />)
    expect(empty).toBeEmptyDOMElement()
  })
})

describe('EvidenceSectionNav', () => {
  const asset = (id: number, sequence: number, attempt: number, isCurrent = true): ReceiptEvidenceAssetRecord => ({
    id, kind: 'source_frame', sequence, mime_type: 'image/jpeg', size_bytes: 10, sha256: 'hash', metadata: null, attempt_number: attempt, is_current: isCurrent,
  })
  const assets = [asset(1, 0, 1, false), asset(2, 0, 2), asset(3, 1, 2), asset(4, 2, 2)]

  it('moves between the sections of the attempt being viewed', async () => {
    const onSelect = vi.fn()
    render(<EvidenceSectionNav assets={assets} selected={assets[2]} onSelect={onSelect} />)

    expect(screen.getByText('Section 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('attempt 2 (current)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous section' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next section' }))
    expect(onSelect.mock.calls.map(([selected]) => selected.id)).toEqual([2, 4])
  })

  it('disables movement past the first and last section', () => {
    render(<EvidenceSectionNav assets={assets} selected={assets[0]} onSelect={vi.fn()} />)

    expect(screen.getByText('Section 1 of 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous section' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next section' })).toBeDisabled()
  })
})
