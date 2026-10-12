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
  project: [], task: [], note: [], txn: [], goal: [], customer: [], debt: [], event: [], time: [], budget: [], rental: [], invoice: [], recurring: [], secret: [], vault: [],
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
  setState({ prefs })
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

on('state', (s: NativeState) => {
  const wasSignedIn = state.signedIn
  setState({ ...s, loaded: true, data: s.signedIn ? state.data : emptyTables(), spaces: s.signedIn ? state.spaces : [] })
  if (wasSignedIn && !s.signedIn) setState({ data: emptyTables() })
})
on('table', (p: { type: TableName; items: any[] }) => {
  setState({ data: { ...state.data, [p.type]: p.items } })
})
on('spaces', (spaces: SpaceInfo[]) => setState({ spaces }))
on('insets', (i: AppState['insets']) => {
  setState({ insets: i })
  const r = document.documentElement.style
  r.setProperty('--sat', `${i.top}px`)
  r.setProperty('--sab', `${i.bottom}px`)
  r.setProperty('--kb', `${i.keyboard}px`)
})

// ---- data helpers

export const save = <K extends TableName>(type: K, item: Tables[K][number]) => {
  // Show the change right away; the native side confirms with a fresh table.
  const list = state.data[type] as any[] | undefined
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
  invoice: 'Invoice', recurring: 'Recurring payment', secret: 'Vault item', vault: 'Vault',
}

/** Deletes an item and offers Undo for a few seconds. */
export const remove = (type: TableName, id: string) => {
  const list = state.data[type] as any[] | undefined
  if (!list) return call('data.delete', { type, id })
  const item = list.find(x => x.id === id)
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
