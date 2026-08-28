import { buildSearchIndex, shortlist } from "./candidateSearch.ts";
import { parseTextLog, parsePhotoLog } from "./parseLog.ts";
import { acquireViaDurableObject } from "./rateLimiter.ts";
import {
  loadAllDishRecords,
  getDishById,
  insertLog,
  getTotalsForRange,
  insertUnmatchedLog,
  getUnmatchedLogs,
  insertErrorLog,
  getErrorLogs,
  getRecentLogsForReview,
  getLogById,
  correctLog,
  getLogsForRange,
  getLogOwnedByDevice,
  userEditLog,
  userDeleteLog,
  getProfile,
  upsertProfile,
  recordLogForStreak,
  insertFeedback,
  getFeedback,
} from "./db.ts";
import { resolvePortion } from "./resolvePortion.ts";
import { storePhoto, getPhoto } from "./r2.ts";
import { GeminiRateLimiterDO } from "./rateLimiterDO.ts";
import { calculateDailyCalorieTarget, isValidProfileInput } from "./goalCalc.ts";

export { GeminiRateLimiterDO };

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RATE_LIMITER: DurableObjectNamespace;
  GEMINI_API_KEY: string;
  ADMIN_TOKEN: string;
}

// The frontend (Cloudflare Pages, a different origin from this Worker's
// own workers.dev domain) needs CORS to call this API from a browser at
// all -- without these headers every fetch() from the deployed app would
// fail silently with an opaque CORS error, never reaching this code.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleTextLog(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { deviceId?: string; text?: string; loggedAt?: number };
  if (typeof body.deviceId !== "string" || !body.deviceId || typeof body.text !== "string" || !body.text) {
    return jsonResponse({ error: "deviceId and text are required and must be strings" }, 400);
  }

  const allDishes = await loadAllDishRecords(env.DB);
  const index = buildSearchIndex(allDishes);
  const candidates = shortlist(index, body.text, 12);

  if (candidates.length === 0) {
    return jsonResponse({ error: "no matching candidates found for that description" }, 422);
  }

  const acquire = () => acquireViaDurableObject(env.RATE_LIMITER);
  const parsed = await parseTextLog(body.text, candidates, env.GEMINI_API_KEY, acquire);

  const loggedAt = body.loggedAt ?? Math.floor(Date.now() / 1000);
  const results = [];

  for (const entry of parsed) {
    if (entry.dish_id === "none_of_these") {
      results.push({ matched: false, description: entry.free_text_description });
      await insertUnmatchedLog(env.DB, {
        id: crypto.randomUUID(),
        device_id: body.deviceId,
        description: entry.free_text_description ?? body.text,
        source: "text",
        created_at: Math.floor(Date.now() / 1000),
        photo_key: null,
      });
      continue;
    }
    const dish = await getDishById(env.DB, entry.dish_id);
    if (!dish) {
      results.push({ matched: false, description: entry.free_text_description ?? entry.dish_id });
      continue;
    }
    const resolved = resolvePortion(entry, dish);
    const logId = crypto.randomUUID();
    await insertLog(env.DB, {
      id: logId,
      device_id: body.deviceId,
      dish_id: entry.dish_id,
      free_text_description: entry.free_text_description,
      quantity: entry.quantity,
      resolved_grams: resolved.resolved_grams,
      swaps_json: JSON.stringify(entry.swaps),
      kcal: resolved.kcal,
      protein_g: resolved.protein_g,
      carbs_g: resolved.carbs_g,
      fat_g: resolved.fat_g,
      fiber_g: resolved.fiber_g,
      sugar_g: resolved.sugar_g,
      sodium_mg: resolved.sodium_mg,
      logged_at: loggedAt,
      confidence: entry.confidence,
      alt_candidates_json: JSON.stringify(entry.alt_candidates),
      photo_key: null,
    });
    await recordLogForStreak(env.DB, body.deviceId);
    results.push({
      matched: true,
      logId,
      dishId: entry.dish_id,
      quantity: entry.quantity,
      confidence: entry.confidence,
      altCandidates: entry.alt_candidates,
      ...resolved,
    });
  }

  return jsonResponse({ results });
}

