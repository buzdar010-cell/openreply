import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Live camera barcode scanning, via a pure-JS decoder rather than the
 * browser's native BarcodeDetector API -- that API doesn't exist on iOS
 * Safari, and iOS users are a real chunk of this app's usage. Manual entry
 * is always shown alongside the camera view too, not just as an error
 * fallback: camera permission gets denied, barcodes get damaged, lighting
 * is bad -- typing the number should never be a dead end.
 *
 * Deliberately does NOT call useDismissOnBack itself -- this is one step
 * inside BarcodeLogFlow, which owns the single history entry for the whole
 * flow. This component gets swapped out for other step UI on a plain state
 * change (not a user-driven close), and unmounting it would otherwise pop
 * that shared history entry and fire a popstate that cascades up through
 * every ancestor overlay's own listener, closing all of them at once.
 */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let detected = false;
    let controls: { stop: () => void } | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, ctrl) => {
        controls = ctrl;
        if (cancelled || detected || !result) return;
        detected = true;
        ctrl.stop();
        onDetected(result.getText());
      })
      .catch(() => {
        if (!cancelled) setCameraError("Camera unavailable — enter the barcode number below instead.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-cream-50 fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-ink-900 text-2xl font-extrabold">Scan barcode</h1>
        <button onClick={onClose} className="text-ink-400 text-2xl leading-none">
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-8">
        {cameraError ? (
          <div className="bg-danger-500/10 text-danger-500 mb-4 rounded-xl px-4 py-3 text-sm font-medium">{cameraError}</div>
        ) : (
          <div className="border-cream-200 mb-4 overflow-hidden rounded-2xl border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          </div>
        )}

        <p className="text-ink-600 mb-2 text-sm">Point the camera at the barcode, or type the number:</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 8964000123456"
            className="border-primary-100 focus:border-primary-500 text-ink-900 min-w-0 flex-1 rounded-xl border-2 bg-surface px-3 py-2.5 text-base outline-none"
          />
          <button
            onClick={() => manualCode && onDetected(manualCode)}
            disabled={!manualCode}
            className="bg-primary-500 hover:bg-primary-600 shrink-0 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            Look up
          </button>
        </div>
      </div>
    </div>
  );
}
