/**
 * Carrot Note API — Cloudflare Worker backed by D1.
 *
 * Auth: email + password (PBKDF2-SHA256), opaque bearer tokens stored as SHA-256 hashes.
 * Sync: clients push changed records and pull everything with rev > their cursor.
 */

export interface Env {
  DB: D1Database;
}

const PBKDF2_ITERATIONS = 100_000;
const SESSION_MAX_IDLE_MS = 180 * 24 * 3600 * 1000;
const MAX_CHANGES_PER_SYNC = 500;
const MAX_RECORD_BYTES = 200_000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

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

function normalizeEmail(v: unknown): string {
  const email = str(v, "email").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Please enter a valid email address");
  return email;
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
  password: string;
  failed_logins: number;
  locked_until: number;
}

const publicUser = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

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
    `SELECT s.last_used, u.id, u.email, u.name, u.password, u.failed_logins, u.locked_until
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

// ---------------------------------------------------------------- handlers

async function register(req: Request, env: Env) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = checkNewPassword(body.password);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new HttpError(409, "An account with this email already exists. Try signing in.");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, name, password, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, email, name, await hashPassword(password), Date.now())
    .run();
  const token = await createSession(env, id);
  return json({ token, user: publicUser({ id, email, name }) }, 201);
}

async function login(req: Request, env: Env) {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = str(body.password, "password", 256);
  const user = await env.DB.prepare(
    "SELECT id, email, name, password, failed_logins, locked_until FROM users WHERE email = ?",
  )
    .bind(email)
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
    throw new HttpError(401, "Wrong email or password");
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

async function changePassword(req: Request, env: Env) {
  const { user, tokenHash } = await authenticate(req, env);
  const body = await readJson(req);
  const old = str(body.oldPassword, "current password", 256);
  const next = checkNewPassword(body.newPassword);
  if (!(await verifyPassword(old, user.password))) throw new HttpError(403, "Current password is wrong");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(await hashPassword(next), user.id),
    // Sign out every other device.
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, tokenHash),
  ]);
  return json({ ok: true });
}

async function deleteAccount(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const password = str(body.password, "password", 256);
  if (!(await verifyPassword(password, user.password))) throw new HttpError(403, "Wrong password");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM records WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return json({ ok: true });
}

interface Change {
  type: string;
  id: string;
  data: string | null;
  updatedAt: number;
  deleted: boolean;
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
    return { type, id, data: deleted ? null : (data as string | null), updatedAt, deleted };
  });
}

async function sync(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const since = typeof body.since === "number" && Number.isSafeInteger(body.since) ? body.since : 0;
  const changes = parseChanges(body.changes);

  if (changes.length > 0) {
    // Bump the user's revision and write all records with it in one transaction, so a
    // concurrent pull either sees the whole batch or none of it.
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET rev = rev + 1 WHERE id = ?").bind(user.id),
      env.DB.prepare(
        `INSERT INTO records (user_id, type, id, data, updated_at, deleted, rev)
         SELECT ?1,
                json_extract(value, '$.type'),
                json_extract(value, '$.id'),
                json_extract(value, '$.data'),
                json_extract(value, '$.updatedAt'),
                json_extract(value, '$.deleted'),
                (SELECT rev FROM users WHERE id = ?1)
         FROM json_each(?2) WHERE true
         ON CONFLICT (user_id, type, id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at,
           deleted = excluded.deleted,
           rev = excluded.rev
         WHERE excluded.updated_at >= records.updated_at`,
      ).bind(user.id, JSON.stringify(changes.map((c) => ({ ...c, deleted: c.deleted ? 1 : 0 })))),
    ]);
  }

  const cursorRow = await env.DB.prepare("SELECT rev FROM users WHERE id = ?").bind(user.id).first<{ rev: number }>();
  const cursor = cursorRow?.rev ?? 0;
  const rows = await env.DB.prepare(
    `SELECT type, id, data, updated_at, deleted FROM records
     WHERE user_id = ? AND rev > ? AND rev <= ? ORDER BY rev`,
  )
    .bind(user.id, since, cursor)
    .all<{ type: string; id: string; data: string | null; updated_at: number; deleted: number }>();

  return json({
    cursor,
    changes: rows.results.map((r) => ({
      type: r.type,
      id: r.id,
      data: r.data,
      updatedAt: r.updated_at,
      deleted: r.deleted === 1,
    })),
  });
}

// ---------------------------------------------------------------- router

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname.replace(/\/+$/, "") || "/"}`;
    try {
      switch (route) {
        case "GET /":
        case "GET /api":
          return json({ ok: true, name: "Carrot Note API" });
        case "POST /api/register":
          return await register(req, env);
        case "POST /api/login":
          return await login(req, env);
        case "POST /api/logout":
          return await logout(req, env);
        case "GET /api/me":
          return await me(req, env);
        case "POST /api/sync":
          return await sync(req, env);
        case "POST /api/password":
          return await changePassword(req, env);
        case "POST /api/account/delete":
          return await deleteAccount(req, env);
        default:
          return json({ error: "Not found" }, 404);
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Server error. Please try again." }, 500);
    }
  },
};
