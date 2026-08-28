import { type Candidate, type DishRecord } from "./candidateSearch.ts";
import { type Gender, type ActivityLevel, type Goal } from "./goalCalc.ts";

export interface DishRow {
  dish_id: string;
  category: string;
  serving_label: string;
  default_serving_g: number;
  per_100g_kcal: number;
  per_100g_protein_g: number;
  per_100g_carbs_g: number;
  per_100g_fat_g: number;
  per_100g_fiber_g: number;
  per_100g_sugar_g: number;
  per_100g_sodium_mg: number;
  portion_presets_json: string | null;
}

/** Loads all dishes for building the in-memory candidate search index (see candidateSearch.ts). */
export async function loadAllDishRecords(db: D1Database): Promise<DishRecord[]> {
  const { results } = await db
    .prepare("SELECT dish_id, category, serving_label FROM dishes")
    .all<{ dish_id: string; category: string; serving_label: string }>();
  return results.map((r) => ({
    dish_id: r.dish_id,
    category: r.category,
    serving_label: r.serving_label,
  }));
}

export async function getDishById(db: D1Database, dishId: string): Promise<DishRow | null> {
  const row = await db.prepare("SELECT * FROM dishes WHERE dish_id = ?").bind(dishId).first<DishRow>();
  return row ?? null;
}

export interface LogRowToInsert {
  id: string;
  device_id: string;
  dish_id: string;
  free_text_description: string | null;
  quantity: number;
  resolved_grams: number;
  swaps_json: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  logged_at: number;
  // Audit-trail fields -- what the AI actually decided (not just the final
  // resolved numbers) and a photo reference, so a matched log can be
  // reviewed for correctness, not just trusted. See getRecentLogsForReview.
  confidence: "high" | "low" | null;
  alt_candidates_json: string | null;
  photo_key: string | null;
}

export async function insertLog(db: D1Database, log: LogRowToInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO logs (id, device_id, dish_id, free_text_description, quantity, resolved_grams,
        swaps_json, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, logged_at, created_at,
        confidence, alt_candidates_json, photo_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      log.id,
      log.device_id,
      log.dish_id,
      log.free_text_description,
      log.quantity,
      log.resolved_grams,
      log.swaps_json,
      log.kcal,
      log.protein_g,
      log.carbs_g,
      log.fat_g,
      log.fiber_g,
      log.sugar_g,
      log.sodium_mg,
      log.logged_at,
      Math.floor(Date.now() / 1000),
      log.confidence,
      log.alt_candidates_json,
      log.photo_key,
    )
    .run();
}

export interface RecentLogForReview {
  id: string;
  device_id: string;
  dish_id: string;
  free_text_description: string | null;
  quantity: number;
  confidence: string | null;
  alt_candidates_json: string | null;
  photo_key: string | null;
  created_at: number;
  original_dish_id: string | null;
  corrected: number;
}

