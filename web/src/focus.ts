// Focus sessions (Pomodoro): 25 minutes of tracked work, then a short break.

import { useEffect, useState } from 'preact/hooks'
import { call } from './bridge'
import { getState, haptic, save } from './store'
import { toast } from './ui'

export const WORK_MS = 25 * 60_000
const BREAK_MS = 5 * 60_000
const LONG_BREAK_MS = 15 * 60_000

export interface FocusState {
  phase: 'work' | 'break' | 'ready'
  endsAt: number
  /** Rounds finished so far. */
  done: number
  projectId: string | null
}

let state: FocusState | null = read()
const subs = new Set<() => void>()
let ticker = 0

function read(): FocusState | null {
  try { return JSON.parse(localStorage.getItem('carrot.focus') ?? 'null') } catch { return null }
}
function set(next: FocusState | null) {
  state = next
  try { localStorage.setItem('carrot.focus', JSON.stringify(next)) } catch { /* blocked */ }
  subs.forEach(f => f())
  if (next && !ticker) ticker = window.setInterval(tick, 1000)
  if (!next && ticker) { clearInterval(ticker); ticker = 0 }
}

export const getFocus = () => state

export function useFocus() {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN(n => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return state
}

export async function startFocus(projectId: string | null) {
  set({ phase: 'work', endsAt: Date.now() + WORK_MS, done: state?.done ?? 0, projectId })
  await call('timer.start', { projectId, note: 'Focus session' })
}

export async function stopFocus() {
  const s = state
  set(null)
  if (s?.phase === 'work') await call('timer.stop')
}

async function finishWork(s: FocusState) {
  const done = s.done + 1
  set({ ...s, phase: 'break', done, endsAt: Date.now() + (done % 4 === 0 ? LONG_BREAK_MS : BREAK_MS) })
  haptic([180, 120, 180])
  toast(done % 4 === 0 ? `Round ${done} done. Take a long 15 minute break.` : `Round ${done} done. Take a 5 minute break.`)
  await call('timer.stop').catch(() => {})
  // The phone may have been asleep past the end: keep only the 25 minutes.
  const entry = getState().data.time.find(t => t.end != null && t.start < s.endsAt && t.end > s.endsAt + 5000)
  if (entry) save('time', { ...entry, end: s.endsAt }).catch(() => {})
}

function tick() {
  const s = state
  if (!s || s.phase === 'ready' || Date.now() < s.endsAt) return
  if (s.phase === 'work') finishWork(s)
  else {
    set({ ...s, phase: 'ready' })
    haptic([120, 80, 120])
    toast('Break is over. Ready for the next round?')
  }
}

if (state) ticker = window.setInterval(tick, 1000)

/** Forgets the session without touching the timer (used when the timer was stopped elsewhere). */
export const dropFocus = () => set(null)
