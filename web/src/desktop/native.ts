// The desktop (Tauri) side of the bridge, in TypeScript. It does on a PC what WebBridge.kt and
// the Kotlin code do on the phone: an offline database (IndexedDB), sync with the same Carrot
// Note server, sign-in, PIN lock, reminders as desktop notifications, files, PDFs and updates.

import { invoke } from '@tauri-apps/api/core'
import { open as openFile, save as saveFile } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { openUrl } from '@tauri-apps/plugin-opener'
import * as F from '../format'
import { toast } from '../ui'
import { httpFetch, inTauri } from './http'
import { deleteDb, openDb, readAll, write } from './idb'
import { printPdf, type PdfDoc } from './pdf'
import { applyZoom, autoZoom, zoomSetting } from './zoom'
import * as Chat from './chat'
import * as WhatsApp from './whatsapp'

declare const __APP_VERSION__: string
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
const API = 'https://carrot-note-api.carrot-note-api.workers.dev'
const REPO = 'DG-925/carrot-note'
const TYPES = ['project', 'task', 'note', 'txn', 'goal', 'customer', 'debt', 'event', 'time', 'budget', 'rental', 'invoice', 'recurring', 'receipt', 'secret', 'vault', 'item', 'quote', 'wallet', 'transfer', 'supplier', 'price', 'doc', 'activity', 'target', 'msgtpl', 'setting', 'reply', 'audio']
const ALLOWED = ['https://date.nager.at/', 'https://open.er-api.com/', 'https://api.github.com/', 'https://rdap.org/']

type Json = any
interface Row { type: string; id: string; data: string | null; updatedAt: number; deleted: boolean; dirty: boolean; space?: string | null }
interface User { id: string; email: string; name: string; username: string; bio: string; github: string; avatarRev: number }

const emit = (name: string, payload: unknown) => window.__native?.emit(name, payload)

// ---------------------------------------------------------------- small stores

const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('carrot.desk.' + k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k: string, v: unknown) { try { localStorage.setItem('carrot.desk.' + k, JSON.stringify(v)) } catch { /* full */ } },
  del(k: string) { try { localStorage.removeItem('carrot.desk.' + k) } catch { /* blocked */ } },
}

let session: { token: string | null; user: User | null } = ls.get('session', { token: null, user: null })
const settings = ls.get('settings', { currency: 'USD', theme: 1, autoUpdate: true })
const pin = ls.get<{ hash?: string; salt?: string; length: number; delay: number; fails: number; until: number }>('pin', { length: 4, delay: 30, fails: 0, until: 0 })
let locked = !!pin.hash
let invites = 0
let syncState: { syncing: boolean; lastSync: number; error: string | null; apiVersion?: number } = { syncing: false, lastSync: 0, error: null }
let release: { version: string; notes: string; size: number; url: string } | null = null
let started = false

const saveSession = () => ls.set('session', session)
const saveSettings = () => ls.set('settings', settings)
const savePin = () => ls.set('pin', pin)

// ---------------------------------------------------------------- server

class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }

