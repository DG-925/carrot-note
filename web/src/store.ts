// App-wide state fed by the native side, plus a tiny hook to re-render on changes.

import { useEffect, useState } from 'preact/hooks'
import { call, on } from './bridge'
import * as F from './format'
import { newId, type CalEvent, type NativeState, type SpaceInfo, type TableName, type TaskItem, type Tables } from './types'
import { toast } from './ui'
import { currentLang, type Lang } from './i18n'

/** Choices kept on this phone only. */
export interface Prefs {
  /** Blur amounts on screen. */
  privacy: boolean
  /** Countries whose public holidays show in the calendar; null until the user picks (then the phone's region is used). */
  holidays: string[] | null
  /** Show phone contacts' birthdays in the calendar. */
  birthdays: boolean
  /** Interface language. */
  lang: Lang
}

export interface AppState extends NativeState {
  loaded: boolean
  data: Tables
  spaces: SpaceInfo[]
  insets: { top: number; bottom: number; keyboard: number }
  prefs: Prefs
}

function loadPrefs(): Prefs {
  const base: Prefs = { privacy: false, holidays: null, birthdays: false, lang: currentLang() }
  try { return { ...base, ...JSON.parse(localStorage.getItem('carrot.prefs') ?? '{}') } } catch { return base }
}

const emptyTables = (): Tables => ({
  project: [], task: [], note: [], txn: [], goal: [], customer: [], debt: [], event: [], time: [], budget: [], rental: [], invoice: [], recurring: [], secret: [], vault: [], item: [],
  quote: [], wallet: [], transfer: [], supplier: [], price: [], doc: [], activity: [], target: [], msgtpl: [], setting: [],
})

let state: AppState = {
  loaded: false,
  signedIn: false,
  locked: false,
  user: null,
  version: '',
  systemDark: false,
  invites: 0,
  settings: { currency: 'USD', theme: 1, autoUpdate: true },
  lock: { pinEnabled: false, pinLength: 4, biometric: false, biometricAvailable: false, delay: 30, secureScreen: false },
  sync: { syncing: false, lastSync: 0, error: null },
  release: null,
  download: { state: 'idle' },
  data: emptyTables(),
  spaces: [],
  insets: { top: 24, bottom: 16, keyboard: 0 },
  prefs: loadPrefs(),
}
document.documentElement.classList.toggle('private', state.prefs.privacy)

export function setPrefs(patch: Partial<Prefs>) {
  const prefs = { ...state.prefs, ...patch }
  try { localStorage.setItem('carrot.prefs', JSON.stringify(prefs)) } catch { /* storage blocked */ }
  document.documentElement.classList.toggle('private', prefs.privacy)
  const widgetChanged = prefs.privacy !== state.prefs.privacy || prefs.lang !== state.prefs.lang
  setState({ prefs })
  if (widgetChanged) tellWidgets()
}

/** The phone's home-screen widgets hide amounts and use the language the app does. */
function tellWidgets() {
  call('settings.set', { hideAmounts: !!state.prefs.privacy, lang: currentLang() }).catch(() => {})
}
/** Switches the interface language; the page reloads in the new language. */
export function setLanguage(lang: Lang) {
  if (lang === state.prefs.lang) return
  setPrefs({ lang })
  setTimeout(() => location.reload(), 120)
}

export const togglePrivacy = () => {
  setPrefs({ privacy: !state.prefs.privacy })
  toast(state.prefs.privacy ? 'Amounts hidden' : 'Amounts shown')
}

const subs = new Set<() => void>()
let scheduled = false

function notify() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    subs.forEach(s => s())
  })
}

export const getState = () => state
export function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch }
  notify()
}

/** Re-renders the calling component whenever app state changes. */
export function useApp(): AppState {
  const [, setTick] = useState(0)
  const seen = state
  useEffect(() => {
    const force = () => setTick(n => n + 1)
    subs.add(force)
    // State may have changed between this render and subscribing.
    if (state !== seen) force()
    return () => { subs.delete(force) }
  }, [])
  return state
}

let widgetsTold = false
on('state', (s: NativeState) => {
  if (!widgetsTold) { widgetsTold = true; setTimeout(tellWidgets, 0) }
  const wasSignedIn = state.signedIn
  setState({ ...s, loaded: true, data: s.signedIn ? state.data : emptyTables(), spaces: s.signedIn ? state.spaces : [] })
  if (wasSignedIn && !s.signedIn) setState({ data: emptyTables() })
})
on('table', (p: { type: TableName; items: any[] }) => {
  setState({ data: { ...state.data, [p.type]: p.items } })
  // The main currency is shared by all devices: follow a change made on another one.
  if (p.type === 'setting') {
    const cur = p.items.find(x => x.id === 'currency')?.value
    if (cur && cur !== state.settings?.currency) call('settings.set', { currency: cur }).catch(() => {})
  }
})

/** Changes the main currency here and on the user's other devices. */
export async function setMainCurrency(currency: string) {
  await call('settings.set', { currency })
  await save('setting', { id: 'currency', value: currency })
}
on('spaces', (spaces: SpaceInfo[]) => setState({ spaces }))
on('insets', (i: AppState['insets']) => {
  setState({ insets: i })
  const r = document.documentElement.style
  r.setProperty('--sat', `${i.top}px`)
  r.setProperty('--sab', `${i.bottom}px`)
  r.setProperty('--kb', `${i.keyboard}px`)
})

