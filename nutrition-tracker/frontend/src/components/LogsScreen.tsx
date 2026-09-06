import { useEffect, useState } from 'react';
import {
  deleteLog,
  getLogs,
  deleteExerciseLog,
  getExerciseLogs,
  deleteWeightLog,
  getWeightLogs,
  deleteWaterLog,
  getWaterLogs,
  ACTIVITY_LABELS,
  type LogListItem,
  type ExerciseLogItem,
  type WeightLogItem,
  type WaterLogItem,
  type ActivityType,
} from '../lib/api';
import { groupByDay, groupByMonth, logsToCsv, type DayGroup, type MonthGroup } from '../lib/dateGroups';
import { showToast } from '../lib/toast';

const WEEK_SECONDS = 7 * 86400;
const HISTORY_SECONDS = 180 * 86400; // ~6 months back for "view all"

type FeedItem =
  | { kind: 'food'; logged_at: number; data: LogListItem }
  | { kind: 'exercise'; logged_at: number; data: ExerciseLogItem }
  | { kind: 'weight'; logged_at: number; data: WeightLogItem }
  | { kind: 'water'; logged_at: number; data: WaterLogItem };

function mergeFeed(foodItems: LogListItem[], exerciseItems: ExerciseLogItem[], weightItems: WeightLogItem[], waterItems: WaterLogItem[]): FeedItem[] {
  const merged: FeedItem[] = [
    ...foodItems.map((data): FeedItem => ({ kind: 'food', logged_at: data.logged_at, data })),
    ...exerciseItems.map((data): FeedItem => ({ kind: 'exercise', logged_at: data.logged_at, data })),
    ...weightItems.map((data): FeedItem => ({ kind: 'weight', logged_at: data.logged_at, data })),
    ...waterItems.map((data): FeedItem => ({ kind: 'water', logged_at: data.logged_at, data })),
  ];
  return merged.sort((a, b) => b.logged_at - a.logged_at);
}

