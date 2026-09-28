import { configure, render, screen, within } from '@testing-library/react'
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

  it('lets a Super Admin set the LOI signatory and upload an e-signature', async () => {
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

  it('rejects non-image signature files before upload', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<LegalSignatoriesSettings canEdit />)
    const loi = await screen.findByRole('form', { name: 'LOI signatory' })
    await user.upload(within(loi).getByLabelText('Upload e-signature'), new File(['<svg/>'], 'sig.svg', { type: 'image/svg+xml' }))
    expect(await within(loi).findByRole('alert')).toHaveTextContent('Upload a PNG or JPEG image')
    expect(api.uploadLegalSignature).not.toHaveBeenCalled()
  })

  it('shows evaluators who signs without letting them change it', async () => {
    render(<LegalSignatoriesSettings canEdit={false} />)
    const sco = await screen.findByRole('form', { name: 'SCO signatory' })
    expect(within(sco).getByLabelText('Signatory name')).toHaveValue('Atty. Ben Cruz')
    expect(within(sco).getByLabelText('Signatory name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Save .* signatory/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Upload e-signature/)).not.toBeInTheDocument()
  })
})
