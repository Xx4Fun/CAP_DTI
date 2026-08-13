import { describe, expect, it, vi } from 'vitest';
import { createReadinessGate } from './readiness';

describe('API readiness gate', () => {
  it('coalesces concurrent callers into one readiness probe', async () => {
    let releaseProbe: (() => void) | undefined;
    const probe = vi.fn(() => new Promise<void>((resolve) => {
      releaseProbe = resolve;
    }));
    const waitUntilReady = createReadinessGate(probe);

    const first = waitUntilReady();
    const second = waitUntilReady();

    expect(probe).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    releaseProbe?.();
    await first;
  });

  it('allows a new readiness attempt after a failed probe', async () => {
    const probe = vi.fn()
      .mockRejectedValueOnce(new Error('starting'))
      .mockResolvedValueOnce(undefined);
    const waitUntilReady = createReadinessGate(probe);

    await expect(waitUntilReady()).rejects.toThrow('starting');
    await expect(waitUntilReady()).resolves.toBeUndefined();

    expect(probe).toHaveBeenCalledTimes(2);
  });
});
