import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import { VendorInvitationAccept } from './VendorInvitationAccept'

vi.mock('../services/api', () => ({
  default: { post: vi.fn() },
}))

describe('VendorInvitationAccept', () => {
  it('submits a user-chosen password to the token acceptance endpoint', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { message: 'Vendor account activated.' } })
    const user = userEvent.setup()
    render(<VendorInvitationAccept token="raw-token-once" />)

    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Vendor Owner')
    await user.type(screen.getByLabelText('Create password'), 'A-secure-vendor-password')
    await user.type(screen.getByLabelText('Confirm password'), 'A-secure-vendor-password')
    await user.click(screen.getByRole('button', { name: 'Activate vendor account' }))

    expect(api.post).toHaveBeenCalledWith('/vendor-invitations/raw-token-once/accept', {
      name: 'Vendor Owner',
      password: 'A-secure-vendor-password',
      password_confirmation: 'A-secure-vendor-password',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Vendor account activated.')
  })
})
