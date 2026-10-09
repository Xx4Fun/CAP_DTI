import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    getReportPage: vi.fn(),
    decideReport: vi.fn(),
    requestFieldVerification,
    getManagedUsers: vi.fn(),
    cancelFieldVerification,
    reopenFieldVerification,
    getReportEvidence: vi.fn(),
    getReportEvidenceManifest: vi.fn(),
    getReportEvidenceAsset: vi.fn(),
    getStores: vi.fn(),
  },
}))

describe('CitizenTipReview - Formal Receipt OCR Review Queue Workspace', () => {
  /** The panel loads a filtered page, so a test states its rows and gets the envelope around them. */
  const mockReportPage = (rows: unknown[]) => {
    vi.mocked(adminApi.getReportPage).mockResolvedValue({
      data: rows as never,
      meta: {
        current_page: 1, last_page: 1, per_page: 20, total: rows.length,
        from: rows.length ? 1 : null, to: rows.length || null,
        filter: 'all',
        filter_counts: { all: rows.length, to_review: rows.length, with_officer: 0, violations: 0, confirmed_findings: 0, no_violation: 0, rejected: 0 },
      },
    })
  }

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
    mockReportPage(mockReports)
    vi.mocked(adminApi.getStores).mockResolvedValue([
      { id: 7, store_name: 'Gaisano Grand Mall', address: 'San Jose', latitude: 10.7, longitude: 121.9, is_active: true },
      { id: 8, store_name: 'Antique Mart', address: 'San Jose', latitude: 10.7, longitude: 121.9, is_active: true },
    ] as never)
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

  it('lists reports in workflow filters and shows queue-wide counts', async () => {
    render(<CitizenTipReview />)

    expect(await screen.findByRole('region', { name: 'Consumer reports' })).toBeInTheDocument()
    // The admin shell already titles the page; the list repeating "Consumer Reports" was noise.
    expect(screen.queryByRole('heading', { name: /Consumer Reports/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Select a report to see the applicable protocol/i)).not.toBeInTheDocument()

    // Workflow states, replacing buckets that matched only two of the six statuses the system
    // writes and left two pills permanently empty.
    expect(screen.getByRole('button', { name: /For Review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /With field officer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Violations/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /No violation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rejected/i })).toBeInTheDocument()

    expect(screen.getByText('RPT-2026-001')).toBeInTheDocument()
    expect(screen.getByText('RPT-2026-002')).toBeInTheDocument()
    expect(screen.getByText('RPT-2026-003')).toBeInTheDocument()

    // Filtering is the server's job now, so choosing a pill re-queries rather than slicing rows.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Violations/i }))
    expect(adminApi.getReportPage).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'violations' }))
  })

  it('opens detected violations first and exposes the confirmed findings queue separately', async () => {
    render(<CitizenTipReview />)
    await screen.findByText('RPT-2026-001')
    const tabs = within(screen.getByRole('group', { name: 'Report status' })).getAllByRole('button')
    expect(tabs.map(tab => tab.textContent?.replace(/\d+$/, '').trim())).toEqual([
      'Violations', 'Confirmed Findings', 'No Violations', 'For Review', 'With Field Officer', 'Rejected', 'All',
    ])
    expect(tabs[0]).toHaveAttribute('aria-pressed', 'true')
    await userEvent.setup().click(tabs[1])
    await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-pressed', 'true'))
  })

  it('shows an automatically resolved report without requiring an evaluator decision', async () => {
    mockReportPage([{ ...mockReports[0], status: 'Resolved', category: 'no_violation', automatic_assessment_json: {
      category: 'no_violation', assessed_at: '2026-10-09T00:00:00Z', reasons: [], items: [],
    } }])
    render(<CitizenTipReview />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Open RPT-2026-001/i }))
    expect(screen.getByText('Automatically resolved')).toBeInTheDocument()
    expect(screen.queryByText('OCR FLAG — REVIEW')).not.toBeInTheDocument()
    expect(screen.queryByText(/Final determination rests with the review officer/)).not.toBeInTheDocument()
    expect(screen.getByText('Automatic assessment snapshot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record finding' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Decision reason / Verification Note')).not.toBeInTheDocument()
  })

  const assessedReport = (category: string) => {
    const restated = ['Product is unidentified or its match is uncertain.', 'The applicable price reference is unavailable.']

    return {
      ...mockReports[0],
      items: [
        { id: 601, sequence: 0, item_name: 'QUAKER INST OATS', quantity: '1', observed_price: '125.25', line_total: '125.25', unit_price: '125.25' },
        { id: 602, sequence: 1, item_name: 'PDS HYDRATING GLOW', quantity: '2', observed_price: '73.50', line_total: '73.50', unit_price: '36.75' },
      ],
      automatic_assessment_json: {
        category, assessed_at: '2026-10-09T00:00:00Z', reasons: ['Extraction requires DTI review.'],
        items: [
          { item_id: 601, reliable: false, reasons: restated },
          { item_id: 602, reliable: false, reasons: [restated[0], 'Receipt line is uncertain or may be duplicated.', restated[1]] },
        ],
      },
    }
  }

  it('does not show an assessment that only asks for review', async () => {
    mockReportPage([assessedReport('to_review')])
    render(<CitizenTipReview />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Open RPT-2026-001/i }))

    expect(screen.getByText('DTI evaluator findings and decision')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Automatic assessment' })).not.toBeInTheDocument()
    expect(screen.queryByText('Assessment requires review')).not.toBeInTheDocument()
  })

  it('leaves out per-item assessment reasons that the item cards already state', async () => {
    mockReportPage([assessedReport('violations')])
    render(<CitizenTipReview />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /Open RPT-2026-001/i }))

    const assessment = within(screen.getByRole('region', { name: 'Automatic assessment' }))
    expect(assessment.getByText('System detected a possible violation')).toBeInTheDocument()
    expect(assessment.getByText('Extraction requires DTI review.')).toBeInTheDocument()
    expect(assessment.getByText('PDS HYDRATING GLOW: Receipt line is uncertain or may be duplicated.')).toBeInTheDocument()
    expect(assessment.queryByText(/QUAKER INST OATS/)).not.toBeInTheDocument()
    expect(assessment.queryByText(/Product is unidentified|price reference is unavailable/)).not.toBeInTheDocument()
  })

  it('scopes the queue by establishment and receipt date on the server, and clears the scope', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await screen.findByText('RPT-2026-001')

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Establishment' }), 'Gaisano Grand Mall')
    expect(adminApi.getReportPage).toHaveBeenLastCalledWith(expect.objectContaining({ store_id: 7, page: 1 }))

    // jsdom drops partially typed date values, so set each date the way the picker commits it.
    fireEvent.change(screen.getByLabelText('Receipt date from'), { target: { value: '2026-08-09' } })
    fireEvent.change(screen.getByLabelText('Receipt date to'), { target: { value: '2026-08-12' } })
    expect(adminApi.getReportPage).toHaveBeenLastCalledWith(expect.objectContaining({
      store_id: 7, date_from: '2026-08-09', date_to: '2026-08-12', page: 1,
    }))

    await user.click(screen.getByRole('button', { name: /Clear filters/i }))
    expect(adminApi.getReportPage).toHaveBeenLastCalledWith(expect.objectContaining({
      store_id: undefined, date_from: undefined, date_to: undefined,
    }))
    expect(screen.queryByRole('button', { name: /Clear filters/i })).not.toBeInTheDocument()
  })

  it('opens a report at full width and returns to the list', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    // The list is the whole view: no report detail until one is chosen.
    expect(await screen.findByText('RPT-2026-001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record finding/i })).not.toBeInTheDocument()

    await user.click(screen.getByText('RPT-2026-001'))

    expect(screen.getByRole('button', { name: /Record finding/i })).toBeInTheDocument()
    // The other reports are gone: one report occupies the panel.
    expect(screen.queryByText('RPT-2026-002')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Back to reports/i }))

    expect(screen.getByText('RPT-2026-002')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record finding/i })).not.toBeInTheDocument()
  })

  it('renders dual-column inspection workspace with image controls for evidence', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    // Select RPT-2026-001
    await user.click(await screen.findByText('RPT-2026-001'))

    // Detail header & image control buttons
    expect(screen.getByRole('heading', { name: 'San Jose Grand Market' })).toBeInTheDocument()
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

    // Ctrl+wheel / pinch over the receipt zooms the image; the page must not zoom with it.
    const viewport = document.querySelector('.consumer-report-viewport')!
    expect(fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -100 })).toBe(false)
    expect(fireEvent.wheel(viewport, { deltaY: -100 })).toBe(true)

    // Right column OCR breakdown & action buttons
    expect(screen.getByText(/Formal receipt \| Consumer report/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Raw OCR and system-extracted information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DTI evaluator findings and decision' })).toBeInTheDocument()
    expect(screen.getAllByText(/Super Extra Rice 1kg/i).length).toBeGreaterThan(0)
    expect(screen.getByText('OCR FLAG — REVIEW')).toBeInTheDocument()

    // Four decision controls, each named for what it writes. Closure labels deliberately do not
    // claim a determination: dismiss and reject record no finding at all.
    expect(screen.getByRole('button', { name: /Refer for field verification/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Record finding/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resolve without a finding/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reject report/i })).toBeInTheDocument()
    // The duplicate "Validate" pill and the primary mislabelled "Mark for Field Verification"
    // while sending `validate` are both gone.
    expect(screen.queryByRole('button', { name: /^Validate$/i })).not.toBeInTheDocument()
  })

  it('maps each decision control to its own backend action', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))
    await user.selectOptions(screen.getByRole('combobox', { name: /Regulatory finding/i }), 'no_violation')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Checked against the bulletin.')

    // dismiss -> Resolved, reject -> Closed; the backend treats these differently and neither
    // records a finding, so they must stay distinct controls.
    await user.click(screen.getByRole('button', { name: /Resolve without a finding/i }))
    expect(adminApi.decideReport).toHaveBeenLastCalledWith(101, expect.objectContaining({ action: 'dismiss' }))

    await user.click(screen.getByRole('button', { name: /Reject report/i }))
    expect(adminApi.decideReport).toHaveBeenLastCalledWith(101, expect.objectContaining({ action: 'reject' }))
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
    await user.click(screen.getByRole('button', { name: /Record finding/i }))

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
    await user.click(screen.getByRole('button', { name: /Refer for field verification/i }))

    expect(requestFieldVerification).toHaveBeenCalledWith(101, { reason: 'Verify the shelf price in person.', field_officer_id: 9 })
    expect(adminApi.decideReport).not.toHaveBeenCalled()
    expect(await screen.findByText('Referred for field verification')).toBeInTheDocument()
    expect(screen.getByText('Verify the shelf price in person.')).toBeInTheDocument()
  })

  it('shows the existing request and cancels it instead of offering a duplicate', async () => {
    mockReportPage([{
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

  it('treats unverified queue evidence as unavailable until a file actually loads', async () => {
    mockReportPage([{
      ...mockReports[0],
      evidence_verified: false,
      evidence_summary: { capture_mode: 'continuous_video_v1', processing_status: 'confirmed', asset_count: 1 },
    }])
    vi.mocked(adminApi.getReportEvidenceManifest).mockResolvedValue({
      capture_mode: 'continuous_video_v1', processing_status: 'confirmed', continuity: null, merchant: null, processing_result: null,
      assets: [{ id: 801, kind: 'source_frame', sequence: 0, mime_type: 'image/jpeg', size_bytes: 5, sha256: 'x', metadata: null }],
    } as never)
    vi.mocked(adminApi.getReportEvidenceAsset).mockRejectedValue(new Error('404'))

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(await screen.findByText('Receipt evidence unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download private receipt evidence/i })).not.toBeInTheDocument()
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
    mockReportPage([receiptReport])
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
    await user.click(screen.getByRole('button', { name: /Record finding/i }))

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
    mockReportPage([receiptReport])
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
    expect(screen.getByRole('button', { name: /Record finding/i })).toBeDisabled()

    await user.type(sardinesPrice, '55')
    await user.click(screen.getByRole('button', { name: /Record finding/i }))

    expect(adminApi.decideReport).toHaveBeenCalledWith(101, expect.objectContaining({
      item_decisions: [
        expect.objectContaining({ item_id: 601, receipt_price: 55 }),
        expect.objectContaining({ item_id: 602, receipt_price: 27 }),
      ],
    }))
  })

  it('shows every structured OCR item without presenting legacy confidence as measured', async () => {
    mockReportPage([{
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
    mockReportPage([{
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
    mockReportPage([{
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
    // The ordinary SRP is the default and is not labelled; only an emergency ceiling is named.
    expect(screen.queryByText(/SRP baseline \(provisional\)/)).not.toBeInTheDocument()
    // A missing reference remains insufficient evidence until the evaluator decides it.
    expect(screen.getByRole('combobox', { name: /Finding for Saba Sardines/i })).toHaveValue('confirmed_violation')
    expect(screen.getByRole('combobox', { name: /Finding for Unmatched line/i })).toHaveValue('insufficient_evidence')
    // A confident automatic match asks the evaluator for nothing.
    expect(screen.queryByRole('combobox', { name: /Commodity for Saba Sardines/i })).not.toBeInTheDocument()
    // The report roll-up counts only what was actually compared.
    expect(screen.getByText(/Compared 1 of 2 item\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 item\(s\) have no applicable reference/)).toBeInTheDocument()
    // An item with no reference must not read as compliant.
    expect(screen.getByText('No applicable reference')).toBeInTheDocument()
    expect(screen.queryByText('Within reference')).not.toBeInTheDocument()
  })

  it('offers commodity suggestions by key, not display name, and skips keyless candidates', async () => {
    mockReportPage([{
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

    const commodity = screen.getByRole('combobox', { name: /Commodity for ZZQX UNREADABLE/i })
    // The server resolves the reference by exact commodity key, so the option's value must be the
    // key. Submitting the display name made every chosen suggestion fail to resolve.
    expect(Array.from(commodity.querySelectorAll('option')).map((option) => option.getAttribute('value'))).toEqual(['', 'saba-sardines-155g'])
    expect(screen.getByRole('option', { name: 'Saba Sardines · 155 g' })).toBeInTheDocument()
    // A keyless bulletin can never resolve a reference, so it is not offered at all.
    expect(screen.queryByText(/Keyless Commodity/)).not.toBeInTheDocument()

    // The evaluator can explicitly confirm that the unmatched line is not an SRP commodity.
    await user.selectOptions(screen.getByRole('combobox', { name: /Finding for ZZQX UNREADABLE/i }), 'no_violation')
    vi.mocked(adminApi.decideReport).mockResolvedValue({ ...mockReports[0], status: 'Resolved' })
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Not an SRP commodity.')
    await user.click(screen.getByRole('button', { name: /Record finding/i }))
    expect(adminApi.decideReport).toHaveBeenCalledWith(101, expect.objectContaining({
      item_decisions: [expect.objectContaining({ item_id: 701, commodity_key: '', regulatory_finding: 'no_violation' })],
    }))
  })

  it('refreshes the queue and counts after confirming a finding', async () => {
    const user = userEvent.setup()
    mockReportPage([{ ...mockReports[0], category: 'violations' }])
    render(<CitizenTipReview />)
    await user.click(await screen.findByRole('button', { name: /Open RPT-2026-001/i }))
    vi.mocked(adminApi.decideReport).mockResolvedValue({ ...mockReports[0], category: 'confirmed_findings', status: 'Under regulatory review' })
    vi.mocked(adminApi.getReportPage).mockResolvedValue({ data: [], meta: {
      current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null,
      filter_counts: { violations: 0, confirmed_findings: 1, all: 1, to_review: 0, with_officer: 0, no_violation: 0, rejected: 0 },
    } })
    await user.selectOptions(screen.getByRole('combobox', { name: /Regulatory finding/i }), 'confirmed_violation')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Verified against original evidence.')
    await user.click(screen.getByRole('button', { name: /Record finding/i }))
    expect(await screen.findByText('DTI confirmed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Back to reports/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Open RPT-2026-001/i })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Confirmed Findings1/i })).toBeInTheDocument()
  })

  it('reports item progress and names what is blocking the decision', async () => {
    mockReportPage([{
      ...mockReports[0],
      evidence_available: false,
      items: [
        { id: 901, sequence: 0, item_name: 'Saba Sardines', quantity: '1', unit_price: '30.00', commodity_key: 'saba-sardines-155g', commodity_name: 'Saba Sardines' },
        { id: 902, sequence: 1, item_name: 'Cooking Oil', quantity: '1', unit_price: '75.00' },
      ],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    // Every line starts with a default finding, so nothing is pending until one is changed.
    expect(screen.getByText('2 of 2 items decided')).toBeInTheDocument()
    // A disabled submit used to give no reason at all, leaving the evaluator to hunt the row.
    expect(screen.getByText(/Add a decision reason/i)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Checked.')
    // A violation must cite the SRP it breaches, and Cooking Oil has no commodity.
    await user.selectOptions(screen.getByRole('combobox', { name: /Finding for Cooking Oil/i }), 'confirmed_violation')

    expect(await screen.findByText('1 of 2 items decided')).toBeInTheDocument()
    expect(screen.getByText(/Cooking Oil still needs a commodity/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Record finding/i })).toBeDisabled()
  })

  it('marks each item decided or not so an incomplete row is findable at a glance', async () => {
    mockReportPage([{
      ...mockReports[0],
      evidence_available: false,
      items: [
        { id: 911, sequence: 0, item_name: 'Saba Sardines', quantity: '1', unit_price: '30.00', commodity_key: 'saba-sardines-155g', commodity_name: 'Saba Sardines' },
        // Two units and only a line total: the unit price is unknown until the evaluator enters it.
        { id: 912, sequence: 1, item_name: 'Cooking Oil', quantity: '2', line_total: '150.00', unit_price: null },
      ],
    }])

    const user = userEvent.setup()
    render(<CitizenTipReview />)
    await user.click(await screen.findByText('RPT-2026-001'))

    expect(screen.getAllByText('Decided')).toHaveLength(1)
    expect(screen.getAllByText('Needs a decision')).toHaveLength(1)

    await user.type(screen.getByRole('spinbutton', { name: /Receipt unit price for Cooking Oil/i }), '75')

    expect(await screen.findAllByText('Decided')).toHaveLength(2)
    expect(screen.queryByText('Needs a decision')).not.toBeInTheDocument()
  })

  it('lets an item report be referred for field verification', async () => {
    mockReportPage([{
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
    mockReportPage([{
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
