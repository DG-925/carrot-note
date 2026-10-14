// Chats with other Carrot Note users: one-to-one, and a team chat for each shared project, with
// voice messages and @mentions. Messages are kept on this device only (the server forgets them once
// delivered); hold a message and choose "Save to notes" to keep it as a synced note.

import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { call, on } from '../bridge'
import * as F from '../format'
import { currentLang } from '../i18n'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { getState, save, useApp } from '../store'
import { newId, type ChatConvo, type ChatMsg, type ChatPerson, type PublicUser } from '../types'
import { Avatar, Btn, Empty, Hint, PageHeader, Round, SearchBar, Seg, SheetTitle, attempt, confirm, cx, openSheet, toast } from '../ui'

// ---------------------------------------------------------------- the list of chats

let cache: ChatConvo[] = []
const subs = new Set<(c: ChatConvo[]) => void>()
let loading = false

/** Reloads the chat list from the device. */
export function refreshChats() {
  if (loading) return
  loading = true
  call<ChatConvo[]>('chat.convos').then(list => { cache = list ?? []; subs.forEach(f => f(cache)) }).catch(() => {}).finally(() => { loading = false })
}
on('chat', () => refreshChats())

/** All chats: what's on the device plus a team chat for every shared project. */
export function useChats(): ChatConvo[] {
  const s = useApp()
  const [list, setList] = useState(cache)
  useEffect(() => { subs.add(setList); refreshChats(); return () => { subs.delete(setList) } }, [])
  const projectChats = s.spaces.filter(sp => sp.kind === 'project' && sp.projectId).map(sp => sp.id)
  const extra = projectChats.filter(id => !list.some(c => c.id === id)).map(id => ({
    id, title: '', last: '', lastAt: 0, unread: 0, mentioned: 0, people: [],
  } satisfies ChatConvo))
  return [...list, ...extra].sort((a, b) => b.lastAt - a.lastAt)
}

/** Unread messages, for badges. */
export const unreadChats = (list: ChatConvo[]) => list.reduce((a, c) => a + c.unread, 0)

const me = () => getState().user
const dmId = (other: string) => 'dm_' + [me()?.id ?? '', other].sort().join('_')

/** The chat's name: the project for a team chat, the other person for a direct chat. */
function titleOf(c: ChatConvo | undefined, id: string): string {
  const s = getState()
  if (id.startsWith('p_')) return s.data.project.find(p => p.id === id.slice(2))?.name ?? c?.title ?? 'Project'
  const other = id.slice(3).split('_').find(x => x !== s.user?.id)
  const person = c?.people.find(p => p.id === other) ?? s.spaces.flatMap(sp => sp.members).find(m => m.id === other)
  return person?.name || person?.username || c?.title || 'Chat'
}

/** Everyone in the chat except me. */
function peopleOf(id: string, c?: ChatConvo): ChatPerson[] {
  const s = getState()
  if (id.startsWith('p_')) {
    const sp = s.spaces.find(x => x.id === id)
    return (sp?.members ?? []).filter(m => m.id !== s.user?.id).map(m => ({ id: m.id, name: m.name, username: m.username, avatarRev: m.avatarRev }))
  }
  const other = id.slice(3).split('_').find(x => x !== s.user?.id)
  const p = c?.people.find(x => x.id === other) ?? s.spaces.flatMap(sp => sp.members).find(m => m.id === other)
  return p ? [{ id: p.id, name: p.name, username: p.username, avatarRev: p.avatarRev }] : []
}

/** 75 → "1:15" */
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const clock = (ms: number) => { const d = new Date(ms); return F.time(d.getHours() * 60 + d.getMinutes()) }
const when = (ms: number) => !ms ? '' : F.dayOfMs(ms) === F.today() ? clock(ms) : F.relativeDay(F.dayOfMs(ms))