async function api<T = Json>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  let res: Response
  try {
    res = await httpFetch(API + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...(auth && session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.")
  }
  const text = await res.text()
  if (!res.ok) {
    let msg = `Server error (${res.status})`
    try { msg = JSON.parse(text).error ?? msg } catch { /* not JSON */ }
    throw new ApiError(res.status, msg)
  }
  return text ? JSON.parse(text) : (null as T)
}

// ---------------------------------------------------------------- local database

let lastTs = 0
const nextTs = () => { const now = Date.now(); lastTs = now > lastTs ? now : lastTs + 1; return lastTs }
const key = (type: string, id: string) => type + '\u001f' + id

class Repo {
  rows = new Map<string, Row>()
  tables: Record<string, Map<string, Json>> = Object.fromEntries(TYPES.map(t => [t, new Map()]))
  meta: Record<string, Json> = {}
  private constructor(public userId: string, private db: IDBDatabase) {}

  static dbName = (userId: string) => 'carrot-' + userId.replace(/[^A-Za-z0-9]/g, '')

  static async open(userId: string) {
    const db = await openDb(Repo.dbName(userId))
    const repo = new Repo(userId, db)
    for (const [, row] of await readAll<Row>(db, 'rows')) {
      repo.rows.set(key(row.type, row.id), row)
      repo.applyRow(row)
    }
    for (const [k, v] of await readAll<Json>(db, 'meta')) repo.meta[k] = v
    // Older versions skipped record types they didn't know yet but still moved their sync cursors
    // past them. When this version knows new types, download everything once more.
    const known = [...TYPES].sort().join(',')
    if (repo.meta.knownTypes !== known) await repo.setMeta({ cursors: {}, knownTypes: known })
    return repo
  }

  get spaces(): Json[] { return this.meta.spaces ?? [] }
  list(type: string): Json[] { return [...(this.tables[type]?.values() ?? [])] }
  get(type: string, id?: string | null) { return id ? this.tables[type]?.get(id) : undefined }

  private applyRow(row: Row) {
    const t = this.tables[row.type]
    if (!t) return
    if (row.deleted || row.data == null) { t.delete(row.id); return }
    try { t.set(row.id, JSON.parse(row.data)) } catch { /* bad row */ }
  }

  private spaceFor(projectId?: string | null) {
    return projectId ? this.spaces.find(s => s.kind === 'project' && s.projectId === projectId)?.id : undefined
  }
  private spaceHint(type: string, id: string, item: Json): string {
    const projectId = type === 'project' ? id : ['task', 'note', 'event', 'rental', 'invoice', 'quote', 'activity'].includes(type) ? item?.projectId : null
    return this.spaceFor(projectId) ?? this.userId
  }

  async save(type: string, item: Json) {
    if (!this.tables[type]) throw new Error('Unknown type ' + type)
    const id = String(item.id)
    const row: Row = { type, id, data: JSON.stringify(item), updatedAt: nextTs(), deleted: false, dirty: true, space: this.spaceHint(type, id, item) }
    this.rows.set(key(type, id), row)
    this.applyRow(row)
    await write(this.db, 'rows', [[key(type, id), row]])
    changed(type)
  }

  async delete(type: string, id: string) {
    const old = this.rows.get(key(type, id))
    const row: Row = { type, id, data: null, updatedAt: nextTs(), deleted: true, dirty: true, space: old?.space ?? this.userId }
    this.rows.set(key(type, id), row)
    this.applyRow(row)
    await write(this.db, 'rows', [[key(type, id), row]])
    changed(type)
  }

  dirty(): Row[] { return [...this.rows.values()].filter(r => r.dirty) }

  async markClean(list: Row[]) {
    const puts: [string, Row][] = []
    for (const r of list) {
      const cur = this.rows.get(key(r.type, r.id))
      if (cur && cur.updatedAt === r.updatedAt) { cur.dirty = false; puts.push([key(r.type, r.id), cur]) }
    }
    await write(this.db, 'rows', puts)
  }

  /** Server changes, last write wins; newer unsynced local edits are kept. */
  async applyRemote(list: Row[]): Promise<Set<string>> {
    const puts: [string, Row][] = []
    const types = new Set<string>()
    for (const r of list) {
      // Types this version doesn't know are still stored, so a later version can show them.
      const local = this.rows.get(key(r.type, r.id))
      if (local && local.updatedAt > r.updatedAt) continue
      if (r.deleted && local && !local.deleted && local.space && r.space && local.space !== r.space) continue
      const row: Row = { type: r.type, id: r.id, data: r.data ?? null, updatedAt: r.updatedAt, deleted: !!r.deleted, dirty: false, space: r.space ?? null }
      this.rows.set(key(r.type, r.id), row)
      this.applyRow(row)
      puts.push([key(r.type, r.id), row])
      if (this.tables[r.type]) types.add(r.type)
    }
    await write(this.db, 'rows', puts)
    return types
  }

  async setSpaces(list: Json[]) {
    const ids = new Set([...list.map(s => s.id), this.userId])
    const gone = [...this.rows.values()].filter(r => r.space && !ids.has(r.space) && !r.dirty)
    if (gone.length) {
      for (const r of gone) { this.rows.delete(key(r.type, r.id)); this.tables[r.type]?.delete(r.id) }
      await write(this.db, 'rows', [], gone.map(r => key(r.type, r.id)))
      new Set(gone.map(r => r.type)).forEach(t => emitTable(t))
      this.meta.cursors = Object.fromEntries(Object.entries(this.meta.cursors ?? {}).filter(([k]) => ids.has(k)))
    }
    this.meta.spaces = list
    await this.setMeta({ spaces: list, cursors: this.meta.cursors ?? {} })
    emit('spaces', list)
  }

  async setMeta(patch: Record<string, Json>) {
    Object.assign(this.meta, patch)
    await write(this.db, 'meta', Object.entries(patch))
  }

  close() { this.db.close() }
}

let repo: Repo | null = null

function emitTable(type: string) {
  if (!repo || type === 'receipt') return
  emit('table', { type, items: repo.list(type) })
}
function emitAllData() {
  if (!repo) return
  TYPES.forEach(emitTable)
  emit('spaces', repo.spaces)
}
function changed(type: string) {
  emitTable(type)
  requestSync()
}

function emitState() {
  emit('state', {
    signedIn: !!repo,
    locked: !!repo && locked,
    user: session.user,
    version: VERSION,
    systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
    invites,
    settings: { ...settings },
    lock: { pinEnabled: !!pin.hash, pinLength: pin.length, biometric: false, biometricAvailable: false, delay: pin.delay, secureScreen: false },
    sync: syncState,
    release: release ? { version: release.version, notes: release.notes, size: release.size } : null,
    download: { state: 'idle' },
  })
}

async function openRepo(user: User) {
  repo?.close()
  repo = await Repo.open(user.id)
  syncState = { syncing: false, lastSync: repo.meta.last_sync ?? 0, error: null }
  emitState()
  emitAllData()
  requestSync(300)
}

function forceSignOut(message?: string) {
  const old = repo
  repo = null
  session = { token: null, user: null }
  saveSession()
  pin.hash = undefined; pin.salt = undefined; savePin()
  locked = false
  invites = 0
  if (old) { old.close(); deleteDb(Repo.dbName(old.userId)) }
  syncState = { syncing: false, lastSync: 0, error: message ?? null }
  emitState()
}

// ---------------------------------------------------------------- sync

let syncing: Promise<boolean> | null = null
let syncTimer = 0
function requestSync(delay = 2500) {
  clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => { syncNow() }, delay)
}

