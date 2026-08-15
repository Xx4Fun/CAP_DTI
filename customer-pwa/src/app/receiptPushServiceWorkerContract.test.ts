import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('receipt push service worker contract', () => {
  it('shows user-visible notifications and opens only same-origin report routes', () => {
    const source = readFileSync(join(process.cwd(), 'public', 'receipt-push-sw.js'), 'utf8');

    expect(source).toContain("addEventListener('push'");
    expect(source).toContain('showNotification');
    expect(source).toContain("addEventListener('notificationclick'");
    expect(source).toContain("startsWith('/reports/')");
    expect(source).not.toContain('tracking_token');
    expect(source).not.toContain('resume_token');
    expect(source).not.toContain('eval(');
  });
});
