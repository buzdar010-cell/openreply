import { useState } from 'react';
import { hasNativeInstallPrompt, isIOS, isStandalone, triggerNativeInstall } from '../../lib/install';

/** Platform-aware: a real one-tap button on Android/Chrome, guided instructions on iPhone (Apple blocks automatic installs entirely). */
export function InstallStep() {
  const [installed, setInstalled] = useState(false);
  const alreadyStandalone = isStandalone();
  const ios = isIOS();
  const canInstallNatively = hasNativeInstallPrompt();

  async function handleInstallClick() {
    const outcome = await triggerNativeInstall();
    if (outcome === 'accepted') setInstalled(true);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 text-6xl">📲</div>
      <h1 className="text-ink-900 mb-3 text-2xl font-extrabold">Add to your home screen</h1>

      {alreadyStandalone || installed ? (
        <p className="text-ink-600 max-w-xs leading-relaxed">You're all set — this is already running as an app on your device.</p>
      ) : ios ? (
        <div className="text-ink-600 max-w-xs text-left leading-relaxed">
          <p className="mb-3 text-center">iPhone doesn't allow one-tap installs, but it only takes a few taps:</p>
          <ol className="border-cream-200 flex flex-col gap-2 rounded-2xl border bg-surface p-4 text-sm">
            <li>
              1. In Safari, tap the <b>•••</b> button (or the <b>Share</b> icon <span className="inline-block">⬆️</span> if you see
              it directly in the toolbar)
            </li>
            <li>
              2. Tap <b>Share</b> in the menu that opens
            </li>
            <li>
              3. Scroll down and tap <b>Add to Home Screen</b>
            </li>
            <li>4. Tap Add in the top-right</li>
          </ol>
        </div>
      ) : canInstallNatively ? (
        <>
          <p className="text-ink-600 mb-6 max-w-xs leading-relaxed">One tap and it's on your home screen like any other app.</p>
          <button
            onClick={handleInstallClick}
            className="bg-primary-500 hover:bg-primary-600 rounded-2xl px-8 py-3 font-bold text-white shadow-sm transition-colors"
          >
            Install app
          </button>
        </>
      ) : (
        <p className="text-ink-600 max-w-xs leading-relaxed">
          Look for "Add to Home Screen" or "Install App" in your browser's menu to add this app to your device.
        </p>
      )}
    </div>
  );
}