function syncNow(): Promise<boolean> {
  if (syncing) return syncing.then(() => runSync())
  return runSync()
}

function runSync(): Promise<boolean> {
  const p = (async () => {
    const r = repo
    if (!r || !session.token) return false
    syncState = { ...syncState, syncing: true, error: null }
    emitState()
    try {
      let cursors: Record<string, number> = r.meta.cursors ?? {}
      let apiVersion = 0
      let chatPending = 0
      const dirty = r.dirty()
      const chunks = dirty.length ? Array.from({ length: Math.ceil(dirty.length / 100) }, (_, i) => dirty.slice(i * 100, i * 100 + 100)) : [[]]
      for (const chunk of chunks) {
        const resp = await api<Json>('POST', '/api/sync', {
          cursors, changes: chunk.map(c => ({ type: c.type, id: c.id, data: c.data, updatedAt: c.updatedAt, deleted: c.deleted, space: c.space ?? null })),
        })
        if (repo !== r) return false
        const types = await r.applyRemote(resp.changes ?? [])
        notifyActivity(r, resp.changes ?? [])
        notifyReplies(resp.changes ?? [])
        notifyFollowers(resp.followers)
        chatPending = Number(resp.chatPending) || 0
        await r.markClean(chunk)
        const spaces = (resp.spaces ?? []).filter((s: Json) => s.kind === 'project')
        await r.setSpaces(spaces)
        cursors = Object.fromEntries(Object.entries(resp.cursors ?? {}).filter(([k]) => k === r.userId || (resp.spaces ?? []).some((s: Json) => s.id === k))) as Record<string, number>
        await r.setMeta({ cursors })
        invites = resp.invites ?? 0
        apiVersion = Number(resp.apiVersion) || 0
        if (resp.user) { session.user = resp.user; saveSession() }
        types.forEach(t => emitTable(t))
      }
      // Chat: send what's waiting, and pick up new messages.
      Chat.flush().catch(() => {})
      if (chatPending > 0) Chat.fetchInbox().catch(() => {})
      const now = Date.now()
      await r.setMeta({ last_sync: now })
      syncState = { syncing: false, lastSync: now, error: null, apiVersion }
      emitState()
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) forceSignOut('Session expired. Please sign in again.')
      else { syncState = { ...syncState, syncing: false, error: (e as Error).message || 'Sync failed' }; emitState() }
      return false
    }
  })()
  syncing = p
  p.finally(() => { if (syncing === p) syncing = null })
  return p
}

// ---------------------------------------------------------------- PIN lock

const enc = new TextEncoder()
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
async function hashPin(value: string, salt: string) {
  const base = await crypto.subtle.importKey('raw', enc.encode(value), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)), iterations: 120_000, hash: 'SHA-256' }, base, 256)
  return b64(new Uint8Array(bits))
}
const cooldown = () => Math.max(0, pin.until - Date.now())

// While the window is open, pull teammates' changes and new invitations every 15 seconds, and
// right away when the window comes back.
setInterval(() => { if (!document.hidden && repo && !locked) syncNow() }, 15_000)
window.addEventListener('focus', () => { if (repo && !locked && Date.now() - syncState.lastSync > 5_000) syncNow() })

let hiddenAt = 0
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return }
  if (repo && !locked) syncNow()
  if (pin.hash && repo && !locked && hiddenAt && Date.now() - hiddenAt >= pin.delay * 1000) { locked = true; emitState() }
})

// ---------------------------------------------------------------- reminders and checks (while the app is open)

const ACTIVITY_WORDS: Record<string, string> = { created: 'added', updated: 'changed', deleted: 'deleted', completed: 'finished', paid: 'recorded a payment on', split: 'split earnings in' }
const ACTIVITY_TYPES: Record<string, string> = { project: 'the project', task: 'task', note: 'note', event: 'event', rental: 'renter', invoice: 'invoice', quote: 'quote', doc: 'file' }