function ChatAvatar({ id, c, size = 46 }: { id: string; c?: ChatConvo; size?: number }) {
  if (id.startsWith('p_')) return <div class="badge-ico t-lilac" style={{ width: size, height: size, borderRadius: size / 3 }}><Icon name="team" size={size * 0.42} /></div>
  const p = peopleOf(id, c)[0]
  return <Avatar userId={p?.id} rev={p?.avatarRev ?? 0} name={p?.name || p?.username || '?'} size={size} />
}

export function ChatsScreen() {
  const list = useChats()
  return (
    <>
      <div class="scroll">
        <PageHeader title="Chats" onBack={popNav}>
          <Round icon="users" label="People" onClick={() => push({ name: 'people' })} />
          <Round icon="plus" label="New chat" onClick={newChat} />
        </PageHeader>
        <div class="content no-tabbar">
          {!list.length && <Empty icon="chat" title="No chats yet" text="Message other Carrot Note users, or your team in a shared project. Send voice messages and @mention people to notify them.">
            <Btn icon="plus" onClick={newChat}>New chat</Btn>
          </Empty>}
          {list.length > 0 && <div class="card flush pop" style={{ '--i': 1 } as any}>
            {list.map(c => (
              <div key={c.id} class="item chat-row" onClick={() => push({ name: 'chat', id: c.id })}>
                <ChatAvatar id={c.id} c={c} />
                <div class="main">
                  <div class="t">{titleOf(c, c.id)}</div>
                  <div class={cx('s', c.unread > 0 && 'semibold')}>{c.last || (c.id.startsWith('p_') ? 'Team chat' : 'Say hi 👋')}</div>
                </div>
                <div class="chat-meta">
                  <span class="tiny muted">{when(c.lastAt)}</span>
                  {c.mentioned > 0 ? <span class="chat-badge"><Icon name="at" size={11} stroke={2.6} /></span> : c.unread > 0 && <span class="chat-badge num">{c.unread}</span>}
                </div>
              </div>
            ))}
          </div>}
          <Hint>Chats are kept only on this device. Hold a message to save it to your notes.</Hint>
        </div>
      </div>
      <button class="add-fab low" onClick={newChat}><Icon name="chat" size={15} />New chat</button>
    </>
  )
}

// ---------------------------------------------------------------- following

export interface FollowPerson { id: string; name: string; username: string; avatarRev: number; at: number }
interface Follows { following: FollowPerson[]; followers: FollowPerson[]; loaded: boolean }

let follows: Follows = { following: [], followers: [], loaded: false }
const followSubs = new Set<(f: Follows) => void>()

export function refreshFollows() {
  call<{ following: FollowPerson[]; followers: FollowPerson[] }>('api.request', { path: '/api/follows', body: {} })
    .then(r => { follows = { following: r.following ?? [], followers: r.followers ?? [], loaded: true }; followSubs.forEach(f => f(follows)) })
    .catch(() => {})
}

export function useFollows(): Follows {
  const [f, set] = useState(follows)
  useEffect(() => { followSubs.add(set); refreshFollows(); return () => { followSubs.delete(set) } }, [])
  return f
}

/** Direct messages work when either of you follows the other, or you share a project. */
export function canMessage(id: string, f: Follows = follows) {
  return f.following.some(p => p.id === id) || f.followers.some(p => p.id === id) || getState().spaces.some(sp => sp.members.some(m => m.id === id))
}

async function setFollow(p: { id: string; username: string }, on: boolean) {
  await attempt(async () => {
    await call('api.request', { path: on ? '/api/follow' : '/api/unfollow', body: { userId: p.id } })
    toast(on ? `You follow @${p.username}` : `You unfollowed @${p.username}`)
    refreshFollows()
  })
}

export function FollowButton({ p, f }: { p: { id: string; username: string }; f: Follows }) {
  const on = f.following.some(x => x.id === p.id)
  const back = !on && f.followers.some(x => x.id === p.id)
  return <Btn sm kind={on ? 'ghost' : undefined} icon={on ? 'check' : 'userPlus'} onClick={() => setFollow(p, !on)}>{on ? 'Following' : back ? 'Follow back' : 'Follow'}</Btn>
}