function FoodRow({ item, onDelete }: { item: LogListItem; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const label = item.free_text_description ?? item.dish_id.replace(/_/g, ' ');

  return (
    <div className="border-cream-200 rounded-xl border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-ink-900 truncate text-sm font-bold capitalize">
            {label} {item.quantity > 1 ? `× ${item.quantity}` : ''}
          </div>
          <div className="text-ink-400 text-xs">
            {Math.round(item.protein_g)}g P · {Math.round(item.carbs_g)}g C · {Math.round(item.fat_g)}g F
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-accent-600 text-sm font-bold">{Math.round(item.kcal)} kcal</span>
          {confirming ? (
            <div className="flex gap-1">
              <button onClick={onDelete} className="bg-danger-500 rounded-lg px-2 py-1 text-xs font-bold text-white">
                Delete
              </button>
              <button onClick={() => setConfirming(false)} className="text-ink-400 px-2 py-1 text-xs font-semibold">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-ink-400 text-lg leading-none">
              ⋯
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExerciseRow({ item, onDelete }: { item: ExerciseLogItem; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const label = ACTIVITY_LABELS[item.activity_type as ActivityType] ?? item.activity_type;

  return (
    <div className="border-cream-200 rounded-xl border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-ink-900 truncate text-sm font-bold">🏃 {label}</div>
          <div className="text-ink-400 text-xs">{item.duration_minutes} min</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-primary-600 text-sm font-bold">-{Math.round(item.calories_burned)} kcal</span>
          {confirming ? (
            <div className="flex gap-1">
              <button onClick={onDelete} className="bg-danger-500 rounded-lg px-2 py-1 text-xs font-bold text-white">
                Delete
              </button>
              <button onClick={() => setConfirming(false)} className="text-ink-400 px-2 py-1 text-xs font-semibold">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-ink-400 text-lg leading-none">
              ⋯
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WeightRow({ item, onDelete }: { item: WeightLogItem; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-cream-200 rounded-xl border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 text-ink-900 truncate text-sm font-bold">⚖️ Weight</div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-primary-600 text-sm font-bold">{item.weight_kg} kg</span>
          {confirming ? (
            <div className="flex gap-1">
              <button onClick={onDelete} className="bg-danger-500 rounded-lg px-2 py-1 text-xs font-bold text-white">
                Delete
              </button>
              <button onClick={() => setConfirming(false)} className="text-ink-400 px-2 py-1 text-xs font-semibold">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-ink-400 text-lg leading-none">
              ⋯
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WaterRow({ item, onDelete }: { item: WaterLogItem; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-cream-200 rounded-xl border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 text-ink-900 truncate text-sm font-bold">💧 Water</div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-primary-600 text-sm font-bold">{Math.round(item.amount_ml)}ml</span>
          {confirming ? (
            <div className="flex gap-1">
              <button onClick={onDelete} className="bg-danger-500 rounded-lg px-2 py-1 text-xs font-bold text-white">
                Delete
              </button>
              <button onClick={() => setConfirming(false)} className="text-ink-400 px-2 py-1 text-xs font-semibold">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-ink-400 text-lg leading-none">
              ⋯
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedRow({ item, onDelete }: { item: FeedItem; onDelete: (item: FeedItem) => void }) {
  switch (item.kind) {
    case 'food':
      return <FoodRow item={item.data} onDelete={() => onDelete(item)} />;
    case 'exercise':
      return <ExerciseRow item={item.data} onDelete={() => onDelete(item)} />;
    case 'weight':
      return <WeightRow item={item.data} onDelete={() => onDelete(item)} />;
    case 'water':
      return <WaterRow item={item.data} onDelete={() => onDelete(item)} />;
  }
}

function DaySection({ group, onDelete }: { group: DayGroup<FeedItem>; onDelete: (item: FeedItem) => void }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-ink-900 font-bold">{group.label}</h3>
        <span className="text-ink-400 text-xs">{Math.round(group.totalKcal)} kcal</span>
      </div>
      <div className="flex flex-col gap-2">
        {group.items.map((item) => (
          <FeedRow key={`${item.kind}-${item.data.id}`} item={item} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function MonthSection({ group, onDelete }: { group: MonthGroup<FeedItem>; onDelete: (item: FeedItem) => void }) {
  return (
    <div className="mb-5">
      <h3 className="text-ink-900 mb-2 font-bold">{group.label}</h3>
      <div className="flex flex-col gap-2">
        {group.items.map((item) => (
          <FeedRow key={`${item.kind}-${item.data.id}`} item={item} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

export function LogsScreen({ refreshKey }: { refreshKey: number }) {
  const [viewingAll, setViewingAll] = useState(false);
  const [foodItems, setFoodItems] = useState<LogListItem[]>([]);
  const [exerciseItems, setExerciseItems] = useState<ExerciseLogItem[]>([]);
  const [weightItems, setWeightItems] = useState<WeightLogItem[]>([]);
  const [waterItems, setWaterItems] = useState<WaterLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  function refetch(rangeStart: number, now: number) {
    getLogs(rangeStart, now).then(setFoodItems);
    getExerciseLogs(rangeStart, now).then(setExerciseItems);
    getWeightLogs(rangeStart, now).then(setWeightItems);
    getWaterLogs(rangeStart, now).then(setWaterItems);
  }

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const rangeStart = now - (viewingAll ? HISTORY_SECONDS : WEEK_SECONDS);
    setLoading(true);
    Promise.all([
      getLogs(rangeStart, now).catch(() => []),
      getExerciseLogs(rangeStart, now).catch(() => []),
      getWeightLogs(rangeStart, now).catch(() => []),
      getWaterLogs(rangeStart, now).catch(() => []),
    ])
      .then(([food, exercise, weight, water]) => {
        setFoodItems(food);
        setExerciseItems(exercise);
        setWeightItems(weight);
        setWaterItems(water);
      })
      .finally(() => setLoading(false));
  }, [refreshKey, viewingAll]);

  async function handleDelete(item: FeedItem) {
    // optimistic
    if (item.kind === 'food') setFoodItems((prev) => prev.filter((i) => i.id !== item.data.id));
    else if (item.kind === 'exercise') setExerciseItems((prev) => prev.filter((i) => i.id !== item.data.id));
    else if (item.kind === 'weight') setWeightItems((prev) => prev.filter((i) => i.id !== item.data.id));
    else setWaterItems((prev) => prev.filter((i) => i.id !== item.data.id));

    try {
      if (item.kind === 'food') await deleteLog(item.data.id);
      else if (item.kind === 'exercise') await deleteExerciseLog(item.data.id);
      else if (item.kind === 'weight') await deleteWeightLog(item.data.id);
      else await deleteWaterLog(item.data.id);
      showToast('Deleted');
    } catch {
      showToast('Failed to delete — try again', 'error');
      // Re-fetch on failure to correct any optimistic-update drift.
      const now = Math.floor(Date.now() / 1000);
      const rangeStart = now - (viewingAll ? HISTORY_SECONDS : WEEK_SECONDS);
      refetch(rangeStart, now);
    }
  }

  function handleExport() {
    const csv = logsToCsv(foodItems);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-log-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const feed = mergeFeed(foodItems, exerciseItems, weightItems, waterItems);
  const kcalOf = (item: FeedItem) => (item.kind === 'food' ? item.data.kcal : 0);
  const dayGroups = viewingAll ? [] : groupByDay(feed, kcalOf);
  const monthGroups = viewingAll ? groupByMonth(feed) : [];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pt-8 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-ink-900 text-2xl font-extrabold">{viewingAll ? 'All logs' : 'This week'}</h1>
        {viewingAll ? (
          <div className="flex gap-2">
            <button onClick={handleExport} className="text-primary-600 text-sm font-semibold">
              Export
            </button>
            <button onClick={() => setViewingAll(false)} className="text-ink-400 text-sm font-semibold">
              Back
            </button>
          </div>
        ) : (
          <button onClick={() => setViewingAll(true)} className="text-primary-600 text-sm font-semibold">
            View all logs
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-ink-400 py-12 text-center text-sm">Loading…</div>
      ) : feed.length === 0 ? (
        <div className="text-ink-400 py-12 text-center text-sm">Nothing logged yet — tap the + button to add your first meal.</div>
      ) : viewingAll ? (
        monthGroups.map((group) => <MonthSection key={group.monthKey} group={group} onDelete={handleDelete} />)
      ) : (
        dayGroups.map((group) => <DaySection key={group.dateKey} group={group} onDelete={handleDelete} />)
      )}
    </div>
  );
}
