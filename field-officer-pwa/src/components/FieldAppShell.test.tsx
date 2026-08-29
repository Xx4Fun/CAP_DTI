// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldAppShell } from './FieldAppShell'

describe('FieldAppShell', () => {
  afterEach(cleanup)

  it('renders the official responsive shell with five destinations and current-page semantics', () => {
    const navigate = vi.fn()
    const { container } = render(
      <FieldAppShell
        activeView="home"
        officerName="Ana Officer"
        online
        queueCount={2}
        hasActiveDraft={false}
        authorizationValid
        onNavigate={navigate}
        onStartVisit={vi.fn()}
        onLock={vi.fn()}
      >
        <h1>Dashboard</h1>
      </FieldAppShell>,
    )

    expect(screen.getAllByAltText('DTI Official Logo')).toHaveLength(2)
    expect(screen.getAllByAltText('DTI Official Logo')[0]).toHaveAttribute('src', '/branding/dti-logo.svg')

    const sidebar = within(container.querySelector('[data-testid="field-sidebar"]') as HTMLElement)
    const bottomNav = within(container.querySelector('[data-testid="field-bottom-nav"]') as HTMLElement)
    expect(within(sidebar.getByRole('navigation')).getAllByRole('button')).toHaveLength(5)
    expect(bottomNav.getAllByRole('button')).toHaveLength(5)
    expect(sidebar.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(bottomNav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(bottomNav.getByRole('button', { name: 'Profile' }))
    expect(navigate).toHaveBeenCalledWith('profile')
  })

  it('routes Add to Activity when a draft exists without starting another visit', () => {
    const navigate = vi.fn()
    const startVisit = vi.fn()
    const { container } = render(
      <FieldAppShell
        activeView="home"
        officerName="Ana Officer"
        online={false}
        queueCount={0}
        hasActiveDraft
        authorizationValid={false}
        onNavigate={navigate}
        onStartVisit={startVisit}
        onLock={vi.fn()}
      >
        <h1>Dashboard</h1>
      </FieldAppShell>,
    )

    const bottomNav = within(container.querySelector('[data-testid="field-bottom-nav"]') as HTMLElement)
    const add = bottomNav.getByRole('button', { name: 'View active visit in Activity' })
    expect(add).not.toBeDisabled()
    fireEvent.click(add)

    expect(navigate).toHaveBeenCalledWith('activity')
    expect(startVisit).not.toHaveBeenCalled()
  })

  it('disables starting a visit when authorization is expired and no draft exists', () => {
    const { container } = render(
      <FieldAppShell
        activeView="home"
        officerName="Ana Officer"
        online={false}
        queueCount={0}
        hasActiveDraft={false}
        authorizationValid={false}
        onNavigate={vi.fn()}
        onStartVisit={vi.fn()}
        onLock={vi.fn()}
      >
        <h1>Dashboard</h1>
      </FieldAppShell>,
    )

    const bottomNav = within(container.querySelector('[data-testid="field-bottom-nav"]') as HTMLElement)
    expect(bottomNav.getByRole('button', { name: 'Start a new monitoring visit' })).toBeDisabled()
  })
})