function PersonLine({ p, f, onMessage }: { p: { id: string; name: string; username: string; avatarRev: number }; f: Follows; onMessage: () => void }) {
  const ok = canMessage(p.id, f)
  return (
    <div class="item person-line">
      <Avatar userId={p.id} rev={p.avatarRev} name={p.name || p.username} size={40} />
      <div class="main"><div class="t">{p.name || '@' + p.username}</div><div class="s">@{p.username}</div></div>
      <FollowButton p={p} f={f} />
      <button class={cx('round sm', !ok && 'muted')} aria-label="Message" disabled={!ok} onClick={onMessage}><Icon name="chat" size={16} /></button>
    </div>
  )
}

/** Searches people by username. */
function useUserSearch(q: string) {
  const [found, setFound] = useState<PublicUser[]>([])
  useEffect(() => {
    const term = q.trim().replace(/^@/, '')
    if (term.length < 2) { setFound([]); return }
    const t = setTimeout(() => call<PublicUser[]>('team.search', { query: term }).then(r => setFound(r ?? [])).catch(() => setFound([])), 300)
    return () => clearTimeout(t)
  }, [q])
  return found
}

let savedPeopleTab = 0
/** People you follow, people who follow you, and finding someone new. */
export function PeopleScreen() {
  const s = useApp()
  const f = useFollows()
  const [tab, setTabState] = useState(savedPeopleTab)
  const setTab = (i: number) => { savedPeopleTab = i; setTabState(i) }
  const [q, setQ] = useState('')
  const found = useUserSearch(q)
  const list = tab === 0 ? f.following : tab === 1 ? f.followers : found.map(u => ({ ...u, at: 0 }))
  return (
    <div class="scroll">
      <PageHeader title="People" onBack={popNav} />
      <div class="content no-tabbar">
        <Seg i={1} options={[{ label: `Following ${f.following.length}` }, { label: `Followers ${f.followers.length}` }, { label: 'Find' }]} value={tab} onChange={setTab} />
        {tab === 2 && <SearchBar i={2} value={q} onInput={setQ} placeholder="Search @username" autoFocus />}
        {list.length > 0 && <div class="card flush pop" style={{ '--i': 3 } as any}>
          {list.filter(p => p.id !== s.user?.id).map(p => <PersonLine key={p.id} p={p} f={f} onMessage={() => chatWith(p)} />)}
        </div>}
        {!list.length && <Empty icon={tab === 2 ? 'search' : 'users'} title={tab === 0 ? 'Not following anyone yet' : tab === 1 ? 'No followers yet' : q.trim() ? 'Nobody found' : 'Find people'}
          text={tab === 2 ? 'Type a username to find someone on Carrot Note.' : 'Follow people by their username. Once one of you follows the other, you can message each other.'}>
          {tab !== 2 && <Btn icon="search" onClick={() => setTab(2)}>Find people</Btn>}
        </Empty>}
        <Hint>You can message people you follow and people who follow you, and anyone in your shared projects.</Hint>
      </div>
    </div>
  )
}

/** Pick someone you follow, a follower or a teammate, or find anyone by username. */
export function newChat() {
  openSheet(close => <NewChatSheet close={close} />)
}

