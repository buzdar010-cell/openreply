import { useEffect, useState } from 'react';
import { getTodayTotals, getProfile, type Totals, type Profile } from '../lib/api';

const DEFAULT_TARGET_KCAL = 2000; // fallback when no profile/goal has been set yet

const TIPS = [
  { emoji: '🧂', title: 'Watch the salt', body: 'Nihari and biryani both run high in sodium — pair with plain daal or salad to balance the day out.' },
  { emoji: '🍗', title: 'Protein swap', body: 'Swapping chicken thigh for breast in karahi cuts fat while keeping protein about the same.' },
  { emoji: '🫓', title: 'Roti vs naan', body: 'A plain roti has roughly a third of the calories of a butter naan — an easy swap that adds up over a week.' },
];

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="border-cream-200 rounded-2xl border bg-surface p-4 text-center">
      <div className="text-primary-600 text-xl font-extrabold">
        {Math.round(value)}
        <span className="text-ink-400 ml-1 text-xs font-semibold">{unit}</span>
      </div>
      <div className="text-ink-600 mt-1 text-xs font-medium">{label}</div>
    </div>
  );
}

function levelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export function Home({ refreshKey }: { refreshKey: number }) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTodayTotals().catch(() => null), getProfile().catch(() => null)]).then(([t, p]) => {
      setTotals(t);
      setProfile(p);
      setLoading(false);
    });
  }, [refreshKey]);

  const target = profile?.daily_calorie_target ?? DEFAULT_TARGET_KCAL;
  const pct = totals ? Math.min(100, Math.round((totals.kcal / target) * 100)) : 0;
  const showGamification = profile?.gamification_enabled === 1;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pt-8 pb-24">
      {showGamification && (
        <div className="bg-primary-500 mb-4 flex items-center justify-between rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <div>
              <div className="text-lg font-extrabold leading-none">{profile?.current_streak ?? 0}-day streak</div>
              <div className="text-xs opacity-80">Longest: {profile?.longest_streak ?? 0} days</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold leading-none">Lvl {levelFromXp(profile?.xp ?? 0)}</div>
            <div className="text-xs opacity-80">{(profile?.xp ?? 0) % 100} / 100 XP</div>
          </div>
        </div>
      )}

      <h1 className="text-ink-900 mb-1 text-2xl font-extrabold">Today</h1>
      <p className="text-ink-600 mb-4 text-sm">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {loading ? (
        <div className="text-ink-400 py-8 text-center text-sm">Loading…</div>
      ) : (
        <>
          <div className="border-cream-200 mb-4 rounded-2xl border bg-surface p-6">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-ink-900 text-3xl font-extrabold">{Math.round(totals?.kcal ?? 0)}</span>
              <span className="text-ink-400 text-sm">of {target} kcal</span>
            </div>
            <div className="bg-cream-200 h-3 w-full overflow-hidden rounded-full">
              <div className="bg-accent-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            <StatCard label="Protein" value={totals?.protein_g ?? 0} unit="g" />
            <StatCard label="Carbs" value={totals?.carbs_g ?? 0} unit="g" />
            <StatCard label="Fat" value={totals?.fat_g ?? 0} unit="g" />
          </div>
        </>
      )}

      <h2 className="text-ink-900 mb-3 text-lg font-bold">Tips for you</h2>
      <div className="flex flex-col gap-3">
        {TIPS.map((tip) => (
          <div key={tip.title} className="border-cream-200 flex gap-3 rounded-2xl border bg-surface p-4">
            <span className="text-2xl">{tip.emoji}</span>
            <div>
              <div className="text-ink-900 text-sm font-bold">{tip.title}</div>
              <div className="text-ink-600 mt-0.5 text-xs leading-relaxed">{tip.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
