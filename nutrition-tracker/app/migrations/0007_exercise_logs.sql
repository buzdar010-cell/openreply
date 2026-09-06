-- Exercise logging, separate from food logs -- lets a day's calorie budget
-- account for activity beyond the flat "activity_level" baked into the
-- profile's TDEE calculation, which never adjusted for what someone
-- actually did on a given day.

CREATE TABLE exercise_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  calories_burned REAL NOT NULL, -- computed server-side via a standard MET formula, never client-supplied
  logged_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_exercise_logs_device_logged ON exercise_logs(device_id, logged_at);
