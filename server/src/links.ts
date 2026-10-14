/**
 * Client links: a private web page for one invoice, quote or project that the owner sends to a
 * client. The client can accept or decline a quote, or say they've paid an invoice; each answer is
 * written as a "reply" record into the owner's personal space, so it reaches their apps by sync.
 * Pages are plain HTML (no scripts) and are read live from the synced records.
 */

import { authenticate, b64url, HttpError, json, memberSpaces, randomBytes, readJson, type Env } from "./index";

const LINK_TYPES = new Set(["invoice", "quote", "project"]);
const MAX_REPLIES_PER_LINK = 30;

let tablesReady = false;
/** The tables this module needs. Created on first use, so the deploy needs no migration step. */
export async function ensureTables(env: Env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS shares (
         token TEXT PRIMARY KEY, owner_id TEXT NOT NULL, space_id TEXT NOT NULL, type TEXT NOT NULL, rec_id TEXT NOT NULL,
         lang TEXT NOT NULL DEFAULT 'en', created_at INTEGER NOT NULL, replies INTEGER NOT NULL DEFAULT 0,
         last_action TEXT, last_at INTEGER)`,
    ),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_shares_rec ON shares(owner_id, type, rec_id)"),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS chat_queue (
         to_user TEXT NOT NULL, id TEXT NOT NULL, from_user TEXT NOT NULL, convo TEXT NOT NULL,
         body TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (to_user, id))`,
    ),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_from ON chat_queue(from_user, created_at)"),
  ]);
  tablesReady = true;
}

interface ShareRow {
  token: string;
  owner_id: string;
  space_id: string;
  type: string;
  rec_id: string;
  lang: string;
  replies: number;
  last_action: string | null;
  last_at: number | null;
}

type Rec = Record<string, unknown>;

