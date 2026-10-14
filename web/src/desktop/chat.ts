// Chats on the PC: kept in this computer's own database only, like on the phone. The server just
// passes messages along and deletes them once they're delivered. "Save to notes" is how a message
// becomes synced data.

type Json = any

export interface ChatPerson { id: string; name: string; username: string; avatarRev: number }
export interface ChatMsg {
  id: string; convo: string; from: ChatPerson; text: string; voice: boolean; dur: number
  mentions: string[]; at: number; mine: boolean; status: 'sending' | 'sent' | 'failed'
}
export interface ChatConvo { id: string; title: string; last: string; lastAt: number; unread: number; mentioned: number; people: ChatPerson[] }

interface Deps {
  api: (method: string, path: string, body?: unknown) => Promise<Json>
  me: () => ChatPerson | null
  projectName: (id: string) => string | undefined
  notify: (title: string, body: string) => void
  changed: (convo: string) => void
}

let deps: Deps
let db: IDBDatabase | null = null
let dbUser = ''
/** The chat open on screen right now: no notifications for it, and it stays read. */
export let viewing: string | null = null

export function initChat(d: Deps) { deps = d }

async function open(): Promise<IDBDatabase | null> {
  const me = deps.me()
  if (!me) return null
  if (db && dbUser === me.id) return db
  db?.close()
  dbUser = me.id
  db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('carrot-chat-' + me.id.replace(/[^A-Za-z0-9]/g, ''), 1)
    req.onupgradeneeded = () => {
      const d = req.result
      d.createObjectStore('convos', { keyPath: 'id' })
      d.createObjectStore('msgs', { keyPath: 'id' }).createIndex('convo', 'convo')
      d.createObjectStore('voice')
      d.createObjectStore('outbox', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}

function tx<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(d => new Promise<T | undefined>((resolve, reject) => {
    if (!d) { resolve(undefined); return }
    const t = d.transaction(stores, mode)
    const req = run(t)
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
  }))
}

const getAll = <T>(store: string) => tx<T[]>([store], 'readonly', t => t.objectStore(store).getAll() as IDBRequest<T[]>).then(r => r ?? [])
const get = <T>(store: string, key: string) => tx<T>([store], 'readonly', t => t.objectStore(store).get(key) as IDBRequest<T>)
const put = (store: string, value: unknown, key?: string) => tx([store], 'readwrite', t => { t.objectStore(store).put(value, key) })
const del = (store: string, key: string) => tx([store], 'readwrite', t => { t.objectStore(store).delete(key) })

export async function convos(): Promise<ChatConvo[]> {
  return (await getAll<ChatConvo>('convos')).sort((a, b) => b.lastAt - a.lastAt)
}

export async function messages(convo: string): Promise<ChatMsg[]> {
  const list = (await tx<ChatMsg[]>(['msgs'], 'readonly', t => t.objectStore('msgs').index('convo').getAll(convo) as IDBRequest<ChatMsg[]>)) ?? []
  return list.sort((a, b) => a.at - b.at).slice(-500)
}

async function saveMessage(m: ChatMsg, title: string, people: ChatPerson[], unread: boolean, mentioned: boolean) {
  const old = await get<ChatMsg>('msgs', m.id)
  if (old && !m.mine) return false
  await put('msgs', m)
  const c = await get<ChatConvo>('convos', m.convo)
  await put('convos', {
    id: m.convo,
    title: title || c?.title || '',
    last: m.text || (m.voice ? '🎤 Voice message' : ''),
    lastAt: Math.max(m.at, c?.lastAt ?? 0),
    unread: (c?.unread ?? 0) + (unread ? 1 : 0),
    mentioned: (c?.mentioned ?? 0) + (mentioned ? 1 : 0),
    people: [...(c?.people ?? []), ...people].filter((p, i, a) => a.findIndex(q => q.id === p.id) === i),
  } satisfies ChatConvo)
  return true
}

export async function openConvo(convo: string, title: string, people: ChatPerson[]) {
  const c = await get<ChatConvo>('convos', convo)
  if (c) { if (title) await put('convos', { ...c, title, people: [...c.people, ...people].filter((p, i, a) => a.findIndex(q => q.id === p.id) === i) }) }
  else await put('convos', { id: convo, title, last: '', lastAt: Date.now(), unread: 0, mentioned: 0, people } satisfies ChatConvo)
}

export async function markRead(convo: string) {
  const c = await get<ChatConvo>('convos', convo)
  if (c && (c.unread || c.mentioned)) await put('convos', { ...c, unread: 0, mentioned: 0 })
}

export function setViewing(convo: string | null) {
  viewing = convo
  if (convo) markRead(convo)
}

export async function deleteMessage(id: string) {
  await del('msgs', id)
  await del('voice', id)
}

export async function clear(convo: string) {
  for (const m of await messages(convo)) await deleteMessage(m.id)
  await del('convos', convo)
}

export const voiceData = (id: string) => get<string>('voice', id).then(v => v ?? null)

const newId = () => 'c' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('')

export async function send(convo: string, title: string, people: ChatPerson[], text: string, voice: string | null, dur: number, mentions: string[]): Promise<ChatMsg> {
  const me = deps.me()
  if (!me) throw new Error('You are signed out')
  const m: ChatMsg = { id: newId(), convo, from: me, text: text.slice(0, 4000), voice: !!voice, dur, mentions, at: Date.now(), mine: true, status: 'sending' }
  if (voice) await put('voice', voice, m.id)
  await saveMessage(m, title, people, false, false)
  await put('outbox', { id: m.id, convo })
  flush()
  return m
}

export async function retry(convo: string, id: string) {
  const m = await get<ChatMsg>('msgs', id)
  if (!m) return
  await put('msgs', { ...m, status: 'sending' })
  await put('outbox', { id, convo })
  deps.changed(convo)
  flush()
}

let flushing: Promise<void> | null = null
export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    for (const o of await getAll<{ id: string; convo: string }>('outbox')) {
      const m = await get<ChatMsg>('msgs', o.id)
      let keep = false
      if (m) {
        try {
          const voice = m.voice ? await voiceData(m.id) : null
          await deps.api('POST', '/api/chat/send', { convo: o.convo, msg: { id: m.id, text: m.text, dur: m.dur, at: m.at, mentions: m.mentions, ...(voice ? { voice } : {}) } })
          await put('msgs', { ...m, status: 'sent' })
        } catch (e) {
          // No connection or a busy server: try later. Anything else won't work on retry.
          const status = (e as { status?: number }).status ?? 0
          if (status === 0 || status === 429 || status >= 500) keep = true
          else await put('msgs', { ...m, status: 'failed' })
        }
        deps.changed(o.convo)
      }
      if (!keep) await del('outbox', o.id)
    }
  })().finally(() => { flushing = null })
  return flushing
}