function NewChatSheet({ close }: { close: () => void }) {
  const s = useApp()
  const f = useFollows()
  const [q, setQ] = useState('')
  const found = useUserSearch(q)
  const known = [...f.following, ...f.followers, ...s.spaces.flatMap(sp => sp.members).map(m => ({ ...m, at: 0 }))]
    .filter((m, i, a) => m.id !== s.user?.id && a.findIndex(x => x.id === m.id) === i)
  const start = async (p: { id: string; name: string; username: string; avatarRev: number }) => {
    if (!canMessage(p.id, f)) { toast(`Follow @${p.username} first to message them`); return }
    close()
    setTimeout(() => chatWith(p), 120)
  }
  const shown = q.trim() ? found.map(u => ({ ...u, at: 0 })) : known
  return (
    <>
      <SheetTitle title="New chat" sub="People you follow, your followers and teammates" />
      <div class="body">
        <SearchBar value={q} onInput={setQ} placeholder="Search @username" autoFocus />
        <div class="card flush in-card">
          {shown.map(p => <PersonLine key={p.id} p={p} f={f} onMessage={() => start(p)} />)}
          {!shown.length && <div class="muted small" style={{ padding: 14 }}>{q.trim() ? 'Nobody found with that username.' : 'Follow people to message them. Search for a username above.'}</div>}
        </div>
        <button class="link" style={{ marginTop: 12 }} onClick={() => { close(); setTimeout(() => push({ name: 'people' }), 120) }}>Following and followers</button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- one chat

/** Plays one voice clip at a time. */
let playing: { audio: HTMLAudioElement; stop: () => void } | null = null

export function VoicePlayer({ load, dur, mine }: { load: () => Promise<string | null>; dur: number; mine?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [progress, setProgress] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { if (playing?.audio === audio.current) { playing.stop(); playing = null } }, [])
  const toggle = async (e: Event) => {
    e.stopPropagation()
    if (state === 'playing') { audio.current?.pause(); setState('idle'); return }
    if (playing && playing.audio !== audio.current) playing.stop()
    if (!audio.current) {
      setState('loading')
      const src = await load().catch(() => null)
      if (!src) { setState('idle'); toast('This voice message is gone'); return }
      const a = new Audio(src)
      a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0)
      a.onended = () => { setState('idle'); setProgress(0) }
      audio.current = a
    }
    const a = audio.current
    playing = { audio: a, stop: () => { a.pause(); setState('idle') } }
    a.play().then(() => setState('playing')).catch(() => { setState('idle'); toast("Can't play this voice message") })
  }
  return (
    <div class={cx('voice', mine && 'mine')} onClick={toggle}>
      <span class="voice-btn">{state === 'loading' ? <span class="spinner" /> : <Icon name={state === 'playing' ? 'stop' : 'play'} size={14} />}</span>
      <span class="voice-track"><i style={{ width: `${progress * 100}%` }} /></span>
      <span class="tiny num">{mmss(dur)}</span>
    </div>
  )
}

/** Turns "@karim" into a highlighted mention. */
function MsgText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9_.]{2,20})/gi)
  return <span class="msg-text" dir="auto">{parts.map((p, i) => (i % 2 ? <b key={i} class="mention">{p}</b> : p))}</span>
}

