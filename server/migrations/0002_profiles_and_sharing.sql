-- v2: usernames, profiles & avatars, and shared project spaces.
-- Apply once to an existing v1 database:
--   npx wrangler d1 execute DB --remote --file=migrations/0002_profiles_and_sharing.sql

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN github TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_rev INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS avatars (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                  -- base64 JPEG
  updated_at INTEGER NOT NULL
);

-- A space is a set of records synced together: each user's personal space (id = user id)
-- and one space per shared project (id = 'p_' + project id).
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                  -- 'personal' | 'project'
  owner_id TEXT NOT NULL,
  project_id TEXT,
  rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO spaces (id, kind, owner_id, rev, created_at)
  SELECT id, 'personal', id, rev, created_at FROM users;

CREATE TABLE IF NOT EXISTS space_members (
  space_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                  -- 'owner' | 'editor'
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

-- records.user_id becomes records.space_id. Rebuilt without the users() foreign key,
-- because shared spaces are not user ids.
CREATE TABLE records_v2 (
  space_id TEXT NOT NULL,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (space_id, type, id)
);
INSERT INTO records_v2 (space_id, type, id, data, updated_at, deleted, rev)
  SELECT user_id, type, id, data, updated_at, deleted, rev FROM records;
DROP TABLE records;
ALTER TABLE records_v2 RENAME TO records;
CREATE INDEX IF NOT EXISTS idx_records_space_rev ON records(space_id, rev);
