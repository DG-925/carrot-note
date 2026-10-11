/**
 * Carrot Note API — Cloudflare Worker backed by D1.
 *
 * Auth: username/email + password (PBKDF2-SHA256), opaque bearer tokens stored as SHA-256 hashes.
 * Data lives in "spaces": every user has a personal space (id = user id) and each shared
 * project gets its own space ('p_' + project id) that all its members sync.
 * Sync: clients push changed records and pull everything with rev > their per-space cursor.
 */

export interface Env {
  DB: D1Database;
}

const PBKDF2_ITERATIONS = 100_000;
const SESSION_MAX_IDLE_MS = 180 * 24 * 3600 * 1000;
const MAX_CHANGES_PER_SYNC = 500;
const MAX_RECORD_BYTES = 200_000;
const MAX_AVATAR_BASE64 = 400_000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
/** Record types that follow their project into a shared space. */
const PROJECT_SCOPED = new Set(["task", "note", "event"]);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return b64url(new Uint8Array(bits));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  return safeEqual(await pbkdf2(password, fromB64url(salt), parseInt(iter, 10)), hash);
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Invalid request body");
}

function str(v: unknown, field: string, max = 320): string {
  if (typeof v !== "string") throw new HttpError(400, `Missing ${field}`);
  if (v.length > max) throw new HttpError(400, `${field} is too long`);
  return v;
}

function optStr(v: unknown, field: string, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  return str(v, field, max).trim();
}

function normalizeEmail(v: unknown): string {
  const email = str(v, "email").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Please enter a valid email address");
  return email;
}

function normalizeUsername(v: unknown): string {
  const u = str(v, "username", 40).trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(u) || u.startsWith(".") || u.endsWith(".")) {
    throw new HttpError(400, "Username must be 3–20 letters, numbers, _ or .");
  }
  return u;
}

function normalizeGithub(v: string): string {
  const g = v.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  if (g && !/^[A-Za-z0-9-]{1,39}$/.test(g)) throw new HttpError(400, "That doesn't look like a GitHub username");
  return g;
}

function checkNewPassword(v: unknown): string {
  const p = str(v, "password", 256);
  if (p.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  return p;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  username: string | null;
  bio: string;
  github: string;
  avatar_rev: number;
  password: string;
  failed_logins: number;
  locked_until: number;
}

const USER_COLS = "id, email, name, username, bio, github, avatar_rev, password, failed_logins, locked_until";

const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  username: u.username ?? "",
  bio: u.bio ?? "",
  github: u.github ?? "",
  avatarRev: u.avatar_rev ?? 0,
});

async function createSession(env: Env, userId: string): Promise<string> {
  const token = b64url(randomBytes(32));
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_used) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now)
    .run();
  return token;
}

async function authenticate(req: Request, env: Env): Promise<{ user: UserRow; tokenHash: string }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Not signed in");
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.last_used, u.id, u.email, u.name, u.username, u.bio, u.github, u.avatar_rev, u.password, u.failed_logins, u.locked_until
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<UserRow & { last_used: number }>();
  const now = Date.now();
  if (!row || now - row.last_used > SESSION_MAX_IDLE_MS) {
    if (row) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    throw new HttpError(401, "Session expired. Please sign in again.");
  }
  if (now - row.last_used > 3600_000) {
    await env.DB.prepare("UPDATE sessions SET last_used = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  }
  return { user: row, tokenHash };
}

async function usernameTaken(env: Env, username: string, exceptId = ""): Promise<boolean> {
  const r = await env.DB.prepare("SELECT id FROM users WHERE username = ? AND id != ?").bind(username, exceptId).first();
  return !!r;
}

// ---------------------------------------------------------------- auth

async function register(req: Request, env: Env) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = checkNewPassword(body.password);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const username = body.username === undefined ? null : normalizeUsername(body.username);
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new HttpError(409, "An account with this email already exists. Try signing in.");
  if (username && (await usernameTaken(env, username))) throw new HttpError(409, "That username is taken");
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name, username, password, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, email, name, username, await hashPassword(password), now),
    env.DB.prepare("INSERT INTO spaces (id, kind, owner_id, rev, created_at) VALUES (?, 'personal', ?, 0, ?)").bind(id, id, now),
  ]);
  const token = await createSession(env, id);
  const user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return json({ token, user: publicUser(user!) }, 201);
}

