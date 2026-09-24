import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CitizenTipReview } from './CitizenTipReview'
import { adminApi } from '../../services/adminApi'

const requestFieldVerification = vi.hoisted(() => vi.fn())
const cancelFieldVerification = vi.hoisted(() => vi.fn())
const reopenFieldVerification = vi.hoisted(() => vi.fn())

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getReports: vi.fn(),
    decideReport: vi.fn(),
    requestFieldVerification,
    getManagedUsers: vi.fn(),
    cancelFieldVerification,
    reopenFieldVerification,
    getReportEvidence: vi.fn(),
    getReportEvidenceManifest: vi.fn(),
    getReportEvidenceAsset: vi.fn(),
  },
}))

describe('CitizenTipReview - Formal Receipt OCR Review Queue Workspace', () => {
  const mockReports = [
    {
      id: 101,
      report_reference: 'RPT-2026-001',
      status: 'pending',
      store_name: 'San Jose Grand Market',
      submitted_at: '2026-08-01T10:00:00Z',
      raw_ocr_json: {
        items: [{ name: 'Super Extra Rice 1kg', price: '65.00', srp: '52.00' }],
        total: '65.00',
      },
      evaluator_confirmed_json: null,
      evidence_available: true,
    },
    {
      id: 102,
      report_reference: 'RPT-2026-002',
      status: 'validated',
      store_name: 'Buenavista Grocery',
      submitted_at: '2026-08-01T11:00:00Z',
      raw_ocr_json: { product: 'Cooking Oil 500ml', price: '75.00' },
      evaluator_confirmed_json: { product: 'Cooking Oil 500ml', receipt_price: 75.0, regulatory_finding: 'confirmed_violation' },
      evidence_available: false,
    },
    {
      id: 103,
      report_reference: 'RPT-2026-003',
      status: 'dismissed',
      store_name: 'Antique Mart',
      submitted_at: '2026-08-01T12:00:00Z',
      raw_ocr_json: { product: 'Sugar 1kg', price: '50.00' },
      evaluator_confirmed_json: null,
      evidence_available: false,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getReports).mockResolvedValue(mockReports)
    vi.mocked(adminApi.getManagedUsers).mockResolvedValue({ records: [{ id: 9, name: 'Ben Officer', email: 'ben@dti.test', role: 'field_officer', is_active: true, created_at: '2026-01-01', stores: [] }], pagination: { current_page: 1, last_page: 1, per_page: 50, total: 1, from: 1, to: 1 }, counts: { total: 1, field_officer: 1, vendor: 0, inactive: 0 } })
    vi.mocked(adminApi.getReportEvidence).mockResolvedValue(new Blob(['fake-image-bytes'], { type: 'image/jpeg' }))
    vi.mocked(adminApi.decideReport).mockResolvedValue({
      ...mockReports[0],
      status: 'validated',
      evaluator_confirmed_json: { regulatory_finding: 'confirmed_violation' },
    })

    // Mock URL object methods for vitest environment
    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-blob')
    }
    if (!globalThis.URL.revokeObjectURL) {
      globalThis.URL.revokeObjectURL = vi.fn()
    }
  })

  it('renders status filter pills and filters consumer reports queue', async () => {
    render(<CitizenTipReview />)

    // Verify workspace title and status filter pills
    expect(await screen.findByRole('heading', { name: /Formal Receipt OCR Review Queue/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reports on this page/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pending Review \(/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Field Verification \/ Validated \/ LOI Issued \(/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Closed \/ Dismissed \(/i })).toBeInTheDocument()

    // Default renders all reports in left list
    expect(screen.getByText('RPT-2026-001')).toBeInTheDocument()
    expect(screen.getByText('RPT-2026-002')).toBeInTheDocument()
    expect(screen.getByText('RPT-2026-003')).toBeInTheDocument()

    // Filter by Pending Review
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Pending Review \(/i }))
    expect(screen.getByText('RPT-2026-001')).toBeInTheDocument()
    expect(screen.queryByText('RPT-2026-002')).not.toBeInTheDocument()
    expect(screen.queryByText('RPT-2026-003')).not.toBeInTheDocument()

    // Filter by Validated / LOI Issued
    await user.click(screen.getByRole('button', { name: /Field Verification \/ Validated \/ LOI Issued \(/i }))
    expect(screen.queryByText('RPT-2026-001')).not.toBeInTheDocument()
    expect(screen.getByText('RPT-2026-002')).toBeInTheDocument()
  })

  it('renders dual-column inspection workspace with image controls for evidence', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    // Select RPT-2026-001
    await user.click(await screen.findByText('RPT-2026-001'))

    // Left column vaulted evidence & image control buttons
    expect(screen.getByRole('heading', { name: 'Original captured receipt evidence' })).toBeInTheDocument()
    const zoomInBtn = screen.getByRole('button', { name: /Zoom In/i })
    const zoomOutBtn = screen.getByRole('button', { name: /Zoom Out/i })
    const rotateBtn = screen.getByRole('button', { name: /Rotate/i })
    const resetBtn = screen.getByRole('button', { name: /Reset/i })
    const fullSizeBtn = screen.getByRole('button', { name: /Full Size/i })

    expect(zoomInBtn).toBeInTheDocument()
    expect(zoomOutBtn).toBeInTheDocument()
    expect(rotateBtn).toBeInTheDocument()
    expect(resetBtn).toBeInTheDocument()
    expect(fullSizeBtn).toBeInTheDocument()

    // Test clicking image controls without error
    await user.click(zoomInBtn)
    await user.click(rotateBtn)
    await user.click(resetBtn)

    // Right column OCR breakdown & action buttons
    expect(screen.getByText(/Formal receipt \| Consumer report/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Raw OCR and system-extracted information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DTI evaluator findings and decision' })).toBeInTheDocument()
    expect(screen.getAllByText(/Super Extra Rice 1kg/i).length).toBeGreaterThan(0)
    expect(screen.getByText('OCR FLAG — REVIEW')).toBeInTheDocument()

    // DTI Evaluator Single-Click Action Buttons
    expect(screen.getByRole('button', { name: /Validate findings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dismiss Report/i })).toBeInTheDocument()
  })

  it('shows an honest missing-evidence state without fabricating a receipt', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    await user.click(await screen.findByText('RPT-2026-002'))
    expect(screen.getByText('Receipt evidence unavailable')).toBeInTheDocument()
    expect(screen.queryByText('[Receipt Image Recorded]')).not.toBeInTheDocument()
    expect(screen.queryByText('OFFICIAL DTI RECORD')).not.toBeInTheDocument()
    expect(screen.queryByText('Gaisano Grand Antique')).not.toBeInTheDocument()
    expect(screen.queryByText('₱28.00')).not.toBeInTheDocument()
    expect(screen.queryByText('₱25.00')).not.toBeInTheDocument()
  })

  it('submits single-click DTI Evaluator action decision', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    await user.click(await screen.findByText('RPT-2026-001'))

    // Fill finding and reason
    await user.selectOptions(screen.getByRole('combobox', { name: /Regulatory finding/i }), 'confirmed_violation')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Overpriced shelf item detected.')

    // Click single-click Validate & Issue LOI
    await user.click(screen.getByRole('button', { name: /Validate findings/i }))

    expect(adminApi.decideReport).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        action: 'validate',
        reason: 'Overpriced shelf item detected.',
        corrected: expect.objectContaining({ regulatory_finding: 'confirmed_violation' }),
      }),
    )
  })

  it('refers a report for field verification without deciding a violation', async () => {
    requestFieldVerification.mockResolvedValue({
      id: 301,
      status: 'claimed',
      reason: 'Verify the shelf price in person.',
      store_id: 22,
      claimed_by: 9,
      requested_at: '2026-08-02T10:00:00Z',
      claimed_at: null,
      completed_at: null,
      cancelled_at: null,
    })
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    await user.click(await screen.findByText('RPT-2026-001'))
    await user.click(screen.getByRole('button', { name: /Require Field Verification/i }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Field Officer' }), '9')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Verify the shelf price in person.')
    await user.click(screen.getByRole('button', { name: /Mark for Field Verification/i }))

    expect(requestFieldVerification).toHaveBeenCalledWith(101, { reason: 'Verify the shelf price in person.', field_officer_id: 9 })
    expect(adminApi.decideReport).not.toHaveBeenCalled()
    expect(await screen.findByText('Referred for field verification')).toBeInTheDocument()
    expect(screen.getByText('Verify the shelf price in person.')).toBeInTheDocument()
  })

  it('shows the existing request and cancels it instead of offering a duplicate', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      status: 'Referred for field verification',
      verification_request: {
        id: 301,
        status: 'open',
        reason: 'Verify the shelf price in person.',
        store_id: 22,
        claimed_by: null,
        requested_at: '2026-08-02T10:00:00Z',
        claimed_at: null,
        completed_at: null,
        cancelled_at: null,
      },
    }])
    cancelFieldVerification.mockResolvedValue({
      id: 301,
      status: 'cancelled',
      reason: 'Verify the shelf price in person.',
      store_id: 22,
      claimed_by: null,
      requested_at: '2026-08-02T10:00:00Z',
      claimed_at: null,
      completed_at: null,
      cancelled_at: '2026-08-02T11:00:00Z',
    })
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    await user.click(await screen.findByText('RPT-2026-001'))
    expect(screen.getByText('Field verification request')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Verify the shelf price in person.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Require Field Verification$/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Cancel field verification/i }))

    expect(cancelFieldVerification).toHaveBeenCalledWith(301)
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  })

  it('shows original guided images before legacy derivatives and submits one decision per receipt item', async () => {
    const receiptReport = {
      ...mockReports[0],
      evidence_summary: {
        capture_mode: 'continuous_video_v1',
        processing_status: 'confirmed',
        asset_count: 2,
        continuity: 'ready',
        merchant: 'matched',
      },
      items: [
        {
          id: 501,
          sequence: 0,
          item_name: 'Rice',
          observed_price: '55.00',
          commodity_key: 'rice-1kg',
          commodity_name: 'Rice',
          consumer_confirmed: true,
        },
        {
          id: 502,
          sequence: 1,
          item_name: 'Sugar',
          observed_price: '80.00',
          commodity_key: 'sugar-1kg',
          commodity_name: 'Sugar',
          consumer_confirmed: true,
        },
      ],
    }
    vi.mocked(adminApi.getReports).mockResolvedValue([receiptReport])
    vi.mocked(adminApi.getReportEvidenceManifest).mockResolvedValue({
      capture_mode: 'continuous_video_v1',
      processing_status: 'confirmed',
      continuity: { status: 'ready' },
      merchant: { status: 'matched' },
      processing_result: {
        selection: { selected_pass: 'primary' },
        passes: { primary: { raw_text: 'PRIMARY SAVED PASS' }, alternate: { raw_text: 'ALTERNATE SAVED PASS' } },
      },
      assets: [
        { id: 701, kind: 'original_video', sequence: 0, mime_type: 'video/webm', size_bytes: 1000, sha256: 'video-hash', metadata: null },
        { id: 702, kind: 'stitched_preview', sequence: 0, mime_type: 'image/jpeg', size_bytes: 500, sha256: 'preview-hash', metadata: null },
        { id: 703, kind: 'source_frame', sequence: 0, mime_type: 'image/jpeg', size_bytes: 800, sha256: 'source-hash', metadata: null },
      ],
    })
    vi.mocked(adminApi.getReportEvidenceAsset).mockResolvedValue(new Blob(['preview'], { type: 'image/jpeg' }))
    vi.mocked(adminApi.decideReport).mockResolvedValue({ ...receiptReport, status: 'Under regulatory review' })

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(await screen.findByRole('button', { name: /Stitched preview/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /source frame/i })).toBeInTheDocument()
    expect(adminApi.getReportEvidenceAsset).toHaveBeenCalledWith(101, 703)
    expect(screen.getByText(/Continuity: ready/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'OCR processing diagnostics' })).toBeInTheDocument()
    expect(screen.getByText(/PRIMARY SAVED PASS/)).toBeInTheDocument()
    expect(screen.getByText(/ALTERNATE SAVED PASS/)).toBeInTheDocument()

    const findings = screen.getAllByRole('combobox', { name: /Finding for/i })
    await user.selectOptions(findings[0], 'confirmed_violation')
    await user.selectOptions(findings[1], 'no_violation')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Reviewed each confirmed receipt line.')
    await user.click(screen.getByRole('button', { name: /Validate findings/i }))

    expect(adminApi.decideReport).toHaveBeenCalledWith(101, {
      action: 'validate',
      reason: 'Reviewed each confirmed receipt line.',
      item_decisions: [
        expect.objectContaining({ item_id: 501, commodity_key: 'rice-1kg', regulatory_finding: 'confirmed_violation' }),
        expect.objectContaining({ item_id: 502, commodity_key: 'sugar-1kg', regulatory_finding: 'no_violation' }),
      ],
    })
  })

  it('requires a per-unit price for multi-unit lines and never shows unverified statuses as verified', async () => {
    const receiptReport = {
      ...mockReports[0],
      evidence_summary: { capture_mode: 'guided_photos_v1', processing_status: 'ready', asset_count: 1, continuity: null, merchant: null },
      items: [
        { id: 601, sequence: 0, item_name: 'SARDINES 155G', quantity: '2', observed_price: '110.00', line_total: '110.00', unit_price: null, commodity_key: 'sardines', commodity_name: 'Sardines' },
        { id: 602, sequence: 1, item_name: 'COBRA 350ML', quantity: '3', observed_price: '81.00', line_total: '81.00', unit_price: '27.00', commodity_key: 'cobra', commodity_name: 'Cobra' },
      ],
    }
    vi.mocked(adminApi.getReports).mockResolvedValue([receiptReport])
    vi.mocked(adminApi.getReportEvidenceManifest).mockResolvedValue({
      capture_mode: 'guided_photos_v1',
      processing_status: 'ready',
      continuity: null,
      merchant: null,
      processing_result: null,
      assets: [{ id: 801, kind: 'source_frame', sequence: 0, mime_type: 'image/jpeg', size_bytes: 800, sha256: 'hash', metadata: null }],
    })
    vi.mocked(adminApi.getReportEvidenceAsset).mockResolvedValue(new Blob(['original'], { type: 'image/jpeg' }))
    vi.mocked(adminApi.decideReport).mockResolvedValue({ ...receiptReport, status: 'Under regulatory review' })

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(await screen.findByText(/Continuity: Not available · Merchant: Not available/)).toBeInTheDocument()
    const sardinesPrice = screen.getByRole('spinbutton', { name: /Receipt unit price for SARDINES 155G/i })
    const cobraPrice = screen.getByRole('spinbutton', { name: /Receipt unit price for COBRA 350ML/i })
    expect(sardinesPrice).toHaveValue(null)
    expect(cobraPrice).toHaveValue(27)
    expect(screen.getByText(/Unit price not available from the receipt extraction/)).toBeInTheDocument()
    expect(screen.getByText(/line total ₱110.00 · qty 2/)).toBeInTheDocument()

    const findings = screen.getAllByRole('combobox', { name: /Finding for/i })
    await user.selectOptions(findings[0], 'confirmed_violation')
    await user.selectOptions(findings[1], 'no_violation')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Compared unit prices with the SRP.')
    expect(screen.getByRole('button', { name: /Validate findings/i })).toBeDisabled()

    await user.type(sardinesPrice, '55')
    await user.click(screen.getByRole('button', { name: /Validate findings/i }))

    expect(adminApi.decideReport).toHaveBeenCalledWith(101, expect.objectContaining({
      item_decisions: [
        expect.objectContaining({ item_id: 601, receipt_price: 55 }),
        expect.objectContaining({ item_id: 602, receipt_price: 27 }),
      ],
    }))
  })

  it('shows every structured OCR item without presenting legacy confidence as measured', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      evidence_available: false,
      raw_ocr_json: {
        merchant: {
          display_name: 'San Jose Grand Market',
          observed: ['SAN JOSE', 'GRAND MARKET'],
        },
        items: [
          { name: 'Rice 1kg', quantity: '2', price: '55.00', ocr_confidence: 0.93 },
          { name: null, quantity: null, price: null, ocr_confidence: null, raw_text: '???' },
          { name: 'Legacy sugar', quantity: '1', price: '80.00', ocr_confidence: 0.8 },
        ],
      },
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(screen.getAllByText('San Jose Grand Market').length).toBeGreaterThan(1)
    expect(screen.queryByText('SAN JOSE / GRAND MARKET')).not.toBeInTheDocument()
    expect(screen.getByText('Rice 1kg')).toBeInTheDocument()
    expect(screen.getByText('Item label not detected')).toBeInTheDocument()
    expect(screen.getByText('Legacy sugar')).toBeInTheDocument()
    expect(screen.getByText('93% measured')).toBeInTheDocument()
    expect(screen.getAllByText('Confidence unavailable')).toHaveLength(2)
    expect(screen.getAllByText(/"raw_text": "\?\?\?"/).length).toBeGreaterThan(0)
  })

  it('uses persisted guided receipt items instead of inventing an item from raw OCR metadata', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      evidence_available: false,
      raw_ocr_json: {
        text: 'SAN JOSE GRAND MARKET\nRICE 2 55.00\nSUGAR 1 80.00',
        merchant: { display_name: 'San Jose Grand Market', observed: ['SAN JOSE GRAND MARKET'] },
        selected_pass: 'primary',
      },
      items: [
        { id: 501, sequence: 0, item_name: 'Rice 1kg', quantity: '2', observed_price: '55.00', ocr_confidence: 0.93 },
        { id: 502, sequence: 1, item_name: null, quantity: null, observed_price: null, ocr_confidence: null, raw_text: 'SUGAR ???' },
      ],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    // Persisted items are reviewed item by item. The duplicate read-only copy of the same rows was
    // removed, so these assert the surviving decision surface rather than that table.
    expect(screen.getByRole('spinbutton', { name: /Receipt unit price for Rice 1kg/i })).toBeInTheDocument()
    expect(screen.getByText(/Rice 1kg/)).toBeInTheDocument()
    expect(screen.getByText(/OCR 93%/)).toBeInTheDocument()
    // The unnamed second item is still reviewable, labelled by position.
    expect(screen.getByText(/Item 2/)).toBeInTheDocument()
    // Nothing was invented from raw OCR metadata.
    expect(screen.queryByText('Item label not detected')).not.toBeInTheDocument()
  })

  it('states the price comparison per item and never guesses when no reference applies', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      evidence_available: false,
      items: [
        {
          id: 601, sequence: 0, item_name: 'Saba Sardines', quantity: '1', unit_price: '30.00',
          commodity_key: 'saba-sardines-155g', commodity_name: 'Saba Sardines',
          reference: {
            status: 'available', type: 'standard_srp', label: 'SRP baseline (provisional)',
            value: 21.5, effective_date: '2026-05-11', receipt_unit_price: 30,
            peso_difference: 8.5, percent_difference: 39.5, is_above_reference: true, auto_matched: true,
          },
        },
        {
          id: 602, sequence: 1, item_name: 'Unmatched line', quantity: '1', unit_price: '12.00',
          reference: { status: 'unavailable', label: 'No applicable reference', is_above_reference: null },
        },
      ],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(screen.getByText('Above reference')).toBeInTheDocument()
    // Twice by design: once on the item badge, once in the report's total-excess tile.
    expect(screen.getAllByText(/\+₱8\.50/)).toHaveLength(2)
    expect(screen.getByText(/SRP baseline \(provisional\)/)).toBeInTheDocument()
    // The report roll-up counts only what was actually compared.
    expect(screen.getByText(/Compared 1 of 2 item\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 item\(s\) have no applicable reference/)).toBeInTheDocument()
    // An item with no reference must not read as compliant.
    expect(screen.getByText('No applicable reference')).toBeInTheDocument()
    expect(screen.queryByText('Within reference')).not.toBeInTheDocument()
  })

  it('offers commodity suggestions by key, not display name, and skips keyless candidates', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      evidence_available: false,
      items: [{
        id: 701, sequence: 0, item_name: 'ZZQX UNREADABLE', quantity: '1', unit_price: '30.00',
        reference: {
          status: 'unavailable', label: 'No applicable reference', is_above_reference: null,
          auto_matched: false,
          match_candidates: [
            { id: 11, commodity_key: 'saba-sardines-155g', commodity_name: 'Saba Sardines', package_size: '155 g', match_score: 62 },
            { id: 12, commodity_key: null, commodity_name: 'Keyless Commodity', match_score: 55 },
          ],
        },
      }],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    const options = document.querySelectorAll('datalist option')
    // The server resolves the reference by exact commodity key, so the option's value must be the
    // key. Submitting the display name made every chosen suggestion fail to resolve.
    expect(Array.from(options).map((option) => option.getAttribute('value'))).toEqual(['saba-sardines-155g'])
    // A keyless bulletin can never resolve a reference, so it is not offered at all.
    expect(screen.queryByText(/Keyless Commodity/)).not.toBeInTheDocument()
  })

  it('lets an item report be referred for field verification', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      evidence_available: false,
      verification_request: null,
      items: [{ id: 801, sequence: 0, item_name: 'Saba Sardines', quantity: '1', unit_price: '30.00' }],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    // The referral controls used to live only in the legacy branch, so on an item report — the
    // normal case — the officer selector never rendered and referral was impossible.
    await user.click(screen.getByRole('checkbox', { name: /Refer this report for field verification/i }))
    expect(await screen.findByRole('combobox', { name: 'Field Officer' })).toBeInTheDocument()
  })

  it('shows the price freeze protocol when the receipt falls inside a declared emergency', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      ...mockReports[0],
      evidence_available: false,
      protocol: { mode: 'emergency', reference: 'PDRRMC-2026-07' },
      items: [],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(screen.getByText(/Price Freeze Protocol/)).toBeInTheDocument()
    expect(screen.getByText(/PDRRMC-2026-07/)).toBeInTheDocument()
  })
})
