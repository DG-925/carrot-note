/**
 * Chat relay. Messages are kept here only until the recipient's app has downloaded them: the app
 * stores its chats on the device, and acknowledges what it received so the copy here is deleted.
 * Conversations: "dm_<userA>_<userB>" (ids sorted) or "p_<projectId>" for a shared project's team.
 */

import { authenticate, HttpError, json, readJson, type Env } from "./index";
import { ensureTables } from "./links";

const MAX_TEXT = 4000;
const MAX_VOICE = 1_400_000; // base64 data URL, about 2 minutes of compressed speech
const MAX_PER_MINUTE = 60;
const KEEP_MS = 30 * 24 * 3600 * 1000;
const PAGE = 40;

/** Who gets a message in this conversation (never the sender). */
async function recipients(env: Env, userId: string, convo: string): Promise<string[]> {
  if (convo.startsWith("dm_")) {
    const ids = convo.slice(3).split("_");
    if (ids.length !== 2 || !ids.includes(userId) || ids[0] === ids[1]) throw new HttpError(400, "Unknown chat");
    const other = ids[0] === userId ? ids[1] : ids[0];
    const exists = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(other).first<{ username: string | null }>();
    if (!exists) throw new HttpError(404, "That person no longer has an account");
    if (!(await canMessage(env, userId, other))) throw new HttpError(403, `Follow @${exists.username ?? "them"} first to send them a message`);
    return [other];
  }
  if (convo.startsWith("p_")) {
    const rows = await env.DB.prepare(
      `SELECT user_id FROM space_members WHERE space_id = ?1
       UNION SELECT owner_id AS user_id FROM spaces WHERE id = ?1`,
    )
      .bind(convo)
      .all<{ user_id: string }>();
    const members = rows.results.map((r) => r.user_id);
    if (!members.includes(userId)) throw new HttpError(403, "You're not in this project");
    return members.filter((m) => m !== userId);
  }
  throw new HttpError(400, "Unknown chat");
}

/** Direct messages need a follow either way, or a shared project. */
async function canMessage(env: Env, a: string, b: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM follows WHERE (follower = ?1 AND followee = ?2) OR (follower = ?2 AND followee = ?1)
     UNION ALL
     SELECT 1 FROM (SELECT space_id FROM space_members WHERE user_id = ?1 UNION SELECT id FROM spaces WHERE owner_id = ?1 AND kind = 'project') x
       JOIN (SELECT space_id FROM space_members WHERE user_id = ?2 UNION SELECT id FROM spaces WHERE owner_id = ?2 AND kind = 'project') y
       ON x.space_id = y.space_id
     LIMIT 1`,
  )
    .bind(a, b)
    .first();
  return !!row;
}

// ---------------------------------------------------------------- following

const person = (r: { id: string; username: string | null; name: string; avatar_rev: number; at: number }) =>
  ({ id: r.id, username: r.username ?? "", name: r.name, avatarRev: r.avatar_rev ?? 0, at: r.at });

/** POST /api/follow {userId} */
export async function follow(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const id = String((await readJson(req)).userId ?? "");
  if (!id || id === user.id) throw new HttpError(400, "You can't follow yourself");
  const exists = await env.DB.prepare("SELECT 1 AS ok FROM users WHERE id = ?").bind(id).first();
  if (!exists) throw new HttpError(404, "That person no longer has an account");
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM follows WHERE follower = ?").bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 2000) throw new HttpError(400, "You follow a lot of people already");
  await env.DB.prepare("INSERT OR IGNORE INTO follows (follower, followee, created_at) VALUES (?, ?, ?)").bind(user.id, id, Date.now()).run();
  return json({ ok: true });
}

/** POST /api/unfollow {userId} */
export async function unfollow(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const id = String((await readJson(req)).userId ?? "");
  await env.DB.prepare("DELETE FROM follows WHERE follower = ? AND followee = ?").bind(user.id, id).run();
  return json({ ok: true });
}

/** POST /api/follows → {following, followers}: people with name, username and since when. */
export async function follows(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const [following, followers] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.username, u.name, u.avatar_rev, f.created_at AS at FROM follows f JOIN users u ON u.id = f.followee
       WHERE f.follower = ? ORDER BY f.created_at DESC LIMIT 2000`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT u.id, u.username, u.name, u.avatar_rev, f.created_at AS at FROM follows f JOIN users u ON u.id = f.follower
       WHERE f.followee = ? ORDER BY f.created_at DESC LIMIT 2000`,
    ).bind(user.id),
  ]);
  type R = { id: string; username: string | null; name: string; avatar_rev: number; at: number };
  return json({ following: (following.results as R[]).map(person), followers: (followers.results as R[]).map(person) });
}

/** POST /api/person {userId}: someone's profile as you see it: who they are, their followers, whether
 *  you follow each other, and the projects you share (ids only; the app knows the names). */
export async function personProfile(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const id = String((await readJson(req)).userId ?? "");
  const u = await env.DB.prepare("SELECT id, username, name, bio, github, avatar_rev, created_at FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string; username: string | null; name: string; bio: string; github: string; avatar_rev: number; created_at: number }>();
  if (!u) throw new HttpError(404, "That person no longer has an account");
  const [counts, rel, shared] = await env.DB.batch([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM follows WHERE followee = ?1) AS followers, (SELECT COUNT(*) FROM follows WHERE follower = ?1) AS following`,
    ).bind(id),
    env.DB.prepare(
      `SELECT EXISTS(SELECT 1 FROM follows WHERE follower = ?1 AND followee = ?2) AS you_follow,
              EXISTS(SELECT 1 FROM follows WHERE follower = ?2 AND followee = ?1) AS follows_you`,
    ).bind(user.id, id),
    env.DB.prepare(
      `SELECT s.id AS space_id, s.project_id FROM spaces s
       WHERE s.kind = 'project'
         AND (s.owner_id = ?1 OR EXISTS(SELECT 1 FROM space_members m WHERE m.space_id = s.id AND m.user_id = ?1))
         AND (s.owner_id = ?2 OR EXISTS(SELECT 1 FROM space_members m WHERE m.space_id = s.id AND m.user_id = ?2))
       LIMIT 50`,
    ).bind(user.id, id),
  ]);
  const c = (counts.results[0] ?? {}) as { followers?: number; following?: number };
  const r = (rel.results[0] ?? {}) as { you_follow?: number; follows_you?: number };
  return json({
    id: u.id, username: u.username ?? "", name: u.name, bio: u.bio ?? "", github: u.github ?? "", avatarRev: u.avatar_rev ?? 0,
    joinedAt: u.created_at, followers: c.followers ?? 0, following: c.following ?? 0,
    youFollow: !!r.you_follow, followsYou: !!r.follows_you,
    projects: (shared.results as { space_id: string; project_id: string | null }[]).map((x) => x.project_id ?? x.space_id.replace(/^p_/, "")),
  });
}

