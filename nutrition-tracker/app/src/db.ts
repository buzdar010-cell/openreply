import { type Candidate, type DishRecord } from "./candidateSearch.ts";

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
