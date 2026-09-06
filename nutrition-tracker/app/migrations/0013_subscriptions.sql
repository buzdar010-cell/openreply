-- Billing: single-tier premium subscription via Paddle (merchant-of-record --
-- Stripe doesn't onboard Pakistan-based sellers, so Paddle handles both
-- payment processing and tax compliance for international customers).
-- Columns live directly on `users` rather than a separate subscriptions
-- table -- this is a single-tier model, one user has at most one active
-- subscription, so there's no history/multiplicity to normalize out.
ALTER TABLE users ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free'; -- 'free' | 'premium'
ALTER TABLE users ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE users ADD COLUMN paddle_subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT; -- Paddle's own status string: 'active' | 'past_due' | 'canceled' | 'paused', etc.
ALTER TABLE users ADD COLUMN subscription_renews_at INTEGER; -- unix seconds; next charge or expiry, whichever Paddle reports

CREATE INDEX idx_users_paddle_subscription ON users(paddle_subscription_id);
