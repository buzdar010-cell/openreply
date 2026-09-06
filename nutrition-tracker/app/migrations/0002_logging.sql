-- Persistent visibility into two things that otherwise vanish once a
-- response goes out: foods people described that didn't match any dish
-- (tells us what to add to the database) and real errors (Gemini failures,
-- DB failures, anything hitting the top-level catch) that previously just
-- produced a 500 with no record anywhere.

CREATE TABLE unmatched_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL, -- 'text' or 'photo'
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_unmatched_created ON unmatched_logs(created_at);

CREATE TABLE error_logs (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  device_id TEXT,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_errors_created ON error_logs(created_at);
