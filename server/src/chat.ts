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
    const exists = await env.DB.prepare("SELECT 1 AS ok FROM users WHERE id = ?").bind(other).first();
    if (!exists) throw new HttpError(404, "That person no longer has an account");
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