/** A notification when a teammate changes something in a shared project. */
function notifyActivity(r: Repo, changes: Json[]) {
  const me = session.user?.id
  let seen = 0
  try { seen = Number(localStorage.getItem('carrot.activitySeen')) || 0 } catch { /* private mode */ }
  const fresh = changes
    .filter(c => c.type === 'activity' && !c.deleted && c.data)
    .map(c => { try { return JSON.parse(c.data) } catch { return null } })
    .filter((a): a is Json => !!a && a.userId !== me && a.at > seen && a.at > Date.now() - 6 * 3_600_000)
    .sort((a, b) => a.at - b.at)
  if (!fresh.length) return
  try { localStorage.setItem('carrot.activitySeen', String(fresh[fresh.length - 1].at)) } catch { /* private mode */ }
  const project = r.get('project', fresh[0].projectId)?.name ?? 'Shared project'
  const line = (a: Json) => `${a.name} ${ACTIVITY_WORDS[a.action] ?? a.action} ${ACTIVITY_TYPES[a.type] ?? a.type}${a.title && a.type !== 'project' ? ` “${a.title}”` : ''}`
  notify(project, fresh.length === 1 ? line(fresh[0]) : `${line(fresh[fresh.length - 1])} and ${fresh.length - 1} more`)
}

/** "Karim followed you": new followers since last time. */
function notifyFollowers(f: Json) {
  const latest: Json[] = f?.latest ?? []
  let seen = -1
  try { seen = Number(localStorage.getItem('carrot.followSeen') ?? -1) } catch { /* private mode */ }
  const newest = latest.reduce((m, x) => Math.max(m, Number(x.at) || 0), 0)
  if (!newest) return
  try { localStorage.setItem('carrot.followSeen', String(Math.max(seen, newest))) } catch { /* private mode */ }
  if (seen < 0) return // first sync on this computer: nothing is new
  const ar = document.documentElement.dir === 'rtl'
  for (const x of latest.filter(x => x.at > seen)) {
    const who = x.name || '@' + x.username
    notify(ar ? `${who} بدأ متابعتك` : `${who} followed you`, ar ? 'تابعه أنت أيضًا لتتراسلا' : 'Follow them back to chat')
  }
}

/** A notification when a client answers through a client link. */
function notifyReplies(changes: Json[]) {
  let seen = 0
  try { seen = Number(localStorage.getItem('carrot.replySeen')) || 0 } catch { /* private mode */ }
  const fresh = changes
    .filter(c => c.type === 'reply' && !c.deleted && c.data)
    .map(c => { try { return JSON.parse(c.data) } catch { return null } })
    .filter((x): x is Json => !!x && !x.handled && x.at > seen)
    .sort((a, b) => a.at - b.at)
  if (!fresh.length) return
  try { localStorage.setItem('carrot.replySeen', String(fresh[fresh.length - 1].at)) } catch { /* private mode */ }
  const ar = document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl'
  for (const x of fresh) {
    const who = x.name || x.clientName || (ar ? 'عميلك' : 'Your client')
    const money = x.amount ? ` ${F.money(x.amount, x.currency)}` : ''
    const method = x.method ? ` · ${x.method}` : ''
    const text = x.kind === 'accept' ? (ar ? `${who} قبل ${x.number} 🎉` : `${who} accepted ${x.number} 🎉`)
      : x.kind === 'decline' ? (ar ? `${who} رفض ${x.number}` : `${who} declined ${x.number}`)
        : ar ? `${who} يقول إنه دفع${money} لـ ${x.number}${method}` : `${who} says they paid${money} for ${x.number}${method}`
    notify(text, x.note || (ar ? 'افتح كاروت نوت للتصرف' : 'Open Carrot Note to act on it'))
  }
}

Chat.initChat({
  api: (method, path, body) => api(method, path, body),
  me: () => session.user ? { id: session.user.id, name: session.user.name, username: session.user.username, avatarRev: session.user.avatarRev } : null,
  projectName: id => repo?.get('project', id)?.name,
  notify: (title, body) => { notify(title, body) },
  changed: convo => emit('chat', convo),
})

async function notify(title: string, body: string) {
  try {
    if (!(await isPermissionGranted())) return
    sendNotification({ title, body })
  } catch { /* not available */ }
}

const fired = new Set<string>(ls.get<string[]>('fired', []))
function fireOnce(k: string, at: number, title: string, body: string, now: number) {
  if (at > now || now - at > 36 * 3600_000 || fired.has(k)) return
  fired.add(k)
  ls.set('fired', [...fired].slice(-500))
  notify(title, body)
}