async function login(req: Request, env: Env) {
  const body = await readJson(req);
  const ident = str(body.login ?? body.email, "email or username").trim().toLowerCase().replace(/^@/, "");
  const password = str(body.password, "password", 256);
  const user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE ${ident.includes("@") ? "email" : "username"} = ?`)
    .bind(ident)
    .first<UserRow>();
  const now = Date.now();
  if (user && user.locked_until > now) {
    throw new HttpError(429, "Too many failed attempts. Try again in a few minutes.");
  }
  if (!user || !(await verifyPassword(password, user.password))) {
    if (user) {
      const fails = user.failed_logins + 1;
      const lock = fails >= MAX_FAILED_LOGINS ? now + LOCKOUT_MS : 0;
      await env.DB.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
        .bind(lock ? 0 : fails, lock, user.id)
        .run();
    }
    throw new HttpError(401, "Wrong username/email or password");
  }
  if (user.failed_logins > 0 || user.locked_until > 0) {
    await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?").bind(user.id).run();
  }
  const token = await createSession(env, user.id);
  return json({ token, user: publicUser(user) });
}

async function logout(req: Request, env: Env) {
  const { tokenHash } = await authenticate(req, env);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  return json({ ok: true });
}

async function me(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  return json({ user: publicUser(user) });
}

async function usernameAvailable(env: Env, raw: string) {
  let username: string;
  try {
    username = normalizeUsername(decodeURIComponent(raw));
  } catch (e) {
    return json({ available: false, reason: (e as Error).message });
  }
  const taken = await usernameTaken(env, username);
  return json({ available: !taken, reason: taken ? "That username is taken" : null });
}

async function changePassword(req: Request, env: Env) {
  const { user, tokenHash } = await authenticate(req, env);
  const body = await readJson(req);
  const old = str(body.oldPassword, "current password", 256);
  const next = checkNewPassword(body.newPassword);
  if (!(await verifyPassword(old, user.password))) throw new HttpError(403, "Current password is wrong");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(await hashPassword(next), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, tokenHash),
  ]);
  return json({ ok: true });
}

async function deleteAccount(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const password = str(body.password, "password", 256);
  if (!(await verifyPassword(password, user.password))) throw new HttpError(403, "Wrong password");
  const owned = "(SELECT id FROM spaces WHERE owner_id = ?1)";
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM records WHERE space_id IN ${owned}`).bind(user.id),
    env.DB.prepare(`DELETE FROM invites WHERE space_id IN ${owned} OR to_user = ?1 OR from_user = ?1`).bind(user.id),
    env.DB.prepare(`DELETE FROM space_members WHERE space_id IN ${owned} OR user_id = ?1`).bind(user.id),
    env.DB.prepare("DELETE FROM spaces WHERE owner_id = ?1").bind(user.id),
    env.DB.prepare("DELETE FROM avatars WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- profile

async function updateProfile(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const name = optStr(body.name, "name", 100);
  const bio = optStr(body.bio, "bio", 280);
  const github = body.github === undefined ? undefined : normalizeGithub(str(body.github, "github", 100));
  const username = body.username === undefined ? undefined : normalizeUsername(body.username);
  if (username && (await usernameTaken(env, username, user.id))) throw new HttpError(409, "That username is taken");
  await env.DB.prepare(
    `UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), github = COALESCE(?, github),
       username = COALESCE(?, username) WHERE id = ?`,
  )
    .bind(name ?? null, bio ?? null, github ?? null, username ?? null, user.id)
    .run();
  const u = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(user.id).first<UserRow>();
  return json({ user: publicUser(u!) });
}

async function putAvatar(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const image = str(body.image, "image", MAX_AVATAR_BASE64);
  if (!/^[A-Za-z0-9+/=]+$/.test(image)) throw new HttpError(400, "Invalid image");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO avatars (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .bind(user.id, image, now),
    env.DB.prepare("UPDATE users SET avatar_rev = avatar_rev + 1 WHERE id = ?").bind(user.id),
  ]);
  const u = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(user.id).first<UserRow>();
  return json({ user: publicUser(u!) });
}

async function deleteAvatar(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM avatars WHERE user_id = ?").bind(user.id),
    env.DB.prepare("UPDATE users SET avatar_rev = 0 WHERE id = ?").bind(user.id),
  ]);
  const u = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(user.id).first<UserRow>();
  return json({ user: publicUser(u!) });
}

