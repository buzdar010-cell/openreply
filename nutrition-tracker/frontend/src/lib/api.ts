// Overridable via VITE_API_BASE at build time so this doesn't need a code
// change once the backend moves to a custom domain.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nutrition-tracker.buzdar0003.workers.dev';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

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
  const data = await postJson<{ results: LogResultEntry[] }>('/log/text', { deviceId, text });
  return data.results ?? [];
}

export async function logPhoto(
  deviceId: string,
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  caption?: string,
): Promise<LogResultEntry[]> {
  const data = await postJson<{ results: LogResultEntry[] }>('/log/photo', { deviceId, imageBase64, mimeType, caption });
  return data.results ?? [];
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

function startOfTodayUnix(): number {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % 86400); // UTC midnight -- fine for a first pass, revisit with real timezone handling later
}

export async function getTodayTotals(deviceId: string): Promise<Totals> {
  const now = Math.floor(Date.now() / 1000);
  return getJson<Totals>(`/totals?deviceId=${encodeURIComponent(deviceId)}&start=${startOfTodayUnix()}&end=${now}`);
}

export interface LogListItem {
  id: string;
  dish_id: string;
  free_text_description: string | null;
  quantity: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  logged_at: number;
}

export async function getLogs(deviceId: string, startUnix: number, endUnix: number): Promise<LogListItem[]> {
  const data = await getJson<{ logs: LogListItem[] }>(
    `/logs?deviceId=${encodeURIComponent(deviceId)}&start=${startUnix}&end=${endUnix}`,
  );
  return data.logs ?? [];
}

export async function editLog(deviceId: string, logId: string, correctDishId: string): Promise<void> {
  await postJson('/logs/edit', { deviceId, logId, correctDishId });
}

export async function deleteLog(deviceId: string, logId: string): Promise<void> {
  await postJson('/logs/delete', { deviceId, logId });
}

export type Gender = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export interface Profile {
  device_id: string;
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  gender: Gender | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  daily_calorie_target: number | null;
  gamification_enabled: 0 | 1;
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  xp: number;
}

export async function getProfile(deviceId: string): Promise<Profile | null> {
  const data = await getJson<{ profile: Profile | null }>(`/profile?deviceId=${encodeURIComponent(deviceId)}`);
  return data.profile;
}

export interface ProfileInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: Gender;
  activity_level: ActivityLevel;
  goal: Goal;
  gamification_enabled: boolean;
}

export async function saveProfile(deviceId: string, input: ProfileInput): Promise<{ daily_calorie_target: number }> {
  return postJson('/profile', { deviceId, ...input });
}

/** Standalone -- never requires the rest of the profile to be filled in, unlike saveProfile. */
export async function setGamification(deviceId: string, enabled: boolean): Promise<void> {
  await postJson('/profile/gamification', { deviceId, enabled });
}

export async function submitFeedback(deviceId: string, message: string, context?: string): Promise<void> {
  await postJson('/feedback', { deviceId, message, context });
}
