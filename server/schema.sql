-- Carrot Note D1 schema (current). For a brand-new database:
--   npx wrangler d1 execute DB --remote --file=schema.sql
-- Existing v1 databases: apply migrations/0002_profiles_and_sharing.sql instead.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,              -- pbkdf2$iterations$salt$hash
  rev INTEGER NOT NULL DEFAULT 0,      -- legacy (v1) cursor; spaces.rev is used now
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  username TEXT,
  bio TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  avatar_rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,         -- SHA-256 of the bearer token (the token itself is never stored)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS avatars (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,                 -- user id (personal) or 'p_' + project id (shared)
  kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON space_members(user_id);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (space_id, to_user)
);
CREATE INDEX IF NOT EXISTS idx_invites_to ON invites(to_user);

-- Every app record (project, task, note, txn, ...) as JSON, scoped to a space.
CREATE TABLE IF NOT EXISTS records (
  space_id TEXT NOT NULL,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,                           -- NULL when deleted
  updated_at INTEGER NOT NULL,         -- client timestamp, last write wins
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,                -- spaces.rev at the time of the write
  PRIMARY KEY (space_id, type, id)
);
CREATE INDEX IF NOT EXISTS idx_records_space_rev ON records(space_id, rev);

-- Client links (created by the Worker on first use, see src/links.ts).
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY, owner_id TEXT NOT NULL, space_id TEXT NOT NULL, type TEXT NOT NULL, rec_id TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en', created_at INTEGER NOT NULL, replies INTEGER NOT NULL DEFAULT 0,
  last_action TEXT, last_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shares_rec ON shares(owner_id, type, rec_id);

-- Chat messages waiting to be picked up; deleted once the recipient's app has them (src/chat.ts).
CREATE TABLE IF NOT EXISTS chat_queue (
  to_user TEXT NOT NULL, id TEXT NOT NULL, from_user TEXT NOT NULL, convo TEXT NOT NULL,
  body TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (to_user, id)
);
CREATE INDEX IF NOT EXISTS idx_chat_from ON chat_queue(from_user, created_at);

-- Following: once either person follows the other, they can send each other direct messages.
CREATE TABLE IF NOT EXISTS follows (
  follower   TEXT NOT NULL,
  followee   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower, followee)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee, created_at);

-- Codes for "forgot password" / "forgot PIN" (src/recover.ts); only a hash of the code is kept.
CREATE TABLE IF NOT EXISTS resets (
  user_id      TEXT NOT NULL,
  purpose      TEXT NOT NULL,          -- 'password' or 'pin'
  code_hash    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_sent    INTEGER NOT NULL,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  PRIMARY KEY (user_id, purpose)
);
