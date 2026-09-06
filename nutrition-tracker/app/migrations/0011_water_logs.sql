CREATE TABLE water_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  amount_ml REAL NOT NULL,
  logged_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_water_logs_device_logged ON water_logs(device_id, logged_at);