async function getAvatar(req: Request, env: Env, userId: string) {
  await authenticate(req, env);
  const row = await env.DB.prepare("SELECT data FROM avatars WHERE user_id = ?").bind(userId).first<{ data: string }>();
  if (!row) return json({ error: "No photo" }, 404);
  const bin = atob(row.data);
  return new Response(Uint8Array.from(bin, (c) => c.charCodeAt(0)), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" },
  });
}

async function searchUsers(req: Request, env: Env, q: string) {
  const { user } = await authenticate(req, env);
  const term = q.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
  if (term.length < 2) return json({ users: [] });
  const escaped = term.replace(/[\\_%]/g, (m) => "\\" + m);
  const rows = await env.DB.prepare(
    `SELECT id, username, name, avatar_rev FROM users
     WHERE username LIKE ? ESCAPE '\\' AND id != ? ORDER BY length(username) LIMIT 10`,
  )
    .bind(escaped + "%", user.id)
    .all<{ id: string; username: string; name: string; avatar_rev: number }>();
  return json({ users: rows.results.map((r) => ({ id: r.id, username: r.username, name: r.name, avatarRev: r.avatar_rev })) });
}

// ---------------------------------------------------------------- sharing

interface SpaceRow {
  id: string;
  kind: string;
  owner_id: string;
  project_id: string | null;
  rev: number;
  role: string;
}

async function memberSpaces(env: Env, userId: string): Promise<SpaceRow[]> {
  const rows = await env.DB.prepare(
    `SELECT s.id, s.kind, s.owner_id, s.project_id, s.rev, 'owner' AS role FROM spaces s WHERE s.id = ?1
     UNION ALL
     SELECT s.id, s.kind, s.owner_id, s.project_id, s.rev, m.role FROM space_members m
       JOIN spaces s ON s.id = m.space_id WHERE m.user_id = ?1 AND s.kind = 'project'`,
  )
    .bind(userId)
    .all<SpaceRow>();
  let list = rows.results;
  if (!list.some((s) => s.id === userId)) {
    // Account created before spaces existed and missed the migration: create its personal space.
    await env.DB.prepare("INSERT OR IGNORE INTO spaces (id, kind, owner_id, rev, created_at) VALUES (?, 'personal', ?, 0, ?)")
      .bind(userId, userId, Date.now())
      .run();
    list = [{ id: userId, kind: "personal", owner_id: userId, project_id: null, rev: 0, role: "owner" }, ...list];
  }
  return list;
}

async function invite(req: Request, env: Env, projectId: string) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  if (projectId.length > 100) throw new HttpError(400, "Invalid project");
  const target = await env.DB.prepare("SELECT id, username, name FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string; username: string; name: string }>();
  if (!target) throw new HttpError(404, `No Carrot Note user called @${username}`);
  if (target.id === user.id) throw new HttpError(400, "You can't invite yourself");

  const spaceId = "p_" + projectId;
  const space = await env.DB.prepare("SELECT id, owner_id FROM spaces WHERE id = ?").bind(spaceId).first<{ id: string; owner_id: string }>();
  const now = Date.now();
  if (!space) {
    const project = await env.DB.prepare(
      "SELECT 1 FROM records WHERE space_id = ? AND type = 'project' AND id = ? AND deleted = 0",
    )
      .bind(user.id, projectId)
      .first();
    if (!project) throw new HttpError(404, "Sync this project first, then try again.");
    // Turn the project into a shared space and move it (and its tasks, notes and events) there.
    await env.DB.batch([
      env.DB.prepare("INSERT INTO spaces (id, kind, owner_id, project_id, rev, created_at) VALUES (?, 'project', ?, ?, 1, ?)")
        .bind(spaceId, user.id, projectId, now),
      env.DB.prepare("INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(spaceId, user.id, now),
      env.DB.prepare(
        `UPDATE records SET space_id = ?1, rev = 1
         WHERE space_id = ?2 AND ((type = 'project' AND id = ?3)
           OR (type IN ('task', 'note', 'event') AND json_extract(data, '$.projectId') = ?3))`,
      ).bind(spaceId, user.id, projectId),
    ]);
  } else if (space.owner_id !== user.id) {
    throw new HttpError(403, "Only the project owner can invite people");
  }
  const already = await env.DB.prepare("SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?").bind(spaceId, target.id).first();
  if (already) throw new HttpError(409, `@${username} is already in this project`);
  await env.DB.prepare("INSERT OR IGNORE INTO invites (id, space_id, from_user, to_user, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), spaceId, user.id, target.id, now)
    .run();
  return json({ ok: true, spaceId, invited: { id: target.id, username: target.username, name: target.name } });
}

async function listInvites(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const rows = await env.DB.prepare(
    `SELECT i.id, i.space_id, i.created_at, u.id AS from_id, u.username AS from_username, u.name AS from_name,
            u.avatar_rev AS from_avatar, json_extract(r.data, '$.name') AS project_name
     FROM invites i
     JOIN users u ON u.id = i.from_user
     JOIN spaces s ON s.id = i.space_id
     LEFT JOIN records r ON r.space_id = s.id AND r.type = 'project' AND r.id = s.project_id
     WHERE i.to_user = ? ORDER BY i.created_at DESC`,
  )
    .bind(user.id)
    .all<Record<string, string | number | null>>();
  return json({
    invites: rows.results.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      projectName: r.project_name ?? "A project",
      createdAt: r.created_at,
      from: { id: r.from_id, username: r.from_username ?? "", name: r.from_name ?? "", avatarRev: r.from_avatar ?? 0 },
    })),
  });
}

