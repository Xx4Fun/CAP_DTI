import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('./services/apiReadiness', () => ({ ensureApiReady: vi.fn().mockResolvedValue(undefined) }))

// App reads VITE_VENDOR_PWA_URL when the module loads, so each case stubs the env and imports a fresh copy.
async function renderLegacyInvitationLink(vendorPwaUrl: string) {
  vi.stubEnv('VITE_VENDOR_PWA_URL', vendorPwaUrl)
  const replace = vi.fn()
  vi.stubGlobal('location', {
    href: 'https://admin.example.test/vendor-invitation?token=raw%2Btoken',
    origin: 'https://admin.example.test',
    pathname: '/vendor-invitation',
    search: '?token=raw%2Btoken',
    hash: '',
    replace,
  })
  const { default: App } = await import('./App')
  render(<App />)
  return replace
}

describe('Legacy Admin vendor invitation links', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('forwards the invitation token to the configured Vendor Portal', async () => {
    const replace = await renderLegacyInvitationLink('https://vendor.example.test/')

    expect(replace).toHaveBeenCalledWith('https://vendor.example.test/vendor-invitation?token=raw%2Btoken')
    expect(screen.getByRole('status')).toHaveTextContent('Opening the Vendor Portal')
  })

  it('explains the missing configuration instead of redirecting when the Vendor Portal address is not set', async () => {
    const replace = await renderLegacyInvitationLink('')

    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('The Vendor Portal address is not configured')
  })
})