/** For every sync: how many follow you, and the newest few (so the app can say "Karim followed you"). */
export async function followSummary(env: Env, userId: string) {
  await ensureTables(env);
  const [count, latest] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM follows WHERE followee = ?").bind(userId),
    env.DB.prepare(
      `SELECT u.id, u.username, u.name, u.avatar_rev, f.created_at AS at FROM follows f JOIN users u ON u.id = f.follower
       WHERE f.followee = ? ORDER BY f.created_at DESC LIMIT 5`,
    ).bind(userId),
  ]);
  type R = { id: string; username: string | null; name: string; avatar_rev: number; at: number };
  return { count: (count.results[0] as { n: number } | undefined)?.n ?? 0, latest: (latest.results as R[]).map(person) };
}

/** POST /api/chat/send {convo, msg: {id, text, voice, dur, mentions, at}} */
export async function sendChat(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const body = await readJson(req);
  const convo = String(body.convo ?? "");
  const msg = (body.msg ?? {}) as Record<string, unknown>;
  const id = String(msg.id ?? "");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id) || convo.length > 120) throw new HttpError(400, "Bad message");
  const text = typeof msg.text === "string" ? msg.text.slice(0, MAX_TEXT) : "";
  const voice = typeof msg.voice === "string" && msg.voice.startsWith("data:audio/") ? msg.voice : "";
  if (voice.length > MAX_VOICE) throw new HttpError(413, "Voice message is too long");
  if (!text.trim() && !voice) throw new HttpError(400, "Empty message");
  const to = await recipients(env, user.id, convo);
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_queue WHERE from_user = ? AND created_at > ?")
    .bind(user.id, now - 60_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_MINUTE * Math.max(1, to.length)) throw new HttpError(429, "Slow down a little");
  const mentions = Array.isArray(msg.mentions) ? (msg.mentions as unknown[]).filter((m): m is string => typeof m === "string").slice(0, 30) : [];
  const payload = JSON.stringify({
    id,
    convo,
    from: { id: user.id, name: user.name, username: user.username ?? "", avatarRev: user.avatar_rev ?? 0 },
    text,
    voice,
    dur: typeof msg.dur === "number" ? Math.min(600, Math.max(0, msg.dur)) : 0,
    mentions,
    at: now,
  });
  const stmts = to.map((u) =>
    env.DB.prepare("INSERT OR IGNORE INTO chat_queue (to_user, id, from_user, convo, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(u, id, user.id, convo, payload, now),
  );
  // Now and then, forget messages nobody picked up in 30 days.
  if (Math.random() < 0.02) stmts.push(env.DB.prepare("DELETE FROM chat_queue WHERE created_at < ?").bind(now - KEEP_MS));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, at: now, delivered: to.length });
}

/** POST /api/chat/inbox {ack: [ids]}: deletes what was received last time, returns what's waiting. */
export async function chatInbox(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const body = await readJson(req);
  const ack = Array.isArray(body.ack) ? (body.ack as unknown[]).filter((a): a is string => typeof a === "string").slice(0, 200) : [];
  if (ack.length) {
    await env.DB.prepare("DELETE FROM chat_queue WHERE to_user = ? AND id IN (SELECT value FROM json_each(?))")
      .bind(user.id, JSON.stringify(ack))
      .run();
  }
  const rows = await env.DB.prepare("SELECT body FROM chat_queue WHERE to_user = ? ORDER BY created_at LIMIT ?")
    .bind(user.id, PAGE + 1)
    .all<{ body: string }>();
  const messages = rows.results.slice(0, PAGE).map((r) => JSON.parse(r.body));
  return json({ messages, more: rows.results.length > PAGE });
}

/** How many messages wait for this user (sent back with every sync). */
export async function chatPending(env: Env, userId: string): Promise<number> {
  await ensureTables(env);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_queue WHERE to_user = ?").bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
}
