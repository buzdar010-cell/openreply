import { buildSearchIndex, shortlist } from "./candidateSearch.ts";
import { parseTextLog, parsePhotoLog } from "./parseLog.ts";
import { acquireViaDurableObject, checkRateLimit } from "./rateLimiter.ts";
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
  setGamificationEnabled,
  recordLogForStreak,
  insertFeedback,
  getFeedback,
  getUserByEmail,
  getUserById,
  createUser,
  markEmailVerified,
  updatePassword,
  createSession,
  getUserIdFromSession,
  deleteSession,
  deleteAllSessionsForUser,
  isTrustedDevice,
  upsertTrustedDevice,
  createOtpCode,
  consumeOtpCode,
  insertExerciseLog,
  getExerciseLogsForRange,
  getExerciseCaloriesForRange,
  deleteExerciseLogOwnedByDevice,
  getTopLoggedDishIds,
  getLastExerciseLogTime,
  insertWeightLog,
  getWeightLogsForRange,
  getAverageWeightForRange,
  getLastWeightLogTime,
  deleteWeightLogOwnedByDevice,
  upsertPushSubscription,
  deletePushSubscription,
  deletePushSubscriptionByEndpoint,
  getPushSubscriptionsOverdueForWeightLog,
  markPushSubscriptionSent,
  insertWaterLog,
  getWaterLogsForRange,
  getWaterTotalForRange,
  deleteWaterLogOwnedByDevice,
} from "./db.ts";
import { computeSignals, selectTips, selectArticles } from "./content/selectContent.ts";
import { ARTICLES } from "./content/articles.ts";
import { computeWeightTrend } from "./weightTrend.ts";
import { sendWebPush, importVapidPrivateKey, base64UrlDecode, type VapidKeyPair } from "./webPush.ts";
import { resolvePortion } from "./resolvePortion.ts";
import { storePhoto, getPhoto } from "./r2.ts";
import { GeminiRateLimiterDO, KeyedRateLimiterDO } from "./rateLimiterDO.ts";
import { calculateDailyCalorieTarget, calculateMacroTargets, calculateWaterTargetMl, isValidProfileInput } from "./goalCalc.ts";
import { calculateCaloriesBurned, isValidActivityType } from "./exerciseCalc.ts";
import { hashPassword, verifyPassword, generateSessionToken, generateDeviceToken, generateOtpCode, hashOtpCode } from "./auth.ts";
import { sendOtpEmail } from "./email.ts";

export { GeminiRateLimiterDO, KeyedRateLimiterDO };

export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RATE_LIMITER: DurableObjectNamespace;
  KEYED_LIMITER: DurableObjectNamespace;
  GEMINI_API_KEY: string;
  ADMIN_TOKEN: string;
  RESEND_API_KEY: string;
  VAPID_PRIVATE_JWK: string; // secret -- see scripts/generate_vapid.mjs
  VAPID_PUBLIC_KEY: string; // not secret -- also embedded in the frontend build to request a push subscription
}

// How long since the last weight log before someone is "overdue" for a reminder --
// matches the in-app banner's cadence and the "after 1 missed day" choice.
const WEIGHT_REMINDER_STALE_SECONDS = 24 * 3600;
const VAPID_SUBJECT = "mailto:buzdar0003@gmail.com";

const SESSION_TTL_SECONDS = 90 * 86400; // 90 days -- casual habit tracker, not a banking app
const OTP_TTL_SECONDS = 10 * 60;

// Resend's shared sending address can currently only deliver to the Resend
// account owner's own inbox (no verified domain yet), so a real signup or
// new-device login can't receive its code and would get stuck. Off until a
// domain is verified in Resend -- flip back to true at that point to
// restore email verification on signup and step-up verification on login.
// Forgot/reset-password is NOT gated by this: skipping it would let anyone
// reset any account just by knowing the email address.
const REQUIRE_EMAIL_VERIFICATION = false;

// Per-account/per-email abuse limits -- separate from the global Gemini
// budget above. Keyed per email (not IP): the threat here is one target
// getting brute-forced or one account looping, not raw traffic volume, and
// email-keying can't be dodged by switching networks the way IP-keying can.
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_CAP = 5; // password guesses per email per window
const SIGNUP_ATTEMPT_CAP = 5; // guards against one email spamming repeated signup/resend calls
const FORGOT_PASSWORD_CAP = 5; // guards against email-bombing someone via repeated reset requests
// Shared across verify-signup, verify-login, and reset-password -- all three
// are "guess a 6-digit code for this email," so splitting attempts across
// them must not multiply the effective attempts allowed.
const CODE_ATTEMPT_CAP = 8;

