/**
 * Forgot password / forgot PIN.
 *
 * Password: the app asks for a 6-digit code to be emailed to the account, then sends the code with
 * a new password; every device is signed out and this one is signed in.
 * PIN (the app lock on a device that is still signed in): either the account password, or an
 * emailed code. The PIN itself never leaves the device; the server only confirms it's you.
 *
 * Email goes out through Resend (RESEND_API_KEY) or any SMTP server, e.g. Gmail with an app password
 * (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). MAIL_FROM is the sender ("Carrot Note <me@gmail.com>").
 */

import { connect } from "cloudflare:sockets";
import { authenticate, HttpError, json, readJson, sha256Hex, verifyPassword, hashPassword, createSession, publicUser, checkNewPassword, noteFailedLogin, userByLogin, type Env, type UserRow } from "./index";
import { ensureTables } from "./links";

const CODE_TTL = 15 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_TRIES = 5;

type Purpose = "password" | "pin";

/** SMTP settings; a Gmail address needs only SMTP_USER and SMTP_PASS (the app password, spaces or not). */
function smtp(env: Env) {
  const user = (env.SMTP_USER ?? "").trim();
  const gmail = /@(gmail|googlemail)\.com$/i.test(user);
  const host = (env.SMTP_HOST ?? "").trim() || (gmail ? "smtp.gmail.com" : "");
  const pass = gmail || host === "smtp.gmail.com" ? (env.SMTP_PASS ?? "").replace(/\s+/g, "") : env.SMTP_PASS ?? "";
  return { host, port: Number(env.SMTP_PORT || 465), user, pass };
}

export const emailReady = (env: Env) => { const s = smtp(env); return !!(env.RESEND_API_KEY || (s.host && s.user && s.pass)); };

/** GET /api/recovery: what this server can do, so the app shows the right options. */
export function recoveryInfo(env: Env) {
  return json({ email: emailReady(env) });
}

/** a••••••5@gmail.com */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "";
  const keep = name.length <= 3 ? 1 : 2;
  return name.slice(0, keep) + "•".repeat(Math.max(3, name.length - keep * 2)) + (name.length > 4 ? name.slice(-keep) : "") + "@" + domain;
}

const codeHash = (userId: string, purpose: Purpose, code: string) => sha256Hex(`${userId}:${purpose}:${code}`);

function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Makes a code and emails it, unless one went out a moment ago or too many went out this hour. */
async function sendCode(env: Env, user: UserRow, purpose: Purpose, lang: string): Promise<number> {
  await ensureTables(env);
  const now = Date.now();
  const row = await env.DB.prepare("SELECT last_sent, sent_count, window_start FROM resets WHERE user_id = ? AND purpose = ?")
    .bind(user.id, purpose)
    .first<{ last_sent: number; sent_count: number; window_start: number }>();
  if (row && now - row.last_sent < RESEND_AFTER) return Math.ceil((RESEND_AFTER - (now - row.last_sent)) / 1000);
  const fresh = !row || now - row.window_start > 3600_000;
  const count = fresh ? 0 : row!.sent_count;
  if (count >= MAX_SENDS_PER_HOUR) throw new HttpError(429, lang === "ar" ? "طلبت رموزًا كثيرة. حاول بعد ساعة." : "Too many codes asked for. Try again in an hour.");
  const code = newCode();
  await sendMail(env, user.email, mailFor(code, purpose, user.name, lang));
  await env.DB.prepare(
    `INSERT INTO resets (user_id, purpose, code_hash, expires_at, attempts, last_sent, sent_count, window_start)
     VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)
     ON CONFLICT(user_id, purpose) DO UPDATE SET code_hash = ?3, expires_at = ?4, attempts = 0, last_sent = ?5, sent_count = ?6, window_start = ?7`,
  )
    .bind(user.id, purpose, await codeHash(user.id, purpose, code), now + CODE_TTL, now, count + 1, fresh ? now : row!.window_start)
    .run();
  return RESEND_AFTER / 1000;
}

/** Checks a code; a right one can be used once. */
async function useCode(env: Env, userId: string, purpose: Purpose, code: string, lang: string) {
  await ensureTables(env);
  const ar = lang === "ar";
  const row = await env.DB.prepare("SELECT code_hash, expires_at, attempts FROM resets WHERE user_id = ? AND purpose = ?")
    .bind(userId, purpose)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();
  const wrong = new HttpError(400, ar ? "الرمز غير صحيح" : "That code isn't right");
  if (!row || !row.code_hash) throw wrong;
  if (row.expires_at < Date.now()) throw new HttpError(400, ar ? "انتهت صلاحية الرمز. اطلب رمزًا جديدًا." : "That code has expired. Ask for a new one.");
  if (row.attempts >= MAX_TRIES) throw new HttpError(429, ar ? "محاولات كثيرة. اطلب رمزًا جديدًا." : "Too many tries. Ask for a new code.");
  if ((await codeHash(userId, purpose, code.replace(/\D/g, ""))) !== row.code_hash) {
    await env.DB.prepare("UPDATE resets SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?").bind(userId, purpose).run();
    throw wrong;
  }
  await env.DB.prepare("UPDATE resets SET code_hash = '', expires_at = 0 WHERE user_id = ? AND purpose = ?").bind(userId, purpose).run();
}