export function ChatScreen({ id }: { id: string }) {
  const s = useApp()
  const list = useChats()
  const c = list.find(x => x.id === id)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const [rec, setRec] = useState<number | null>(null) // when recording started
  const [tick, setTick] = useState(0)
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const group = id.startsWith('p_')
  const people = peopleOf(id, c)
  const title = titleOf(c, id)
  const myId = s.user?.id

  const load = () => call<ChatMsg[]>('chat.messages', { convo: id }).then(m => setMsgs(m ?? [])).catch(() => {})
  useEffect(() => {
    load()
    call('chat.viewing', { convo: id }).catch(() => {})
    const off = on('chat', (convo: string) => { if (convo === id) load() })
    // While the chat is open, look for new messages every few seconds.
    const poll = setInterval(() => { call('chat.poll').catch(() => {}) }, 4000)
    call('chat.poll').catch(() => {})
    return () => { off(); clearInterval(poll); call('chat.viewing', { convo: null }).catch(() => {}); call('voice.cancel').catch(() => {}); refreshChats() }
  }, [id])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])
  useEffect(() => { if (rec == null) return; const t = setInterval(() => setTick(x => x + 1), 500); return () => clearInterval(t) }, [rec])

  const mentionsIn = (t: string) => people.filter(p => p.username && new RegExp(`@${p.username.replace(/\./g, '\\.')}(?![a-z0-9_.])`, 'i').test(t)).map(p => p.id)
  const send = async (voice?: { data: string; dur: number }) => {
    const body = voice ? '' : text.trim()
    if (!voice && !body) return
    setText('')
    await attempt(() => call('chat.send', { convo: id, title, people, text: body, voice: voice?.data ?? null, dur: voice?.dur ?? 0, mentions: mentionsIn(body) }))
    load()
  }
  const startRec = async () => {
    try { await call('voice.start'); setRec(Date.now()) } catch (e) { toast(String((e as Error).message ?? e)) }
  }
  const stopRec = async (keep: boolean) => {
    setRec(null)
    if (!keep) { call('voice.cancel').catch(() => {}); return }
    const clip = await call<{ data: string; dur: number } | null>('voice.stop').catch(() => null)
    if (clip) send(clip); else toast('Too short. Tap the mic, talk, then tap send.')
  }

  // @mentions: suggest people while typing "@ka…".
  const word = /(^|\s)@([a-z0-9_.]*)$/i.exec(text)
  const suggest = group && word ? people.filter(p => p.username && p.username.toLowerCase().startsWith(word[2].toLowerCase())).slice(0, 5) : []
  const pick = (p: ChatPerson) => { setText(text.replace(/@([a-z0-9_.]*)$/i, '@' + p.username + ' ')); box.current?.focus() }

  let lastDay = -1
  let lastFrom = ''
  return (
    <div class="chat-page">
      <PageHeader title={title} onBack={popNav}>
        {group && <Round icon="project" label="Open project" onClick={() => push({ name: 'project', id: id.slice(2) })} />}
        <Round icon="trash" label="Clear chat" onClick={async () => {
          if (!(await confirm('Clear this chat?', 'Its messages are deleted from this device. Notes you saved from it stay.', 'Clear'))) return
          await call('chat.clear', { convo: id }); refreshChats(); popNav()
        }} />
      </PageHeader>
      <div class="chat-scroll">
        <div class="chat-head">
          <ChatAvatar id={id} c={c} size={56} />
          <div class="h-sm" style={{ marginTop: 8 }}>{title}</div>
          <div class="tiny muted">{group ? `${people.length + 1} people · @mention someone to notify them` : people[0]?.username ? '@' + people[0].username : ''}</div>
          <div class="tiny muted" style={{ marginTop: 4 }}>Messages stay on this device. Hold one to save it to your notes.</div>
        </div>
        {msgs.map(m => {
          const day = F.dayOfMs(m.at)
          const showDay = day !== lastDay
          const showName = group && !m.mine && (m.from.id !== lastFrom || showDay)
          lastDay = day; lastFrom = m.from.id
          return (
            <Fragment key={m.id}>
              {showDay && <div class="chat-day">{F.relativeDay(day)}</div>}
              <div class={cx('msg', m.mine && 'mine', m.mentions.includes(myId ?? '') && 'mentioned')} {...holdable(() => messageMenu(m, id, load))}>
                {showName && <div class="msg-from">{m.from.name || '@' + m.from.username}</div>}
                {m.voice ? <VoicePlayer load={() => call<string | null>('chat.voice', { id: m.id })} dur={m.dur} mine={m.mine} /> : <MsgText text={m.text} />}
                <div class="msg-time">
                  {clock(m.at)}
                  {m.mine && m.status === 'sending' && <Icon name="clock" size={11} />}
                  {m.mine && m.status === 'sent' && <Icon name="check" size={11} />}
                  {m.mine && m.status === 'failed' && <span class="bad semibold">Not sent, hold to retry</span>}
                </div>
              </div>
            </Fragment>
          )
        })}
        <div ref={end} />
      </div>
      {suggest.length > 0 && <div class="mention-bar">
        {suggest.map(p => <button key={p.id} class="chip" onClick={() => pick(p)}><Avatar userId={p.id} rev={p.avatarRev} name={p.name} size={20} />@{p.username}</button>)}
      </div>}
      <div class="composer">
        {rec != null ? <>
          <button class="round sm" aria-label="Cancel" onClick={() => stopRec(false)}><Icon name="trash" size={17} /></button>
          <div class="rec-bar"><span class="rec-dot" /><span class="num semibold" data-tick={tick}>{mmss((Date.now() - rec) / 1000)}</span><span class="muted small grow">Recording…</span></div>
          <button class="send" aria-label="Send voice message" onClick={() => stopRec(true)}><Icon name="send" size={18} /></button>
        </> : <>
          <textarea ref={box} rows={1} value={text} placeholder={group ? 'Message the team · @ to mention' : 'Message'}
            onInput={e => { const t = e.target as HTMLTextAreaElement; setText(t.value); t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && document.documentElement.classList.contains('desktop')) { e.preventDefault(); send() } }} />
          {text.trim()
            ? <button class="send" aria-label="Send" onClick={() => send()}><Icon name="send" size={18} /></button>
            : <button class="send mic" aria-label="Record a voice message" onClick={startRec}><Icon name="mic" size={19} /></button>}
        </>}
      </div>
    </div>
  )
}