async function handlePhotoLog(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    deviceId?: string;
    imageBase64?: string;
    mimeType?: "image/jpeg" | "image/png" | "image/webp";
    caption?: string;
    loggedAt?: number;
  };
  const mimeType = body.mimeType;
  if (
    typeof body.deviceId !== "string" ||
    !body.deviceId ||
    typeof body.imageBase64 !== "string" ||
    !body.imageBase64 ||
    (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp")
  ) {
    return jsonResponse(
      { error: "deviceId and imageBase64 must be strings; mimeType must be one of image/jpeg, image/png, image/webp" },
      400,
    );
  }

  const allDishes = await loadAllDishRecords(env.DB);
  const index = buildSearchIndex(allDishes);
  // A photo has no text to search against unless there's a caption; without
  // one, hand the model a broader shortlist so it has real options to pick
  // from rather than an empty candidate list.
  const candidates = body.caption
    ? shortlist(index, body.caption, 12)
    : allDishes.slice(0, 20).map((d) => ({ dish_id: d.dish_id, label: d.serving_label }));

  const acquire = () => acquireViaDurableObject(env.RATE_LIMITER);
  const parsed = await parsePhotoLog(
    body.imageBase64,
    mimeType,
    candidates,
    env.GEMINI_API_KEY,
    body.caption,
    acquire,
  );

  const loggedAt = body.loggedAt ?? Math.floor(Date.now() / 1000);
  const results = [];

  // Save every submitted photo -- matched or not -- so nothing is lost for
  // QA review. Previously this only ran inside the matched branch, which
  // meant a low-confidence or wrong AI call couldn't be checked against the
  // actual photo it was looking at.
  const imageBytes = Uint8Array.from(atob(body.imageBase64), (c) => c.charCodeAt(0)).buffer;
  const photoLogId = crypto.randomUUID();
  const photoKey = await storePhoto(env.PHOTOS, body.deviceId, photoLogId, imageBytes, mimeType);

  for (const entry of parsed) {
    if (entry.dish_id === "none_of_these") {
      results.push({ matched: false, description: entry.free_text_description });
      await insertUnmatchedLog(env.DB, {
        id: crypto.randomUUID(),
        device_id: body.deviceId,
        description: entry.free_text_description ?? body.caption ?? "(photo, no caption)",
        source: "photo",
        created_at: Math.floor(Date.now() / 1000),
        photo_key: photoKey,
      });
      continue;
    }
    const dish = await getDishById(env.DB, entry.dish_id);
    if (!dish) {
      results.push({ matched: false, description: entry.free_text_description ?? entry.dish_id });
      continue;
    }

    const resolved = resolvePortion(entry, dish);
    const logId = crypto.randomUUID();
    await insertLog(env.DB, {
      id: logId,
      device_id: body.deviceId,
      dish_id: entry.dish_id,
      free_text_description: entry.free_text_description,
      quantity: entry.quantity,
      resolved_grams: resolved.resolved_grams,
      swaps_json: JSON.stringify(entry.swaps),
      kcal: resolved.kcal,
      protein_g: resolved.protein_g,
      carbs_g: resolved.carbs_g,
      fat_g: resolved.fat_g,
      fiber_g: resolved.fiber_g,
      sugar_g: resolved.sugar_g,
      sodium_mg: resolved.sodium_mg,
      logged_at: loggedAt,
      confidence: entry.confidence,
      alt_candidates_json: JSON.stringify(entry.alt_candidates),
      photo_key: photoKey,
    });
    await recordLogForStreak(env.DB, body.deviceId);
    results.push({
      matched: true,
      logId,
      dishId: entry.dish_id,
      quantity: entry.quantity,
      confidence: entry.confidence,
      altCandidates: entry.alt_candidates,
      ...resolved,
    });
  }

  return jsonResponse({ results });
}

async function handleTotals(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId");
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!deviceId || !startUnix || !endUnix) {
    return jsonResponse({ error: "deviceId, start, and end (unix seconds) are required" }, 400);
  }
  const totals = await getTotalsForRange(env.DB, deviceId, Number(startUnix), Number(endUnix));
  return jsonResponse(totals);
}

/** Individual logged items in a range, e.g. for a day-grouped history feed -- /totals only gives the sum. */
async function handleGetLogs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId");
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!deviceId || !startUnix || !endUnix) {
    return jsonResponse({ error: "deviceId, start, and end (unix seconds) are required" }, 400);
  }
  const logs = await getLogsForRange(env.DB, deviceId, Number(startUnix), Number(endUnix));
  return jsonResponse({ logs });
}

/**
 * User-facing edit -- distinct from /admin/correct. Ownership-checked via
 * device_id (the only identity this app has) so one device can't edit
 * another's logs. Recalculates nutrition from the portion size that was
 * already resolved, same reasoning as the admin correction endpoint.
 */