async function findUser(env: Env, login: unknown): Promise<UserRow | null> {
  const ident = String(login ?? "").trim().toLowerCase().replace(/^@/, "").slice(0, 320);
  if (!ident) throw new HttpError(400, "Type your email or username");
  return userByLogin(env, ident);
}

const needEmail = (env: Env, lang: string) => {
  if (!emailReady(env)) {
    throw new HttpError(503, lang === "ar"
      ? "إرسال الرموز بالبريد غير مفعّل على هذا الخادم بعد."
      : "Sending codes by email isn't set up on this server yet.");
  }
};

/** POST /api/password/forgot {login, lang} → {to, retryIn}. Says the same whether or not the account exists. */
export async function forgotPassword(req: Request, env: Env) {
  const body = await readJson(req);
  const lang = String(body.lang ?? "en");
  needEmail(env, lang);
  const login = String(body.login ?? "");
  const user = await findUser(env, login);
  if (!user) return json({ ok: true, to: null, retryIn: RESEND_AFTER / 1000 });
  const retryIn = await sendCode(env, user, "password", lang);
  // Usernames are public anyway; for an email the person already knows where it went.
  return json({ ok: true, to: login.includes("@") ? null : maskEmail(user.email), retryIn });
}

/** POST /api/password/reset {login, code, password} → {token, user}: signed in with the new password. */
export async function resetPassword(req: Request, env: Env) {
  const body = await readJson(req);
  const lang = String(body.lang ?? "en");
  const user = await findUser(env, body.login);
  const password = checkNewPassword(body.password);
  if (!user) throw new HttpError(400, lang === "ar" ? "الرمز غير صحيح" : "That code isn't right");
  await useCode(env, user.id, "password", String(body.code ?? ""), lang);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password = ?, failed_logins = 0, locked_until = 0 WHERE id = ?").bind(await hashPassword(password), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);
  const token = await createSession(env, user.id);
  return json({ token, user: publicUser(user) });
}

/** POST /api/pin/forgot {lang} (signed in) → {to, retryIn}: a code to the account's email. */
export async function forgotPin(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const lang = String(body.lang ?? "en");
  needEmail(env, lang);
  const retryIn = await sendCode(env, user, "pin", lang);
  return json({ ok: true, to: maskEmail(user.email), retryIn });
}