const LOG_BURST_WINDOW_MS = 60 * 1000;
const LOG_BURST_CAP = 5; // stops a runaway loop/bug instantly, not just at the daily boundary
const LOG_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOG_DAILY_CAP = 40; // generous vs. real usage; caps how much of the shared 500/day Gemini budget one account can take

async function rateLimitOrNull(
  namespace: DurableObjectNamespace,
  key: string,
  capacity: number,
  windowMs: number,
): Promise<Response | null> {
  const { allowed, waitMs } = await checkRateLimit(namespace, key, capacity, windowMs);
  if (allowed) return null;
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  return jsonResponse({ error: `Too many attempts -- try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` }, 429);
}

// The frontend (Cloudflare Pages, a different origin from this Worker's
// own workers.dev domain) needs CORS to call this API from a browser at
// all -- without these headers every fetch() from the deployed app would
// fail silently with an opaque CORS error, never reaching this code.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token, Authorization",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Resolves the bearer session token to a real, server-verified user id -- the only source of identity for every data endpoint below. */
async function requireAuth(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return getUserIdFromSession(env.DB, token);
}

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8;
}

// ---- Auth: signup, email verification, login, step-up verification, logout ----

async function handleSignup(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string; password?: string };
  if (!isValidEmail(body.email) || !isValidPassword(body.password)) {
    return jsonResponse({ error: "a valid email and a password of at least 8 characters are required" }, 400);
  }
  const email = body.email.toLowerCase();
  const limited = await rateLimitOrNull(env.KEYED_LIMITER, `signup:${email}`, SIGNUP_ATTEMPT_CAP, AUTH_ATTEMPT_WINDOW_MS);
  if (limited) return limited;

  const existing = await getUserByEmail(env.DB, email);
  const { hash, salt } = await hashPassword(body.password);

  let userId: string;
  if (existing) {
    if (existing.email_verified) {
      return jsonResponse({ error: "an account with this email already exists -- try logging in instead" }, 409);
    }
    // Started signup before but never verified -- update the password (in
    // case of a typo the first time) and send a fresh code rather than
    // erroring on an account nobody ever actually finished creating.
    await updatePassword(env.DB, existing.id, hash, salt);
    userId = existing.id;
  } else {
    userId = crypto.randomUUID();
    await createUser(env.DB, { id: userId, email, password_hash: hash, password_salt: salt });
  }

  if (!REQUIRE_EMAIL_VERIFICATION) {
    await markEmailVerified(env.DB, userId);
    const sessionToken = generateSessionToken();
    await createSession(env.DB, sessionToken, userId, SESSION_TTL_SECONDS);
    const deviceToken = generateDeviceToken();
    const country = (request as unknown as { cf?: { country?: string } }).cf?.country ?? null;
    await upsertTrustedDevice(env.DB, deviceToken, userId, country);
    return jsonResponse({ sessionToken, deviceToken });
  }

  const code = generateOtpCode();
  await createOtpCode(env.DB, {
    id: crypto.randomUUID(),
    email,
    code_hash: await hashOtpCode(code),
    purpose: "signup",
    ttlSeconds: OTP_TTL_SECONDS,
  });
  await sendOtpEmail(env.RESEND_API_KEY, email, code, "signup");
  return jsonResponse({ ok: true });
}

