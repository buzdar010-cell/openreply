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
}

export async function insertLog(db: D1Database, log: LogRowToInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO logs (id, device_id, dish_id, free_text_description, quantity, resolved_grams,
        swaps_json, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, logged_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    )
    .run();
}

export interface UnmatchedLogToInsert {
  id: string;
  device_id: string;
  description: string;
  source: "text" | "photo";
  created_at: number;
}

export async function insertUnmatchedLog(db: D1Database, log: UnmatchedLogToInsert): Promise<void> {
  await db
    .prepare(`INSERT INTO unmatched_logs (id, device_id, description, source, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(log.id, log.device_id, log.description, log.source, log.created_at)
    .run();
}

export interface UnmatchedLogRow {
  id: string;
  device_id: string;
  description: string;
  source: string;
  created_at: number;
}

export async function getUnmatchedLogs(db: D1Database, limit = 200): Promise<UnmatchedLogRow[]> {
  const { results } = await db
    .prepare(`SELECT id, device_id, description, source, created_at FROM unmatched_logs ORDER BY created_at DESC LIMIT ?`)
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
