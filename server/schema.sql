-- Carrot Note D1 schema. Apply with: npx wrangler d1 execute DB --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,              -- pbkdf2$iterations$salt$hash
  rev INTEGER NOT NULL DEFAULT 0,      -- per-user change counter used for sync cursors
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,         -- SHA-256 of the bearer token (the token itself is never stored)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Every app record (project, task, note, txn, goal, customer, debt, event) as JSON, scoped to its user.
CREATE TABLE IF NOT EXISTS records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,                           -- NULL when deleted
  updated_at INTEGER NOT NULL,         -- client timestamp, last write wins
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,                -- users.rev at the time of the write
  PRIMARY KEY (user_id, type, id)
);
CREATE INDEX IF NOT EXISTS idx_records_user_rev ON records(user_id, rev);