function checkReminders() {
  const r = repo
  if (!r || locked) return
  const now = Date.now()
  const at = (day: number, minutes?: number | null) => F.msAt(day, minutes ?? 9 * 60)
  for (const t of r.list('task')) if (t.reminder && !t.done && t.dueDate != null) fireOnce(`task_${t.id}_${t.dueDate}_${t.dueTime}`, at(t.dueDate, t.dueTime), t.title, t.notes || 'Task due', now)
  for (const e of r.list('event')) if (e.reminder && !e.done) fireOnce(`event_${e.id}_${e.date}_${e.time}`, at(e.date, e.time), e.title, e.note || 'Calendar event', now)
  for (const x of r.list('rental')) {
    if (x.status !== 'active' || !x.reminder || x.expiryDate == null) continue
    const what = x.name || String(x.kind).toUpperCase()
    if (x.remindDays > 0) fireOnce(`rental_${x.id}_${x.expiryDate}_before`, at(x.expiryDate - x.remindDays), `${what} expires in ${x.remindDays} days`, 'Renew it before it runs out.', now)
    fireOnce(`rental_${x.id}_${x.expiryDate}_day`, at(x.expiryDate, x.expiryTime != null ? Math.max(0, x.expiryTime - 60) : null), `${what} expires today`, 'Renew it or it will stop.', now)
  }
  for (const i of r.list('invoice')) {
    const paid = (i.payments ?? []).reduce((a: number, p: Json) => a + p.amount, 0)
    if (i.status === 'draft' || i.status === 'cancelled' || i.dueDate == null || paid + 0.0001 >= (i.total ?? 0)) continue
    fireOnce(`invoice_${i.id}_${i.dueDate}`, at(i.dueDate), `Invoice ${i.number} is due today`, i.clientName ? `Check if ${i.clientName} has paid.` : 'Check if it has been paid.', now)
  }
  const running = r.list('time').find(t => t.end == null)
  if (running && now - running.start >= 4 * 3600_000) {
    const step = Math.floor((now - running.start - 4 * 3600_000) / (2 * 3600_000))
    fireOnce(`timer_${running.id}_${step}`, now, 'Still working?', `The timer has been running for ${F.duration(now - running.start)}.`, now)
  }
}

interface Uptime { up: boolean; at: number; ms: number; error: string; since: number }
let uptime: Record<string, Uptime> = ls.get('uptime', {})

async function probe(target: string): Promise<Uptime> {
  const t = target.trim()
  const start = Date.now()
  try {
    if (/^https?:\/\//i.test(t)) {
      const res = await httpFetch(t, { method: 'GET', headers: { 'User-Agent': 'CarrotNote-Uptime' }, connectTimeout: 10_000 } as RequestInit)
      const ms = Date.now() - start
      return res.status < 500 ? { up: true, at: Date.now(), ms, error: '', since: 0 } : { up: false, at: Date.now(), ms, error: `Server error ${res.status}`, since: 0 }
    }
    const m = /^(.*?)(?::(\d+))?$/.exec(t)!
    const ms = await invoke<number>('tcp_probe', { host: m[1].replace(/^\[|\]$/g, ''), port: Number(m[2] ?? 22) })
    return { up: true, at: Date.now(), ms, error: '', since: 0 }
  } catch (e) {
    return { up: false, at: Date.now(), ms: Date.now() - start, error: String((e as Error)?.message ?? e).slice(0, 120), since: 0 }
  }
}

async function checkRental(x: Json): Promise<Uptime> {
  const old = uptime[x.id]
  const r0 = await probe(x.monitorUrl)
  const r = { ...r0, since: old && old.up === r0.up ? old.since : r0.at }
  uptime = { ...uptime, [x.id]: r }
  ls.set('uptime', uptime)
  if (old && old.up !== r.up) {
    const name = x.name || x.monitorUrl
    notify(r.up ? `${name} is back online` : `${name} is down`, r.up ? 'It answered again.' : `It isn't answering: ${r.error || 'no response'}`)
  }
  return r
}

async function checkAllUptime() {
  if (!repo) return
  for (const x of repo.list('rental')) if (x.monitor && x.status === 'active' && x.monitorUrl?.trim()) await checkRental(x)
}

setInterval(checkReminders, 30_000)
setInterval(checkAllUptime, 15 * 60_000)

// ---------------------------------------------------------------- files and pictures

/** Lets the user pick an image file; resolves to the File or null. */
function pickImageFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) resolve(null) }, 800), { once: true })
    input.click()
  })
}

