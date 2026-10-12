// App-wide state fed by the native side, plus a tiny hook to re-render on changes.

import { useEffect, useState } from 'preact/hooks'
import { call, on } from './bridge'
import type { NativeState, SpaceInfo, TableName, Tables } from './types'

export interface AppState extends NativeState {
  loaded: boolean
  data: Tables
  spaces: SpaceInfo[]
  insets: { top: number; bottom: number; keyboard: number }
}

const emptyTables = (): Tables => ({
  project: [], task: [], note: [], txn: [], goal: [], customer: [], debt: [], event: [], time: [], budget: [],
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
  const list = state.data[type] as any[]
  const i = list.findIndex(x => x.id === (item as any).id)
  const next = i >= 0 ? list.map(x => (x.id === (item as any).id ? item : x)) : [...list, item]
  setState({ data: { ...state.data, [type]: next } })
  return call('data.save', { type, item })
}

export const remove = (type: TableName, id: string) => {
  setState({ data: { ...state.data, [type]: (state.data[type] as any[]).filter(x => x.id !== id) } })
  return call('data.delete', { type, id })
}

export const byId = <K extends TableName>(type: K, id: string | null | undefined): Tables[K][number] | undefined =>
  id ? (state.data[type] as any[]).find(x => x.id === id) : undefined

export const isDark = (s: AppState) => (s.settings.theme === 2 ? true : s.settings.theme === 1 ? false : s.systemDark)
