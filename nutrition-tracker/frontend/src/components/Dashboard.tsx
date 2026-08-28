import { useEffect, useState } from 'react';
import { getDeviceId } from '../lib/device';
import { getTodayTotals, type Totals } from '../lib/api';

const DAILY_TARGET_KCAL = 2000; // placeholder until real per-user goals exist

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="border-cream-200 rounded-2xl border bg-white p-4 text-center">
      <div className="text-primary-600 text-xl font-extrabold">
        {Math.round(value)}
        <span className="text-ink-400 ml-1 text-xs font-semibold">{unit}</span>
      </div>
      <div className="text-ink-600 mt-1 text-xs font-medium">{label}</div>
    </div>
  );
}

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTodayTotals(getDeviceId())
      .then(setTotals)
      .catch(() => setTotals(null))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const pct = totals ? Math.min(100, Math.round((totals.kcal / DAILY_TARGET_KCAL) * 100)) : 0;

  return (
    <div className="flex flex-1 flex-col px-5 pt-8 pb-4">
      <h1 className="text-ink-900 mb-1 text-2xl font-extrabold">Today</h1>
      <p className="text-ink-600 mb-6 text-sm">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {loading ? (
        <div className="text-ink-400 py-12 text-center text-sm">Loading…</div>
      ) : (
        <>
          <div className="border-cream-200 mb-4 rounded-2xl border bg-white p-6">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-ink-900 text-3xl font-extrabold">{Math.round(totals?.kcal ?? 0)}</span>
              <span className="text-ink-400 text-sm">of {DAILY_TARGET_KCAL} kcal</span>
            </div>
            <div className="bg-cream-200 h-3 w-full overflow-hidden rounded-full">
              <div className="bg-accent-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Protein" value={totals?.protein_g ?? 0} unit="g" />
            <StatCard label="Carbs" value={totals?.carbs_g ?? 0} unit="g" />
            <StatCard label="Fat" value={totals?.fat_g ?? 0} unit="g" />
          </div>
        </>
      )}
    </div>
  );
}
