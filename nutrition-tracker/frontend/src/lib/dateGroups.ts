import type { LogListItem } from './api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or a weekday name -- for the This Week view. */
export function dayLabel(loggedAtUnix: number): string {
  const date = new Date(loggedAtUnix * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return DAY_NAMES[date.getUTCDay()];
}

export interface DayGroup {
  label: string;
  dateKey: string;
  items: LogListItem[];
  totalKcal: number;
}

export function groupByDay(items: LogListItem[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const date = new Date(item.logged_at * 1000);
    const key = dayKey(date);
    if (!map.has(key)) {
      map.set(key, { label: dayLabel(item.logged_at), dateKey: key, items: [], totalKcal: 0 });
    }
    const group = map.get(key)!;
    group.items.push(item);
    group.totalKcal += item.kcal;
  }
  return Array.from(map.values()).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

export interface MonthGroup {
  label: string;
  monthKey: string;
  items: LogListItem[];
}

export function groupByMonth(items: LogListItem[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const item of items) {
    const date = new Date(item.logged_at * 1000);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { label: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`, monthKey: key, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
}

export function logsToCsv(items: LogListItem[]): string {
  const header = 'date,dish,quantity,kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg';
  const rows = items.map((i) => {
    const date = new Date(i.logged_at * 1000).toISOString();
    const dish = i.free_text_description ?? i.dish_id;
    return [date, `"${dish.replace(/"/g, '""')}"`, i.quantity, i.kcal, i.protein_g, i.carbs_g, i.fat_g, i.fiber_g, i.sugar_g, i.sodium_mg].join(
      ',',
    );
  });
  return [header, ...rows].join('\n');
}
