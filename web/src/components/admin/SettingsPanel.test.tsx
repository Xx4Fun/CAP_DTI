import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { AdminToastHost } from './AdminToastHost'
import { SettingsPanel } from './SettingsPanel'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getSettings: vi.fn(),
    updateProfile: vi.fn(),
    updatePreferences: vi.fn(),
    updateSystemSettings: vi.fn(),
  },
}))

const evaluator = { id: 1, name: 'DTI Evaluator', email: 'evaluator@dti.gov.ph', role: 'dti_evaluator' as const }

describe('Admin settings feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getSettings).mockResolvedValue({} as never)
  })

  it('shows saved profile confirmation as a toast without shifting the form', async () => {
    vi.mocked(adminApi.updateProfile).mockResolvedValue({ message: 'Profile details updated successfully.' } as never)
    const user = userEvent.setup()
    render(<><SettingsPanel user={evaluator} /><AdminToastHost /></>)

    await user.click(screen.getByRole('button', { name: 'Save Profile Changes' }))

    const notice = await screen.findByText('Profile details updated successfully.')
    expect(notice.closest('[data-sonner-toast]')).toBeInTheDocument()
    expect(screen.queryByText('Profile details updated successfully.', { selector: '.settings-alert-badge' })).not.toBeInTheDocument()
  })

  it('keeps password mismatch validation next to the form', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel user={evaluator} />)

    await user.type(screen.getByLabelText('New Password'), 'first-password')
    await user.type(screen.getByLabelText('Confirm New Password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Save Profile Changes' }))

    expect(screen.getByRole('alert')).toHaveTextContent('New password and confirmation do not match.')
  })

  it('does not offer settings that are not connected to runtime behavior', () => {
    render(<SettingsPanel user={evaluator} />)

    expect(screen.getByRole('heading', { name: 'Unavailable settings' })).toBeInTheDocument()
    expect(screen.getByText(/Notifications, display density, inactivity timeout, GIS defaults, and regulatory thresholds/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save Notification Preferences/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save System Parameters/i })).not.toBeInTheDocument()
    expect(adminApi.updatePreferences).not.toHaveBeenCalled()
    expect(adminApi.updateSystemSettings).not.toHaveBeenCalled()
  })
})
