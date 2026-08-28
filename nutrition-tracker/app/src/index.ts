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
} from "./db.ts";
import { resolvePortion } from "./resolvePortion.ts";
import { storePhoto } from "./r2.ts";
import { GeminiRateLimiterDO } from "./rateLimiterDO.ts";

export { GeminiRateLimiterDO };

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RATE_LIMITER: DurableObjectNamespace;
  GEMINI_API_KEY: string;
  ADMIN_TOKEN: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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
    });
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

  for (const entry of parsed) {
    const logId = crypto.randomUUID();

    if (entry.dish_id === "none_of_these") {
      results.push({ matched: false, description: entry.free_text_description });
      await insertUnmatchedLog(env.DB, {
        id: crypto.randomUUID(),
        device_id: body.deviceId,
        description: entry.free_text_description ?? body.caption ?? "(photo, no caption)",
        source: "photo",
        created_at: Math.floor(Date.now() / 1000),
      });
      continue;
    }
    const dish = await getDishById(env.DB, entry.dish_id);
    if (!dish) {
      results.push({ matched: false, description: entry.free_text_description ?? entry.dish_id });
      continue;
    }

    const imageBytes = Uint8Array.from(atob(body.imageBase64), (c) => c.charCodeAt(0)).buffer;
    await storePhoto(env.PHOTOS, body.deviceId, logId, imageBytes, mimeType);

    const resolved = resolvePortion(entry, dish);
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
    });
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
      if (request.method === "GET" && url.pathname === "/admin/unmatched") {
        return await handleAdminUnmatched(request, env);
      }
      if (request.method === "GET" && url.pathname === "/admin/errors") {
        return await handleAdminErrors(request, env);
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
