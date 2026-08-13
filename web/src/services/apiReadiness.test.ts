import { describe, expect, it, vi } from 'vitest';
import api from './api';
import { createReadinessGate } from './apiReadiness';

describe('Admin API readiness', () => {
  it('coalesces concurrent readiness probes and retries only after failure', async () => {
    const probe = vi.fn()
      .mockRejectedValueOnce(new Error('starting'))
      .mockResolvedValueOnce(undefined);
    const waitUntilReady = createReadinessGate(probe);

    const first = waitUntilReady();
    expect(waitUntilReady()).toBe(first);
    await expect(first).rejects.toThrow('starting');
    await expect(waitUntilReady()).resolves.toBeUndefined();

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('sets a finite timeout for ordinary Admin API requests', () => {
    expect(api.defaults.timeout).toBe(30_000);
  });
});