async function handleVerifySignup(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string; code?: string };
  if (!isValidEmail(body.email) || typeof body.code !== "string") {
    return jsonResponse({ error: "email and code are required" }, 400);
  }
  const email = body.email.toLowerCase();
  const limited = await rateLimitOrNull(env.KEYED_LIMITER, `code:${email}`, CODE_ATTEMPT_CAP, AUTH_ATTEMPT_WINDOW_MS);
  if (limited) return limited;

  const valid = await consumeOtpCode(env.DB, email, await hashOtpCode(body.code), "signup");
  if (!valid) return jsonResponse({ error: "that code is invalid or has expired" }, 400);

  const user = await getUserByEmail(env.DB, email);
  if (!user) return jsonResponse({ error: "account not found" }, 404);
  await markEmailVerified(env.DB, user.id);

  const sessionToken = generateSessionToken();
  await createSession(env.DB, sessionToken, user.id, SESSION_TTL_SECONDS);
  const deviceToken = generateDeviceToken();
  const country = (request as unknown as { cf?: { country?: string } }).cf?.country ?? null;
  await upsertTrustedDevice(env.DB, deviceToken, user.id, country);

  return jsonResponse({ sessionToken, deviceToken });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string; password?: string; deviceToken?: string };
  if (!isValidEmail(body.email) || typeof body.password !== "string") {
    return jsonResponse({ error: "email and password are required" }, 400);
  }
  const email = body.email.toLowerCase();
  const limited = await rateLimitOrNull(env.KEYED_LIMITER, `login:${email}`, LOGIN_ATTEMPT_CAP, AUTH_ATTEMPT_WINDOW_MS);
  if (limited) return limited;

  const user = await getUserByEmail(env.DB, email);
  // Same generic error whether the email doesn't exist or the password is
  // wrong -- never reveal which one it was.
  const invalidCreds = () => jsonResponse({ error: "invalid email or password" }, 401);
  if (!user) return invalidCreds();
  const passwordOk = await verifyPassword(body.password, user.password_hash, user.password_salt);
  if (!passwordOk) return invalidCreds();

  const country = (request as unknown as { cf?: { country?: string } }).cf?.country ?? null;
  const trusted =
    !REQUIRE_EMAIL_VERIFICATION ||
    (typeof body.deviceToken === "string" && (await isTrustedDevice(env.DB, body.deviceToken, user.id, country)));

  if (trusted) {
    const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken : generateDeviceToken();
    await upsertTrustedDevice(env.DB, deviceToken, user.id, country);
    const sessionToken = generateSessionToken();
    await createSession(env.DB, sessionToken, user.id, SESSION_TTL_SECONDS);
    return jsonResponse({ status: "logged_in", sessionToken, deviceToken });
  }

  // New device or a location change from what we've seen for this user --
  // step-up verification before completing the login.
  const code = generateOtpCode();
  await createOtpCode(env.DB, {
    id: crypto.randomUUID(),
    email,
    code_hash: await hashOtpCode(code),
    purpose: "login",
    ttlSeconds: OTP_TTL_SECONDS,
  });
  await sendOtpEmail(env.RESEND_API_KEY, email, code, "login");
  return jsonResponse({ status: "verification_required" });
}

async function handleVerifyLogin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string; code?: string };
  if (!isValidEmail(body.email) || typeof body.code !== "string") {
    return jsonResponse({ error: "email and code are required" }, 400);
  }
  const email = body.email.toLowerCase();
  const limited = await rateLimitOrNull(env.KEYED_LIMITER, `code:${email}`, CODE_ATTEMPT_CAP, AUTH_ATTEMPT_WINDOW_MS);
  if (limited) return limited;

  const valid = await consumeOtpCode(env.DB, email, await hashOtpCode(body.code), "login");
  if (!valid) return jsonResponse({ error: "that code is invalid or has expired" }, 400);

  const user = await getUserByEmail(env.DB, email);
  if (!user) return jsonResponse({ error: "account not found" }, 404);

  const sessionToken = generateSessionToken();
  await createSession(env.DB, sessionToken, user.id, SESSION_TTL_SECONDS);
  const deviceToken = generateDeviceToken();
  const country = (request as unknown as { cf?: { country?: string } }).cf?.country ?? null;
  await upsertTrustedDevice(env.DB, deviceToken, user.id, country);

  return jsonResponse({ sessionToken, deviceToken });
}

async function handleForgotPassword(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string };
  if (!isValidEmail(body.email)) return jsonResponse({ error: "a valid email is required" }, 400);
  const email = body.email.toLowerCase();
  const limited = await rateLimitOrNull(env.KEYED_LIMITER, `forgot:${email}`, FORGOT_PASSWORD_CAP, AUTH_ATTEMPT_WINDOW_MS);
  if (limited) return limited;

  const user = await getUserByEmail(env.DB, email);
  // Always return ok, whether or not the account exists -- never let this
  // endpoint be used to check which emails are registered.
  if (user) {
    const code = generateOtpCode();
    await createOtpCode(env.DB, {
      id: crypto.randomUUID(),
      email,
      code_hash: await hashOtpCode(code),
      purpose: "reset",
      ttlSeconds: OTP_TTL_SECONDS,
    });
    await sendOtpEmail(env.RESEND_API_KEY, email, code, "reset");
  }
  return jsonResponse({ ok: true });
}