/** The newest copy of a record in any space the user belongs to. */
async function findRecord(env: Env, userId: string, type: string, id: string): Promise<{ space: string; data: Rec } | null> {
  const spaces = (await memberSpaces(env, userId)).map((s) => s.id);
  const row = await env.DB.prepare(
    `SELECT space_id, data FROM records WHERE type = ? AND id = ? AND deleted = 0
       AND space_id IN (SELECT value FROM json_each(?)) ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(type, id, JSON.stringify(spaces))
    .first<{ space_id: string; data: string }>();
  if (!row?.data) return null;
  try {
    return { space: row.space_id, data: JSON.parse(row.data) as Rec };
  } catch {
    return null;
  }
}

/** POST /api/share {type, id, lang} → {token, url}: the same link every time for the same record. */
export async function createLink(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const body = await readJson(req);
  const type = String(body.type ?? "");
  const id = String(body.id ?? "");
  const lang = body.lang === "ar" ? "ar" : "en";
  if (!LINK_TYPES.has(type) || !id || id.length > 80) throw new HttpError(400, "Can't share this");
  const rec = await findRecord(env, user.id, type, id);
  if (!rec) throw new HttpError(404, "Not synced yet. Wait a few seconds and try again.");
  const origin = new URL(req.url).origin;
  const existing = await env.DB.prepare("SELECT token FROM shares WHERE owner_id = ? AND type = ? AND rec_id = ?")
    .bind(user.id, type, id)
    .first<{ token: string }>();
  if (existing) {
    await env.DB.prepare("UPDATE shares SET lang = ?, space_id = ? WHERE token = ?").bind(lang, rec.space, existing.token).run();
    return json({ token: existing.token, url: `${origin}/c/${existing.token}` });
  }
  const token = b64url(randomBytes(16));
  await env.DB.prepare(
    "INSERT INTO shares (token, owner_id, space_id, type, rec_id, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(token, user.id, rec.space, type, id, lang, Date.now())
    .run();
  return json({ token, url: `${origin}/c/${token}` });
}

/** POST /api/share/revoke {type, id}: the old link stops working. */
export async function revokeLink(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  await ensureTables(env);
  const body = await readJson(req);
  await env.DB.prepare("DELETE FROM shares WHERE owner_id = ? AND type = ? AND rec_id = ?")
    .bind(user.id, String(body.type ?? ""), String(body.id ?? ""))
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- public page

const T = {
  en: {
    invoice: "Invoice", quote: "Price offer", project: "Project progress", from: "From", to: "For", issued: "Date", due: "Due",
    valid: "Valid until", subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "Total", paid: "Paid", left: "Left to pay",
    notes: "Notes", accept: "Accept the offer", decline: "No thanks", iPaid: "I've paid", yourName: "Your name (optional)",
    note: "Message (optional)", amount: "Amount", method: "How did you pay?", send: "Send",
    sentAccept: "Thanks! You accepted this offer. {owner} will be in touch.", sentDecline: "Thanks for letting us know.",
    sentPaid: "Thanks! {owner} will confirm your payment.", accepted: "Accepted", declined: "Declined", paidFull: "Paid in full 🎉",
    expired: "This offer has expired", tasks: "tasks done", deadline: "Deadline", status: "Status", progress: "Progress",
    gone: "This link doesn't work anymore", goneText: "Ask the sender for a new link.", made: "Made with Carrot Note",
    item: "Item", qty: "Qty", price: "Price", amountCol: "Amount", priceTotal: "Price", received: "Paid so far",
    statuses: { active: "In progress", on_hold: "On hold", done: "Finished", completed: "Finished", cancelled: "Cancelled" } as Record<string, string>,
    methods: ["InstaPay", "Vodafone Cash", "Bank transfer", "Cash", "Other"],
  },
  ar: {
    invoice: "فاتورة", quote: "عرض سعر", project: "تقدم المشروع", from: "من", to: "إلى", issued: "التاريخ", due: "تاريخ الاستحقاق",
    valid: "صالح حتى", subtotal: "المجموع الفرعي", discount: "الخصم", tax: "الضريبة", total: "الإجمالي", paid: "المدفوع", left: "المتبقي",
    notes: "ملاحظات", accept: "قبول العرض", decline: "لا، شكرًا", iPaid: "دفعت", yourName: "اسمك (اختياري)",
    note: "رسالة (اختياري)", amount: "المبلغ", method: "طريقة الدفع", send: "إرسال",
    sentAccept: "شكرًا! قبلت هذا العرض. سيتواصل معك {owner}.", sentDecline: "شكرًا لإبلاغنا.",
    sentPaid: "شكرًا! سيؤكد {owner} استلام الدفع.", accepted: "مقبول", declined: "مرفوض", paidFull: "مدفوعة بالكامل 🎉",
    expired: "انتهت صلاحية هذا العرض", tasks: "مهام منتهية", deadline: "الموعد النهائي", status: "الحالة", progress: "التقدم",
    gone: "هذا الرابط لم يعد يعمل", goneText: "اطلب رابطًا جديدًا من المرسل.", made: "صُنع بواسطة كاروت نوت",
    item: "البند", qty: "الكمية", price: "السعر", amountCol: "المبلغ", priceTotal: "السعر", received: "المدفوع حتى الآن",
    statuses: { active: "قيد التنفيذ", on_hold: "متوقف مؤقتًا", done: "منتهٍ", completed: "منتهٍ", cancelled: "ملغى" } as Record<string, string>,
    methods: ["إنستاباي", "فودافون كاش", "تحويل بنكي", "نقدًا", "أخرى"],
  },
};
type Words = typeof T.en;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
/** "4,980 EGP", kept in that order on right-to-left pages too. */
const money = (v: number, cur: unknown) =>
  `<bdi>${`${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${esc(cur || "")}`.trim()}</bdi>`;
const day = (d: unknown, lang: string) =>
  typeof d === "number"
    ? new Date(d * 86_400_000).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "";
const today = () => Math.floor(Date.now() / 86_400_000);

function page(lang: string, title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>
:root{--bg:#F4F1EC;--card:#fff;--text:#1E1A17;--muted:#8A817A;--line:#ECE7E1;--accent:#FF6B1F;--good:#1E9E63;--bad:#D93A3A}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--card:#1F1C19;--text:#F5F1EC;--muted:#A39A92;--line:#332E2A;--accent:#FF7A2E;--good:#4ADE80;--bad:#FF6B6B}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 40px}.card{background:var(--card);border-radius:22px;padding:18px;margin-top:14px}
.hero{background:linear-gradient(135deg,#FF7A2E,#FF5A12);color:#fff;border-radius:24px;padding:20px}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.big{font-size:34px;font-weight:900;letter-spacing:-.02em;margin:4px 0}.pill{display:inline-block;background:rgba(255,255,255,.22);border-radius:99px;padding:3px 10px;font-size:12px;font-weight:700}
.row{display:flex;gap:10px;justify-content:space-between;align-items:baseline}.muted{color:var(--muted)}.small{font-size:13px}
table{width:100%;border-collapse:collapse}td,th{padding:9px 0;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}td.n,th.n{text-align:end;white-space:nowrap;padding-inline-start:10px}
.tot div{display:flex;justify-content:space-between;padding:4px 0}.tot .strong{font-weight:800;font-size:17px;border-top:1px solid var(--line);margin-top:6px;padding-top:10px}
.bar{height:10px;border-radius:99px;background:var(--line);overflow:hidden;margin:10px 0 6px}.bar i{display:block;height:100%;background:var(--accent);border-radius:99px}
form{margin:0}input,select,textarea{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:11px 12px;margin-top:8px}
textarea{min-height:70px}.btns{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
button{font:inherit;font-weight:700;border:0;border-radius:16px;padding:13px 18px;cursor:pointer;flex:1}
.primary{background:var(--accent);color:#fff}.ghost{background:var(--bg);color:var(--text)}.done{background:var(--good);color:#fff;border-radius:16px;padding:14px;font-weight:700;margin-top:14px}
.pre{white-space:pre-wrap}.foot{text-align:center;margin-top:22px;font-size:12px;color:var(--muted)}h2{font-size:15px;margin:0 0 6px}
</style></head><body><main>${body}<div class="foot">${esc(T[lang as "en" | "ar"]?.made ?? T.en.made)}</div></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

async function loadShare(env: Env, token: string): Promise<ShareRow | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  await ensureTables(env);
  return await env.DB.prepare("SELECT * FROM shares WHERE token = ?").bind(token).first<ShareRow>();
}

function itemsTable(w: Words, rec: Rec) {
  const items = Array.isArray(rec.items) ? (rec.items as Rec[]) : [];
  const cur = rec.currency;
  const rows = items
    .map((i) => `<tr><td>${esc(i.description)}</td><td class="n">${num(i.qty)}</td><td class="n">${money(num(i.price), "")}</td><td class="n">${money(num(i.qty) * num(i.price), cur)}</td></tr>`)
    .join("");
  return `<div class="card"><table><tr><th>${w.item}</th><th class="n">${w.qty}</th><th class="n">${w.price}</th><th class="n">${w.amountCol}</th></tr>${rows}</table></div>`;
}

function totals(rec: Rec) {
  const items = Array.isArray(rec.items) ? (rec.items as Rec[]) : [];
  const subtotal = items.reduce((a, i) => a + num(i.qty) * num(i.price), 0);
  const discount = Math.min(subtotal, rec.discountPercent ? (subtotal * num(rec.discount)) / 100 : num(rec.discount));
  const tax = ((subtotal - discount) * num(rec.taxPercent)) / 100;
  const total = Math.round((subtotal - discount + tax) * 100) / 100;
  const paid = (Array.isArray(rec.payments) ? (rec.payments as Rec[]) : []).reduce((a, p) => a + num(p.amount), 0);
  return { subtotal, discount, tax, total, paid, due: Math.max(0, Math.round((total - paid) * 100) / 100) };
}

function totalsCard(w: Words, rec: Rec, withPaid: boolean) {
  const t = totals(rec);
  const cur = rec.currency;
  return `<div class="card tot"><div><span class="muted">${w.subtotal}</span><b>${money(t.subtotal, cur)}</b></div>
${t.discount > 0 ? `<div><span class="muted">${w.discount}</span><b>−${money(t.discount, cur)}</b></div>` : ""}
${num(rec.taxPercent) > 0 ? `<div><span class="muted">${w.tax} (${num(rec.taxPercent)}%)</span><b>${money(t.tax, cur)}</b></div>` : ""}
<div class="strong"><span>${w.total}</span><span>${money(t.total, cur)}</span></div>
${withPaid && t.paid > 0 ? `<div><span class="muted">${w.paid}</span><b>${money(t.paid, cur)}</b></div><div class="strong"><span>${w.left}</span><span>${money(t.due, cur)}</span></div>` : ""}</div>`;
}

const notesCard = (w: Words, rec: Rec) =>
  typeof rec.notes === "string" && rec.notes.trim() ? `<div class="card"><h2>${w.notes}</h2><div class="pre">${esc(rec.notes)}</div></div>` : "";

function replyForm(w: Words, token: string, action: string, label: string, extra = "", kind = "primary") {
  return `<form method="post" action="/c/${token}/reply"><input type="hidden" name="action" value="${action}">${extra}
<button class="${kind}" type="submit">${label}</button></form>`;
}

/** GET /c/<token>: the client's page. */
export async function showLink(env: Env, token: string, url: URL) {
  const share = await loadShare(env, token);
  const lang = share?.lang === "ar" ? "ar" : "en";
  const w = T[lang];
  const gone = () => page(lang, w.gone, `<div class="card"><h2>${w.gone}</h2><p class="muted">${w.goneText}</p></div>`, 404);
  if (!share) return gone();
  const rec = await findRecord(env, share.owner_id, share.type, share.rec_id);
  if (!rec) return gone();
  const owner = await env.DB.prepare("SELECT name, username FROM users WHERE id = ?").bind(share.owner_id).first<{ name: string; username: string | null }>();
  const ownerName = esc(owner?.name || owner?.username || "Carrot Note");
  const r = rec.data;
  const done = url.searchParams.get("done");
  const thanks = done ? `<div class="done">${esc((done === "accept" ? w.sentAccept : done === "decline" ? w.sentDecline : w.sentPaid).replace("{owner}", owner?.name || ""))}</div>` : "";

  if (share.type === "invoice") {
    const t = totals(r);
    const fullyPaid = t.total > 0 && t.due <= 0.0001;
    const methods = w.methods.map((m) => `<option>${esc(m)}</option>`).join("");
    const pay = fullyPaid || r.status === "cancelled" ? "" : `<div class="card"><h2>${w.iPaid}</h2>
<form method="post" action="/c/${token}/reply"><input type="hidden" name="action" value="paid">
<input name="amount" inputmode="decimal" placeholder="${w.amount}" value="${t.due}"><select name="method">${methods}</select>
<input name="name" placeholder="${w.yourName}" maxlength="80"><textarea name="note" placeholder="${w.note}" maxlength="500"></textarea>
<div class="btns"><button class="primary" type="submit">${w.send}</button></div></form></div>`;
    return page(lang, `${w.invoice} ${String(r.number ?? "")}`, `<div class="hero"><div class="row"><span class="eyebrow">${w.invoice} ${esc(r.number)}</span>
<span class="pill">${fullyPaid ? w.paidFull : `${w.due} ${day(r.dueDate, lang)}`}</span></div>
<div class="big">${money(fullyPaid ? t.total : t.due, r.currency)}</div>
<div class="small">${w.from} ${ownerName}${r.clientName ? ` · ${w.to} ${esc(r.clientName)}` : ""} · ${w.issued} ${day(r.issueDate, lang)}</div></div>
${thanks}${itemsTable(w, r)}${totalsCard(w, r, true)}${notesCard(w, r)}${pay}`);
  }

  if (share.type === "quote") {
    const t = totals(r);
    const expired = typeof r.validUntil === "number" && r.validUntil < today();
    const decided = r.status === "accepted" || r.status === "declined" ? r.status : share.last_action === "accept" ? "accepted" : share.last_action === "decline" ? "declined" : "";
    const answer = decided || expired ? `<div class="card"><b>${decided === "accepted" ? w.accepted : decided === "declined" ? w.declined : w.expired}</b></div>`
      : `<div class="card"><form method="post" action="/c/${token}/reply"><input name="name" placeholder="${w.yourName}" maxlength="80">
<textarea name="note" placeholder="${w.note}" maxlength="500"></textarea>
<div class="btns"><button class="primary" type="submit" name="action" value="accept">${w.accept}</button>
<button class="ghost" type="submit" name="action" value="decline">${w.decline}</button></div></form></div>`;
    return page(lang, `${w.quote} ${String(r.number ?? "")}`, `<div class="hero"><div class="row"><span class="eyebrow">${w.quote} ${esc(r.number)}</span>
${r.validUntil != null ? `<span class="pill">${w.valid} ${day(r.validUntil, lang)}</span>` : ""}</div>
${r.title ? `<div style="font-weight:700;margin-top:6px">${esc(r.title)}</div>` : ""}<div class="big">${money(t.total, r.currency)}</div>
<div class="small">${w.from} ${ownerName}${r.clientName ? ` · ${w.to} ${esc(r.clientName)}` : ""}</div></div>
${thanks}${itemsTable(w, r)}${totalsCard(w, r, false)}${notesCard(w, r)}${answer}`);
  }

  // Project: progress only. Task names and private notes stay private.
  const spaces = (await memberSpaces(env, share.owner_id)).map((s) => s.id);
  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN json_extract(data, '$.done') = 1 OR json_extract(data, '$.done') = 'true' THEN 1 ELSE 0 END) AS done
     FROM records WHERE type = 'task' AND deleted = 0 AND json_extract(data, '$.projectId') = ?
       AND space_id IN (SELECT value FROM json_each(?))`,
  )
    .bind(share.rec_id, JSON.stringify(spaces))
    .first<{ total: number; done: number | null }>();
  const paid = await env.DB.prepare(
    `SELECT SUM(json_extract(data, '$.amount')) AS paid FROM records WHERE type = 'txn' AND deleted = 0
       AND json_extract(data, '$.kind') = 'income' AND json_extract(data, '$.projectId') = ?
       AND json_extract(data, '$.currency') = ? AND space_id IN (SELECT value FROM json_each(?))`,
  )
    .bind(share.rec_id, String(r.currency ?? ""), JSON.stringify(spaces))
    .first<{ paid: number | null }>();
  const total = counts?.total ?? 0;
  const doneCount = counts?.done ?? 0;
  const pct = total ? Math.round((doneCount / total) * 100) : r.status === "done" || r.status === "completed" ? 100 : 0;
  const price = num(r.price);
  const status = w.statuses[String(r.status ?? "active")] ?? w.statuses.active;
  return page(lang, String(r.name ?? w.project), `<div class="hero"><div class="row"><span class="eyebrow">${w.project}</span><span class="pill">${esc(status)}</span></div>
<div class="big" style="font-size:28px">${esc(r.name)}</div><div class="small">${w.from} ${ownerName}${r.clientName ? ` · ${w.to} ${esc(r.clientName)}` : ""}</div></div>
<div class="card"><div class="row"><h2>${w.progress}</h2><b>${pct}%</b></div><div class="bar"><i style="width:${pct}%"></i></div>
<div class="muted small">${doneCount} / ${total} ${w.tasks}</div></div>
<div class="card tot">${r.deadline != null ? `<div><span class="muted">${w.deadline}</span><b>${day(r.deadline, lang)}</b></div>` : ""}
${price > 0 ? `<div><span class="muted">${w.priceTotal}</span><b>${money(price, r.currency)}</b></div><div><span class="muted">${w.received}</span><b>${money(num(paid?.paid), r.currency)}</b></div>` : ""}
<div><span class="muted">${w.status}</span><b>${esc(status)}</b></div></div>`);
}

