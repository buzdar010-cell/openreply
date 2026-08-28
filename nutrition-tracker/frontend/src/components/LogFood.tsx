import { useState } from 'react';
import { getDeviceId } from '../lib/device';
import { logText, type LogResultEntry } from '../lib/api';

export function LogFood({ onLogged }: { onLogged: () => void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LogResultEntry[] | null>(null);

  async function submit() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await logText(getDeviceId(), text.trim());
      setResults(res);
      setText('');
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-8 pb-4">
      <h1 className="text-ink-900 mb-1 text-2xl font-extrabold">What did you eat?</h1>
      <p className="text-ink-600 mb-6 text-sm">Describe it in your own words.</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "chicken karahi and two rotis"'
        rows={3}
        className="border-primary-100 focus:border-primary-500 text-ink-900 resize-none rounded-2xl border-2 bg-white p-4 text-base outline-none placeholder:text-gray-400"
      />

      <button
        onClick={submit}
        disabled={loading || !text.trim()}
        className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
      >
        {loading ? 'Logging…' : 'Log it'}
      </button>

      {error && (
        <div className="bg-danger-500/10 text-danger-500 mt-4 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>
      )}

      {results && (
        <div className="mt-6 flex flex-col gap-3">
          {results.map((r, i) => (
            <div key={i} className="border-cream-200 rounded-2xl border bg-white p-4">
              {r.matched ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-900 font-bold capitalize">
                      {r.dishId?.replace(/_/g, ' ')} {r.quantity && r.quantity > 1 ? `× ${r.quantity}` : ''}
                    </span>
                    <span className="text-accent-600 font-bold">{Math.round(r.kcal ?? 0)} kcal</span>
                  </div>
                  {r.confidence === 'low' && (
                    <span className="text-ink-400 mt-1 block text-xs">Not 100% sure — tap to confirm (coming soon)</span>
                  )}
                  <div className="text-ink-600 mt-2 flex gap-4 text-xs">
                    <span>{Math.round(r.protein_g ?? 0)}g protein</span>
                    <span>{Math.round(r.carbs_g ?? 0)}g carbs</span>
                    <span>{Math.round(r.fat_g ?? 0)}g fat</span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-ink-900 font-bold">Couldn't match that one</span>
                  <p className="text-ink-600 mt-1 text-sm">
                    "{r.description}" isn't in our database yet — we've noted it so we can add it.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