async function answerInvite(req: Request, env: Env, inviteId: string, accept: boolean) {
  const { user } = await authenticate(req, env);
  const inv = await env.DB.prepare("SELECT id, space_id FROM invites WHERE id = ? AND to_user = ?")
    .bind(inviteId, user.id)
    .first<{ id: string; space_id: string }>();
  if (!inv) throw new HttpError(404, "Invitation not found");
  const stmts = [env.DB.prepare("DELETE FROM invites WHERE id = ?").bind(inv.id)];
  if (accept) {
    stmts.push(
      env.DB.prepare("INSERT OR IGNORE INTO space_members (space_id, user_id, role, joined_at) VALUES (?, ?, 'editor', ?)")
        .bind(inv.space_id, user.id, Date.now()),
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function leaveSpace(req: Request, env: Env, spaceId: string) {
  const { user } = await authenticate(req, env);
  const s = await env.DB.prepare("SELECT owner_id FROM spaces WHERE id = ? AND kind = 'project'").bind(spaceId).first<{ owner_id: string }>();
  if (!s) throw new HttpError(404, "Project not found");
  if (s.owner_id === user.id) throw new HttpError(400, "The owner can't leave. Remove members instead.");
  await env.DB.prepare("DELETE FROM space_members WHERE space_id = ? AND user_id = ?").bind(spaceId, user.id).run();
  return json({ ok: true });
}

async function removeMember(req: Request, env: Env, spaceId: string) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const target = str(body.userId, "userId", 100);
  const s = await env.DB.prepare("SELECT owner_id FROM spaces WHERE id = ? AND kind = 'project'").bind(spaceId).first<{ owner_id: string }>();
  if (!s) throw new HttpError(404, "Project not found");
  if (s.owner_id !== user.id) throw new HttpError(403, "Only the owner can remove people");
  if (target === user.id) throw new HttpError(400, "You can't remove yourself");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM space_members WHERE space_id = ? AND user_id = ?").bind(spaceId, target),
    env.DB.prepare("DELETE FROM invites WHERE space_id = ? AND to_user = ?").bind(spaceId, target),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- sync

interface Change {
  type: string;
  id: string;
  data: string | null;
  updatedAt: number;
  deleted: boolean;
  space?: string;
}

function parseChanges(v: unknown): Change[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new HttpError(400, "changes must be a list");
  if (v.length > MAX_CHANGES_PER_SYNC) throw new HttpError(413, "Too many changes in one request");
  return v.map((c) => {
    if (!c || typeof c !== "object") throw new HttpError(400, "Invalid change");
    const o = c as Record<string, unknown>;
    const type = o.type, id = o.id, data = o.data ?? null, updatedAt = o.updatedAt, deleted = o.deleted === true;
    if (typeof type !== "string" || !/^[a-z_]{1,32}$/.test(type)) throw new HttpError(400, "Invalid record type");
    if (typeof id !== "string" || id.length < 1 || id.length > 100) throw new HttpError(400, "Invalid record id");
    if (data !== null && (typeof data !== "string" || data.length > MAX_RECORD_BYTES)) throw new HttpError(400, "Invalid record data");
    if (typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt)) throw new HttpError(400, "Invalid updatedAt");
    const space = typeof o.space === "string" ? o.space : undefined;
    return { type, id, data: deleted ? null : (data as string | null), updatedAt, deleted, space };
  });
}

function projectIdOf(c: Change): string | null {
  if (c.type === "project") return c.id;
  if (!PROJECT_SCOPED.has(c.type) || !c.data) return null;
  try {
    const pid = (JSON.parse(c.data) as { projectId?: unknown }).projectId;
    return typeof pid === "string" ? pid : null;
  } catch {
    return null;
  }
}

async function sync(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const legacy = !("cursors" in body);
  const changes = parseChanges(body.changes);

  let spaces = await memberSpaces(env, user.id);
  const member = new Set(spaces.map((s) => s.id));

  if (changes.length > 0) {
    // Where does each (type, id) live today, in the spaces this user can see?
    const keys = changes.map((c) => c.type + "\u001f" + c.id);
    const located = await env.DB.prepare(
      `SELECT space_id, type, id FROM records
       WHERE space_id IN (SELECT value FROM json_each(?1))
         AND (type || char(31) || id) IN (SELECT value FROM json_each(?2))`,
    )
      .bind(JSON.stringify([...member]), JSON.stringify(keys))
      .all<{ space_id: string; type: string; id: string }>();
    const where = new Map<string, string[]>();
    for (const r of located.results) {
      const k = r.type + "\u001f" + r.id;
      where.set(k, [...(where.get(k) ?? []), r.space_id]);
    }

    const bySpace = new Map<string, Change[]>();
    const put = (space: string, c: Change) => bySpace.set(space, [...(bySpace.get(space) ?? []), c]);
    for (const c of changes) {
      const existing = where.get(c.type + "\u001f" + c.id) ?? [];
      if (c.deleted) {
        const targets = existing.length ? existing : [c.space && member.has(c.space) ? c.space : user.id];
        targets.forEach((s) => put(s, c));
        continue;
      }
      const pid = projectIdOf(c);
      const target = pid && member.has("p_" + pid) ? "p_" + pid : user.id;
      put(target, c);
      // Moved to another space (e.g. a task taken out of a shared project): tombstone the old copy.
      for (const s of existing) if (s !== target) put(s, { ...c, data: null, deleted: true });
    }

    const stmts: D1PreparedStatement[] = [];
    for (const [space, list] of bySpace) {
      stmts.push(env.DB.prepare("UPDATE spaces SET rev = rev + 1 WHERE id = ?").bind(space));
      stmts.push(
        env.DB.prepare(
          `INSERT INTO records (space_id, type, id, data, updated_at, deleted, rev)
           SELECT ?1, json_extract(value, '$.type'), json_extract(value, '$.id'), json_extract(value, '$.data'),
                  json_extract(value, '$.updatedAt'), json_extract(value, '$.deleted'),
                  (SELECT rev FROM spaces WHERE id = ?1)
           FROM json_each(?2) WHERE true
           ON CONFLICT (space_id, type, id) DO UPDATE SET
             data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev
           WHERE excluded.updated_at >= records.updated_at`,
        ).bind(
          space,
          JSON.stringify(list.map((c) => ({ type: c.type, id: c.id, data: c.data, updatedAt: c.updatedAt, deleted: c.deleted ? 1 : 0 }))),
        ),
      );
    }
    await env.DB.batch(stmts);
    spaces = await memberSpaces(env, user.id);
  }

  // Pull everything newer than each cursor (all spaces start at 0 when first seen).
  const cursorsIn = (legacy ? { [user.id]: body.since } : body.cursors) as Record<string, unknown>;
  const visible = legacy ? spaces.filter((s) => s.id === user.id) : spaces;
  const windows = visible.map((s) => {
    const c = cursorsIn && typeof cursorsIn[s.id] === "number" ? (cursorsIn[s.id] as number) : 0;
    return { s: s.id, c: c > s.rev ? 0 : c, m: s.rev };
  });
  const rows = await env.DB.prepare(
    `SELECT r.space_id, r.type, r.id, r.data, r.updated_at, r.deleted FROM records r
     JOIN json_each(?1) j ON r.space_id = json_extract(j.value, '$.s')
     WHERE r.rev > json_extract(j.value, '$.c') AND r.rev <= json_extract(j.value, '$.m')
     ORDER BY r.rev`,
  )
    .bind(JSON.stringify(windows))
    .all<{ space_id: string; type: string; id: string; data: string | null; updated_at: number; deleted: number }>();
  const out = rows.results.map((r) => ({
    space: r.space_id,
    type: r.type,
    id: r.id,
    data: r.data,
    updatedAt: r.updated_at,
    deleted: r.deleted === 1,
  }));
  if (legacy) {
    return json({ cursor: windows[0]?.m ?? 0, changes: out });
  }

  const shared = spaces.filter((s) => s.kind === "project").map((s) => s.id);
  const [members, pending, inviteCount, me] = await env.DB.batch([
    env.DB.prepare(
      `SELECT m.space_id, m.role, u.id, u.username, u.name, u.avatar_rev FROM space_members m
       JOIN users u ON u.id = m.user_id WHERE m.space_id IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(shared)),
    env.DB.prepare(
      `SELECT i.space_id, u.id, u.username, u.name, u.avatar_rev FROM invites i JOIN users u ON u.id = i.to_user
       WHERE i.space_id IN (SELECT id FROM spaces WHERE owner_id = ? AND kind = 'project')`,
    ).bind(user.id),
    env.DB.prepare("SELECT COUNT(*) AS n FROM invites WHERE to_user = ?").bind(user.id),
    env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(user.id),
  ]);
  type M = { space_id: string; role?: string; id: string; username: string | null; name: string; avatar_rev: number };
  const person = (m: M) => ({ id: m.id, username: m.username ?? "", name: m.name, avatarRev: m.avatar_rev, role: m.role ?? "invited" });
  return json({
    cursors: Object.fromEntries(windows.map((w) => [w.s, w.m])),
    changes: out,
    spaces: spaces.map((s) => ({
      id: s.id,
      kind: s.kind,
      projectId: s.project_id,
      ownerId: s.owner_id,
      role: s.role,
      members: (members.results as M[]).filter((m) => m.space_id === s.id).map(person),
      pending: (pending.results as M[]).filter((m) => m.space_id === s.id).map(person),
    })),
    invites: (inviteCount.results[0] as { n: number } | undefined)?.n ?? 0,
    user: publicUser(me.results[0] as UserRow),
  });
}

// ---------------------------------------------------------------- router

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const route = `${req.method} ${path}`;
    let m: RegExpMatchArray | null;
    try {
      switch (route) {
        case "GET /":
        case "GET /api":
          return json({ ok: true, name: "Carrot Note API", version: 2 });
        case "POST /api/register":
          return await register(req, env);
        case "POST /api/login":
          return await login(req, env);
        case "POST /api/logout":
          return await logout(req, env);
        case "GET /api/me":
          return await me(req, env);
        case "PATCH /api/profile":
        case "POST /api/profile":
          return await updateProfile(req, env);
        case "PUT /api/profile/avatar":
          return await putAvatar(req, env);
        case "DELETE /api/profile/avatar":
          return await deleteAvatar(req, env);
        case "GET /api/users/search":
          return await searchUsers(req, env, url.searchParams.get("q") ?? "");
        case "GET /api/invites":
          return await listInvites(req, env);
        case "POST /api/sync":
          return await sync(req, env);
        case "POST /api/password":
          return await changePassword(req, env);
        case "POST /api/account/delete":
          return await deleteAccount(req, env);
      }
      if (req.method === "GET" && (m = path.match(/^\/api\/username\/([^/]+)$/))) return await usernameAvailable(env, m[1]);
      if (req.method === "GET" && (m = path.match(/^\/api\/users\/([^/]+)\/avatar$/))) return await getAvatar(req, env, m[1]);
      if (req.method === "POST" && (m = path.match(/^\/api\/projects\/([^/]+)\/invite$/))) return await invite(req, env, decodeURIComponent(m[1]));
      if (req.method === "POST" && (m = path.match(/^\/api\/invites\/([^/]+)\/(accept|decline)$/))) return await answerInvite(req, env, m[1], m[2] === "accept");
      if (req.method === "POST" && (m = path.match(/^\/api\/spaces\/([^/]+)\/leave$/))) return await leaveSpace(req, env, decodeURIComponent(m[1]));
      if (req.method === "POST" && (m = path.match(/^\/api\/spaces\/([^/]+)\/remove$/))) return await removeMember(req, env, decodeURIComponent(m[1]));
      return json({ error: "Not found" }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Server error. Please try again." }, 500);
    }
  },
};
