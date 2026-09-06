-- Needed to compute real MRR in the daily Slack summary -- premium users on
-- an annual plan count as price/12 toward MRR, not the full price, so which
-- billing period each subscriber is on has to be tracked, not just that
-- they're premium.
ALTER TABLE users ADD COLUMN subscription_period TEXT; -- 'month' | 'year', from Paddle's billing_cycle.interval
