// WhatsApp on the PC: WhatsApp Web in its own browser view, placed over the WhatsApp page of the
// app. It keeps its login (scan the QR code once). It's a separate website: it can't reach the
// app's data or features, and the app can't read its chats.

import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { Webview } from '@tauri-apps/api/webview'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { currentZoom } from './zoom'

const URL = 'https://web.whatsapp.com/'
const LABEL = 'whatsapp'

export interface Bounds { x: number; y: number; w: number; h: number }

let view: Webview | null = null
let creating: Promise<Webview> | null = null
let shown = false

/** The page's position (CSS pixels of the zoomed page) as window pixels. */
const toWindow = (b: Bounds) => {
  const z = currentZoom()
  return { x: Math.round(b.x * z), y: Math.round(b.y * z), w: Math.max(50, Math.round(b.w * z)), h: Math.max(50, Math.round(b.h * z)) }
}

async function create(b: Bounds): Promise<Webview> {
  const existing = await Webview.getByLabel(LABEL).catch(() => null)
  if (existing) return existing
  const r = toWindow(b)
  const w = new Webview(getCurrentWindow(), LABEL, { url: URL, x: r.x, y: r.y, width: r.w, height: r.h, focus: true })
  await new Promise<void>((resolve, reject) => {
    w.once('tauri://created', () => resolve())
    w.once('tauri://error', e => reject(new Error(String((e as { payload?: unknown }).payload ?? "Couldn't open WhatsApp"))))
  })
  await w.setZoom(currentZoom()).catch(() => {})
  return w
}

/** Shows WhatsApp over [b] (the WhatsApp page's empty area). */
export async function show(b: Bounds) {
  if (!view) {
    creating ??= create(b).finally(() => { creating = null })
    view = await creating
  }
  const r = toWindow(b)
  await view.setPosition(new LogicalPosition(r.x, r.y))
  await view.setSize(new LogicalSize(r.w, r.h))
  if (!shown) { await view.show(); shown = true }
}

/** Moves it out of sight (it stays logged in and keeps running). */
export async function hide() {
  if (view && shown) { shown = false; await view.hide().catch(() => {}) }
}

/** Starts WhatsApp Web again (if it got stuck). */
export async function reload(b: Bounds) {
  const old = view
  view = null
  shown = false
  if (old) await old.close().catch(() => {})
  await show(b)
}

/** WhatsApp in its own window instead. */
export async function openWindow() {
  const existing = await WebviewWindow.getByLabel('whatsapp-window').catch(() => null)
  if (existing) { await existing.setFocus(); return }
  // eslint-disable-next-line no-new
  new WebviewWindow('whatsapp-window', { url: URL, title: 'WhatsApp · Carrot Note', width: 1100, height: 780, center: true })
}
