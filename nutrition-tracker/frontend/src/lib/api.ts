// Overridable via VITE_API_BASE at build time so this doesn't need a code
// change once the backend moves to a custom domain.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nutrition-tracker.buzdar0003.workers.dev';

export interface LogResultEntry {
  matched: boolean;
  logId?: string;
  dishId?: string;
  description?: string;
  quantity?: number;
  confidence?: 'high' | 'low';
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export async function logText(deviceId: string, text: string): Promise<LogResultEntry[]> {
  const res = await fetch(`${API_BASE}/log/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, text }),
  });
  const body = (await res.json()) as { results?: LogResultEntry[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body.results ?? [];
}

export interface Totals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

export async function getTodayTotals(deviceId: string): Promise<Totals> {
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = now - (now % 86400); // UTC midnight -- fine for a first pass, revisit with real timezone handling later
  const url = `${API_BASE}/totals?deviceId=${encodeURIComponent(deviceId)}&start=${startOfDay}&end=${now}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as Totals;
}