async function imageToJpeg(file: Blob, maxSide: number, square: boolean, quality: number): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
    if (square) { const side = Math.min(sw, sh); sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side }
    const scale = Math.min(1, maxSide / Math.max(sw, sh))
    const c = document.createElement('canvas')
    c.width = Math.round(sw * scale); c.height = Math.round(sh * scale)
    c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function saveText(defaultName: string, contents: string, ext: string) {
  if (!inTauri) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([contents]))
    a.download = defaultName
    a.click()
    return
  }
  const path = await saveFile({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
  if (!path) return
  await writeTextFile(path, contents)
  toast('Saved')
}

const csv = (s: unknown) => { const v = String(s ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }

async function uploadAvatar(dataUrl: string) {
  const res = await api<{ user: User }>('PUT', '/api/profile/avatar', { image: dataUrl.replace(/^data:image\/jpeg;base64,/, '') })
  session.user = res.user
  saveSession()
  avatarCache.clear()
  emitState()
}
const avatarCache = new Map<string, string | null>()

const isNewer = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

async function checkUpdate(manual: boolean): Promise<string | null> {
  const r = await httpFetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CarrotNote-Desktop' } })
  if (!r.ok) { if (manual) throw new Error("Couldn't check for updates"); return null }
  const j = await r.json()
  const version = String(j.tag_name ?? '').replace(/^v/, '')
  if (!version || !isNewer(version, VERSION)) { if (manual) release = null; emitState(); return null }
  const asset = (j.assets ?? []).find((a: Json) => /windows.*\.exe$|\.msi$/i.test(a.name)) ?? null
  release = { version, notes: String(j.body ?? ''), size: asset?.size ?? 0, url: asset?.browser_download_url ?? j.html_url }
  emitState()
  return version
}

const open = (url: string) => (inTauri ? openUrl(url) : Promise.resolve(window.open(url, '_blank'))).then(() => true)

// ---------------------------------------------------------------- methods

const handlers: Record<string, (a: Json) => unknown> = {
  // data
  'data.save': async a => { await need().save(a.type, a.item); return true },
  'data.delete': async a => { await need().delete(a.type, a.id); return true },

  // account
  'auth.login': async a => signedIn(await api('POST', '/api/login', { login: a.login, password: a.password }, false)),
  'auth.register': async a => signedIn(await api('POST', '/api/register', { username: a.username, name: a.name, email: a.email, password: a.password }, false)),
  'auth.usernameAvailable': a => api('GET', '/api/username/' + encodeURIComponent(a.username), undefined, false),
  'auth.hasUnsynced': () => (repo?.dirty().length ?? 0) > 0,
  'auth.signOut': async () => { await syncNow().catch(() => {}); api('POST', '/api/logout', {}).catch(() => {}); forceSignOut(); return true },
  'auth.changePassword': async a => { await api('POST', '/api/password', { oldPassword: a.old, newPassword: a.new }); return true },
  'auth.deleteAccount': async a => { await api('POST', '/api/account/delete', { password: a.password }); forceSignOut(); return true },

  // profile
  'profile.update': async a => {
    const body: Json = {}
    for (const k of ['name', 'username', 'bio', 'github']) if (a[k] != null) body[k] = a[k]
    const r = await api<{ user: User }>('POST', '/api/profile', body)
    session.user = r.user; saveSession(); emitState(); return true
  },
  'profile.pickPhoto': async () => {
    const f = await pickImageFile()
    if (!f) return false
    await uploadAvatar(await imageToJpeg(f, 512, true, 0.85)); return true
  },
  'profile.deletePhoto': async () => { const r = await api<{ user: User }>('DELETE', '/api/profile/avatar'); session.user = r.user; saveSession(); avatarCache.clear(); emitState(); return true },
  'profile.githubPhoto': async a => {
    const p = await handlers['github.profile'](a) as Json
    if (!p?.avatarUrl) throw new Error('GitHub profile not found')
    const res = await httpFetch(p.avatarUrl)
    await uploadAvatar(await imageToJpeg(await res.blob(), 512, true, 0.85)); return true
  },
  'github.profile': async a => {
    const r = await httpFetch(`https://api.github.com/users/${encodeURIComponent(a.login)}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CarrotNote-Desktop' } })
    if (!r.ok) return null
    const j = await r.json()
    return { login: j.login, name: j.name ?? '', bio: j.bio ?? '', avatarUrl: j.avatar_url ?? '', publicRepos: j.public_repos ?? 0, followers: j.followers ?? 0, htmlUrl: j.html_url ?? '' }
  },
  'avatar': async a => {
    const k = `${a.userId}:${a.rev}`
    if (avatarCache.has(k)) return avatarCache.get(k)
    try {
      const r = await httpFetch(`${API}/api/users/${encodeURIComponent(a.userId)}/avatar`, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} })
      if (!r.ok) { avatarCache.set(k, null); return null }
      const bytes = new Uint8Array(await r.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const url = 'data:image/jpeg;base64,' + btoa(s)
      avatarCache.set(k, url)
      return url
    } catch { return null }
  },

  // settings and lock
  'settings.set': a => {
    if (a.currency) settings.currency = a.currency
    if (a.theme != null) settings.theme = a.theme
    if (a.autoUpdate != null) settings.autoUpdate = a.autoUpdate
    saveSettings(); emitState(); return true
  },
  'lock.verify': async a => {
    if (cooldown() > 0 || !pin.hash || !pin.salt) return { ok: false, cooldown: cooldown() }
    const ok = (await hashPin(a.pin, pin.salt)) === pin.hash
    if (ok) { pin.fails = 0; locked = false; emitState() } else { pin.fails++; if (pin.fails >= 5) { pin.until = Date.now() + 30_000 * Math.min(10, pin.fails - 4) } }
    savePin()
    return { ok, cooldown: cooldown() }
  },
  'lock.cooldown': () => cooldown(),
  'lock.biometric': () => false,
  'lock.setPin': async a => {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
    pin.salt = salt; pin.hash = await hashPin(a.pin, salt); pin.length = String(a.pin).length; pin.fails = 0
    savePin(); emitState(); return true
  },
  'lock.disable': () => { pin.hash = undefined; pin.salt = undefined; locked = false; savePin(); emitState(); return true },
  'lock.setBiometric': () => false,
  'lock.setDelay': a => { pin.delay = a.seconds; savePin(); emitState(); return true },
  'lock.setSecure': () => true,
  'lock.now': () => { if (pin.hash) { locked = true; emitState() } return true },

  // sync, team, invitations
  'sync.now': () => syncNow(),
  'ui.zoom': async a => (a.value ? { setting: a.value, value: await applyZoom(String(a.value)) } : { setting: zoomSetting(), auto: autoZoom() }),
  'team.search': async a => (await api<Json>('GET', '/api/users/search?q=' + encodeURIComponent(a.query))).users ?? [],
  'team.invite': async a => { await syncNow(); await api('POST', `/api/projects/${encodeURIComponent(a.projectId)}/invite`, { username: a.username }); await syncNow(); return true },
  'team.remove': async a => { await api('POST', `/api/spaces/${encodeURIComponent(a.spaceId)}/remove`, { userId: a.userId }); await syncNow(); return true },
  'team.leave': async a => { await api('POST', `/api/spaces/${encodeURIComponent(a.spaceId)}/leave`, {}); await syncNow(); return true },
  'invites.list': async () => { const l = (await api<Json>('GET', '/api/invites')).invites ?? []; invites = l.length; emitState(); return l },
  'invites.answer': async a => { await api('POST', `/api/invites/${encodeURIComponent(a.id)}/${a.accept ? 'accept' : 'decline'}`, {}); await syncNow(); return true },

  // timer
  'timer.start': async a => {
    const r = need()
    const now = Date.now()
    for (const t of r.list('time')) if (t.end == null) await r.save('time', { ...t, end: now })
    await r.save('time', { id: crypto.randomUUID(), projectId: a.projectId ?? null, start: now, end: null, note: a.note ?? '', createdAt: now })
    return true
  },
  'timer.stop': async () => { const r = need(); const now = Date.now(); for (const t of r.list('time')) if (t.end == null) await r.save('time', { ...t, end: now }); return true },

  // documents and files
  'pdf.share': a => { printPdf(a.doc as PdfDoc); return true },
  'invoice.share': () => { toast('Create an invoice from the project to print it'); return true },
  'money.exportCsv': async () => {
    const r = need()
    const lines = ['Date,Type,Amount,Currency,Category,Method,Note,Project,Customer']
    for (const t of r.list('txn').sort((a, b) => a.date - b.date)) {
      lines.push([F.isoDate(t.date), t.kind, t.amount, csv(t.currency), csv(t.category), csv(t.method), csv(t.note), csv(r.get('project', t.projectId)?.name), csv(r.get('customer', t.customerId)?.name)].join(','))
    }
    await saveText(`carrot-note-transactions-${F.isoDate(F.today())}.csv`, lines.join('\n') + '\n', 'csv'); return true
  },
  'backup.export': async () => {
    const r = need()
    const data = Object.fromEntries(TYPES.map(t => [t, r.list(t)]))
    await saveText(`carrot-note-backup-${F.isoDate(F.today())}.json`, JSON.stringify({ app: 'Carrot Note', version: VERSION, exportedAt: Date.now(), data }), 'json'); return true
  },
  'backup.import': async () => {
    const r = need()
    let text: string | null = null
    if (inTauri) {
      const path = await openFile({ multiple: false, filters: [{ name: 'Backup', extensions: ['json'] }] })
      if (!path) return null
      text = await readTextFile(path as string)
    }
    if (text == null) return null
    let root: Json
    try { root = JSON.parse(text) } catch { throw new Error("That isn't a Carrot Note backup") }
    if (!root?.data || typeof root.data !== 'object') throw new Error("That isn't a Carrot Note backup")
    const counts: Record<string, number> = {}
    for (const [type, items] of Object.entries(root.data as Record<string, Json[]>)) {
      if (!TYPES.includes(type) || !Array.isArray(items)) continue
      for (const item of items) if (item?.id) { await r.save(type, item); counts[type] = (counts[type] ?? 0) + 1 }
    }
    return counts
  },
  'receipt.capture': async () => { const f = await pickImageFile(); return f ? imageToJpeg(f, 1400, false, 0.72) : null },
  'receipt.get': a => repo?.get('receipt', a.id) ?? null,

  // client links
  'api.request': a => {
    if (!['/api/share', '/api/share/revoke', '/api/follow', '/api/unfollow', '/api/follows', '/api/person'].includes(a.path)) throw new Error('Not allowed')
    return api('POST', a.path, a.body ?? {})
  },

  // chat (kept on this computer; see chat.ts)
  'chat.convos': () => Chat.convos(),
  'chat.messages': a => Chat.messages(a.convo),
  'chat.open': async a => { await Chat.openConvo(a.convo, a.title ?? '', a.people ?? []); return true },
  'chat.send': a => Chat.send(a.convo, a.title ?? '', a.people ?? [], a.text ?? '', a.voice ?? null, Number(a.dur) || 0, a.mentions ?? []),
  'chat.retry': async a => { await Chat.retry(a.convo, a.id); return true },
  'chat.read': async a => { await Chat.markRead(a.convo); return true },
  'chat.viewing': a => { Chat.setViewing(a.convo || null); return true },
  'chat.delete': async a => { await Chat.deleteMessage(a.id); return true },
  'chat.clear': async a => { await Chat.clear(a.convo); return true },
  'chat.voice': a => Chat.voiceData(a.id),
  'chat.poll': async () => { await Chat.flush(); await Chat.fetchInbox(); return true },
  'voice.start': async () => { await Chat.startRecording(); return true },
  'voice.stop': () => Chat.stopRecording(),
  'voice.cancel': () => { Chat.cancelRecording(); return true },
  // WhatsApp Web inside the app (see whatsapp.ts)
  'whatsapp.show': a => WhatsApp.show(a).then(() => true),
  'whatsapp.hide': () => WhatsApp.hide().then(() => true),
  'whatsapp.reload': a => WhatsApp.reload(a).then(() => true),
  'whatsapp.window': () => WhatsApp.openWindow().then(() => true),
  'speech.listen': () => { throw new Error("Voice typing isn't available on the PC. Type it instead.") },
  'barcode.scan': () => { throw new Error('On the PC, scan with a USB barcode scanner or type the code.') },

  // uptime
  'uptime.status': () => uptime,
  'uptime.check': async a => { const x = need().get('rental', a.id); if (!x) throw new Error('Rental not found'); return checkRental(x) },
  'uptime.probe': a => probe(a.target),

  // vault: no fingerprint on the desktop, the password is always typed
  'vault.hasKey': () => false,
  'vault.saveKey': () => true,
  'vault.clearKey': () => true,
  'vault.loadKey': () => null,

  // web APIs
  'net.get': async a => {
    const url = String(a.url)
    if (!ALLOWED.some(h => url.startsWith(h))) throw new Error('That address is not allowed')
    let res: Response
    try { res = await httpFetch(url, { headers: { Accept: 'application/json', 'User-Agent': `CarrotNote/${VERSION}` } }) } catch { throw new Error("Can't reach the internet. Check your connection.") }
    if (res.status === 404) throw new Error('Not found')
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`The service answered ${res.status}. Try again later.`)
    return res.json()
  },
  'contacts.birthdays': () => null,
  'contacts.all': () => [],

  // system
  'notifications.request': async () => { try { return (await isPermissionGranted()) || (await requestPermission()) === 'granted' } catch { return false } },
  'notifications.granted': async () => { try { return await isPermissionGranted() } catch { return false } },
  'app.started': async () => {
    if (!started) {
      started = true
      handlers['notifications.request']({})
      if (settings.autoUpdate) checkUpdate(false).catch(() => {})
      checkReminders()
      checkAllUptime()
    }
    return true
  },
  'app.openUrl': a => open(/^[a-z]+:/i.test(a.url) ? a.url : 'https://' + a.url),
  'app.dial': a => open('tel:' + encodeURIComponent(a.phone)),
  'app.whatsapp': a => open(`https://wa.me/${String(a.phone ?? '').replace(/\D/g, '')}${a.text ? '?text=' + encodeURIComponent(a.text) : ''}`),
  'app.email': a => open('mailto:' + a.to),
  'app.share': async a => { await navigator.clipboard.writeText(a.text); toast('Copied. Paste it anywhere to share.'); return true },
  'app.copy': async a => { await navigator.clipboard.writeText(a.text); toast(a.toast ?? 'Copied'); return true },
  'app.toast': a => { toast(a.text); return true },
  'app.systemBars': () => true,
  'app.exit': () => true,

  // updates
  'update.check': a => checkUpdate(a.manual ?? true),
  'update.download': async () => { if (!release) throw new Error('No update to download'); await open(release.url); release = null; emitState(); return true },
  'update.install': async () => { if (release) await open(release.url); return true },
  'update.later': () => { release = null; emitState(); return true },
}

function need(): Repo {
  if (!repo) throw new Error('Not signed in')
  return repo
}

async function signedIn(auth: { token: string; user: User }) {
  session = { token: auth.token, user: auth.user }
  saveSession()
  locked = false
  await openRepo(auth.user)
  return true
}

/** The object the page talks to, like `window.CarrotNative` on the phone. */
export function createDesktopNative() {
  return {
    call(id: string, method: string, args: string) {
      const h = handlers[method]
      Promise.resolve()
        .then(() => {
          if (!h) throw new Error('Not available on the desktop app')
          return h(JSON.parse(args || '{}'))
        })
        .then(v => window.__native.reply(id, true, v === undefined ? true : v))
        .catch(e => window.__native.reply(id, false, (e as Error)?.message ?? String(e)))
    },
    ready() {
      emit('insets', { top: 8, bottom: 8, keyboard: 0 })
      if (session.token && session.user) openRepo(session.user).catch(() => emitState())
      else emitState()
    },
  }
}
