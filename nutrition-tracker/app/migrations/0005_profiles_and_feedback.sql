-- Backs the goals/profile onboarding step, opt-in gamification (streak/XP/
-- level), and the feedback form. One row per device (same identity model as
-- everything else in this app -- no login system exists).

CREATE TABLE user_profiles (
  device_id TEXT PRIMARY KEY,
  weight_kg REAL,
  height_cm REAL,
  age INTEGER,
  gender TEXT, -- 'male' | 'female' -- only used for the BMR formula, not a broader identity field
  activity_level TEXT, -- 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  goal TEXT, -- 'lose' | 'maintain' | 'gain'
  daily_calorie_target INTEGER, -- computed server-side from the fields above, not user-entered directly
  gamification_enabled INTEGER NOT NULL DEFAULT 0, -- opt-in, off by default -- see the gamification research discussion
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_logged_date TEXT, -- YYYY-MM-DD, used to compute streak continuation/breaks
  xp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT, -- optional: e.g. a logId if submitted from a "this doesn't look right" link
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_feedback_created ON feedback(created_at);
