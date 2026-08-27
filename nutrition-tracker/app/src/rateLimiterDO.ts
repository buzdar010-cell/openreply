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
}

const CAPACITY = 15; // matches gemini-3.1-flash-lite's confirmed free-tier RPM
const REFILL_INTERVAL_MS = 60_000 / CAPACITY; // one token every 4 seconds

export class GeminiRateLimiterDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async getBucket(): Promise<BucketState> {
    const stored = await this.state.storage.get<BucketState>("bucket");
    return stored ?? { tokens: CAPACITY, lastRefill: Date.now() };
  }

  private refill(bucket: BucketState, now: number): BucketState {
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / REFILL_INTERVAL_MS);
    if (tokensToAdd <= 0) return bucket;
    return {
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

    if (bucket.tokens > 0) {
      bucket = { ...bucket, tokens: bucket.tokens - 1 };
      await this.state.storage.put("bucket", bucket);
      return Response.json({ waitMs: 0 });
    }

    const msSinceLastRefill = now - bucket.lastRefill;
    const waitMs = Math.max(0, REFILL_INTERVAL_MS - msSinceLastRefill);
    await this.state.storage.put("bucket", bucket); // persist the refill progress even on failure
    return Response.json({ waitMs });
  }
}
