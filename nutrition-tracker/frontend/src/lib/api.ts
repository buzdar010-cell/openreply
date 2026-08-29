import { getSessionToken, clearSession, UNAUTHORIZED_EVENT } from './session';

// Overridable via VITE_API_BASE at build time so this doesn't need a code
// change once the backend moves to a custom domain.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nutrition-tracker.buzdar0003.workers.dev';

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(res: Response) {
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    handleUnauthorized(res);
    throw new Error(data.error ?? `request failed (${res.status})`);
  }
  return data;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    handleUnauthorized(res);
    throw new Error(data.error ?? `request failed (${res.status})`);
  }
  return data;
}

// ---- Auth ----

export interface AuthTokens {
  sessionToken: string;
  deviceToken: string;
}

/** null means the account needs email verification before it can log in (an OTP was sent). */
export async function signup(email: string, password: string): Promise<AuthTokens | null> {
  const data = await postJson<Partial<AuthTokens> & { ok?: boolean }>('/auth/signup', { email, password });
  return data.sessionToken && data.deviceToken ? { sessionToken: data.sessionToken, deviceToken: data.deviceToken } : null;
}

export async function verifySignup(email: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/verify-signup', { email, code });
}

export type LoginResult = ({ status: 'logged_in' } & AuthTokens) | { status: 'verification_required' };

export async function login(email: string, password: string, deviceToken: string | null): Promise<LoginResult> {
  return postJson('/auth/login', { email, password, deviceToken: deviceToken ?? undefined });
}

export async function verifyLogin(email: string, code: string): Promise<AuthTokens> {
  return postJson('/auth/verify-login', { email, code });
}

export async function forgotPassword(email: string): Promise<void> {
  await postJson('/auth/forgot-password', { email });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await postJson('/auth/reset-password', { email, code, newPassword });
}

export async function logout(): Promise<void> {
  try {
    await postJson('/auth/logout', {});
  } catch {
    // Clearing the local session is what actually matters for logout to feel instant -- an unreachable
    // server just means this token dies naturally at its TTL instead of being revoked immediately.
  } finally {
    clearSession();
  }
}

// ---- Food logging ----

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

export async function logText(text: string): Promise<LogResultEntry[]> {
  const data = await postJson<{ results: LogResultEntry[] }>('/log/text', { text });
  return data.results ?? [];
}

export async function logPhoto(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  caption?: string,
): Promise<LogResultEntry[]> {
  const data = await postJson<{ results: LogResultEntry[] }>('/log/photo', { imageBase64, mimeType, caption });
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
  exercise_kcal: number;
}

// ---- Exercise logging -- separate from food, no AI call involved ----

export type ActivityType = 'walk' | 'run' | 'cycling' | 'gym' | 'sports' | 'yoga' | 'housework';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walk: 'Walking',
  run: 'Running / jogging',
  cycling: 'Cycling',
  gym: 'Gym / weights',
  sports: 'Sports',
  yoga: 'Yoga / stretching',
  housework: 'Housework / chores',
};

export interface ExerciseLogResult {
  logId: string;
  activityType: ActivityType;
  durationMinutes: number;
  caloriesBurned: number;
}

export async function logExercise(activityType: ActivityType, durationMinutes: number): Promise<ExerciseLogResult> {
  return postJson('/log/exercise', { activityType, durationMinutes });
}

export interface ExerciseLogItem {
  id: string;
  activity_type: string;
  duration_minutes: number;
  calories_burned: number;
  logged_at: number;
}

export async function getExerciseLogs(startUnix: number, endUnix: number): Promise<ExerciseLogItem[]> {
  const data = await getJson<{ logs: ExerciseLogItem[] }>(`/logs/exercise?start=${startUnix}&end=${endUnix}`);
  return data.logs ?? [];
}

export async function deleteExerciseLog(logId: string): Promise<void> {
  await postJson('/logs/exercise/delete', { logId });
}

function startOfTodayUnix(): number {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % 86400); // UTC midnight -- fine for a first pass, revisit with real timezone handling later
}

export async function getTodayTotals(): Promise<Totals> {
  const now = Math.floor(Date.now() / 1000);
  return getJson<Totals>(`/totals?start=${startOfTodayUnix()}&end=${now}`);
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

export async function getLogs(startUnix: number, endUnix: number): Promise<LogListItem[]> {
  const data = await getJson<{ logs: LogListItem[] }>(`/logs?start=${startUnix}&end=${endUnix}`);
  return data.logs ?? [];
}

export async function editLog(logId: string, correctDishId: string): Promise<void> {
  await postJson('/logs/edit', { logId, correctDishId });
}

export async function deleteLog(logId: string): Promise<void> {
  await postJson('/logs/delete', { logId });
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

export async function getProfile(): Promise<Profile | null> {
  const data = await getJson<{ profile: Profile | null }>('/profile');
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

export async function saveProfile(input: ProfileInput): Promise<{ daily_calorie_target: number }> {
  return postJson('/profile', input);
}

/** Standalone -- never requires the rest of the profile to be filled in, unlike saveProfile. */
export async function setGamification(enabled: boolean): Promise<void> {
  await postJson('/profile/gamification', { enabled });
}

export async function submitFeedback(message: string, context?: string): Promise<void> {
  await postJson('/feedback', { message, context });
}
