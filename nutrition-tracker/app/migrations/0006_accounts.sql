-- Real accounts, replacing the client-trusted device_id model. Existing
-- tables (logs, user_profiles, unmatched_logs, feedback) keep their
-- device_id TEXT columns unchanged -- going forward that column is
-- populated with the authenticated user's id (resolved server-side from
-- the session token), never a client-supplied string. No rename needed,
-- just a change in what trustworthy value fills it.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, -- PBKDF2-SHA256 output, see auth.ts
  password_salt TEXT NOT NULL, -- per-user random salt
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY, -- random 256-bit, base64url -- this itself is the bearer credential
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Lets a login skip the step-up email code when both the device and the
-- rough location (Cloudflare's request.cf.country -- free, no extra API)
-- match a previously-verified combination for this user.
CREATE TABLE trusted_devices (
  device_token TEXT PRIMARY KEY, -- random, stored client-side only, never derivable from anything else
  user_id TEXT NOT NULL REFERENCES users(id),
  country TEXT, -- ISO country code at time of trust, compared on future logins
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE INDEX idx_trusted_devices_user ON trusted_devices(user_id);

-- Shared by signup verification, login step-up verification, and password
-- reset -- purpose distinguishes which flow a given code belongs to so one
-- can't be replayed into another.
CREATE TABLE otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL, -- SHA-256 of the 6-digit code, never stored plain
  purpose TEXT NOT NULL, -- 'signup' | 'login' | 'reset'
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_otp_email_purpose ON otp_codes(email, purpose);