async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { email?: string; code?: string; newPassword?: string };
  if (!isValidEmail(body.email) || typeof body.code !== "string" || !isValidPassword(body.newPassword)) {
    return jsonResponse({ error: "email, code, and a new password of at least 8 characters are required" }, 400);
  }
  const email = body.email.toLowerCase();
  const limited = await rateLimitOrNull(env.KEYED_LIMITER, `code:${email}`, CODE_ATTEMPT_CAP, AUTH_ATTEMPT_WINDOW_MS);
  if (limited) return limited;

  const valid = await consumeOtpCode(env.DB, email, await hashOtpCode(body.code), "reset");
  if (!valid) return jsonResponse({ error: "that code is invalid or has expired" }, 400);

  const user = await getUserByEmail(env.DB, email);
  if (!user) return jsonResponse({ error: "account not found" }, 404);

  const { hash, salt } = await hashPassword(body.newPassword);
  await updatePassword(env.DB, user.id, hash, salt);
  // Force re-login everywhere, not just on the device that reset it --
  // standard practice after a password change.
  await deleteAllSessionsForUser(env.DB, user.id);
  return jsonResponse({ ok: true });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) {
    await deleteSession(env.DB, header.slice("Bearer ".length));
  }
  return jsonResponse({ ok: true });
}

// ---- Food logging and the rest of the app, now identity-checked via requireAuth ----

/**
 * Caps how much of the shared Gemini budget one account can take -- a
 * burst check (stops a runaway loop/bug immediately) and a daily check
 * (bounds the total). Checked before the Gemini call itself, so a denied
 * request never spends any quota.
 */
async function logRateLimitOrNull(env: Env, userId: string): Promise<Response | null> {
  const burst = await rateLimitOrNull(env.KEYED_LIMITER, `log-burst:${userId}`, LOG_BURST_CAP, LOG_BURST_WINDOW_MS);
  if (burst) return burst;
  return rateLimitOrNull(env.KEYED_LIMITER, `log-day:${userId}`, LOG_DAILY_CAP, LOG_DAILY_WINDOW_MS);
}

