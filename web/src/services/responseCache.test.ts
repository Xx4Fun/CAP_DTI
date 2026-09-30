import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cached, clearResponseCache } from './responseCache'

describe('responseCache', () => {
  beforeEach(() => clearResponseCache())

  it('shares one request per key within the TTL', async () => {
    const load = vi.fn().mockResolvedValue(['store'])

    await Promise.all([cached('stores', 60_000, load), cached('stores', 60_000, load)])
    await cached('stores', 60_000, load)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('evicts a rejected request so the next call retries', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(['store'])

    await expect(cached('stores', 60_000, load)).rejects.toThrow('offline')
    await expect(cached('stores', 60_000, load)).resolves.toEqual(['store'])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('refetches after the cache is cleared', async () => {
    const load = vi.fn().mockResolvedValue(['store'])

    await cached('stores', 60_000, load)
    clearResponseCache()
    await cached('stores', 60_000, load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})