// ---- data helpers

// ---------------------------------------------------------------- activity in shared projects

const LOGGED: string[] = ['project', 'task', 'note', 'event', 'rental', 'invoice', 'quote', 'doc']
/** The last activity line written for each record, so quick edits update one line instead of adding many. */
const recentLines = new Map<string, { id: string; at: number }>()

function projectOf(type: string, item: any): string | null {
  return type === 'project' ? item?.id ?? null : item?.projectId ?? null
}

/** Writes "who did what" for records of shared projects, so teammates see it in the project's activity. */
function logActivity(type: string, item: any, before: any, action?: string) {
  if (!LOGGED.includes(type) || !item) return
  const pid = projectOf(type, item) ?? projectOf(type, before)
  if (!pid || !state.spaces.some(sp => sp.kind === 'project' && sp.projectId === pid)) return
  const me = state.user
  if (!me) return
  const what = action
    ?? (!before ? 'created'
      : type === 'task' && item.done && !before.done ? 'completed'
      : type === 'event' && item.done && !before.done ? 'completed'
      : type === 'invoice' && (item.payments?.length ?? 0) > (before.payments?.length ?? 0) ? 'paid'
      : type === 'project' && (item.splits?.length ?? 0) !== (before.splits?.length ?? 0) ? 'split'
      : 'updated')
  const title = item.title || item.name || item.number || item.clientName || ''
  const key = `${type}:${item.id}:${what}`
  const now = Date.now()
  const last = recentLines.get(key)
  const id = last && now - last.at < 120_000 ? last.id : newId()
  recentLines.set(key, { id, at: now })
  const line = { id, projectId: pid, userId: me.id, name: me.name || '@' + me.username, action: what, type, title, at: now }
  const list = state.data.activity
  setState({ data: { ...state.data, activity: [...list.filter(x => x.id !== id), line] } })
  call('data.save', { type: 'activity', item: line }).catch(() => {})
  // Keep the newest 150 lines of each project.
  const mine = list.filter(x => x.projectId === pid).sort((a, b) => b.at - a.at)
  for (const old of mine.slice(150)) call('data.delete', { type: 'activity', id: old.id }).catch(() => {})
}

export const save = <K extends TableName>(type: K, item: Tables[K][number]) => {
  // Show the change right away; the native side confirms with a fresh table.
  const list = state.data[type] as any[] | undefined
  if (type !== 'activity') logActivity(type, item, list?.find(x => x.id === (item as any).id))
  // Receipts aren't kept in the page (photos are loaded on demand), so only update known tables.
  if (list) {
    const i = list.findIndex(x => x.id === (item as any).id)
    const next = i >= 0 ? list.map(x => (x.id === (item as any).id ? item : x)) : [...list, item]
    setState({ data: { ...state.data, [type]: next } })
  }
  return call('data.save', { type, item })
}

const typeNames: Record<TableName, string> = {
  project: 'Project', task: 'Task', note: 'Note', txn: 'Transaction', goal: 'Goal', customer: 'Customer',
  debt: 'Debt', event: 'Event', time: 'Time entry', budget: 'Budget', rental: 'Rental',
  invoice: 'Invoice', recurring: 'Recurring payment', secret: 'Vault item', vault: 'Vault', item: 'Stock item', quote: 'Quote', wallet: 'Wallet', transfer: 'Transfer', supplier: 'Supplier', price: 'Price', doc: 'File', activity: 'Activity', target: 'Target', msgtpl: 'Message', setting: 'Setting',
}

/** Deletes an item and offers Undo for a few seconds. */
export const remove = (type: TableName, id: string) => {
  const list = state.data[type] as any[] | undefined
  if (!list) return call('data.delete', { type, id })
  const item = list.find(x => x.id === id)
  if (type !== 'activity') logActivity(type, item, item, 'deleted')
  setState({ data: { ...state.data, [type]: list.filter(x => x.id !== id) } })
  const done = call('data.delete', { type, id })
  if (item) toast(`${typeNames[type]} deleted`, { label: 'Undo', run: () => { save(type, item).catch(e => toast(e.message)) } })
  return done
}

/** Marks a task done or not done; a repeating task gets its next copy when it is done. */
export async function setTaskDone(task: TaskItem, done: boolean) {
  if (done) haptic()
  await save('task', { ...task, done })
  const repeat = task.repeat ?? ''
  if (done && !task.done && repeat && task.dueDate != null) {
    let next = F.nextRepeat(task.dueDate, repeat)
    while (next < F.today()) next = F.nextRepeat(next, repeat)
    await save('task', { ...task, id: newId(), done: false, dueDate: next, createdAt: Date.now() })
    toast(`Next one: ${F.relativeDay(next)}`)
  }
}

/** Ticks an event off (or back on). */
export async function setEventDone(event: CalEvent, done: boolean) {
  if (done) haptic()
  await save('event', { ...event, done })
}

/** A short buzz for taps that finish something. */
export const haptic = (ms: number | number[] = 12) => { try { navigator.vibrate?.(ms) } catch { /* not supported */ } }

export const byId = <K extends TableName>(type: K, id: string | null | undefined): Tables[K][number] | undefined =>
  id ? (state.data[type] as any[]).find(x => x.id === id) : undefined

export const isDark = (s: AppState) => (s.settings.theme === 2 ? true : s.settings.theme === 1 ? false : s.systemDark)
