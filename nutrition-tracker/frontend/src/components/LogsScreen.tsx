import { useEffect, useState } from 'react';
import { getDeviceId } from '../lib/device';
import { deleteLog, getLogs, type LogListItem } from '../lib/api';
import { groupByDay, groupByMonth, logsToCsv, type DayGroup, type MonthGroup } from '../lib/dateGroups';

const WEEK_SECONDS = 7 * 86400;
const HISTORY_SECONDS = 180 * 86400; // ~6 months back for "view all"

function LogRow({ item, onDelete }: { item: LogListItem; onDelete: (id: string) => void }) {
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
              <button
                onClick={() => onDelete(item.id)}
                className="bg-danger-500 rounded-lg px-2 py-1 text-xs font-bold text-white"
              >
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

function DaySection({ group, onDelete }: { group: DayGroup; onDelete: (id: string) => void }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-ink-900 font-bold">{group.label}</h3>
        <span className="text-ink-400 text-xs">{Math.round(group.totalKcal)} kcal</span>
      </div>
      <div className="flex flex-col gap-2">
        {group.items.map((item) => (
          <LogRow key={item.id} item={item} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function MonthSection({ group, onDelete }: { group: MonthGroup; onDelete: (id: string) => void }) {
  return (
    <div className="mb-5">
      <h3 className="text-ink-900 mb-2 font-bold">{group.label}</h3>
      <div className="flex flex-col gap-2">
        {group.items.map((item) => (
          <LogRow key={item.id} item={item} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

export function LogsScreen({ refreshKey }: { refreshKey: number }) {
  const [viewingAll, setViewingAll] = useState(false);
  const [items, setItems] = useState<LogListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const deviceId = getDeviceId();
    const now = Math.floor(Date.now() / 1000);
    const rangeStart = now - (viewingAll ? HISTORY_SECONDS : WEEK_SECONDS);
    setLoading(true);
    getLogs(deviceId, rangeStart, now)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [refreshKey, viewingAll]);

  async function handleDelete(logId: string) {
    setItems((prev) => prev.filter((i) => i.id !== logId)); // optimistic
    try {
      await deleteLog(getDeviceId(), logId);
    } catch {
      // Re-fetch on failure to correct any optimistic-update drift.
      const deviceId = getDeviceId();
      const now = Math.floor(Date.now() / 1000);
      getLogs(deviceId, now - (viewingAll ? HISTORY_SECONDS : WEEK_SECONDS), now).then(setItems);
    }
  }

  function handleExport() {
    const csv = logsToCsv(items);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-log-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dayGroups = viewingAll ? [] : groupByDay(items);
  const monthGroups = viewingAll ? groupByMonth(items) : [];

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
      ) : items.length === 0 ? (
        <div className="text-ink-400 py-12 text-center text-sm">Nothing logged yet — tap the + button to add your first meal.</div>
      ) : viewingAll ? (
        monthGroups.map((group) => <MonthSection key={group.monthKey} group={group} onDelete={handleDelete} />)
      ) : (
        dayGroups.map((group) => <DaySection key={group.dateKey} group={group} onDelete={handleDelete} />)
      )}
    </div>
  );
}
