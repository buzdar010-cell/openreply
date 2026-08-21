CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_shop_idx ON sessions (shop);
