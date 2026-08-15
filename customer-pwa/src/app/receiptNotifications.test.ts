import { describe, expect, it } from 'vitest';
import { base64UrlToUint8Array, receiptNotificationAvailability } from './receiptNotifications';

describe('receipt notification capability', () => {
  it('requires Home Screen installation for iPhone and iPad push', () => {
    expect(receiptNotificationAvailability({
      supportsServiceWorker: true,
      supportsPush: true,
      supportsNotifications: true,
      isIOS: true,
      isStandalone: false,
      permission: 'default',
    })).toBe('install-required');
  });

  it('does not offer notifications after permission was denied', () => {
    expect(receiptNotificationAvailability({
      supportsServiceWorker: true,
      supportsPush: true,
      supportsNotifications: true,
      isIOS: false,
      isStandalone: false,
      permission: 'denied',
    })).toBe('denied');
  });

  it('decodes a VAPID public key without placing it in a URL', () => {
    expect(Array.from(base64UrlToUint8Array('AQIDBA'))).toEqual([1, 2, 3, 4]);
  });
});
