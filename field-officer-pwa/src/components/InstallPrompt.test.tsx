// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from './InstallPrompt'

describe('Field Officer InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(cleanup)

  it('renders install prompt when beforeinstallprompt event fires and allows installation', async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined)
    const userChoiceMock = Promise.resolve({ outcome: 'accepted' as const, platform: 'web' })

    render(<InstallPrompt />)
    expect(screen.queryByLabelText('Install PRICE-Watch Field App')).not.toBeInTheDocument()

    // Trigger beforeinstallprompt event
    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: promptMock,
      userChoice: userChoiceMock,
    })
    window.dispatchEvent(event)

    expect(await screen.findByLabelText('Install PRICE-Watch Field App')).toBeInTheDocument()
    expect(screen.getByText('Install Field Monitoring App')).toBeInTheDocument()

    // Click install button
    const installBtn = screen.getByRole('button', { name: 'Install app' })
    fireEvent.click(installBtn)

    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  it('dismisses the prompt and writes expiration to localStorage', async () => {
    render(<InstallPrompt />)

    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    })
    window.dispatchEvent(event)

    expect(await screen.findByLabelText('Install PRICE-Watch Field App')).toBeInTheDocument()

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss install banner' })
    fireEvent.click(dismissBtn)

    expect(screen.queryByLabelText('Install PRICE-Watch Field App')).not.toBeInTheDocument()
    expect(localStorage.getItem('price-watch-field-install-dismissed')).toBeTruthy()
  })
})
