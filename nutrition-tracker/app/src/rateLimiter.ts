/**
 * Token-bucket rate limiter matching Gemini's free-tier RPM ceiling.
 *
 * Shape: a bucket holds up to `capacity` tokens, refilling by 1 every
 * `refillIntervalMs`. A request that finds a token available goes through
 * immediately -- no artificial delay during normal/low load. A request that
 * arrives after the bucket is empty waits only as long as it takes for the
 * next token to refill. This is what gives "instant when quiet, paced when
 * busy" without needing separate rush-hour-detection logic -- it's one
 * mechanism, and both behaviors fall out of it naturally.
 *
 * This file has two acquire strategies:
 *   - `TokenBucket` / `geminiFlashLiteBucket`: in-memory, same-process only.
 *     Correct for local Node testing (test/test_e2e.ts runs outside any
 *     Workers runtime, so a Durable Object isn't available there at all),
 *     but WRONG for the real deployed Worker -- Cloudflare runs many
 *     instances of your code simultaneously across the edge, so an
 *     in-memory bucket in one instance can't see requests hitting a
 *     different instance.
 *   - `acquireViaDurableObject`: the production-correct strategy. Calls out
 *     to the single GeminiRateLimiterDO instance (rateLimiterDO.ts) that is
 *     the one shared source of truth every Worker instance talks to. Same
 *     token-bucket math, just backed by Durable Object storage instead of a
 *     plain in-memory field.
 *
 * parseLog.ts takes an `acquire: () => Promise<void>` function as a
 * parameter rather than importing one specific strategy, so the real Worker
 * (src/index.ts) wires up the Durable Object version and local tests wire up
 * the in-memory version, without parseLog.ts needing to know which runtime
 * it's in.
 */

export interface TokenBucketOptions {
  capacity: number; // max tokens the bucket can hold (matches RPM ceiling)
  refillIntervalMs: number; // time to add one token (60000 / RPM)
}

export class TokenBucket {
  private opts: TokenBucketOptions;
  private tokens: number;
  private lastRefill: number;

  constructor(opts: TokenBucketOptions, now: number = Date.now()) {
    this.opts = opts;
    this.tokens = opts.capacity;
    this.lastRefill = now;
  }

  private refill(now: number) {
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.opts.refillIntervalMs);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.opts.capacity, this.tokens + tokensToAdd);
      this.lastRefill += tokensToAdd * this.opts.refillIntervalMs;
    }
  }

  /**
   * Returns 0 if a token is available right now (and consumes it).
   * Returns the number of ms to wait for the next token, otherwise
   * (does not consume a token in that case -- caller must retry after waiting).
   */
  tryAcquire(now: number = Date.now()): number {
    this.refill(now);
    if (this.tokens > 0) {
      this.tokens -= 1;
      return 0;
    }
    const msSinceLastRefill = now - this.lastRefill;
    return Math.max(0, this.opts.refillIntervalMs - msSinceLastRefill);
  }

  /** Waits (if needed) then acquires a token. Use this to actually gate a call. */
  async acquire(): Promise<void> {
    for (;;) {
      const waitMs = this.tryAcquire();
      if (waitMs === 0) return;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// Matches gemini-3.1-flash-lite's confirmed free-tier limit: 15 requests/minute.
// Local/Node-only strategy -- see file header. Not safe to use inside the
// deployed Worker; use acquireViaDurableObject there instead.
export const geminiFlashLiteBucket = new TokenBucket({
  capacity: 15,
  refillIntervalMs: 60_000 / 15, // one token every 4 seconds
});

import { GEMINI_LIMITER_ID } from "./rateLimiterDO.ts";

/**
 * Production strategy: acquires a token from the shared GeminiRateLimiterDO
 * instance. `namespace` is the Worker's RATE_LIMITER Durable Object binding
 * (env.RATE_LIMITER). Loops the same way TokenBucket.acquire() does --
 * ask, and if told to wait, wait exactly that long and ask again.
 */
export async function acquireViaDurableObject(namespace: DurableObjectNamespace): Promise<void> {
  const id = namespace.idFromName(GEMINI_LIMITER_ID);
  const stub = namespace.get(id);
  for (;;) {
    const response = await stub.fetch("https://do/acquire");
    const { waitMs } = (await response.json()) as { waitMs: number };
    if (waitMs === 0) return;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
