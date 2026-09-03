// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FieldAppShell } from './FieldAppShell'

describe('FieldAppShell', () => {
  afterEach(cleanup)

  it('renders four flat destinations with profile and notifications outside navigation', () => {
    const navigate = vi.fn()
    const { container } = render(
      <FieldAppShell
        activeView="home"
        officerName="Ana Officer"
        online
        queueCount={2}
        draftCount={0}
        unreadCount={3}
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
    expect(within(sidebar.getByRole('navigation')).getAllByRole('button')).toHaveLength(4)
    expect(bottomNav.getAllByRole('button')).toHaveLength(4)
    expect(sidebar.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(bottomNav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(bottomNav.getByRole('button', { name: 'Start a new monitoring visit' })).not.toHaveClass('raised')
    expect(screen.getAllByRole('button', { name: 'Notifications, 3 unread' })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: 'Open profile' })[0])
    expect(navigate).toHaveBeenCalledWith('profile')
  })

  it('keeps Add as a direct new-visit action when drafts exist', () => {
    const navigate = vi.fn()
    const startVisit = vi.fn()
    const { container } = render(
      <FieldAppShell
        activeView="home"
        officerName="Ana Officer"
        online={false}
        queueCount={0}
        draftCount={2}
        unreadCount={0}
        authorizationValid={false}
        onNavigate={navigate}
        onStartVisit={startVisit}
        onLock={vi.fn()}
      >
        <h1>Dashboard</h1>
      </FieldAppShell>,
    )

    const bottomNav = within(container.querySelector('[data-testid="field-bottom-nav"]') as HTMLElement)
    const add = bottomNav.getByRole('button', { name: 'Start a new monitoring visit' })
    expect(add).not.toBeDisabled()
    fireEvent.click(add)

    expect(startVisit).toHaveBeenCalledTimes(1)
  })

  it('disables starting a visit when authorization is expired and no draft exists', () => {
    const { container } = render(
      <FieldAppShell
        activeView="home"
        officerName="Ana Officer"
        online={false}
        queueCount={0}
        draftCount={0}
        unreadCount={0}
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

  it('shows New Visit in the regular shell and marks Add active on Choose Store', () => {
    const { container } = render(
      <FieldAppShell
        activeView="visit"
        officerName="Ana Officer"
        online
        queueCount={0}
        draftCount={1}
        unreadCount={0}
        authorizationValid
        onNavigate={vi.fn()}
        onStartVisit={vi.fn()}
        onLock={vi.fn()}
      >
        <h1>Choose a store</h1>
      </FieldAppShell>,
    )

    expect(screen.getByTestId('field-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('field-bottom-nav')).toBeInTheDocument()
    expect(screen.getByText('New Visit')).toBeInTheDocument()
    const sidebar = within(container.querySelector('[data-testid="field-sidebar"]') as HTMLElement)
    const bottomNav = within(container.querySelector('[data-testid="field-bottom-nav"]') as HTMLElement)
    expect(sidebar.getByRole('button', { name: 'Start a new monitoring visit' })).toHaveAttribute('aria-current', 'page')
    expect(bottomNav.getByRole('button', { name: 'Start a new monitoring visit' })).toHaveAttribute('aria-current', 'page')
  })
})
