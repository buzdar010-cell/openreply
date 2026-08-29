/**
 * Durable Object version of the token-bucket rate limiter.
 *
 * Why this exists: rateLimiter.ts's in-memory TokenBucket is correct logic
 * but wrong storage location for production -- Cloudflare Workers run many
 * instances of your code simultaneously across the edge, so an in-memory
 * bucket in one instance can't see requests hitting a different instance.
 * A Durable Object is Cloudflare's mechanism for exactly this problem: one
 * named instance is the single, globally-consistent source of truth that
 * every Worker instance talks to over a request, instead of each instance
 * keeping its own (wrong) copy of the state.
 *
 * The token-bucket math itself is identical to TokenBucket in rateLimiter.ts
 * -- only where the counters live has changed. One DO instance (a fixed,
 * well-known ID -- see GEMINI_LIMITER_ID below) backs the whole app's
 * Gemini rate limit, since the 15 RPM ceiling is per-project, not per-user.
 */

export const GEMINI_LIMITER_ID = "gemini-flash-lite-global";

interface BucketState {
  tokens: number;
  lastRefill: number;
  lastDispatch: number;
}

const CAPACITY = 15; // matches gemini-3.1-flash-lite's confirmed free-tier RPM
const REFILL_INTERVAL_MS = 60_000 / CAPACITY; // one token every 4 seconds

// Banked tokens let a burst of concurrent requests all get granted in the
// same instant -- fine for our own 15/min accounting, but a real burst like
// that still tripped Gemini's own (undocumented) transient 429 protection
// under production load-testing, even while staying under the 15 RPM
// average. Spacing grants out by this much, even when tokens are available,
// staggers a burst without meaningfully slowing single-user usage (nobody
// logs two meals in the same 500ms).
const MIN_DISPATCH_SPACING_MS = 1500;

export class GeminiRateLimiterDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async getBucket(): Promise<BucketState> {
    const stored = await this.state.storage.get<BucketState>("bucket");
    if (!stored) return { tokens: CAPACITY, lastRefill: Date.now(), lastDispatch: 0 };
    // Defensive: a bucket written by a pre-lastDispatch version of this class
    // (this DO's storage outlives any single Worker deploy) would be missing
    // the field entirely, and `now - undefined` is NaN, not a real gap --
    // treat that the same as "never dispatched" rather than let NaN leak
    // into the comparison below and produce a NaN waitMs.
    return { ...stored, lastDispatch: stored.lastDispatch ?? 0 };
  }

  private refill(bucket: BucketState, now: number): BucketState {
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / REFILL_INTERVAL_MS);
    if (tokensToAdd <= 0) return bucket;
    return {
      ...bucket,
      tokens: Math.min(CAPACITY, bucket.tokens + tokensToAdd),
      lastRefill: bucket.lastRefill + tokensToAdd * REFILL_INTERVAL_MS,
    };
  }

  /**
   * GET /acquire -- returns { waitMs: 0 } and consumes a token if one's
   * available right now, or { waitMs: N } (without consuming) if the caller
   * needs to wait N ms and retry. Mirrors TokenBucket.tryAcquire()'s contract
   * in rateLimiter.ts so callers behave identically either way.
   */
  async fetch(request: Request): Promise<Response> {
    const now = Date.now();
    let bucket = await this.getBucket();
    bucket = this.refill(bucket, now);

    const sinceLastDispatch = now - bucket.lastDispatch;
    if (bucket.tokens > 0 && sinceLastDispatch >= MIN_DISPATCH_SPACING_MS) {
      bucket = { ...bucket, tokens: bucket.tokens - 1, lastDispatch: now };
      await this.state.storage.put("bucket", bucket);
      return Response.json({ waitMs: 0 });
    }

    await this.state.storage.put("bucket", bucket); // persist the refill progress even on failure

    if (bucket.tokens > 0) {
      // Token available, but too soon after the last grant -- stagger it.
      return Response.json({ waitMs: MIN_DISPATCH_SPACING_MS - sinceLastDispatch });
    }
    const msSinceLastRefill = now - bucket.lastRefill;
    const waitMs = Math.max(0, REFILL_INTERVAL_MS - msSinceLastRefill);
    return Response.json({ waitMs });
  }
}

/**
 * Generic per-key token bucket, used for everything the Gemini limiter
 * above doesn't cover: per-user food-log throttling (so one account can't
 * burn the whole shared Gemini budget alone) and per-email attempt limits
 * on login/signup/OTP-code endpoints (which have no abuse protection
 * otherwise -- unlike the Gemini limiter, brute-forcing a password or a
 * 6-digit code costs nothing to attempt).
 *
 * Unlike GeminiRateLimiterDO, capacity and window aren't fixed per class --
 * every caller names its own Durable Object instance (e.g. `login:<email>`,
 * `log-burst:<userId>`) via idFromName, so the same class safely serves many
 * independent buckets with different limits, each isolated by its own
 * instance storage. No MIN_DISPATCH_SPACING here -- that was specifically
 * to smooth bursts past Gemini's own transient rate protection, not
 * something an attempt-cap needs.
 */
interface KeyedBucketState {
  tokens: number;
  lastRefill: number;
}

export class KeyedRateLimiterDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const capacity = Number(url.searchParams.get("capacity"));
    const windowMs = Number(url.searchParams.get("windowMs"));
    const refillIntervalMs = windowMs / capacity;
    const now = Date.now();

    const stored = await this.state.storage.get<KeyedBucketState>("bucket");
    let bucket = stored ?? { tokens: capacity, lastRefill: now };

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / refillIntervalMs);
    if (tokensToAdd > 0) {
      bucket = {
        tokens: Math.min(capacity, bucket.tokens + tokensToAdd),
        lastRefill: bucket.lastRefill + tokensToAdd * refillIntervalMs,
      };
    }

    if (bucket.tokens > 0) {
      bucket = { ...bucket, tokens: bucket.tokens - 1 };
      await this.state.storage.put("bucket", bucket);
      return Response.json({ allowed: true });
    }

    await this.state.storage.put("bucket", bucket); // persist refill progress even when denying
    const waitMs = Math.max(0, refillIntervalMs - (now - bucket.lastRefill));
    return Response.json({ allowed: false, waitMs });
  }
}
