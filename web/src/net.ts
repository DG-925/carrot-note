// Free public web APIs (through the app, so only allowed sites are reached), with a cache on the phone.

import { call } from './bridge'

const memory = new Map<string, Promise<unknown>>()

/**
 * Loads JSON from [url]. With [cacheKey] the answer is kept on the phone for [maxAgeMs] and
 * reused, and an old copy is used when there is no internet.
 */
export function getJson<T>(url: string, cacheKey?: string, maxAgeMs = 86_400_000): Promise<T> {
  const key = cacheKey ?? url
  const hit = memory.get(key)
  if (hit) return hit as Promise<T>
  const stored = cacheKey ? readCache<T>(cacheKey) : null
  if (stored && Date.now() - stored.t < maxAgeMs) {
    const p = Promise.resolve(stored.v)
    memory.set(key, p)
    return p
  }
  const p = call<T>('net.get', { url }).then(v => {
    if (cacheKey) writeCache(cacheKey, v)
    return v
  }).catch(e => {
    memory.delete(key)
    if (stored) return stored.v
    throw e
  })
  memory.set(key, p)
  return p
}

function readCache<T>(key: string): { t: number; v: T } | null {
  try { return JSON.parse(localStorage.getItem('carrot.net.' + key) ?? 'null') } catch { return null }
}
function writeCache(key: string, v: unknown) {
  try { localStorage.setItem('carrot.net.' + key, JSON.stringify({ t: Date.now(), v })) } catch { /* full or blocked */ }
}

/** "3 days ago" for an ISO time. */
export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day')
  if (s < 86400 * 365) return rtf.format(-Math.round(s / (86400 * 30)), 'month')
  return rtf.format(-Math.round(s / (86400 * 365)), 'year')
}
