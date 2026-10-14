// Desktop: on very large screens everything is scaled up, like browser zoom, so text and cards stay
// a comfortable size. "Auto" picks the size from the screen width; Settings can pick one by hand.

import { getCurrentWebview } from '@tauri-apps/api/webview'
import { inTauri } from './http'

const KEY = 'carrot.zoom'
// Read once, before any zoom is applied.
const screenWidth = screen.width

/** 100% up to 2400px wide screens, then about 1% per 22px (a 3325px screen gets 150%). */
export const autoZoom = () => (screenWidth >= 2400 ? Math.min(2, Math.round((screenWidth / 2200) * 4) / 4) : 1)

export function zoomSetting(): string {
  try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' }
}

let current = 1
/** The zoom the page is shown at now (1 = 100%). */
export const currentZoom = () => current

export async function applyZoom(setting = zoomSetting()) {
  try { localStorage.setItem(KEY, setting) } catch { /* private mode */ }
  const value = setting === 'auto' ? autoZoom() : Number(setting) || 1
  current = value
  if (inTauri) await getCurrentWebview().setZoom(value).catch(() => {})
  return value
}
