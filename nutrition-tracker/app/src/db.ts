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

export interface DishInsert {
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
  source: string; // 'barcode_off' | 'barcode_ai' -- distinguishes runtime-added products from the curated 228
}

/** First runtime dish inserts -- previously dishes only ever came from the seed script. Used by barcode lookups (openFoodFacts.ts / parseBarcodeLabel.ts) so a scanned product becomes a real dish: searchable, editable, loggable through every mechanism that already exists. */
export async function insertDish(db: D1Database, dish: DishInsert): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO dishes (dish_id, category, serving_label, default_serving_g, per_100g_kcal, per_100g_protein_g,
        per_100g_carbs_g, per_100g_fat_g, per_100g_fiber_g, per_100g_sugar_g, per_100g_sodium_mg, portion_presets_json, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      dish.dish_id,
      dish.category,
      dish.serving_label,
      dish.default_serving_g,
      dish.per_100g_kcal,
      dish.per_100g_protein_g,
      dish.per_100g_carbs_g,
      dish.per_100g_fat_g,
      dish.per_100g_fiber_g,
      dish.per_100g_sugar_g,
      dish.per_100g_sodium_mg,
      dish.source,
    )
    .run();
}

export async function insertUnmatchedBarcode(db: D1Database, row: { id: string; device_id: string; barcode: string; created_at: number }): Promise<void> {
  await db
    .prepare(`INSERT INTO unmatched_barcodes (id, device_id, barcode, created_at) VALUES (?, ?, ?, ?)`)
    .bind(row.id, row.device_id, row.barcode, row.created_at)
    .run();
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
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
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
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
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
      `INSERT INTO user_profiles (device_id, weight_kg, height_cm, age, gender, activity_level, goal, daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, gamification_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         weight_kg = excluded.weight_kg, height_cm = excluded.height_cm, age = excluded.age,
         gender = excluded.gender, activity_level = excluded.activity_level, goal = excluded.goal,
         daily_calorie_target = excluded.daily_calorie_target, protein_target_g = excluded.protein_target_g,
         carbs_target_g = excluded.carbs_target_g, fat_target_g = excluded.fat_target_g,
         gamification_enabled = excluded.gamification_enabled,
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
      p.protein_target_g,
      p.carbs_target_g,
      p.fat_target_g,
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

// ---- Accounts: users, sessions, trusted devices, OTP codes ----

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  email_verified: number;
  created_at: number;
  subscription_tier: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  subscription_status: string | null;
  subscription_renews_at: number | null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE email = ?`).bind(email.toLowerCase()).first<UserRow>();
  return row ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ?? null;
}

export async function createUser(
  db: D1Database,
  u: { id: string; email: string; password_hash: string; password_salt: string },
): Promise<void> {
  await db
    .prepare(`INSERT INTO users (id, email, password_hash, password_salt, email_verified, created_at) VALUES (?, ?, ?, ?, 0, ?)`)
    .bind(u.id, u.email.toLowerCase(), u.password_hash, u.password_salt, Math.floor(Date.now() / 1000))
    .run();
}

export async function markEmailVerified(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(userId).run();
}

export async function updatePassword(db: D1Database, userId: string, hash: string, salt: string): Promise<void> {
  await db.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`).bind(hash, salt, userId).run();
}

export async function createSession(db: D1Database, token: string, userId: string, ttlSeconds: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(token, userId, now, now + ttlSeconds)
    .run();
}

/** Resolves a bearer token to the authenticated user id, or null if missing/expired -- the one source of truth for "who is calling." */
export async function getUserIdFromSession(db: D1Database, token: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(`SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?`)
    .bind(token, now)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
}

/** Called on password reset -- forces re-login everywhere, not just on the device that reset it. */
export async function deleteAllSessionsForUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
}

/**
 * Called when Paddle reports a subscription becoming active (checkout
 * completed, or reactivated after a past-due recovery). `userId` comes from
 * the `custom_data` we attach at checkout creation -- Paddle echoes it back
 * on every webhook for that subscription, so this is the reliable join key
 * back to our own accounts rather than trying to match on email.
 */
export async function activatePremium(
  db: D1Database,
  userId: string,
  paddleCustomerId: string,
  paddleSubscriptionId: string,
  status: string,
  renewsAt: number | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET subscription_tier = 'premium', paddle_customer_id = ?, paddle_subscription_id = ?, subscription_status = ?, subscription_renews_at = ? WHERE id = ?`,
    )
    .bind(paddleCustomerId, paddleSubscriptionId, status, renewsAt, userId)
    .run();
}

