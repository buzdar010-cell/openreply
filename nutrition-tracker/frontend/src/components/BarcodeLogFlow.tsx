import { useRef, useState } from 'react';
import { lookupBarcode, extractBarcodeLabel, logBarcodeDish, type BarcodeFound } from '../lib/api';
import { showToast } from '../lib/toast';
import { WhenField, toDatetimeLocalValue, datetimeLocalValueToUnix } from './WhenField';
import { BarcodeScanner } from './BarcodeScanner';

type Step =
  | { kind: 'scan' }
  | { kind: 'looking_up' }
  | { kind: 'found'; product: BarcodeFound }
  | { kind: 'not_found'; code: string }
  | { kind: 'extracting' }
  | { kind: 'unreadable' }
  | { kind: 'logged'; product: BarcodeFound };

function fileToBase64(file: File): Promise<{ base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      const mimeType = (dataUrl.match(/data:(.*?);/)?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Scan -> lookup (our cache -> Open Food Facts) -> if that misses, a label photo -> Gemini
 * extraction -> log. See app/src/index.ts's barcode handlers for the backend half of this
 * pipeline.
 *
 * Deliberately does not manage its own browser-history entry (no useDismissOnBack here) --
 * the parent AddLogSheet owns a single two-level history handler for itself plus this flow, so
 * `onClose` here is a plain callback, not something that also needs to pop history on its own.
 * See the comment in AddLogSheet.tsx for why nesting a second independent hook instance here
 * broke back-dismissal for both components at once.
 */
export function BarcodeLogFlow({ onClose, onLogged }: { onClose: () => void; onLogged: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'scan' });
  const [logging, setLogging] = useState(false);
  const [loggedAtInput, setLoggedAtInput] = useState(() => toDatetimeLocalValue(new Date()));
  const labelFileInputRef = useRef<HTMLInputElement>(null);
  const pendingCodeRef = useRef<string | null>(null);

  async function handleDetected(code: string) {
    setStep({ kind: 'looking_up' });
    try {
      const result = await lookupBarcode(code);
      setStep(result.found ? { kind: 'found', product: result } : { kind: 'not_found', code });
    } catch {
      showToast('Lookup failed — try again', 'error');
      setStep({ kind: 'scan' });
    }
  }

  async function handleLabelPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const code = pendingCodeRef.current;
    if (!file || !code) return;
    setStep({ kind: 'extracting' });
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const result = await extractBarcodeLabel(code, base64, mimeType);
      setStep(result.found ? { kind: 'found', product: result } : { kind: 'unreadable' });
    } catch {
      showToast("Couldn't read that — try again", 'error');
      setStep({ kind: 'not_found', code });
    }
  }

  async function handleLogIt(product: BarcodeFound) {
    setLogging(true);
    try {
      await logBarcodeDish(product.dishId, datetimeLocalValueToUnix(loggedAtInput));
      onLogged();
      showToast('Logged!');
      setStep({ kind: 'logged', product });
    } catch {
      showToast('Failed to log — try again', 'error');
    } finally {
      setLogging(false);
    }
  }

  if (step.kind === 'scan') {
    return <BarcodeScanner onDetected={handleDetected} onClose={onClose} />;
  }

  return (
    <div className="bg-cream-50 fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-ink-900 text-2xl font-extrabold">Scan barcode</h1>
        <button onClick={onClose} className="text-ink-400 text-2xl leading-none">
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-8">
        {step.kind === 'looking_up' && <div className="text-ink-400 py-12 text-center text-sm">Looking it up…</div>}
        {step.kind === 'extracting' && <div className="text-ink-400 py-12 text-center text-sm">Reading the label…</div>}

        {step.kind === 'not_found' && (
          <>
            <p className="text-ink-600 mb-4 text-sm">
              Couldn't identify that from the barcode alone — take a photo of the nutrition facts label instead and we'll read it.
            </p>
            <input
              ref={labelFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleLabelPhoto}
              className="hidden"
            />
            <button
              onClick={() => {
                pendingCodeRef.current = step.code;
                labelFileInputRef.current?.click();
              }}
              className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors"
            >
              📷 Photograph the label
            </button>
            <button
              onClick={() => setStep({ kind: 'scan' })}
              className="border-primary-100 text-primary-600 mt-3 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              Scan a different barcode
            </button>
          </>
        )}

        {step.kind === 'unreadable' && (
          <>
            <p className="text-ink-600 mb-4 text-sm">
              Couldn't read that label either — we've noted this product so we can add it. You can still log it by typing what
              it is in Food mode instead.
            </p>
            <button onClick={onClose} className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 font-bold text-white">
              Done
            </button>
          </>
        )}

        {step.kind === 'found' && (
          <>
            <div className="border-cream-200 rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-ink-900 font-bold">{step.product.name}</span>
                <span className="text-accent-600 font-bold">{Math.round(step.product.kcal)} kcal</span>
              </div>
              <div className="text-ink-600 mt-2 flex gap-4 text-xs">
                <span>{Math.round(step.product.protein_g)}g protein</span>
                <span>{Math.round(step.product.carbs_g)}g carbs</span>
                <span>{Math.round(step.product.fat_g)}g fat</span>
              </div>
              <div className="text-ink-400 mt-1 text-xs">per {Math.round(step.product.resolved_grams)}g serving</div>
            </div>

            <WhenField value={loggedAtInput} onChange={setLoggedAtInput} />

            <button
              onClick={() => handleLogIt(step.product)}
              disabled={logging}
              className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
            >
              {logging ? 'Logging…' : 'Log it'}
            </button>
          </>
        )}

        {step.kind === 'logged' && (
          <>
            <div className="border-cream-200 rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-ink-900 font-bold">{step.product.name}</span>
                <span className="text-accent-600 font-bold">{Math.round(step.product.kcal)} kcal</span>
              </div>
            </div>
            <button
              onClick={() => setStep({ kind: 'scan' })}
              className="border-primary-100 text-primary-600 mt-4 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              Scan another
            </button>
            <button onClick={onClose} className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-2xl py-4 font-bold text-white">
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
