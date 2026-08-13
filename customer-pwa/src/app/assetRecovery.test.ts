import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';

describe('asset-load recovery shell', () => {
  it('reloads automatically only once per session and never unregisters the service worker', () => {
    expect(indexHtml).toContain("price-watch-asset-recovery-v1");
    expect(indexHtml).toContain('sessionStorage.getItem');
    expect(indexHtml).toContain('sessionStorage.setItem');
    expect(indexHtml).not.toContain('.unregister(');
  });

  it('renders a manual recovery message after a repeated asset failure', () => {
    expect(indexHtml).toContain('PRICE-Watch could not finish loading');
    expect(indexHtml).toContain('Reload manually');
  });
});