async function handleTextLog(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const limited = await logRateLimitOrNull(env, userId);
  if (limited) return limited;

  const body = (await request.json()) as { text?: string; loggedAt?: number };
  if (typeof body.text !== "string" || !body.text) {
    return jsonResponse({ error: "text is required and must be a string" }, 400);
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
        device_id: userId,
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
      device_id: userId,
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
    await recordLogForStreak(env.DB, userId);
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
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const limited = await logRateLimitOrNull(env, userId);
  if (limited) return limited;

  const body = (await request.json()) as {
    imageBase64?: string;
    mimeType?: "image/jpeg" | "image/png" | "image/webp";
    caption?: string;
    loggedAt?: number;
  };
  const mimeType = body.mimeType;
  if (
    typeof body.imageBase64 !== "string" ||
    !body.imageBase64 ||
    (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp")
  ) {
    return jsonResponse(
      { error: "imageBase64 must be a string; mimeType must be one of image/jpeg, image/png, image/webp" },
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
  const photoKey = await storePhoto(env.PHOTOS, userId, photoLogId, imageBytes, mimeType);

  for (const entry of parsed) {
    if (entry.dish_id === "none_of_these") {
      results.push({ matched: false, description: entry.free_text_description });
      await insertUnmatchedLog(env.DB, {
        id: crypto.randomUUID(),
        device_id: userId,
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
      device_id: userId,
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
    await recordLogForStreak(env.DB, userId);
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
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!startUnix || !endUnix) {
    return jsonResponse({ error: "start and end (unix seconds) are required" }, 400);
  }
  const totals = await getTotalsForRange(env.DB, userId, Number(startUnix), Number(endUnix));
  const exercise_kcal = await getExerciseCaloriesForRange(env.DB, userId, Number(startUnix), Number(endUnix));
  return jsonResponse({ ...totals, exercise_kcal });
}

/** Individual logged items in a range, e.g. for a day-grouped history feed -- /totals only gives the sum. */
async function handleGetLogs(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!startUnix || !endUnix) {
    return jsonResponse({ error: "start and end (unix seconds) are required" }, 400);
  }
  const logs = await getLogsForRange(env.DB, userId, Number(startUnix), Number(endUnix));
  return jsonResponse({ logs });
}

/**
 * User-facing edit -- distinct from /admin/correct. Ownership-checked via
 * the authenticated user id so one account can't edit another's logs.
 * Recalculates nutrition from the portion size that was already resolved,
 * same reasoning as the admin correction endpoint.
 */
async function handleUserEditLog(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { logId?: string; correctDishId?: string };
  if (typeof body.logId !== "string" || !body.logId || typeof body.correctDishId !== "string" || !body.correctDishId) {
    return jsonResponse({ error: "logId and correctDishId are required" }, 400);
  }

  const log = await getLogOwnedByDevice(env.DB, userId, body.logId);
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
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { logId?: string };
  if (typeof body.logId !== "string" || !body.logId) {
    return jsonResponse({ error: "logId is required" }, 400);
  }
  const log = await getLogOwnedByDevice(env.DB, userId, body.logId);
  if (!log) return jsonResponse({ error: "log not found" }, 404);
  await userDeleteLog(env.DB, log.id);
  return jsonResponse({ ok: true });
}

// ---- Exercise logging -- separate from food logs, no Gemini call involved ----

async function handleExerciseLog(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { activityType?: string; durationMinutes?: number; loggedAt?: number };
  if (!isValidActivityType(body.activityType)) {
    return jsonResponse({ error: "a valid activityType is required" }, 400);
  }
  if (typeof body.durationMinutes !== "number" || body.durationMinutes <= 0 || body.durationMinutes > 600) {
    return jsonResponse({ error: "durationMinutes must be a number between 1 and 600" }, 400);
  }

  // Calories burned scale with body weight -- can't compute this without it.
  const profile = await getProfile(env.DB, userId);
  if (!profile?.weight_kg) {
    return jsonResponse({ error: "add your weight in Profile & Goals before logging exercise" }, 400);
  }

  const caloriesBurned = calculateCaloriesBurned(body.activityType, profile.weight_kg, body.durationMinutes);
  const logId = crypto.randomUUID();
  const loggedAt = body.loggedAt ?? Math.floor(Date.now() / 1000);
  await insertExerciseLog(env.DB, {
    id: logId,
    device_id: userId,
    activity_type: body.activityType,
    duration_minutes: body.durationMinutes,
    calories_burned: caloriesBurned,
    logged_at: loggedAt,
  });

  return jsonResponse({ logId, activityType: body.activityType, durationMinutes: body.durationMinutes, caloriesBurned });
}

async function handleGetExerciseLogs(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!startUnix || !endUnix) {
    return jsonResponse({ error: "start and end (unix seconds) are required" }, 400);
  }
  const logs = await getExerciseLogsForRange(env.DB, userId, Number(startUnix), Number(endUnix));
  return jsonResponse({ logs });
}

async function handleDeleteExerciseLog(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const body = (await request.json()) as { logId?: string };
  if (typeof body.logId !== "string" || !body.logId) {
    return jsonResponse({ error: "logId is required" }, 400);
  }
  const deleted = await deleteExerciseLogOwnedByDevice(env.DB, userId, body.logId);
  if (!deleted) return jsonResponse({ error: "log not found" }, 404);
  return jsonResponse({ ok: true });
}

// ---- Weight logging + trend ----

async function handleLogWeight(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { weightKg?: number; loggedAt?: number };
  if (typeof body.weightKg !== "number" || body.weightKg <= 20 || body.weightKg >= 400) {
    return jsonResponse({ error: "weightKg must be a number between 20 and 400" }, 400);
  }

  const logId = crypto.randomUUID();
  const loggedAt = body.loggedAt ?? Math.floor(Date.now() / 1000);
  await insertWeightLog(env.DB, { id: logId, device_id: userId, weight_kg: body.weightKg, logged_at: loggedAt });
  return jsonResponse({ logId, weightKg: body.weightKg, loggedAt });
}

async function handleGetWeightLogs(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!startUnix || !endUnix) {
    return jsonResponse({ error: "start and end (unix seconds) are required" }, 400);
  }
  const logs = await getWeightLogsForRange(env.DB, userId, Number(startUnix), Number(endUnix));
  return jsonResponse({ logs });
}

async function handleDeleteWeightLog(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const body = (await request.json()) as { logId?: string };
  if (typeof body.logId !== "string" || !body.logId) {
    return jsonResponse({ error: "logId is required" }, 400);
  }
  const deleted = await deleteWeightLogOwnedByDevice(env.DB, userId, body.logId);
  if (!deleted) return jsonResponse({ error: "log not found" }, 404);
  return jsonResponse({ ok: true });
}

const WEIGHT_TREND_WINDOW_SECONDS = 7 * 86400;

/** The trend + goal-mismatch verdict shown on Home -- see weightTrend.ts for the math and why it's never an automatic target change. */
async function handleGetWeightTrend(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const now = Math.floor(Date.now() / 1000);
  const [profile, recentLogs, recentAvgKg, priorAvgKg] = await Promise.all([
    getProfile(env.DB, userId),
    getWeightLogsForRange(env.DB, userId, now - WEIGHT_TREND_WINDOW_SECONDS, now),
    getAverageWeightForRange(env.DB, userId, now - WEIGHT_TREND_WINDOW_SECONDS, now),
    getAverageWeightForRange(env.DB, userId, now - 2 * WEIGHT_TREND_WINDOW_SECONDS, now - WEIGHT_TREND_WINDOW_SECONDS),
  ]);

  const latestWeightKg = recentLogs[0]?.weight_kg ?? null; // recentLogs is DESC-ordered, so [0] is the most recent
  const trend = computeWeightTrend({ goal: profile?.goal ?? null, latestWeightKg, recentAvgKg, priorAvgKg });

  // Sparkline points -- oldest first, last 14 days, whatever's actually logged.
  const sparkline = await getWeightLogsForRange(env.DB, userId, now - 2 * WEIGHT_TREND_WINDOW_SECONDS, now);
  return jsonResponse({
    ...trend,
    points: sparkline.slice().reverse().map((l) => ({ weightKg: l.weight_kg, loggedAt: l.logged_at })),
  });
}

// ---- Water logs ----

async function handleLogWater(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { amountMl?: number; loggedAt?: number };
  if (typeof body.amountMl !== "number" || body.amountMl <= 0 || body.amountMl > 5000) {
    return jsonResponse({ error: "amountMl must be a number between 1 and 5000" }, 400);
  }

  const logId = crypto.randomUUID();
  const loggedAt = body.loggedAt ?? Math.floor(Date.now() / 1000);
  await insertWaterLog(env.DB, { id: logId, device_id: userId, amount_ml: body.amountMl, logged_at: loggedAt });
  return jsonResponse({ logId, amountMl: body.amountMl, loggedAt });
}

async function handleGetWaterLogs(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!startUnix || !endUnix) {
    return jsonResponse({ error: "start and end (unix seconds) are required" }, 400);
  }
  const logs = await getWaterLogsForRange(env.DB, userId, Number(startUnix), Number(endUnix));
  return jsonResponse({ logs });
}

async function handleDeleteWaterLog(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const body = (await request.json()) as { logId?: string };
  if (typeof body.logId !== "string" || !body.logId) {
    return jsonResponse({ error: "logId is required" }, 400);
  }
  const deleted = await deleteWaterLogOwnedByDevice(env.DB, userId, body.logId);
  if (!deleted) return jsonResponse({ error: "log not found" }, 404);
  return jsonResponse({ ok: true });
}

// ---- Daily todo checklist ----

/** Today's state for the Home checklist -- "today" is whatever [start, end) range the caller supplies, same convention as /totals. */
async function handleGetTodo(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const startUnix = url.searchParams.get("start");
  const endUnix = url.searchParams.get("end");
  if (!startUnix || !endUnix) {
    return jsonResponse({ error: "start and end (unix seconds) are required" }, 400);
  }
  const start = Number(startUnix);
  const end = Number(endUnix);

  const [profile, weightLogs, waterMl, foodLogs, exerciseKcal] = await Promise.all([
    getProfile(env.DB, userId),
    getWeightLogsForRange(env.DB, userId, start, end),
    getWaterTotalForRange(env.DB, userId, start, end),
    getLogsForRange(env.DB, userId, start, end),
    getExerciseCaloriesForRange(env.DB, userId, start, end),
  ]);

  return jsonResponse({
    weightLoggedToday: weightLogs.length > 0,
    waterMl,
    waterTargetMl: calculateWaterTargetMl(profile?.weight_kg ?? null),
    mealLoggedToday: foodLogs.length > 0,
    exerciseLoggedToday: exerciseKcal > 0,
  });
}

// ---- Push notifications ----

async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (typeof body.endpoint !== "string" || !body.endpoint || typeof body.keys?.p256dh !== "string" || typeof body.keys?.auth !== "string") {
    return jsonResponse({ error: "endpoint and keys.p256dh/keys.auth are required" }, 400);
  }

  await upsertPushSubscription(env.DB, { userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth });
  return jsonResponse({ ok: true });
}

async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { endpoint?: string };
  if (typeof body.endpoint !== "string" || !body.endpoint) {
    return jsonResponse({ error: "endpoint is required" }, 400);
  }

  await deletePushSubscription(env.DB, userId, body.endpoint);
  return jsonResponse({ ok: true });
}

async function handleGetProfile(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const profile = await getProfile(env.DB, userId);
  return jsonResponse({ profile });
}

const SIGNALS_WINDOW_SECONDS = 7 * 86400;

/**
 * Personalized "Tips for you" + a short rotating articles list for Home.
 * Selection is a deterministic rules match against real signals from this
 * account's own recent logs/profile (see content/selectContent.ts) -- no
 * AI call, so it costs nothing and never drifts into made-up advice.
 * Seeded by (userId, today's date) so picks are stable within a day and
 * rotate day to day, without needing to persist "what was shown" anywhere.
 */
async function handleHomeContent(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - SIGNALS_WINDOW_SECONDS;
  const [profile, weeklyTotals, topDishIds, lastExerciseLogAt] = await Promise.all([
    getProfile(env.DB, userId),
    getTotalsForRange(env.DB, userId, weekAgo, now),
    getTopLoggedDishIds(env.DB, userId, weekAgo, now, 5),
    getLastExerciseLogTime(env.DB, userId),
  ]);

  const signals = computeSignals({
    goal: profile?.goal ?? null,
    avgSodiumMg: weeklyTotals.sodium_mg / 7,
    avgProteinG: weeklyTotals.protein_g / 7,
    proteinTargetG: profile?.protein_target_g ?? null,
    topDishIds,
    lastExerciseLogAt,
    nowUnix: now,
  });

  const today = new Date(now * 1000).toISOString().slice(0, 10);
  const seed = `${userId}:${today}`;
  const tips = selectTips(signals, seed);
  const articles = selectArticles(seed);

  return jsonResponse({
    tips: tips.map((t) => ({ id: t.id, emoji: t.emoji, title: t.title, body: t.body })),
    articles: articles.map((a) => ({ id: a.id, emoji: a.emoji, title: a.title, summary: a.summary })),
  });
}

async function handleGetArticle(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const article = ARTICLES.find((a) => a.id === id);
  if (!article) return jsonResponse({ error: "article not found" }, 404);
  return jsonResponse({ article });
}

/**
 * Standalone endpoint so toggling gamification never requires a complete
 * profile to exist -- it previously shared a save action with the full
 * goals form, which meant flipping it with an incomplete profile silently
 * never persisted. This can never fail on missing weight/height/etc.
 */
async function handlePostGamification(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);
  const body = (await request.json()) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return jsonResponse({ error: "enabled (boolean) is required" }, 400);
  }
  await setGamificationEnabled(env.DB, userId, body.enabled);
  return jsonResponse({ ok: true });
}

