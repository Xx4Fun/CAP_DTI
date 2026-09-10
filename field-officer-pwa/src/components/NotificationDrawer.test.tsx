// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationDrawer } from './NotificationDrawer'

describe('NotificationDrawer', () => {
  it('shows unread events, supports read actions, and closes with Escape', () => {
    const read = vi.fn()
    const readAll = vi.fn()
    const close = vi.fn()
    render(<NotificationDrawer open online state="ready" notifications={[{
      id: 'n1', event: 'verification_assigned', read_at: null, created_at: '2026-08-30T00:00:00Z', payload: { store_name: 'Market One' },
    }]} onClose={close} onRead={read} onReadAll={readAll} />)
    expect(screen.getByText('Additional visit assigned')).toBeInTheDocument()
    expect(screen.getByText('Visit Market One for the assigned follow-up.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark notification as read' }))
    expect(read).toHaveBeenCalledWith('n1')
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    expect(readAll).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })
})
