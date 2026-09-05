import { subscribePush, unsubscribePush } from './api';

// Not secret -- this is the "applicationServerKey" every subscriber's browser embeds in its
// subscription so the push service can verify the VAPID JWT came from us. Matches the backend's
// VAPID_PUBLIC_KEY (see app/scripts/generate_vapid.mjs); overridable the same way API_BASE is,
// so a future key rotation doesn't need a code change.
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ?? 'BMoUaDb4XHQh4sNmh9d7AmxrNbnT8XVR5V4y7TLJxlsWFuFhOUU8y5De6dhkvJJQrmfaKWak1BIa2doE5rPuliM';

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function toBackendSubscription(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = sub.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } };
}

/** Requests Notification permission (if not already decided) and subscribes with the push service. Returns false if the user declines or the platform doesn't support it. */
export async function enableWeightReminders(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));

  await subscribePush(toBackendSubscription(subscription));
  return true;
}

export async function disableWeightReminders(): Promise<void> {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;
  await unsubscribePush(subscription.endpoint);
  await subscription.unsubscribe();
}