/** Looked up by subscription id -- update/cancel/paused webhooks identify the subscription, not our user id directly. */
export async function getUserByPaddleSubscriptionId(db: D1Database, paddleSubscriptionId: string): Promise<UserRow | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE paddle_subscription_id = ?`).bind(paddleSubscriptionId).first<UserRow>();
  return row ?? null;
}

/**
 * Called on subscription.updated/canceled/paused -- Paddle's own `status`
 * decides whether that still counts as premium access. Only 'active' and
 * 'trialing' keep the higher log cap; anything else (canceled, paused,
 * past_due) drops back to the free cap immediately rather than trusting a
 * grace period we haven't built.
 */
export async function updateSubscriptionStatus(
  db: D1Database,
  paddleSubscriptionId: string,
  status: string,
  renewsAt: number | null,
): Promise<void> {
  const tier = status === "active" || status === "trialing" ? "premium" : "free";
  await db
    .prepare(`UPDATE users SET subscription_tier = ?, subscription_status = ?, subscription_renews_at = ? WHERE paddle_subscription_id = ?`)
    .bind(tier, status, renewsAt, paddleSubscriptionId)
    .run();
}

export async function isTrustedDevice(db: D1Database, deviceToken: string, userId: string, country: string | null): Promise<boolean> {
  const row = await db
    .prepare(`SELECT country FROM trusted_devices WHERE device_token = ? AND user_id = ?`)
    .bind(deviceToken, userId)
    .first<{ country: string | null }>();
  if (!row) return false;
  // Missing country on either side (Cloudflare didn't supply one) is treated as a match rather than
  // forcing step-up verification on every request purely from an absent signal.
  if (row.country && country && row.country !== country) return false;
  return true;
}

export async function upsertTrustedDevice(db: D1Database, deviceToken: string, userId: string, country: string | null): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO trusted_devices (device_token, user_id, country, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_token) DO UPDATE SET country = excluded.country, last_used_at = excluded.last_used_at`,
    )
    .bind(deviceToken, userId, country, now, now)
    .run();
}

export async function createOtpCode(
  db: D1Database,
  o: { id: string; email: string; code_hash: string; purpose: "signup" | "login" | "reset"; ttlSeconds: number },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`INSERT INTO otp_codes (id, email, code_hash, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`)
    .bind(o.id, o.email.toLowerCase(), o.code_hash, o.purpose, now + o.ttlSeconds, now)
    .run();
}

/** Finds the newest unused, unexpired code for this email+purpose+hash and marks it used -- atomically enough for this scale (D1 is single-writer per row). */
export async function consumeOtpCode(
  db: D1Database,
  email: string,
  codeHash: string,
  purpose: "signup" | "login" | "reset",
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `SELECT id FROM otp_codes WHERE email = ? AND purpose = ? AND code_hash = ? AND used = 0 AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(email.toLowerCase(), purpose, codeHash, now)
    .first<{ id: string }>();
  if (!row) return false;
  await db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).bind(row.id).run();
  return true;
}

// ---- Exercise logs ----

export interface ExerciseLogRow {
  id: string;
  activity_type: string;
  duration_minutes: number;
  calories_burned: number;
  logged_at: number;
}

export async function insertExerciseLog(
  db: D1Database,
  log: {
    id: string;
    device_id: string;
    activity_type: string;
    duration_minutes: number;
    calories_burned: number;
    logged_at: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO exercise_logs (id, device_id, activity_type, duration_minutes, calories_burned, logged_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(log.id, log.device_id, log.activity_type, log.duration_minutes, log.calories_burned, log.logged_at, Math.floor(Date.now() / 1000))
    .run();
}

export async function getExerciseLogsForRange(
  db: D1Database,
  deviceId: string,
  startUnix: number,
  endUnix: number,
): Promise<ExerciseLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, activity_type, duration_minutes, calories_burned, logged_at
       FROM exercise_logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ? ORDER BY logged_at DESC`,
    )
    .bind(deviceId, startUnix, endUnix)
    .all<ExerciseLogRow>();
  return results;
}

