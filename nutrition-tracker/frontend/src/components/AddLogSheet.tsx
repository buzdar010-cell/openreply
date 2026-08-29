import { useRef, useState } from 'react';
import { logText, logPhoto, logExercise, ACTIVITY_LABELS, type LogResultEntry, type ActivityType, type ExerciseLogResult } from '../lib/api';
import { showToast } from '../lib/toast';
import { useDismissOnBack } from '../lib/useDismissOnBack';

const EXAMPLES = ['chicken karahi and two rotis', 'one plate biryani', 'a bowl of daal chawal', '3 samosas'];
const ACTIVITY_OPTIONS = Object.entries(ACTIVITY_LABELS) as [ActivityType, string][];

/** datetime-local inputs work in the browser's local time, not UTC -- format/parse accordingly. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalValueToUnix(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

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

function WhenField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="border-cream-200 mb-3 flex items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-2">
      <span className="text-ink-600 text-xs font-semibold">🕐 When</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-ink-900 bg-transparent text-xs outline-none"
      />
    </label>
  );
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

export function AddLogSheet({ onClose, onLogged }: { onClose: () => void; onLogged: () => void }) {
  useDismissOnBack(onClose);

  const [mode, setMode] = useState<'food' | 'exercise'>('food');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LogResultEntry[] | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<{ base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [exerciseResult, setExerciseResult] = useState<ExerciseLogResult | null>(null);

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
        <h1 className="text-ink-900 text-2xl font-extrabold">{mode === 'food' ? 'Log food' : 'Log exercise'}</h1>
        <button onClick={onClose} className="text-ink-400 text-2xl leading-none">
          ×
        </button>
      </div>

      {!results && !exerciseResult && (
        <div className="border-cream-200 mx-5 mb-2 flex gap-1 rounded-xl border bg-surface p-1">
          <button
            onClick={() => setMode('food')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              mode === 'food' ? 'bg-primary-500 text-white' : 'text-ink-600'
            }`}
          >
            🍛 Food
          </button>
          <button
            onClick={() => setMode('exercise')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              mode === 'exercise' ? 'bg-primary-500 text-white' : 'text-ink-600'
            }`}
          >
            🏃 Exercise
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
            <p className="text-ink-400 mt-2 text-center text-xs">Snap what's on your plate — no need to type anything.</p>

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
    </div>
  );
}
