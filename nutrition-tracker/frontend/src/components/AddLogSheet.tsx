import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { logText, logPhoto, logExercise, logWeight, logWater, ACTIVITY_LABELS, type LogResultEntry, type ActivityType, type ExerciseLogResult } from '../lib/api';
import { showToast } from '../lib/toast';
import { WhenField, toDatetimeLocalValue, datetimeLocalValueToUnix } from './WhenField';

// The barcode scanning library is ~200KB gzipped on its own -- code-split so
// that weight only loads for someone who actually taps "Scan a barcode",
// not on every visit to the app.
const BarcodeLogFlow = lazy(() => import('./BarcodeLogFlow').then((m) => ({ default: m.BarcodeLogFlow })));

const EXAMPLES = ['chicken karahi and two rotis', 'one plate biryani', 'a bowl of daal chawal', '3 samosas'];
const ACTIVITY_OPTIONS = Object.entries(ACTIVITY_LABELS) as [ActivityType, string][];
const WATER_QUICK_AMOUNTS_ML = [250, 500, 750, 1000];

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

function ResultCard({ r }: { r: LogResultEntry }) {
  return (
    <div className="border-cream-200 rounded-2xl border bg-surface p-4">
      {r.matched ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-ink-900 font-bold capitalize">
              {r.dishId?.replace(/_/g, ' ')} {r.quantity && r.quantity > 1 ? `× ${r.quantity}` : ''}
            </span>
            <span className="text-accent-600 font-bold">{Math.round(r.kcal ?? 0)} kcal</span>
          </div>
          {r.confidence === 'low' && <span className="text-ink-400 mt-1 block text-xs">Not 100% sure — check it in Logs</span>}
          <div className="text-ink-600 mt-2 flex gap-4 text-xs">
            <span>{Math.round(r.protein_g ?? 0)}g protein</span>
            <span>{Math.round(r.carbs_g ?? 0)}g carbs</span>
            <span>{Math.round(r.fat_g ?? 0)}g fat</span>
          </div>
        </>
      ) : (
        <div>
          <span className="text-ink-900 font-bold">Couldn't match that one</span>
          <p className="text-ink-600 mt-1 text-sm">"{r.description}" isn't in our database yet — we've noted it so we can add it.</p>
        </div>
      )}
    </div>
  );
}