/** Sums calories burned in a range -- used to adjust the day's calorie budget alongside food totals. */
export async function getExerciseCaloriesForRange(db: D1Database, deviceId: string, startUnix: number, endUnix: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(calories_burned), 0) as total FROM exercise_logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ?`)
    .bind(deviceId, startUnix, endUnix)
    .first<{ total: number }>();
  return row!.total;
}

/** Ownership-checked delete, same pattern as userDeleteLog for food logs. Returns whether a row was actually deleted. */
export async function deleteExerciseLogOwnedByDevice(db: D1Database, deviceId: string, logId: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM exercise_logs WHERE id = ? AND device_id = ?`).bind(logId, deviceId).run();
  return (result.meta.changes ?? 0) > 0;
}

// ---- Signals for personalized Home content (tips/articles) ----

/** Which dishes this device has logged most in the range -- feeds dish-specific tips. */
export async function getTopLoggedDishIds(db: D1Database, deviceId: string, startUnix: number, endUnix: number, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT dish_id FROM logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ?
       GROUP BY dish_id ORDER BY COUNT(*) DESC LIMIT ?`,
    )
    .bind(deviceId, startUnix, endUnix, limit)
    .all<{ dish_id: string }>();
  return results.map((r) => r.dish_id);
}

/** Most recent exercise log's timestamp, if any -- feeds the "no recent exercise" signal. */
export async function getLastExerciseLogTime(db: D1Database, deviceId: string): Promise<number | null> {
  const row = await db
    .prepare(`SELECT MAX(logged_at) as last FROM exercise_logs WHERE device_id = ?`)
    .bind(deviceId)
    .first<{ last: number | null }>();
  return row?.last ?? null;
}

// ---- Weight logs ----

export interface WeightLogRow {
  id: string;
  weight_kg: number;
  logged_at: number;
}

export async function insertWeightLog(
  db: D1Database,
  log: { id: string; device_id: string; weight_kg: number; logged_at: number },
): Promise<void> {
  await db
    .prepare(`INSERT INTO weight_logs (id, device_id, weight_kg, logged_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(log.id, log.device_id, log.weight_kg, log.logged_at, Math.floor(Date.now() / 1000))
    .run();
}

export async function getWeightLogsForRange(db: D1Database, deviceId: string, startUnix: number, endUnix: number): Promise<WeightLogRow[]> {
  const { results } = await db
    .prepare(`SELECT id, weight_kg, logged_at FROM weight_logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ? ORDER BY logged_at DESC`)
    .bind(deviceId, startUnix, endUnix)
    .all<WeightLogRow>();
  return results;
}

/** Average weight over a range -- null (not 0) when there are no entries, so callers can tell "no data" apart from "weighs 0kg". */
export async function getAverageWeightForRange(db: D1Database, deviceId: string, startUnix: number, endUnix: number): Promise<number | null> {
  const row = await db
    .prepare(`SELECT AVG(weight_kg) as avg FROM weight_logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ?`)
    .bind(deviceId, startUnix, endUnix)
    .first<{ avg: number | null }>();
  return row?.avg ?? null;
}

export async function getLastWeightLogTime(db: D1Database, deviceId: string): Promise<number | null> {
  const row = await db.prepare(`SELECT MAX(logged_at) as last FROM weight_logs WHERE device_id = ?`).bind(deviceId).first<{ last: number | null }>();
  return row?.last ?? null;
}

export async function deleteWeightLogOwnedByDevice(db: D1Database, deviceId: string, logId: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM weight_logs WHERE id = ? AND device_id = ?`).bind(logId, deviceId).run();
  return (result.meta.changes ?? 0) > 0;
}

// ---- Push subscriptions ----

/** Keyed by endpoint (unique) so re-subscribing the same browser/device just refreshes its keys instead of creating a duplicate row. */
export async function upsertPushSubscription(
  db: D1Database,
  sub: { userId: string; endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(crypto.randomUUID(), sub.userId, sub.endpoint, sub.p256dh, sub.auth, Math.floor(Date.now() / 1000))
    .run();
}

export async function deletePushSubscription(db: D1Database, userId: string, endpoint: string): Promise<void> {
  await db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`).bind(userId, endpoint).run();
}

