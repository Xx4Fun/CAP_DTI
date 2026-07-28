import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Login } from './Login'

describe('Login', () => {
  it('renders the complete DTI artwork as an image in the left column', () => {
    render(<Login onLoginSuccess={vi.fn()} />)

    const artwork = screen.getByRole('img', {
      name: 'DTI fair trade and consumer protection illustration',
    })

    expect(artwork).toHaveAttribute('src', '/login-left.png')
    expect(artwork).toHaveStyle({ objectFit: 'contain' })
    expect(artwork.parentElement).toHaveClass('login-left-column')
  })
})