/** POST /api/pin/reset {password} or {code} (signed in): confirms it's you so the app can remove its PIN. */
export async function resetPin(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  const body = await readJson(req);
  const lang = String(body.lang ?? "en");
  if (typeof body.code === "string" && body.code) {
    await useCode(env, user.id, "pin", body.code, lang);
    return json({ ok: true });
  }
  const password = String(body.password ?? "").slice(0, 256);
  // Same lockout as signing in, so a found phone can't be used to guess the password.
  if (user.locked_until > Date.now()) throw new HttpError(429, lang === "ar" ? "محاولات كثيرة. حاول بعد دقائق." : "Too many failed attempts. Try again in a few minutes.");
  if (!password || !(await verifyPassword(password, user.password))) {
    await noteFailedLogin(env, user);
    throw new HttpError(403, lang === "ar" ? "كلمة المرور غير صحيحة" : "Wrong password");
  }
  if (user.failed_logins > 0) await env.DB.prepare("UPDATE users SET failed_logins = 0 WHERE id = ?").bind(user.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- the email

interface Mail { subject: string; text: string; html: string }

function mailFor(code: string, purpose: Purpose, name: string, lang: string): Mail {
  const ar = lang === "ar";
  const first = name.trim().split(/\s+/)[0] ?? "";
  const what = purpose === "password"
    ? (ar ? "لتعيين كلمة مرور جديدة" : "to set a new password")
    : (ar ? "لإزالة رمز PIN من التطبيق" : "to remove the PIN lock in the app");
  const subject = ar ? `رمز Carrot Note: ${code}` : `Your Carrot Note code: ${code}`;
  const hello = ar ? `مرحبًا${first ? " " + first : ""}،` : `Hi${first ? " " + first : ""},`;
  const line = ar ? `هذا رمزك ${what}. صالح لمدة ١٥ دقيقة.` : `Here's your code ${what}. It works for 15 minutes.`;
  const ignore = ar
    ? "إذا لم تطلب هذا فتجاهل الرسالة؛ حسابك بأمان ولن يتغير شيء."
    : "If you didn't ask for this, ignore this email. Your account is safe and nothing changes.";
  const text = `${hello}\n\n${line}\n\n${code}\n\n${ignore}\n\nCarrot Note`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html dir="${ar ? "rtl" : "ltr"}"><body style="margin:0;background:#F4F1EC;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1E1A16">
<div style="max-width:460px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:22px;padding:26px 24px">
<div style="font-size:20px;font-weight:800;color:#FF6B1F">Carrot Note</div>
<p style="font-size:15px;margin:18px 0 6px">${esc(hello)}</p><p style="font-size:15px;margin:0 0 18px">${esc(line)}</p>
<div dir="ltr" style="font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;background:#FFF1E8;border-radius:16px;padding:16px 0;color:#1E1A16">${code}</div>
<p style="font-size:13px;color:#7A716A;margin:18px 0 0">${esc(ignore)}</p></div></div></body></html>`;
  return { subject, text, html };
}

/** "Carrot Note <me@x.com>" or "me@x.com" → [display, address] */
function sender(env: Env): [string, string] {
  const raw = (env.MAIL_FROM || env.SMTP_USER || "").trim();
  const m = /^(.*)<([^>]+)>$/.exec(raw);
  return m ? [m[1].trim().replace(/^"|"$/g, "") || "Carrot Note", m[2].trim()] : ["Carrot Note", raw];
}

async function sendMail(env: Env, to: string, mail: Mail) {
  try {
    if (env.RESEND_API_KEY) await viaResend(env, to, mail);
    else await viaSmtp(env, to, mail);
  } catch (e) {
    console.error("email failed", (e as Error).message);
    throw new HttpError(502, "Couldn't send the email right now. Try again in a minute.");
  }
}

async function viaResend(env: Env, to: string, mail: Mail) {
  const [name, address] = sender(env);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `${name} <${address || "onboarding@resend.dev"}>`, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const enc = new TextEncoder();
const b64 = (s: string) => {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap76 = (s: string) => s.replace(/.{1,76}/g, (l) => l + "\r\n");

function mime(env: Env, to: string, mail: Mail) {
  const [name, address] = sender(env);
  const boundary = "cn" + crypto.randomUUID().replace(/-/g, "");
  return [
    `From: =?UTF-8?B?${b64(name)}?= <${address}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(mail.subject)}?=`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${address.split("@")[1] ?? "carrot-note"}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(mail.text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(mail.html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** A small SMTP client over Workers TCP sockets: port 465 is TLS from the start, 587 upgrades with STARTTLS. */
async function viaSmtp(env: Env, to: string, mail: Mail) {
  const { host, port, user, pass } = smtp(env);
  const tls = env.SMTP_TLS === "off" ? "off" : port === 465 ? "on" : "starttls";
  let socket = connect({ hostname: host, port }, { secureTransport: tls, allowHalfOpen: false });
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  const dec = new TextDecoder();
  let buf = "";
  const reply = async (): Promise<[number, string]> => {
    for (;;) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          buf = lines.slice(i + 1).join("\r\n");
          return [Number(lines[i].slice(0, 3)), lines.slice(0, i + 1).join(" | ")];
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP connection closed");
      buf += dec.decode(value, { stream: true });
    }
  };
  const step = async (want: number, line?: string) => {
    if (line != null) await writer.write(enc.encode(line + "\r\n"));
    const [code, text] = await reply();
    if (Math.floor(code / 100) !== Math.floor(want / 100)) throw new Error(`SMTP ${code}: ${text.slice(0, 200)}`);
  };
  const timer = setTimeout(() => socket.close().catch(() => {}), 20_000);
  try {
    await step(220);
    await step(250, "EHLO carrot-note");
    if (tls === "starttls") {
      await step(220, "STARTTLS");
      reader.releaseLock();
      writer.releaseLock();
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      buf = "";
      await step(250, "EHLO carrot-note");
    }
    await step(334, "AUTH LOGIN");
    await step(334, b64(user));
    await step(235, b64(pass));
    await step(250, `MAIL FROM:<${sender(env)[1]}>`);
    await step(250, `RCPT TO:<${to}>`);
    await step(354, "DATA");
    // Lines starting with a dot get another dot (SMTP's end-of-message marker is a lone dot).
    await step(250, mime(env, to, mail).replace(/\r\n\./g, "\r\n..") + "\r\n.");
    await writer.write(enc.encode("QUIT\r\n")).catch(() => {});
  } finally {
    clearTimeout(timer);
    await socket.close().catch(() => {});
  }
}