let fetching: Promise<void> | null = null
/** Downloads waiting messages, keeps them here, tells the server it has them, and notifies. */
export function fetchInbox(): Promise<void> {
  if (fetching) return fetching
  fetching = (async () => {
    const me = deps.me()
    if (!me) return
    let ack: string[] = []
    const fresh: ChatMsg[] = []
    for (let round = 0; round < 20; round++) {
      let resp: Json
      try { resp = await deps.api('POST', '/api/chat/inbox', { ack }) } catch { break }
      const list: Json[] = resp?.messages ?? []
      for (const o of list) {
        if (!o?.id || !o?.convo || !o?.from) continue
        const m: ChatMsg = {
          id: o.id, convo: o.convo, from: { id: o.from.id, name: o.from.name ?? '', username: o.from.username ?? '', avatarRev: o.from.avatarRev ?? 0 },
          text: o.text ?? '', voice: !!o.voice, dur: Number(o.dur) || 0, mentions: Array.isArray(o.mentions) ? o.mentions : [],
          at: Number(o.at) || Date.now(), mine: false, status: 'sent',
        }
        if (o.voice) await put('voice', o.voice, m.id)
        const reading = viewing === m.convo
        const title = m.convo.startsWith('p_') ? deps.projectName(m.convo.slice(2)) ?? 'Project' : m.from.name || m.from.username
        if (await saveMessage(m, title, [m.from], !reading, !reading && m.mentions.includes(me.id))) fresh.push(m)
      }
      ack = list.map(o => o.id).filter(Boolean)
      if (!resp?.more) {
        if (ack.length) { try { await deps.api('POST', '/api/chat/inbox', { ack }) } catch { /* next time */ } }
        break
      }
    }
    if (!fresh.length) return
    const byConvo = new Map<string, ChatMsg[]>()
    for (const m of fresh) byConvo.set(m.convo, [...(byConvo.get(m.convo) ?? []), m])
    for (const [convo, list] of byConvo) {
      deps.changed(convo)
      if (convo === viewing) continue
      // Direct messages always notify; in a project chat only an @mention does.
      const shown = convo.startsWith('p_') ? list.filter(m => m.mentions.includes(me.id)) : list
      const last = shown[shown.length - 1]
      if (!last) continue
      const title = convo.startsWith('p_') ? `${last.from.name} · ${deps.projectName(convo.slice(2)) ?? 'Project'}` : last.from.name || last.from.username
      const ar = document.documentElement.dir === 'rtl'
      deps.notify(title, last.text || (ar ? '🎤 رسالة صوتية' : '🎤 Voice message'))
    }
  })().finally(() => { fetching = null })
  return fetching
}

// ---------------------------------------------------------------- voice recording (microphone)

let recorder: MediaRecorder | null = null
let chunks: Blob[] = []
let startedAt = 0
let stream: MediaStream | null = null

export async function startRecording() {
  cancelRecording()
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    throw new Error("Can't use the microphone. Allow it for Carrot Note in Windows settings.")
  }
  const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) ?? ''
  recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 })
  chunks = []
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  recorder.start()
  startedAt = Date.now()
  // Two minutes at most, like on the phone.
  const r = recorder
  setTimeout(() => { if (recorder === r && r.state === 'recording') r.stop() }, 120_000)
}

export function stopRecording(): Promise<{ data: string; dur: number } | null> {
  const r = recorder
  if (!r) return Promise.resolve(null)
  const dur = Math.min(120, (Date.now() - startedAt) / 1000)
  recorder = null
  return new Promise(resolve => {
    const finish = () => {
      stream?.getTracks().forEach(t => t.stop())
      stream = null
      if (dur < 0.6 || !chunks.length) { resolve(null); return }
      const blob = new Blob(chunks, { type: (r.mimeType || 'audio/webm').split(';')[0] })
      const reader = new FileReader()
      reader.onload = () => resolve({ data: String(reader.result).replace(/^data:audio\/([a-z0-9]+);codecs=[^;,]+/, 'data:audio/$1'), dur })
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    }
    if (r.state === 'inactive') finish()
    else { r.onstop = finish; r.stop() }
  })
}

export function cancelRecording() {
  const r = recorder
  recorder = null
  if (r && r.state !== 'inactive') { r.onstop = null; r.stop() }
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  chunks = []
}
