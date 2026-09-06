-- Weight-trend tracking: daily/weekly weight entries, smoothed into a
-- trend server-side rather than reacting to any single noisy entry.
-- Separate from user_profiles.weight_kg, which stays a one-time manually
-- edited field used for the BMR calculation.

CREATE TABLE weight_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  logged_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_weight_logs_device_logged ON weight_logs(device_id, logged_at);