/** Computes the real daily_calorie_target server-side -- the client sends raw inputs, never the target itself. */
async function handlePostProfile(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { gamification_enabled?: boolean } & Record<string, unknown>;
  if (!isValidProfileInput(body)) {
    return jsonResponse({ error: "weight_kg, height_cm, age, gender, activity_level, and goal are required and must be valid" }, 400);
  }
  const daily_calorie_target = calculateDailyCalorieTarget(body);
  const { protein_g, carbs_g, fat_g } = calculateMacroTargets(daily_calorie_target, body.weight_kg);
  await upsertProfile(env.DB, {
    device_id: userId,
    weight_kg: body.weight_kg,
    height_cm: body.height_cm,
    age: body.age,
    gender: body.gender,
    activity_level: body.activity_level,
    goal: body.goal,
    daily_calorie_target,
    protein_target_g: protein_g,
    carbs_target_g: carbs_g,
    fat_target_g: fat_g,
    gamification_enabled: body.gamification_enabled === true,
  });
  return jsonResponse({
    ok: true,
    daily_calorie_target,
    protein_target_g: protein_g,
    carbs_target_g: carbs_g,
    fat_target_g: fat_g,
  });
}

async function handlePostFeedback(request: Request, env: Env): Promise<Response> {
  const userId = await requireAuth(request, env);
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const body = (await request.json()) as { message?: string; context?: string };
  if (typeof body.message !== "string" || !body.message.trim()) {
    return jsonResponse({ error: "message is required" }, 400);
  }
  await insertFeedback(env.DB, {
    id: crypto.randomUUID(),
    device_id: userId,
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

/** Daily cron: nudge anyone overdue for a weight log who has an active push subscription. See db.ts's query for the exact "overdue" + "not already reminded" logic. */
async function sendWeightReminders(env: Env): Promise<void> {
  const subs = await getPushSubscriptionsOverdueForWeightLog(env.DB, WEIGHT_REMINDER_STALE_SECONDS);
  if (subs.length === 0) return;

  const vapid: VapidKeyPair = {
    privateKey: await importVapidPrivateKey(env.VAPID_PRIVATE_JWK),
    publicKeyRaw: base64UrlDecode(env.VAPID_PUBLIC_KEY),
  };
  const payload = { title: "Time for a check-in", body: "Haven't logged your weight in a while -- worth a quick update?" };

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, vapid, VAPID_SUBJECT);
      if (result.ok) {
        await markPushSubscriptionSent(env.DB, sub.id);
      } else if (result.expired) {
        await deletePushSubscriptionByEndpoint(env.DB, sub.endpoint);
      }
      // A non-expired failure (e.g. a transient 5xx from the push service) is left alone --
      // it'll just get retried on tomorrow's run rather than needing its own retry logic here.
    }),
  );
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await sendWeightReminders(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      if (request.method === "POST" && url.pathname === "/auth/signup") {
        return await handleSignup(request, env);
      }
      if (request.method === "POST" && url.pathname === "/auth/verify-signup") {
        return await handleVerifySignup(request, env);
      }
      if (request.method === "POST" && url.pathname === "/auth/login") {
        return await handleLogin(request, env);
      }
      if (request.method === "POST" && url.pathname === "/auth/verify-login") {
        return await handleVerifyLogin(request, env);
      }
      if (request.method === "POST" && url.pathname === "/auth/forgot-password") {
        return await handleForgotPassword(request, env);
      }
      if (request.method === "POST" && url.pathname === "/auth/reset-password") {
        return await handleResetPassword(request, env);
      }
      if (request.method === "POST" && url.pathname === "/auth/logout") {
        return await handleLogout(request, env);
      }
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
      if (request.method === "POST" && url.pathname === "/log/exercise") {
        return await handleExerciseLog(request, env);
      }
      if (request.method === "GET" && url.pathname === "/logs/exercise") {
        return await handleGetExerciseLogs(request, env);
      }
      if (request.method === "POST" && url.pathname === "/logs/exercise/delete") {
        return await handleDeleteExerciseLog(request, env);
      }
      if (request.method === "POST" && url.pathname === "/log/weight") {
        return await handleLogWeight(request, env);
      }
      if (request.method === "GET" && url.pathname === "/logs/weight") {
        return await handleGetWeightLogs(request, env);
      }
      if (request.method === "POST" && url.pathname === "/logs/weight/delete") {
        return await handleDeleteWeightLog(request, env);
      }
      if (request.method === "GET" && url.pathname === "/weight-trend") {
        return await handleGetWeightTrend(request, env);
      }
      if (request.method === "POST" && url.pathname === "/log/water") {
        return await handleLogWater(request, env);
      }
      if (request.method === "GET" && url.pathname === "/logs/water") {
        return await handleGetWaterLogs(request, env);
      }
      if (request.method === "POST" && url.pathname === "/logs/water/delete") {
        return await handleDeleteWaterLog(request, env);
      }
      if (request.method === "GET" && url.pathname === "/todo") {
        return await handleGetTodo(request, env);
      }
      if (request.method === "POST" && url.pathname === "/push/subscribe") {
        return await handlePushSubscribe(request, env);
      }
      if (request.method === "POST" && url.pathname === "/push/unsubscribe") {
        return await handlePushUnsubscribe(request, env);
      }
      if (request.method === "GET" && url.pathname === "/profile") {
        return await handleGetProfile(request, env);
      }
      if (request.method === "GET" && url.pathname === "/home-content") {
        return await handleHomeContent(request, env);
      }
      if (request.method === "GET" && url.pathname === "/article") {
        return await handleGetArticle(request, env);
      }
      if (request.method === "POST" && url.pathname === "/profile") {
        return await handlePostProfile(request, env);
      }
      if (request.method === "POST" && url.pathname === "/profile/gamification") {
        return await handlePostGamification(request, env);
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
