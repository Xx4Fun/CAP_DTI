// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaUpdatePrompt } from './PwaUpdatePrompt'

const { updateServiceWorkerMock, setNeedRefreshMock } = vi.hoisted(() => ({
  updateServiceWorkerMock: vi.fn<() => Promise<void>>(),
  setNeedRefreshMock: vi.fn(),
}))

vi.mock('../app/pwaRegistration', () => ({
  useRegisterSW: () => ({
    needRefresh: [true, setNeedRefreshMock],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: updateServiceWorkerMock,
  }),
}))

describe('Field Officer PwaUpdatePrompt', () => {
  beforeEach(() => {
    updateServiceWorkerMock.mockReset()
    setNeedRefreshMock.mockReset()
  })

  afterEach(cleanup)

  it('renders update prompt and applies update when Update now is clicked', async () => {
    updateServiceWorkerMock.mockResolvedValue(undefined)
    render(<PwaUpdatePrompt />)

    expect(screen.getByRole('status')).toHaveTextContent('Update available')
    expect(screen.getByText('New version')).toBeInTheDocument()
    expect(updateServiceWorkerMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true)
  })

  it('allows the update prompt to be dismissed for later', () => {
    render(<PwaUpdatePrompt />)

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(setNeedRefreshMock).toHaveBeenCalledWith(false)
    expect(updateServiceWorkerMock).not.toHaveBeenCalled()
  })
})
