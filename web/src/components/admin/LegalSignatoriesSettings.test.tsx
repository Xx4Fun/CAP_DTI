import { configure, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import type { LegalSignatoryRecord } from '../../types/admin'
import { LegalSignatoriesSettings } from './LegalSignatoriesSettings'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getLegalSignatories: vi.fn(), updateLegalSignatory: vi.fn(), uploadLegalSignature: vi.fn(),
    removeLegalSignature: vi.fn(), getLegalSignatureImage: vi.fn(),
  },
}))
vi.mock('../../services/adminToast', () => ({ adminToast: { success: vi.fn(), error: vi.fn() } }))

configure({ asyncUtilTimeout: 5000 })
const api = vi.mocked(adminApi)
const record = (overrides: Partial<LegalSignatoryRecord> = {}): LegalSignatoryRecord => ({
  name: null, office: 'Provincial Director, DTI Antique', source: 'environment', has_signature: false, updated_at: null, updated_by: null, ...overrides,
})

describe('LegalSignatoriesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getLegalSignatories.mockResolvedValue({ LOI: record(), SCO: record({ name: 'Atty. Ben Cruz', office: 'Director, Fair Trade Enforcement Bureau', source: 'settings' }) })
  })

  it('lets DTI staff set the LOI signatory and upload an e-signature', async () => {
    api.updateLegalSignatory.mockResolvedValue(record({ name: 'Atty. Ana Reyes', source: 'settings' }))
    api.uploadLegalSignature.mockResolvedValue(record({ name: 'Atty. Ana Reyes', source: 'settings', has_signature: true, updated_at: '2026-09-28T01:00:00Z' }))
    api.getLegalSignatureImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    URL.createObjectURL = vi.fn(() => 'blob:signature')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup()
    render(<LegalSignatoriesSettings canEdit />)

    const loi = await screen.findByRole('form', { name: 'LOI signatory' })
    expect(within(loi).getByText('Not set: issuing is disabled')).toBeInTheDocument()
    await user.type(within(loi).getByLabelText('Signatory name'), 'Atty. Ana Reyes')
    await user.click(within(loi).getByRole('button', { name: 'Save LOI signatory' }))
    expect(api.updateLegalSignatory).toHaveBeenCalledWith('LOI', { name: 'Atty. Ana Reyes', office: 'Provincial Director, DTI Antique' })

    await user.upload(within(loi).getByLabelText('Upload e-signature'), new File(['png'], 'sig.png', { type: 'image/png' }))
    expect(api.uploadLegalSignature).toHaveBeenCalledWith('LOI', expect.any(File))
    expect(await within(loi).findByRole('img', { name: 'LOI e-signature' })).toHaveAttribute('src', 'blob:signature')
  })

  it('uploads a hand-drawn e-signature as a PNG', async () => {
    api.uploadLegalSignature.mockResolvedValue(record({ has_signature: true }))
    api.getLegalSignatureImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    URL.createObjectURL = vi.fn(() => 'blob:signature')
    URL.revokeObjectURL = vi.fn()
    const context = { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(new Blob(['png'], { type: 'image/png' })))
    const user = userEvent.setup()
    render(<LegalSignatoriesSettings canEdit />)

    const loi = await screen.findByRole('form', { name: 'LOI signatory' })
    await user.click(within(loi).getByRole('button', { name: 'Draw e-signature' }))
    const pad = within(loi).getByLabelText('LOI signature drawing area')
    expect(within(loi).getByRole('button', { name: 'Use this signature' })).toBeDisabled()
    fireEvent.pointerDown(pad, { clientX: 20, clientY: 30 })
    fireEvent.pointerMove(pad, { clientX: 120, clientY: 60 })
    fireEvent.pointerUp(pad)
    await user.click(within(loi).getByRole('button', { name: 'Use this signature' }))

    await vi.waitFor(() => expect(api.uploadLegalSignature).toHaveBeenCalledWith('LOI', expect.objectContaining({ type: 'image/png', name: 'LOI-signature.png' })))
    expect(within(loi).queryByLabelText('LOI signature drawing area')).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('rejects non-image signature files before upload', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<LegalSignatoriesSettings canEdit />)
    const loi = await screen.findByRole('form', { name: 'LOI signatory' })
    await user.upload(within(loi).getByLabelText('Upload e-signature'), new File(['<svg/>'], 'sig.svg', { type: 'image/svg+xml' }))
    expect(await within(loi).findByRole('alert')).toHaveTextContent('Upload a PNG or JPEG image')
    expect(api.uploadLegalSignature).not.toHaveBeenCalled()
  })

  it('shows read-only viewers who signs without letting them change it', async () => {
    render(<LegalSignatoriesSettings canEdit={false} />)
    const sco = await screen.findByRole('form', { name: 'SCO signatory' })
    expect(within(sco).getByLabelText('Signatory name')).toHaveValue('Atty. Ben Cruz')
    expect(within(sco).getByLabelText('Signatory name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Save .* signatory/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Upload e-signature/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('form', { name: 'LOI signatory' })).getByText('Not set: ask DTI staff')).toBeInTheDocument()
  })

  it('reloads the preview after a replacement even when updated_at is unchanged', async () => {
    const signed = record({ name: 'Atty. Ana Reyes', source: 'settings', has_signature: true, updated_at: '2026-09-28T01:00:00Z' })
    api.getLegalSignatories.mockResolvedValue({ LOI: signed, SCO: record() })
    api.uploadLegalSignature.mockResolvedValue(signed)
    api.getLegalSignatureImage.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    URL.createObjectURL = vi.fn(() => 'blob:signature')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup()
    render(<LegalSignatoriesSettings canEdit />)

    const loi = await screen.findByRole('form', { name: 'LOI signatory' })
    await within(loi).findByRole('img', { name: 'LOI e-signature' })
    expect(api.getLegalSignatureImage).toHaveBeenCalledTimes(1)
    await user.upload(within(loi).getByLabelText('Replace e-signature'), new File(['png'], 'sig.png', { type: 'image/png' }))
    await vi.waitFor(() => expect(api.getLegalSignatureImage).toHaveBeenCalledTimes(2))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:signature')
  })
})
