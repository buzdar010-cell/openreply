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
 * PRODUCTION NOTE: this class holds its state (`tokens`, `lastRefill`) in
 * memory. That's correct for local testing, but Cloudflare Workers run many
 * instances of your code simultaneously across the edge -- an in-memory
 * bucket in one instance doesn't know about requests hitting a different
 * instance, so the real 15/min ceiling wouldn't be enforced correctly across
 * the whole app. In production this state needs to live in a single
 * Cloudflare Durable Object (one authoritative instance all Workers talk to)
 * instead of a plain in-memory object. The token-bucket *logic* below is the
 * same either way -- only where `tokens`/`lastRefill` are stored changes.
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
export const geminiFlashLiteBucket = new TokenBucket({
  capacity: 15,
  refillIntervalMs: 60_000 / 15, // one token every 4 seconds
});
