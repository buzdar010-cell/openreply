CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_shop_idx ON sessions (shop);

CREATE TABLE IF NOT EXISTS shop_settings (
  shop TEXT PRIMARY KEY,
  nav_setup_dismissed INTEGER NOT NULL DEFAULT 0,
  widget_setup_dismissed INTEGER NOT NULL DEFAULT 0
);