export function AddLogSheet({
  onClose,
  onLogged,
  initialMode = 'food',
}: {
  onClose: () => void;
  onLogged: () => void;
  initialMode?: 'food' | 'exercise' | 'weight' | 'water';
}) {
  const [mode, setMode] = useState<'food' | 'exercise' | 'weight' | 'water'>(initialMode);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LogResultEntry[] | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<{ base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBarcodeFlow, setShowBarcodeFlow] = useState(false);

  // Two-level history handling, same pattern as SettingsScreen's sub-screens: this sheet pushes
  // one entry for itself on mount, and the barcode flow (a sub-view *within* this already-open
  // sheet) pushes one more on top when opened. A single popstate listener is the only thing that
  // ever changes showBarcodeFlow/closes the sheet -- both the barcode flow's own close button and
  // a real back gesture route through history.back() into this same listener, so history and UI
  // state can never drift apart. Two independent useDismissOnBack hooks here (one per component)
  // would each try to pop their own entry on close, and closing the inner one would cascade a
  // history.back() into the outer listener too, closing both at once -- that bug shipped once
  // before this comment was added; see BarcodeScanner.tsx for the other half of the fix.
  const showBarcodeFlowRef = useRef(showBarcodeFlow);
  useEffect(() => {
    showBarcodeFlowRef.current = showBarcodeFlow;
  }, [showBarcodeFlow]);
  // Tracks whether the sheet's own entry was already consumed by a real popstate (browser/swipe
  // back) -- if so, the cleanup below must NOT pop again, or a close-via-back would remove two
  // history entries for what was only one physical back-navigation (verified: without this guard,
  // going back once from the barcode flow, then back again, skipped past the app's own base state
  // entirely). Same guard the original useDismissOnBack hook uses, for the same reason.
  const closedByPopStateRef = useRef(false);

  useEffect(() => {
    closedByPopStateRef.current = false;
    window.history.pushState({ addLogSheet: true }, '');
    function handlePopState() {
      if (showBarcodeFlowRef.current) {
        setShowBarcodeFlow(false);
      } else {
        closedByPopStateRef.current = true;
        onClose();
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (showBarcodeFlowRef.current) window.history.back();
      if (!closedByPopStateRef.current) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openBarcodeFlow() {
    window.history.pushState({ addLogSheet: true, barcode: true }, '');
    setShowBarcodeFlow(true);
  }

  function closeBarcodeFlow() {
    window.history.back(); // routes through handlePopState above, which sets showBarcodeFlow(false)
  }

  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [exerciseResult, setExerciseResult] = useState<ExerciseLogResult | null>(null);

  const [weightKgInput, setWeightKgInput] = useState('');
  const [weightResult, setWeightResult] = useState<{ weightKg: number } | null>(null);

  const [waterMlInput, setWaterMlInput] = useState('');
  const [waterResult, setWaterResult] = useState<{ amountMl: number } | null>(null);

  // Defaults to right now -- only touched when backdating a forgotten meal/workout.
  const [loggedAtInput, setLoggedAtInput] = useState(() => toDatetimeLocalValue(new Date()));
  const loggedAtUnix = datetimeLocalValueToUnix(loggedAtInput);

  async function submitText() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await logText(text.trim(), loggedAtUnix);
      setResults(res);
      setText('');
      setLoggedAtInput(toDatetimeLocalValue(new Date())); // don't let a backdated time silently carry over to the next entry
      onLogged();
      if (res.some((r) => r.matched)) showToast('Logged!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function submitPhoto() {
    if (!photoFile) return;
    setLoading(true);
    setError(null);
    try {
      const res = await logPhoto(photoFile.base64, photoFile.mimeType, text.trim() || undefined, loggedAtUnix);
      setResults(res);
      setPhotoFile(null);
      setPhotoPreview(null);
      setText('');
      setLoggedAtInput(toDatetimeLocalValue(new Date()));
      onLogged();
      if (res.some((r) => r.matched)) showToast('Logged!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function submitExercise() {
    const minutes = Number(durationMinutes);
    if (!activityType || !minutes || minutes <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await logExercise(activityType, minutes, loggedAtUnix);
      setExerciseResult(res);
      setActivityType(null);
      setDurationMinutes('');
      setLoggedAtInput(toDatetimeLocalValue(new Date()));
      onLogged();
      showToast('Logged!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function submitWeight() {
    const kg = Number(weightKgInput);
    if (!kg || kg <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await logWeight(kg, loggedAtUnix);
      setWeightResult({ weightKg: res.weightKg });
      setWeightKgInput('');
      setLoggedAtInput(toDatetimeLocalValue(new Date()));
      onLogged();
      showToast('Logged!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function submitWater(amountMl: number) {
    if (!amountMl || amountMl <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await logWater(amountMl, loggedAtUnix);
      setWaterResult({ amountMl: res.amountMl });
      setWaterMlInput('');
      setLoggedAtInput(toDatetimeLocalValue(new Date()));
      onLogged();
      showToast('Logged!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { base64, mimeType } = await fileToBase64(file);
    setPhotoFile({ base64, mimeType });
    setPhotoPreview(URL.createObjectURL(file));
  }

  return (
    <div className="bg-cream-50 fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <h1 className="text-ink-900 text-2xl font-extrabold">
          {mode === 'food' ? 'Log food' : mode === 'exercise' ? 'Log exercise' : mode === 'weight' ? 'Log weight' : 'Log water'}
        </h1>
        <button onClick={onClose} className="text-ink-400 text-2xl leading-none">
          ×
        </button>
      </div>

      {!results && !exerciseResult && !weightResult && !waterResult && (
        <div className="border-cream-200 mx-5 mb-2 grid grid-cols-4 gap-1 rounded-xl border bg-surface p-1">
          <button
            onClick={() => setMode('food')}
            className={`rounded-lg py-2 text-xs font-bold transition-colors ${mode === 'food' ? 'bg-primary-500 text-white' : 'text-ink-600'}`}
          >
            🍛 Food
          </button>
          <button
            onClick={() => setMode('exercise')}
            className={`rounded-lg py-2 text-xs font-bold transition-colors ${mode === 'exercise' ? 'bg-primary-500 text-white' : 'text-ink-600'}`}
          >
            🏃 Exercise
          </button>
          <button
            onClick={() => setMode('weight')}
            className={`rounded-lg py-2 text-xs font-bold transition-colors ${mode === 'weight' ? 'bg-primary-500 text-white' : 'text-ink-600'}`}
          >
            ⚖️ Weight
          </button>
          <button
            onClick={() => setMode('water')}
            className={`rounded-lg py-2 text-xs font-bold transition-colors ${mode === 'water' ? 'bg-primary-500 text-white' : 'text-ink-600'}`}
          >
            💧 Water
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col px-5 pb-8">
        {!results && mode === 'food' && (
          <>
            <p className="text-ink-600 mb-3 text-sm">
              Describe what you ate in your own words — dish name, quantity, or ingredients all work.
            </p>

            <div className="mb-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setText(ex)}
                  className="bg-primary-50 text-primary-600 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  {ex}
                </button>
              ))}
            </div>

            {photoPreview ? (
              <div className="mb-3">
                <img src={photoPreview} alt="Selected food" className="mb-2 max-h-48 w-full rounded-2xl object-cover" />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Optional caption (e.g. 'large portion')"
                  className="border-primary-100 focus:border-primary-500 text-ink-900 w-full rounded-xl border-2 bg-surface px-3 py-2 text-sm outline-none"
                />
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='e.g. "chicken karahi and two rotis"'
                rows={3}
                className="border-primary-100 focus:border-primary-500 text-ink-900 mb-3 resize-none rounded-2xl border-2 bg-surface p-4 text-base outline-none placeholder:text-ink-400/60"
              />
            )}

            <WhenField value={loggedAtInput} onChange={setLoggedAtInput} />

            <button
              onClick={photoFile ? submitPhoto : submitText}
              disabled={loading || (!text.trim() && !photoFile)}
              className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
            >
              {loading ? 'Logging…' : 'Log it'}
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="bg-cream-200 h-px flex-1" />
              <span className="text-ink-400 text-xs font-semibold">OR</span>
              <div className="bg-cream-200 h-px flex-1" />
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border-primary-100 text-primary-600 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              📷 {photoPreview ? 'Retake photo' : 'Log from a photo instead'}
            </button>
            <p className="text-ink-400 mt-2 mb-4 text-center text-xs">Snap what's on your plate — no need to type anything.</p>

            <button
              onClick={openBarcodeFlow}
              className="border-primary-100 text-primary-600 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              🔍 Scan a barcode
            </button>
            <p className="text-ink-400 mt-2 text-center text-xs">For packaged/branded foods and drinks.</p>

            {error && <div className="bg-danger-500/10 text-danger-500 mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
          </>
        )}

        {!exerciseResult && mode === 'exercise' && (
          <>
            <p className="text-ink-600 mb-3 text-sm">What did you do, and for how long?</p>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {ACTIVITY_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setActivityType(value)}
                  className={`rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition-colors ${
                    activityType === value ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-cream-200 bg-surface text-ink-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              type="number"
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="Duration in minutes, e.g. 30"
              className="border-primary-100 focus:border-primary-500 text-ink-900 mb-3 w-full rounded-xl border-2 bg-surface px-3 py-2.5 text-base outline-none"
            />

            <WhenField value={loggedAtInput} onChange={setLoggedAtInput} />

            <button
              onClick={submitExercise}
              disabled={loading || !activityType || !Number(durationMinutes)}
              className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
            >
              {loading ? 'Logging…' : 'Log it'}
            </button>

            {error && <div className="bg-danger-500/10 text-danger-500 mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
          </>
        )}

        {!weightResult && mode === 'weight' && (
          <>
            <p className="text-ink-600 mb-3 text-sm">What's your weight today?</p>

            <input
              type="number"
              inputMode="decimal"
              value={weightKgInput}
              onChange={(e) => setWeightKgInput(e.target.value)}
              placeholder="Weight in kg, e.g. 70.5"
              className="border-primary-100 focus:border-primary-500 text-ink-900 mb-3 w-full rounded-xl border-2 bg-surface px-3 py-2.5 text-base outline-none"
            />

            <WhenField value={loggedAtInput} onChange={setLoggedAtInput} />

            <button
              onClick={submitWeight}
              disabled={loading || !Number(weightKgInput)}
              className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
            >
              {loading ? 'Logging…' : 'Log it'}
            </button>

            {error && <div className="bg-danger-500/10 text-danger-500 mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
          </>
        )}

        {!waterResult && mode === 'water' && (
          <>
            <p className="text-ink-600 mb-3 text-sm">How much did you drink?</p>

            <div className="mb-4 grid grid-cols-4 gap-2">
              {WATER_QUICK_AMOUNTS_ML.map((ml) => (
                <button
                  key={ml}
                  onClick={() => submitWater(ml)}
                  disabled={loading}
                  className="border-primary-100 text-primary-600 rounded-xl border-2 py-3 text-center text-sm font-bold disabled:opacity-40"
                >
                  {ml}ml
                </button>
              ))}
            </div>

            <input
              type="number"
              inputMode="numeric"
              value={waterMlInput}
              onChange={(e) => setWaterMlInput(e.target.value)}
              placeholder="Custom amount in ml"
              className="border-primary-100 focus:border-primary-500 text-ink-900 mb-3 w-full rounded-xl border-2 bg-surface px-3 py-2.5 text-base outline-none"
            />

            <WhenField value={loggedAtInput} onChange={setLoggedAtInput} />

            <button
              onClick={() => submitWater(Number(waterMlInput))}
              disabled={loading || !Number(waterMlInput)}
              className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
            >
              {loading ? 'Logging…' : 'Log custom amount'}
            </button>

            {error && <div className="bg-danger-500/10 text-danger-500 mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
          </>
        )}

        {exerciseResult && (
          <>
            <div className="border-cream-200 rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-ink-900 font-bold">{ACTIVITY_LABELS[exerciseResult.activityType]}</span>
                <span className="text-primary-600 font-bold">-{exerciseResult.caloriesBurned} kcal</span>
              </div>
              <div className="text-ink-600 mt-1 text-xs">{exerciseResult.durationMinutes} minutes</div>
            </div>
            <button
              onClick={() => setExerciseResult(null)}
              className="border-primary-100 text-primary-600 mt-4 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              Log something else
            </button>
            <button onClick={onClose} className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-2xl py-4 font-bold text-white">
              Done
            </button>
          </>
        )}

        {weightResult && (
          <>
            <div className="border-cream-200 rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-ink-900 font-bold">Weight logged</span>
                <span className="text-primary-600 font-bold">{weightResult.weightKg} kg</span>
              </div>
            </div>
            <button
              onClick={() => setWeightResult(null)}
              className="border-primary-100 text-primary-600 mt-4 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              Log something else
            </button>
            <button onClick={onClose} className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-2xl py-4 font-bold text-white">
              Done
            </button>
          </>
        )}

        {waterResult && (
          <>
            <div className="border-cream-200 rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-ink-900 font-bold">Water logged</span>
                <span className="text-primary-600 font-bold">{waterResult.amountMl}ml</span>
              </div>
            </div>
            <button
              onClick={() => setWaterResult(null)}
              className="border-primary-100 text-primary-600 mt-4 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              Log something else
            </button>
            <button onClick={onClose} className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-2xl py-4 font-bold text-white">
              Done
            </button>
          </>
        )}

        {results && (
          <>
            <div className="flex flex-col gap-3">
              {results.map((r, i) => (
                <ResultCard key={i} r={r} />
              ))}
            </div>
            <button
              onClick={() => setResults(null)}
              className="border-primary-100 text-primary-600 mt-4 rounded-2xl border-2 py-3 text-sm font-bold"
            >
              Log something else
            </button>
            <button onClick={onClose} className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-2xl py-4 font-bold text-white">
              Done
            </button>
          </>
        )}
      </div>

      {showBarcodeFlow && (
        <Suspense fallback={<div className="bg-cream-50 fixed inset-0 z-50 flex items-center justify-center text-sm text-ink-400">Loading…</div>}>
          <BarcodeLogFlow onClose={closeBarcodeFlow} onLogged={onLogged} />
        </Suspense>
      )}
    </div>
  );
}