/** POST /c/<token>/reply (a form post): saves the client's answer as a "reply" record for the owner. */
export async function replyLink(req: Request, env: Env, token: string) {
  const share = await loadShare(env, token);
  if (!share) return new Response("Not found", { status: 404 });
  const form = await req.formData().catch(() => null);
  const action = String(form?.get("action") ?? "");
  const allowed = share.type === "quote" ? ["accept", "decline"] : share.type === "invoice" ? ["paid"] : [];
  if (!allowed.includes(action) || share.replies >= MAX_REPLIES_PER_LINK) return Response.redirect(new URL(`/c/${token}`, req.url).toString(), 303);
  const rec = await findRecord(env, share.owner_id, share.type, share.rec_id);
  const clip = (k: string, max: number) => String(form?.get(k) ?? "").trim().slice(0, max);
  const amount = parseFloat(clip("amount", 20).replace(/,/g, ""));
  const now = Date.now();
  const reply = {
    id: "r" + b64url(randomBytes(9)),
    kind: action,
    targetType: share.type,
    targetId: share.rec_id,
    number: String(rec?.data.number ?? rec?.data.name ?? ""),
    clientName: String(rec?.data.clientName ?? ""),
    currency: String(rec?.data.currency ?? ""),
    name: clip("name", 80),
    note: clip("note", 500),
    amount: isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    method: clip("method", 40),
    at: now,
    handled: false,
    createdAt: now,
  };
  // Into the owner's personal space, like any synced record, so all their devices get it.
  await env.DB.batch([
    env.DB.prepare("UPDATE spaces SET rev = rev + 1 WHERE id = ?").bind(share.owner_id),
    env.DB.prepare(
      `INSERT INTO records (space_id, type, id, data, updated_at, deleted, rev)
       VALUES (?1, 'reply', ?2, ?3, ?4, 0, (SELECT rev FROM spaces WHERE id = ?1))`,
    ).bind(share.owner_id, reply.id, JSON.stringify(reply), now),
    env.DB.prepare("UPDATE shares SET replies = replies + 1, last_action = ?, last_at = ? WHERE token = ?").bind(action, now, token),
  ]);
  return Response.redirect(new URL(`/c/${token}?done=${action}`, req.url).toString(), 303);
}
