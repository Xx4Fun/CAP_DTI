import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CitizenTipReview } from './CitizenTipReview'
import { adminApi } from '../../services/adminApi'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getReports: vi.fn(),
    decideReport: vi.fn(),
    getReportEvidence: vi.fn(),
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
    expect(screen.getByRole('button', { name: /All Reports/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pending Review \(/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Validated \/ LOI Issued \(/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dismissed \(/i })).toBeInTheDocument()

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
    await user.click(screen.getByRole('button', { name: /Validated \/ LOI Issued \(/i }))
    expect(screen.queryByText('RPT-2026-001')).not.toBeInTheDocument()
    expect(screen.getByText('RPT-2026-002')).toBeInTheDocument()
  })

  it('renders dual-column inspection workspace with image controls for evidence', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    // Select RPT-2026-001
    await user.click(await screen.findByText('RPT-2026-001'))

    // Left column vaulted evidence & image control buttons
    expect(screen.getByRole('heading', { name: /Vaulted Receipt Evidence/i })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Original OCR values' })).toBeInTheDocument()
    expect(screen.getAllByText(/Super Extra Rice 1kg/i).length).toBeGreaterThan(0)
    expect(screen.getByText('FLAGGED OVER SRP')).toBeInTheDocument()

    // DTI Evaluator Single-Click Action Buttons
    expect(screen.getByRole('button', { name: /Validate & Issue LOI/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dismiss Report/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Request Re-scan/i })).toBeInTheDocument()
  })

  it('submits single-click DTI Evaluator action decision', async () => {
    const user = userEvent.setup()
    render(<CitizenTipReview />)

    await user.click(await screen.findByText('RPT-2026-001'))

    // Fill finding and reason
    await user.selectOptions(screen.getByRole('combobox', { name: /Regulatory finding/i }), 'confirmed_violation')
    await user.type(screen.getByRole('textbox', { name: /Decision reason/i }), 'Overpriced shelf item detected.')

    // Click single-click Validate & Issue LOI
    await user.click(screen.getByRole('button', { name: /Validate & Issue LOI/i }))

    expect(adminApi.decideReport).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        action: 'validate',
        reason: 'Overpriced shelf item detected.',
        corrected: expect.objectContaining({ regulatory_finding: 'confirmed_violation' }),
      }),
    )
  })
})