export async function deletePushSubscriptionByEndpoint(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).run();
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Subscriptions belonging to users who haven't logged their weight in
 * `staleSeconds` (or ever) and haven't already been sent a reminder inside
 * that same window -- the daily-cadence, "remind after one missed day"
 * behavior, with the last_sent_at guard preventing a double-send if the
 * cron fires more than once in a window.
 */
export async function getPushSubscriptionsOverdueForWeightLog(db: D1Database, staleSeconds: number): Promise<PushSubscriptionRow[]> {
  const cutoff = Math.floor(Date.now() / 1000) - staleSeconds;
  const { results } = await db
    .prepare(
      `SELECT ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       LEFT JOIN (SELECT device_id, MAX(logged_at) as last_logged FROM weight_logs GROUP BY device_id) wl
         ON wl.device_id = ps.user_id
       WHERE (wl.last_logged IS NULL OR wl.last_logged < ?)
         AND (ps.last_sent_at IS NULL OR ps.last_sent_at < ?)`,
    )
    .bind(cutoff, cutoff)
    .all<PushSubscriptionRow>();
  return results;
}

export async function markPushSubscriptionSent(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE push_subscriptions SET last_sent_at = ? WHERE id = ?`).bind(Math.floor(Date.now() / 1000), id).run();
}

// ---- Water logs ----

export interface WaterLogRow {
  id: string;
  amount_ml: number;
  logged_at: number;
}

export async function insertWaterLog(
  db: D1Database,
  log: { id: string; device_id: string; amount_ml: number; logged_at: number },
): Promise<void> {
  await db
    .prepare(`INSERT INTO water_logs (id, device_id, amount_ml, logged_at, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(log.id, log.device_id, log.amount_ml, log.logged_at, Math.floor(Date.now() / 1000))
    .run();
}

export async function getWaterLogsForRange(db: D1Database, deviceId: string, startUnix: number, endUnix: number): Promise<WaterLogRow[]> {
  const { results } = await db
    .prepare(`SELECT id, amount_ml, logged_at FROM water_logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ? ORDER BY logged_at DESC`)
    .bind(deviceId, startUnix, endUnix)
    .all<WaterLogRow>();
  return results;
}

/** Total ml over a range -- 0 (not null) when there are no entries, unlike getAverageWeightForRange: "drank 0ml" is a meaningful, correct answer for a sum, not a missing-data case. */
export async function getWaterTotalForRange(db: D1Database, deviceId: string, startUnix: number, endUnix: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(amount_ml), 0) as total FROM water_logs WHERE device_id = ? AND logged_at >= ? AND logged_at < ?`)
    .bind(deviceId, startUnix, endUnix)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function deleteWaterLogOwnedByDevice(db: D1Database, deviceId: string, logId: string): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM water_logs WHERE id = ? AND device_id = ?`).bind(logId, deviceId).run();
  return (result.meta.changes ?? 0) > 0;
}
