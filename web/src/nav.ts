// In-app navigation: four tabs, a stack of pushed screens and overlays (editors, sheets, dialogs).

import type { ComponentChildren } from 'preact'
import { setBackHandler } from './bridge'

export type Tab = 'home' | 'money' | 'projects' | 'notes'

export type Route =
  | { name: 'project'; id: string }
  | { name: 'customer'; id: string }
  | { name: 'rental'; id: string } | { name: 'rentals' }
  | { name: 'invoices' } | { name: 'invoice'; id: string } | { name: 'report' } | { name: 'vault' } | { name: 'recurring' }
  | { name: 'stock' } | { name: 'item'; id: string }
  | { name: 'quotes' } | { name: 'quote'; id: string } | { name: 'wallets' } | { name: 'wallet'; id: string }
  | { name: 'suppliers' } | { name: 'supplier'; id: string } | { name: 'prices' } | { name: 'insights' }
  | { name: 'docs' } | { name: 'doc'; id: string } | { name: 'messages' } | { name: 'activity'; id?: string } | { name: 'targets' }
  | { name: 'calendar' } | { name: 'time' } | { name: 'customers' } | { name: 'debts' } | { name: 'goals' }
  | { name: 'chats' } | { name: 'chat'; id: string } | { name: 'people' } | { name: 'whatsapp' } | { name: 'person'; id: string }
  | { name: 'invites' } | { name: 'search' } | { name: 'profile' } | { name: 'settings' }

export interface Overlay {
  key: number
  kind: 'sheet' | 'page' | 'dialog'
  closing?: boolean
  tag?: string
  render: (close: () => void) => ComponentChildren
}

interface NavState {
  tab: Tab
  stack: Route[]
  overlays: Overlay[]
  drawer: boolean
  /** Direction of the last screen change, for the transition. */
  dir: 'tab' | 'push' | 'pop'
}

let nav: NavState = { tab: 'home', stack: [], overlays: [], drawer: false, dir: 'tab' }
const subs = new Set<() => void>()
const emit = () => subs.forEach(s => s())
let seq = 0

export const getNav = () => nav
export const onNav = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export function goTab(tab: Tab) {
  nav = { ...nav, tab, stack: [], drawer: false, dir: 'tab' }
  emit()
}

export function push(route: Route) {
  const top = nav.stack[nav.stack.length - 1]
  if (top && JSON.stringify(top) === JSON.stringify(route)) return
  nav = { ...nav, stack: [...nav.stack, route], drawer: false, dir: 'push' }
  emit()
}

export function pop() {
  nav = { ...nav, stack: nav.stack.slice(0, -1), dir: 'pop' }
  emit()
}

export function setDrawer(open: boolean) {
  nav = { ...nav, drawer: open }
  emit()
}

/** Shows an overlay; returns a function that closes it. */
export function openOverlay(kind: Overlay['kind'], render: Overlay['render'], tag?: string): () => void {
  const key = ++seq
  nav = { ...nav, overlays: [...nav.overlays, { key, kind, render, tag }] }
  emit()
  return () => closeOverlay(key)
}

export function closeOverlay(key: number) {
  const o = nav.overlays.find(x => x.key === key)
  if (!o || o.closing) return
  nav = { ...nav, overlays: nav.overlays.map(x => (x.key === key ? { ...x, closing: true } : x)) }
  emit()
  setTimeout(() => {
    nav = { ...nav, overlays: nav.overlays.filter(x => x.key !== key) }
    emit()
  }, 230)
}

export const closeAllOverlays = () => nav.overlays.forEach(o => closeOverlay(o.key))

/** Android back button: overlay, then drawer, then pushed screen, then Home. */
setBackHandler(() => {
  const open = nav.overlays.filter(o => !o.closing)
  if (open.length) { closeOverlay(open[open.length - 1].key); return true }
  if (nav.drawer) { setDrawer(false); return true }
  if (nav.stack.length) { pop(); return true }
  if (nav.tab !== 'home') { goTab('home'); return true }
  return false
})