/** For QA: recent matched logs with the AI's decision context, newest first. */
export async function getRecentLogsForReview(db: D1Database, limit = 100): Promise<RecentLogForReview[]> {
  const { results } = await db
    .prepare(
      `SELECT id, device_id, dish_id, free_text_description, quantity, confidence, alt_candidates_json,
         photo_key, created_at, original_dish_id, corrected
       FROM logs ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<RecentLogForReview>();
  return results;
}

export interface LogRowForCorrection {
  id: string;
  dish_id: string;
  resolved_grams: number;
  original_dish_id: string | null;
}

export async function getLogById(db: D1Database, logId: string): Promise<LogRowForCorrection | null> {
  const row = await db
    .prepare(`SELECT id, dish_id, resolved_grams, original_dish_id FROM logs WHERE id = ?`)
    .bind(logId)
    .first<LogRowForCorrection>();
  return row ?? null;
}

export interface LogCorrection {
  dish_id: string;
  original_dish_id: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

/**
 * Applies a correction to a log's matched dish. original_dish_id is passed
 * in by the caller (not computed here) specifically so a *second* correction
 * doesn't overwrite the record of what the AI actually guessed the first
 * time -- see handleAdminCorrect in index.ts.
 */
export async function correctLog(db: D1Database, logId: string, c: LogCorrection): Promise<void> {
  await db
    .prepare(
      `UPDATE logs SET dish_id = ?, original_dish_id = ?, corrected = 1,
         kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sodium_mg = ?
       WHERE id = ?`,
    )
    .bind(c.dish_id, c.original_dish_id, c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.fiber_g, c.sugar_g, c.sodium_mg, logId)
    .run();
}

export interface UnmatchedLogToInsert {
  id: string;
  device_id: string;
  description: string;
  source: "text" | "photo";
  created_at: number;
  photo_key: string | null;
}

export async function insertUnmatchedLog(db: D1Database, log: UnmatchedLogToInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO unmatched_logs (id, device_id, description, source, created_at, photo_key) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(log.id, log.device_id, log.description, log.source, log.created_at, log.photo_key)
    .run();
}

export interface UnmatchedLogRow {
  id: string;
  device_id: string;
  description: string;
  source: string;
  created_at: number;
  photo_key: string | null;
}

export async function getUnmatchedLogs(db: D1Database, limit = 200): Promise<UnmatchedLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, device_id, description, source, created_at, photo_key FROM unmatched_logs ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<UnmatchedLogRow>();
  return results;
}

export interface ErrorLogToInsert {
  id: string;
  endpoint: string;
  device_id: string | null;
  message: string;
  created_at: number;
}

export async function insertErrorLog(db: D1Database, log: ErrorLogToInsert): Promise<void> {
  await db
    .prepare(`INSERT INTO error_logs (id, endpoint, device_id, message, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(log.id, log.endpoint, log.device_id, log.message, log.created_at)
    .run();
}

export interface ErrorLogRow {
  id: string;
  endpoint: string;
  device_id: string | null;
  message: string;
  created_at: number;
}

export async function getErrorLogs(db: D1Database, limit = 200): Promise<ErrorLogRow[]> {
  const { results } = await db
    .prepare(`SELECT id, endpoint, device_id, message, created_at FROM error_logs ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<ErrorLogRow>();
  return results;
}

export interface DailyTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

/** Sums a device's logs between two unix-second timestamps (inclusive start, exclusive end). */
export async function getTotalsForRange(
  db: D1Database,
  deviceId: string,
  startUnix: number,
  endUnix: number,
): Promise<DailyTotals> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(kcal), 0) as kcal,
         COALESCE(SUM(protein_g), 0) as protein_g,
         COALESCE(SUM(carbs_g), 0) as carbs_g,
         COALESCE(SUM(fat_g), 0) as fat_g,
         COALESCE(SUM(fiber_g), 0) as fiber_g,
         COALESCE(SUM(sugar_g), 0) as sugar_g,
         COALESCE(SUM(sodium_mg), 0) as sodium_mg
       FROM logs
       WHERE device_id = ? AND logged_at >= ? AND logged_at < ?`,
    )
    .bind(deviceId, startUnix, endUnix)
    .first<DailyTotals>();
  return row!;
}

/** An individual logged item -- for the day-grouped history feed, not just the summed totals above. */
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

export async function getLogsForRange(
  db: D1Database,
  deviceId: string,
  startUnix: number,
  endUnix: number,
): Promise<LogListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, dish_id, free_text_description, quantity, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, logged_at
       FROM logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ? ORDER BY logged_at DESC`,
    )
    .bind(deviceId, startUnix, endUnix)
    .all<LogListItem>();
  return results;
}

/** Ownership-checked lookup -- a user can only edit/delete their own logs, keyed by device_id since there's no login system. */
export async function getLogOwnedByDevice(
  db: D1Database,
  deviceId: string,
  logId: string,
): Promise<{ id: string; resolved_grams: number } | null> {
  const row = await db
    .prepare(`SELECT id, resolved_grams FROM logs WHERE id = ? AND device_id = ?`)
    .bind(logId, deviceId)
    .first<{ id: string; resolved_grams: number }>();
  return row ?? null;
}

export async function userEditLog(
  db: D1Database,
  logId: string,
  dish: {
    dish_id: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE logs SET dish_id = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, sugar_g = ?, sodium_mg = ? WHERE id = ?`,
    )
    .bind(dish.dish_id, dish.kcal, dish.protein_g, dish.carbs_g, dish.fat_g, dish.fiber_g, dish.sugar_g, dish.sodium_mg, logId)
    .run();
}

export async function userDeleteLog(db: D1Database, logId: string): Promise<void> {
  await db.prepare(`DELETE FROM logs WHERE id = ?`).bind(logId).run();
}

