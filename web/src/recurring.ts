// Recurring money: copies of each due recurring payment are added to Money when the app opens.

import * as F from './format'
import { getState, save } from './store'
import type { Recurring } from './types'

export const recurringPeriods: { value: string; label: string; short: string }[] = [
  { value: 'weekly', label: 'Every week', short: 'week' },
  { value: 'monthly', label: 'Every month', short: 'month' },
  { value: 'quarterly', label: 'Every 3 months', short: '3 months' },
  { value: 'yearly', label: 'Every year', short: 'year' },
]
export const recurringPeriod = (p: string) => recurringPeriods.find(x => x.value === p) ?? recurringPeriods[1]

export function nextOccurrence(day: number, period: string): number {
  if (period === 'weekly') return day + 7
  if (period === 'quarterly') return F.addMonthsKeep(day, 3)
  if (period === 'yearly') return F.addMonthsKeep(day, 12)
  return F.addMonthsKeep(day, 1)
}

/** Per-month amount, for totals. */
export const monthlyAmount = (r: Recurring) =>
  r.period === 'weekly' ? (r.amount * 52) / 12 : r.period === 'quarterly' ? r.amount / 3 : r.period === 'yearly' ? r.amount / 12 : r.amount

let running = false

/** Adds every occurrence that is due (up to today) and moves each one's next date forward. */
export async function runRecurring() {
  const s = getState()
  if (running || !s.signedIn || s.locked) return
  running = true
  try {
    const today = F.today()
    for (const r of s.data.recurring) {
      if (!r.active || r.nextDate > today) continue
      let day = r.nextDate
      // The id is made from the date, so two phones adding the same copy end up with one.
      for (let n = 0; day <= today && n < 36; n++) {
        await save('txn', {
          id: `${r.id}-${day}`, kind: r.kind, amount: r.amount, currency: r.currency, category: r.category, method: r.method, date: day,
          note: r.note, projectId: r.projectId ?? null, customerId: r.customerId ?? null, createdAt: Date.now(),
        })
        day = nextOccurrence(day, r.period)
      }
      await save('recurring', { ...r, nextDate: day })
    }
  } catch { /* try again next time */ } finally {
    running = false
  }
}
