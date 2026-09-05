/**
 * Detects whether a real one-tap install is available (Android/Chrome, via
 * the browser's own beforeinstallprompt event) versus needing to show
 * manual instructions (iOS/Safari, which never fires that event -- Apple
 * blocks programmatic install triggers entirely, no exceptions). Also
 * detects if the app is already running installed, so the step can be
 * skipped on repeat visits.
 */

export function isStandalone(): boolean {
  // iOS-specific flag, plus the standard media-query check other platforms use.
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
});

export function hasNativeInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

export async function triggerNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome;
}