async function handleUserEditLog(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { deviceId?: string; logId?: string; correctDishId?: string };
  if (
    typeof body.deviceId !== "string" ||
    !body.deviceId ||
    typeof body.logId !== "string" ||
    !body.logId ||
    typeof body.correctDishId !== "string" ||
    !body.correctDishId
  ) {
    return jsonResponse({ error: "deviceId, logId, and correctDishId are required" }, 400);
  }

  const log = await getLogOwnedByDevice(env.DB, body.deviceId, body.logId);
  if (!log) return jsonResponse({ error: "log not found" }, 404);

  const dish = await getDishById(env.DB, body.correctDishId);
  if (!dish) return jsonResponse({ error: "correctDishId is not a real dish" }, 404);

  const scale = log.resolved_grams / 100;
  await userEditLog(env.DB, log.id, {
    dish_id: dish.dish_id,
    kcal: dish.per_100g_kcal * scale,
    protein_g: dish.per_100g_protein_g * scale,
    carbs_g: dish.per_100g_carbs_g * scale,
    fat_g: dish.per_100g_fat_g * scale,
    fiber_g: dish.per_100g_fiber_g * scale,
    sugar_g: dish.per_100g_sugar_g * scale,
    sodium_mg: dish.per_100g_sodium_mg * scale,
  });
  return jsonResponse({ ok: true });
}

async function handleUserDeleteLog(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { deviceId?: string; logId?: string };
  if (typeof body.deviceId !== "string" || !body.deviceId || typeof body.logId !== "string" || !body.logId) {
    return jsonResponse({ error: "deviceId and logId are required" }, 400);
  }
  const log = await getLogOwnedByDevice(env.DB, body.deviceId, body.logId);
  if (!log) return jsonResponse({ error: "log not found" }, 404);
  await userDeleteLog(env.DB, log.id);
  return jsonResponse({ ok: true });
}

async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get("deviceId");
  if (!deviceId) return jsonResponse({ error: "deviceId is required" }, 400);
  const profile = await getProfile(env.DB, deviceId);
  return jsonResponse({ profile });
}

/** Computes the real daily_calorie_target server-side -- the client sends raw inputs, never the target itself. */
async function handlePostProfile(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    deviceId?: string;
    gamification_enabled?: boolean;
  } & Record<string, unknown>;
  if (typeof body.deviceId !== "string" || !body.deviceId) {
    return jsonResponse({ error: "deviceId is required" }, 400);
  }
  if (!isValidProfileInput(body)) {
    return jsonResponse({ error: "weight_kg, height_cm, age, gender, activity_level, and goal are required and must be valid" }, 400);
  }
  const daily_calorie_target = calculateDailyCalorieTarget(body);
  await upsertProfile(env.DB, {
    device_id: body.deviceId,
    weight_kg: body.weight_kg,
    height_cm: body.height_cm,
    age: body.age,
    gender: body.gender,
    activity_level: body.activity_level,
    goal: body.goal,
    daily_calorie_target,
    gamification_enabled: body.gamification_enabled === true,
  });
  return jsonResponse({ ok: true, daily_calorie_target });
}

async function handlePostFeedback(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { deviceId?: string; message?: string; context?: string };
  if (typeof body.deviceId !== "string" || !body.deviceId || typeof body.message !== "string" || !body.message.trim()) {
    return jsonResponse({ error: "deviceId and message are required" }, 400);
  }
  await insertFeedback(env.DB, {
    id: crypto.randomUUID(),
    device_id: body.deviceId,
    message: body.message.trim(),
    context: typeof body.context === "string" ? body.context : null,
    created_at: Math.floor(Date.now() / 1000),
  });
  return jsonResponse({ ok: true });
}

// Gate on a shared secret set via `wrangler secret put ADMIN_TOKEN` -- these
// endpoints expose user descriptions and internal error text, so they can't
// be left open.
function isAdmin(request: Request, env: Env): boolean {
  const token = request.headers.get("X-Admin-Token");
  return token !== null && token === env.ADMIN_TOKEN;
}

async function handleAdminUnmatched(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const rows = await getUnmatchedLogs(env.DB);
  return jsonResponse({ count: rows.length, rows });
}

async function handleAdminErrors(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const rows = await getErrorLogs(env.DB);
  return jsonResponse({ count: rows.length, rows });
}

async function handleAdminFeedback(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const rows = await getFeedback(env.DB);
  return jsonResponse({ count: rows.length, rows });
}

/**
 * QA endpoint: recent matched logs with what the AI actually decided
 * (confidence, alternates it weighed) and a link to the photo endpoint
 * below when there was one, so a human can judge whether the AI got it
 * right -- not just see the final resolved nutrition numbers.
 */
