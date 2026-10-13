// Port of util/Format.kt: amounts, epoch-day dates and times.
import { dateLocale } from './i18n'

const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const amount = (v: number) => amountFmt.format(v)
export const money = (v: number, currency: string) => `${amount(v)} ${currency}`

/** "1,200 USD · 300 EGP": totals that may be in several currencies. */
export function totals(map: Record<string, number>, fallback: string): string {
  const entries = Object.entries(map).filter(([, v]) => Math.abs(v) > 0.0001)
  if (!entries.length) return money(0, fallback)
  return entries
    .sort((a, b) => (a[0] === fallback ? -1 : b[0] === fallback ? 1 : Math.abs(b[1]) - Math.abs(a[1])))
    .map(([c, v]) => money(v, c))
    .join(' · ')
}

export function sumBy<T>(list: T[], currency: (t: T) => string, value: (t: T) => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of list) out[currency(t)] = (out[currency(t)] ?? 0) + value(t)
  return out
}

/** Reads an amount; also works out simple sums like "120+35*2" or "(300-40)/2". */
export const parseAmount = (s: string): number | null => {
  const v = calc(s)
  return v != null && Number.isFinite(v) ? Math.round(v * 100) / 100 : null
}

/** True when [s] is a sum to work out rather than a plain number. */
export const isExpression = (s: string) => /\d\s*[-+*/×÷]\s*[\d(.]/.test(s.replace(/,/g, ''))

function calc(input: string): number | null {
  const src = input.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '')
  if (!src) return null
  let i = 0
  const peek = () => src[i]
  function num(): number | null {
    if (peek() === '(') {
      i++
      const v = sum()
      if (peek() !== ')') return null
      i++
      return v
    }
    if (peek() === '-') { i++; const v = num(); return v == null ? null : -v }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i))
    if (!m) return null
    i += m[0].length
    return parseFloat(m[0])
  }
  function product(): number | null {
    let v = num()
    while (v != null && (peek() === '*' || peek() === '/')) {
      const op = src[i++]
      const r = num()
      if (r == null) return null
      v = op === '*' ? v * r : r === 0 ? null : v / r
    }
    return v
  }
  function sum(): number | null {
    let v = product()
    while (v != null && (peek() === '+' || peek() === '-')) {
      const op = src[i++]
      const r = product()
      if (r == null) return null
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const v = sum()
  return i === src.length ? v : null
}
export const amountText = (v: number) => (v === 0 ? '' : String(Math.round(v * 100) / 100))

// ---- dates (epoch days, local calendar)

const DAY = 86_400_000
export const toEpochDay = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
export const fromEpochDay = (e: number) => {
  const u = new Date(e * DAY)
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())
}
export const today = () => toEpochDay(new Date())
export const dayOfMs = (ms: number) => toEpochDay(new Date(ms))
export const monthStart = (e: number) => { const d = fromEpochDay(e); return toEpochDay(new Date(d.getFullYear(), d.getMonth(), 1)) }
export const addMonths = (e: number, n: number) => { const d = fromEpochDay(e); return toEpochDay(new Date(d.getFullYear(), d.getMonth() + n, 1)) }
export const monthEnd = (e: number) => addMonths(e, 1) - 1

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(dateLocale(), o)
const fullFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const shortFmt = fmt({ day: 'numeric', month: 'short' })
const monthFmt = fmt({ month: 'long', year: 'numeric' })
const monthNameFmt = fmt({ month: 'long' })
const longDayFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' })

export const date = (e: number) => fullFmt.format(fromEpochDay(e))
export const dateShort = (e: number) => shortFmt.format(fromEpochDay(e))
export const month = (e: number) => monthFmt.format(fromEpochDay(e))
export const monthName = (e: number) => monthNameFmt.format(fromEpochDay(e))
export const longDay = (e: number) => longDayFmt.format(fromEpochDay(e))
export const isoDate = (e: number) => {
  const d = fromEpochDay(e)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return toEpochDay(new Date(y, m - 1, d)) }

export function relativeDay(e: number): string {
  const diff = e - today()
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return date(e)
}

export function daysLeft(e: number): string {
  const diff = e - today()
  if (diff === 0) return 'due today'
  if (diff === 1) return 'due tomorrow'
  if (diff > 1) return `${diff} days left`
  if (diff === -1) return '1 day overdue'
  return `${-diff} days overdue`
}

export function time(minutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)
  return d.toLocaleTimeString(dateLocale() ?? [], { hour: 'numeric', minute: '2-digit' })
}
export const timeInput = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const fromTimeInput = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
export const minutesOfMs = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() }
export const msAt = (day: number, minutes: number) => {
  const d = fromEpochDay(day)
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d.getTime()
}

/** Tracked time as "1:24:37" or "24:37". */
export function duration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
export const hours = (ms: number) => ms / 3_600_000

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
export const initials = (name: string) =>
  name.trim().split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+/u, '')).filter(Boolean).slice(0, 2).map(w => [...w][0]!.toUpperCase()).join('') || '?'

/** The same day of the month [n] months later (or earlier), clamped to the month's last day. */
export function addMonthsKeep(day: number, n: number): number {
  const d = fromEpochDay(day)
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return toEpochDay(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)))
}

/** Next due day of a repeating task. */
export function nextRepeat(day: number, repeat: string): number {
  if (repeat === 'daily') return day + 1
  if (repeat === 'weekly') return day + 7
  if (repeat === 'monthly') return addMonthsKeep(day, 1)
  return day
}

/** "12d 4h 32m", "3h 05m 12s": time left on a countdown. */
export function countdown(ms: number, seconds = false): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, sec = s % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  const [D, H, M, S] = dateLocale() ? ['ي', 'س', 'د', 'ث'] : ['d', 'h', 'm', 's']
  if (d > 0) return seconds ? `${d}${D} ${p2(h)}${H} ${p2(m)}${M} ${p2(sec)}${S}` : `${d}${D} ${h}${H} ${p2(m)}${M}`
  if (h > 0) return `${h}${H} ${p2(m)}${M}${seconds ? ` ${p2(sec)}${S}` : ''}`
  return `${m}${M} ${p2(sec)}${S}`
}

/** Country code to its flag emoji ("EG" → 🇪🇬). */
export const flag = (cc: string) => cc.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)))
