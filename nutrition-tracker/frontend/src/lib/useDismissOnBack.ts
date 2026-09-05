import { useEffect, useRef } from 'react';

/**
 * Makes a full-screen overlay (a sheet/reader mounted by its parent, closed
 * via its own X/Done button) dismissible by the browser/iOS swipe-back
 * gesture too, not just its own close button -- same gap and same fix as
 * Settings' sub-screens, generalized: without this, opening the sheet never
 * touches window.history, so there's nothing for the OS gesture to act on.
 *
 * Pushes one history entry on mount. A back-navigation (gesture, hardware
 * back, or programmatic) fires popstate and calls `onClose`. If the sheet
 * closes some other way instead (its own button), the pushed entry is
 * popped on unmount so history never drifts out of sync with the screen.
 *
 * Note: React StrictMode's dev-only double-invoke of this effect (mount,
 * simulated cleanup, real mount) can make a stray popstate fire during
 * local `npm run dev` testing, since the cleanup's history.back() call is
 * asynchronous and can resolve after the second mount is already listening.
 * This never happens in a production build (StrictMode's double-invoke is
 * dev-only) -- verified directly against a production build rather than
 * the dev server for that reason.
 */
export function useDismissOnBack(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const closedByPopStateRef = useRef(false);

  useEffect(() => {
    closedByPopStateRef.current = false;
    window.history.pushState({ overlay: true }, '');
    function handlePopState() {
      closedByPopStateRef.current = true;
      onCloseRef.current();
    }
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!closedByPopStateRef.current) window.history.back();
    };
  }, []);
}