async function handleAdminReview(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const rows = await getRecentLogsForReview(env.DB);
  const withPhotoUrls = rows.map((row) => ({
    ...row,
    alt_candidates: row.alt_candidates_json ? JSON.parse(row.alt_candidates_json) : [],
    photo_url: row.photo_key ? `/admin/photo?key=${encodeURIComponent(row.photo_key)}` : null,
  }));
  return jsonResponse({ count: rows.length, rows: withPhotoUrls });
}

/**
 * Fixes a wrong AI match: re-fetches the correct dish and recalculates
 * nutrition using the portion size that was already resolved (grams), so
 * this only corrects *which dish* it was -- not the amount, which the AI
 * usually gets right even when it picks the wrong dish. Keeps
 * original_dish_id from the first correction only, so a later re-correction
 * can't erase the record of what the AI actually guessed.
 */
async function handleAdminCorrect(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const body = (await request.json()) as { logId?: string; correctDishId?: string };
  if (typeof body.logId !== "string" || !body.logId || typeof body.correctDishId !== "string" || !body.correctDishId) {
    return jsonResponse({ error: "logId and correctDishId are required" }, 400);
  }

  const log = await getLogById(env.DB, body.logId);
  if (!log) return jsonResponse({ error: "log not found" }, 404);

  const dish = await getDishById(env.DB, body.correctDishId);
  if (!dish) return jsonResponse({ error: "correctDishId is not a real dish" }, 404);

  const grams = log.resolved_grams;
  const scale = grams / 100;
  await correctLog(env.DB, log.id, {
    dish_id: dish.dish_id,
    // First correction: keep what the AI actually guessed. A later
    // correction on an already-corrected row: don't overwrite that.
    original_dish_id: log.original_dish_id ?? log.dish_id,
    kcal: dish.per_100g_kcal * scale,
    protein_g: dish.per_100g_protein_g * scale,
    carbs_g: dish.per_100g_carbs_g * scale,
    fat_g: dish.per_100g_fat_g * scale,
    fiber_g: dish.per_100g_fiber_g * scale,
    sugar_g: dish.per_100g_sugar_g * scale,
    sodium_mg: dish.per_100g_sodium_mg * scale,
  });

  return jsonResponse({ ok: true, logId: log.id, correctedTo: dish.dish_id });
}

/** Streams a stored photo back for review -- gated the same as the other admin endpoints. */
async function handleAdminPhoto(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return jsonResponse({ error: "unauthorized" }, 401);
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return jsonResponse({ error: "key query param is required" }, 400);
  const object = await getPhoto(env.PHOTOS, key);
  if (!object) return jsonResponse({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      if (request.method === "POST" && url.pathname === "/log/text") {
        return await handleTextLog(request, env);
      }
      if (request.method === "POST" && url.pathname === "/log/photo") {
        return await handlePhotoLog(request, env);
      }
      if (request.method === "GET" && url.pathname === "/totals") {
        return await handleTotals(request, env);
      }
      if (request.method === "GET" && url.pathname === "/logs") {
        return await handleGetLogs(request, env);
      }
      if (request.method === "POST" && url.pathname === "/logs/edit") {
        return await handleUserEditLog(request, env);
      }
      if (request.method === "POST" && url.pathname === "/logs/delete") {
        return await handleUserDeleteLog(request, env);
      }
      if (request.method === "GET" && url.pathname === "/profile") {
        return await handleGetProfile(request, env);
      }
      if (request.method === "POST" && url.pathname === "/profile") {
        return await handlePostProfile(request, env);
      }
      if (request.method === "POST" && url.pathname === "/feedback") {
        return await handlePostFeedback(request, env);
      }
      if (request.method === "GET" && url.pathname === "/admin/unmatched") {
        return await handleAdminUnmatched(request, env);
      }
      if (request.method === "GET" && url.pathname === "/admin/errors") {
        return await handleAdminErrors(request, env);
      }
      if (request.method === "GET" && url.pathname === "/admin/feedback") {
        return await handleAdminFeedback(request, env);
      }
      if (request.method === "GET" && url.pathname === "/admin/review") {
        return await handleAdminReview(request, env);
      }
      if (request.method === "GET" && url.pathname === "/admin/photo") {
        return await handleAdminPhoto(request, env);
      }
      if (request.method === "POST" && url.pathname === "/admin/correct") {
        return await handleAdminCorrect(request, env);
      }
      return jsonResponse({ error: "not found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await insertErrorLog(env.DB, {
          id: crypto.randomUUID(),
          endpoint: url.pathname,
          device_id: null,
          message,
          created_at: Math.floor(Date.now() / 1000),
        });
      } catch {
        // Don't let a failure to record the error mask the real error response.
      }
      return jsonResponse({ error: message }, 500);
    }
  },
};