/** Long-press (or right-click) handlers for a message. */
function holdable(run: () => void) {
  let timer = 0
  const cancel = () => clearTimeout(timer)
  return {
    onPointerDown: () => { cancel(); timer = window.setTimeout(() => { navigator.vibrate?.(15); run() }, 450) },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (e: Event) => { e.preventDefault(); cancel(); run() },
  }
}

function messageMenu(m: ChatMsg, convo: string, reload: () => void) {
  openSheet(close => (
    <>
      <SheetTitle title={m.voice ? 'Voice message' : 'Message'} sub={`${m.mine ? 'You' : m.from.name} · ${F.relativeDay(F.dayOfMs(m.at))} ${clock(m.at)}`} />
      <div class="body">
        <Btn block icon="note" onClick={async () => { close(); await saveToNotes(m) }}>Save to notes</Btn>
        {!m.voice && <Btn block kind="soft-bg" icon="copy" onClick={() => { call('app.copy', { text: m.text, toast: 'Copied' }); close() }}>Copy</Btn>}
        {m.mine && m.status === 'failed' && <Btn block kind="soft-bg" icon="sync" onClick={() => { call('chat.retry', { convo, id: m.id }); close() }}>Send again</Btn>}
        <Btn block kind="ghost" icon="trash" onClick={async () => { await call('chat.delete', { convo, id: m.id }); close(); reload() }}>Delete from this device</Btn>
      </div>
    </>
  ))
}

/** Keeps a chat message as a note (which syncs like any note). A voice message keeps its clip. */
async function saveToNotes(m: ChatMsg) {
  // The title is saved with the note, so it's written in the app's language.
  const ar = currentLang() === 'ar'
  const who = m.mine ? (ar ? 'أنا' : 'Me') : m.from.name || '@' + m.from.username
  const title = `${m.voice ? (ar ? 'رسالة صوتية' : 'Voice message') : (ar ? 'رسالة' : 'Message')} · ${who} · ${F.dateShort(F.dayOfMs(m.at))}`
  await attempt(async () => {
    let audioIds: string[] = []
    if (m.voice) {
      const data = await call<string | null>('chat.voice', { id: m.id })
      if (!data) throw new Error('This voice message is gone')
      const audioId = newId()
      await save('audio', { id: audioId, data, dur: m.dur, createdAt: Date.now() })
      audioIds = [audioId]
    }
    const id = newId()
    await save('note', { id, title, body: m.text, checklist: [], projectId: null, date: null, pinned: false, color: 0, createdAt: Date.now(), audioIds })
    toast('Saved to notes', { label: 'Open', run: () => import('../editors').then(e => e.editNote(getState().data.note.find(n => n.id === id))) })
  })
}

/** For a team member's card: start a direct chat with them. */
export async function chatWith(p: { id: string; name: string; username: string; avatarRev: number }) {
  const convo = dmId(p.id)
  await attempt(() => call('chat.open', { convo, title: p.name || p.username, people: [p] }))
  push({ name: 'chat', id: convo })
}

/** The chats button for page headers, with the unread count. */
export function ChatButton() {
  const n = unreadChats(useChats())
  // Phones have little room up there: only show it when something is unread (chats are in the menu too).
  if (!n && !document.documentElement.classList.contains('desktop')) return null
  return <Round icon="chat" label="Chats" badge={n || undefined} onClick={() => push({ name: 'chats' })} />
}
