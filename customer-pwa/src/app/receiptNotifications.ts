import { apiClient } from '../api/client';

export type ReceiptNotificationAvailability = 'available' | 'install-required' | 'denied' | 'unsupported';

export interface ReceiptNotificationCapabilities {
  supportsServiceWorker: boolean;
  supportsPush: boolean;
  supportsNotifications: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: NotificationPermission;
}

export function receiptNotificationAvailability(
  capabilities: ReceiptNotificationCapabilities,
): ReceiptNotificationAvailability {
  if (!capabilities.supportsServiceWorker || !capabilities.supportsPush || !capabilities.supportsNotifications) {
    return 'unsupported';
  }
  if (capabilities.isIOS && !capabilities.isStandalone) return 'install-required';
  if (capabilities.permission === 'denied') return 'denied';
  return 'available';
}

export function currentReceiptNotificationAvailability(): ReceiptNotificationAvailability {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return receiptNotificationAvailability({
    supportsServiceWorker: 'serviceWorker' in navigator,
    supportsPush: 'PushManager' in window,
    supportsNotifications: 'Notification' in window,
    isIOS,
    isStandalone: window.matchMedia?.('(display-mode: standalone)').matches === true,
    permission: 'Notification' in window ? Notification.permission : 'denied',
  });
}

export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

export async function enableReceiptNotifications(input: {
  reference: string;
  resumeToken: string;
  vapidPublicKey: string;
}): Promise<ReceiptNotificationAvailability | 'enabled'> {
  const availability = currentReceiptNotificationAvailability();
  if (availability !== 'available') return availability;
  if (!input.vapidPublicKey) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsupported';

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(input.vapidPublicKey),
  });
  await apiClient.post(
    `/public/reports/${encodeURIComponent(input.reference)}/push-subscription`,
    { subscription: subscription.toJSON() },
    { headers: { 'X-Report-Resume-Token': input.resumeToken } },
  );

  return 'enabled';
}