export interface ProfileRow {
  device_id: string;
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  gender: Gender | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  daily_calorie_target: number | null;
  gamification_enabled: number;
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  xp: number;
}

export async function getProfile(db: D1Database, deviceId: string): Promise<ProfileRow | null> {
  const row = await db.prepare(`SELECT * FROM user_profiles WHERE device_id = ?`).bind(deviceId).first<ProfileRow>();
  return row ?? null;
}

export interface ProfileUpsert {
  device_id: string;
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: Gender;
  activity_level: ActivityLevel;
  goal: Goal;
  daily_calorie_target: number;
  gamification_enabled: boolean;
}

/**
 * Sets the profile/goal fields. Deliberately does NOT touch streak/xp/
 * last_logged_date -- those are updated only by recordLogForStreak, never
 * reset just because someone edits their weight or goal in Settings.
 */
export async function upsertProfile(db: D1Database, p: ProfileUpsert): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO user_profiles (device_id, weight_kg, height_cm, age, gender, activity_level, goal, daily_calorie_target, gamification_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         weight_kg = excluded.weight_kg, height_cm = excluded.height_cm, age = excluded.age,
         gender = excluded.gender, activity_level = excluded.activity_level, goal = excluded.goal,
         daily_calorie_target = excluded.daily_calorie_target, gamification_enabled = excluded.gamification_enabled,
         updated_at = excluded.updated_at`,
    )
    .bind(
      p.device_id,
      p.weight_kg,
      p.height_cm,
      p.age,
      p.gender,
      p.activity_level,
      p.goal,
      p.daily_calorie_target,
      p.gamification_enabled ? 1 : 0,
      now,
      now,
    )
    .run();
}

/**
 * Called after every successful (matched) log, regardless of whether
 * gamification is enabled -- streak/XP keep accruing in the background so
 * turning gamification on later doesn't unfairly start someone at zero.
 * Only the UI decides whether to show it.
 */
export async function recordLogForStreak(db: D1Database, deviceId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  const now = Math.floor(Date.now() / 1000);
  const existing = await db
    .prepare(`SELECT current_streak, longest_streak, last_logged_date, xp FROM user_profiles WHERE device_id = ?`)
    .bind(deviceId)
    .first<{ current_streak: number; longest_streak: number; last_logged_date: string | null; xp: number }>();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO user_profiles (device_id, gamification_enabled, current_streak, longest_streak, last_logged_date, xp, created_at, updated_at)
         VALUES (?, 0, 1, 1, ?, 10, ?, ?)`,
      )
      .bind(deviceId, today, now, now)
      .run();
    return;
  }

  if (existing.last_logged_date === today) return; // already logged today, streak already counted

  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const newStreak = existing.last_logged_date === yesterday ? existing.current_streak + 1 : 1;

  await db
    .prepare(
      `UPDATE user_profiles SET current_streak = ?, longest_streak = MAX(longest_streak, ?), last_logged_date = ?, xp = xp + 10, updated_at = ?
       WHERE device_id = ?`,
    )
    .bind(newStreak, newStreak, today, now, deviceId)
    .run();
}

/**
 * Toggling gamification is a standalone action -- it must never require a
 * complete weight/height/age/etc. profile to exist first (that was exactly
 * the bug reported: the toggle shared its save action with the full goals
 * form, so flipping it with an incomplete profile silently didn't persist).
 * Upserts a bare row if none exists yet, same pattern as recordLogForStreak.
 */
export async function setGamificationEnabled(db: D1Database, deviceId: string, enabled: boolean): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO user_profiles (device_id, gamification_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET gamification_enabled = excluded.gamification_enabled, updated_at = excluded.updated_at`,
    )
    .bind(deviceId, enabled ? 1 : 0, now, now)
    .run();
}

export async function insertFeedback(
  db: D1Database,
  f: { id: string; device_id: string; message: string; context: string | null; created_at: number },
): Promise<void> {
  await db
    .prepare(`INSERT INTO feedback (id, device_id, message, context, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(f.id, f.device_id, f.message, f.context, f.created_at)
    .run();
}

export async function getFeedback(db: D1Database, limit = 200) {
  const { results } = await db
    .prepare(`SELECT id, device_id, message, context, created_at FROM feedback ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all();
  return results;
}
