import { useEffect, useState } from 'react';
import {
  getTodayTotals,
  getProfile,
  getHomeContent,
  getWeightTrend,
  type Totals,
  type Profile,
  type TipItem,
  type ArticleSummary,
  type WeightTrend,
} from '../lib/api';
import { ArticleReader } from './ArticleReader';

const DEFAULT_TARGET_KCAL = 2000; // fallback when no profile/goal has been set yet
const MISSED_LOG_HOURS = 24; // matches the "after 1 missed day" reminder cadence

function Sparkline({ points }: { points: { weightKg: number; loggedAt: number }[] }) {
  const width = 280;
  const height = 48;
  const kgs = points.map((p) => p.weightKg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const range = max - min || 1; // avoid divide-by-zero when weight hasn't moved at all
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? (i / (points.length - 1)) * width : width / 2;
    const y = height - ((p.weightKg - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" preserveAspectRatio="none">
      <polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeightTrendCard({
  trend,
  onLogWeight,
  onGoToSettings,
}: {
  trend: WeightTrend;
  onLogWeight: () => void;
  onGoToSettings: () => void;
}) {
  if (trend.status === 'no_data') {
    return (
      <div className="border-cream-200 mb-6 rounded-2xl border bg-surface p-4">
        <div className="text-ink-900 text-sm font-bold">⚖️ Track your weight</div>
        <p className="text-ink-600 mt-1 text-xs leading-relaxed">
          Log your weight regularly to see your trend and get a nudge if it stops matching your goal.
        </p>
        <button onClick={onLogWeight} className="bg-primary-500 hover:bg-primary-600 mt-3 rounded-xl px-4 py-2 text-xs font-bold text-white">
          Log your weight
        </button>
      </div>
    );
  }

  const rate = trend.weeklyRateKg ?? 0;
  const rateLabel = `${rate > 0 ? '+' : ''}${rate.toFixed(1)} kg/week`;

  return (
    <div className="border-cream-200 mb-6 rounded-2xl border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-ink-900 text-2xl font-extrabold">{trend.latestWeightKg?.toFixed(1)}</span>
          <span className="text-ink-400 ml-1 text-xs font-semibold">kg</span>
        </div>
        <span className="text-ink-600 text-xs font-medium">{rateLabel}</span>
      </div>
      {trend.points.length > 1 && (
        <div className="text-primary-500 mt-2">
          <Sparkline points={trend.points} />
        </div>
      )}
      {trend.status === 'mismatch' && (
        <div className="bg-accent-50 mt-3 rounded-xl p-3">
          <p className="text-ink-700 text-xs leading-relaxed">
            Your trend doesn't quite match your goal's pace lately — might be worth rechecking your profile.
          </p>
          <button onClick={onGoToSettings} className="text-primary-600 mt-1 text-xs font-bold underline">
            Recheck goal in Settings
          </button>
        </div>
      )}
      <button onClick={onLogWeight} className="border-primary-100 text-primary-600 mt-3 rounded-xl border-2 px-4 py-2 text-xs font-bold">
        Log today's weight
      </button>
    </div>
  );
}

function ReminderBanner({ onLogWeight }: { onLogWeight: () => void }) {
  return (
    <div className="bg-accent-500 mb-4 flex items-center justify-between gap-3 rounded-2xl p-4 text-white">
      <div className="text-sm font-bold leading-snug">Haven't logged your weight in a while — worth a quick update?</div>
      <button onClick={onLogWeight} className="shrink-0 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-bold whitespace-nowrap">
        Log it
      </button>
    </div>
  );
}

function MacroCard({
  label,
  value,
  target,
  unit,
  barColor,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  barColor: string;
}) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="border-cream-200 rounded-2xl border bg-surface p-4 text-center">
      <div className="text-primary-600 text-xl font-extrabold">
        {Math.round(value)}
        <span className="text-ink-400 ml-1 text-xs font-semibold">{unit}</span>
      </div>
      <div className="text-ink-600 mt-1 text-xs font-medium">{label}</div>
      {target != null ? (
        <>
          <div className="bg-cream-200 mt-2 h-1.5 w-full overflow-hidden rounded-full">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-ink-400 mt-1 text-[10px]">
            of {target}
            {unit}
          </div>
        </>
      ) : (
        <div className="text-ink-400 mt-2 text-[10px]">set a goal for a target</div>
      )}
    </div>
  );
}

function levelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export function Home({
  refreshKey,
  onGoToSettings,
  onLogWeight,
}: {
  refreshKey: number;
  onGoToSettings: () => void;
  onLogWeight: () => void;
}) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState<TipItem[]>([]);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [weightTrend, setWeightTrend] = useState<WeightTrend | null>(null);
  const [showReminderBanner, setShowReminderBanner] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTodayTotals().catch(() => null), getProfile().catch(() => null)]).then(([t, p]) => {
      setTotals(t);
      setProfile(p);
      setLoading(false);
    });
    // Personalized, so it's refetched on the same triggers as totals/profile
    // (a fresh log can shift signals like "no recent exercise").
    getHomeContent()
      .then(({ tips: fetchedTips, articles: fetchedArticles }) => {
        setTips(fetchedTips);
        setArticles(fetchedArticles);
      })
      .catch(() => {});
    getWeightTrend()
      .then((trend) => {
        setWeightTrend(trend);
        const lastWeightLogAt = trend.points.at(-1)?.loggedAt ?? null;
        const hoursSinceLastWeightLog = lastWeightLogAt != null ? (Date.now() / 1000 - lastWeightLogAt) / 3600 : null;
        setShowReminderBanner(trend.status !== 'no_data' && (hoursSinceLastWeightLog ?? Infinity) >= MISSED_LOG_HOURS);
      })
      .catch(() => setWeightTrend(null));
  }, [refreshKey]);

  const baseTarget = profile?.daily_calorie_target ?? DEFAULT_TARGET_KCAL;
  const exerciseKcal = totals?.exercise_kcal ?? 0;
  const target = baseTarget + exerciseKcal;
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

      {showReminderBanner && <ReminderBanner onLogWeight={onLogWeight} />}

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
            {exerciseKcal > 0 && (
              <div className="text-primary-600 mt-2 text-xs font-medium">
                🏃 +{Math.round(exerciseKcal)} kcal from today's exercise, added to your {baseTarget} target
              </div>
            )}
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            <MacroCard label="Protein" value={totals?.protein_g ?? 0} target={profile?.protein_target_g ?? null} unit="g" barColor="bg-accent-500" />
            <MacroCard label="Carbs" value={totals?.carbs_g ?? 0} target={profile?.carbs_target_g ?? null} unit="g" barColor="bg-primary-500" />
            <MacroCard label="Fat" value={totals?.fat_g ?? 0} target={profile?.fat_target_g ?? null} unit="g" barColor="bg-accent-300" />
          </div>
        </>
      )}

      {weightTrend && <WeightTrendCard trend={weightTrend} onLogWeight={onLogWeight} onGoToSettings={onGoToSettings} />}

      {tips.length > 0 && (
        <>
          <h2 className="text-ink-900 mb-3 text-lg font-bold">Tips for you</h2>
          <div className="mb-6 flex flex-col gap-3">
            {tips.map((tip) => (
              <div key={tip.id} className="border-cream-200 flex gap-3 rounded-2xl border bg-surface p-4">
                <span className="text-2xl">{tip.emoji}</span>
                <div>
                  <div className="text-ink-900 text-sm font-bold">{tip.title}</div>
                  <div className="text-ink-600 mt-0.5 text-xs leading-relaxed">{tip.body}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {articles.length > 0 && (
        <>
          <h2 className="text-ink-900 mb-3 text-lg font-bold">Worth a read</h2>
          <div className="flex flex-col gap-3">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => setOpenArticleId(article.id)}
                className="border-cream-200 flex items-center gap-3 rounded-2xl border bg-surface p-4 text-left"
              >
                <span className="text-2xl">{article.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-ink-900 text-sm font-bold leading-snug">{article.title}</div>
                  <div className="text-ink-600 mt-0.5 text-xs leading-relaxed">{article.summary}</div>
                </div>
                <span className="text-ink-400 shrink-0 text-lg">›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {openArticleId && <ArticleReader articleId={openArticleId} onClose={() => setOpenArticleId(null)} />}
    </div>
  );
}
