// Live exchange rates (open.er-api.com, free) for showing mixed-currency totals in one currency.

import { useEffect, useState } from 'preact/hooks'
import { getJson } from './net'

interface Rates { result: string; base_code: string; time_last_update_unix: number; rates: Record<string, number> }

/** USDT follows the US dollar. */
export const fxCode = (c: string) => (c === 'USDT' ? 'USD' : c)

export const ratesFor = (base: string) => getJson<Rates>(`https://open.er-api.com/v6/latest/${fxCode(base)}`, `fx.${fxCode(base)}`, 6 * 3_600_000)

/** Rates from [base] to every currency, once loaded (null offline with no saved copy). */
export function useRates(base: string, enabled = true) {
  const [rates, setRates] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    ratesFor(base).then(r => { if (live && r.result === 'success') setRates(r.rates) }).catch(() => {})
    return () => { live = false }
  }, [base, enabled])
  return rates
}

/** Sum of [totals] in [base], or null when a rate is missing. */
export function convertTotal(totals: Record<string, number>, base: string, rates: Record<string, number> | null): number | null {
  let sum = 0
  for (const [cur, v] of Object.entries(totals)) {
    if (Math.abs(v) < 0.0001) continue
    if (fxCode(cur) === fxCode(base)) { sum += v; continue }
    const r = rates?.[fxCode(cur)]
    if (!r) return null
    sum += v / r
  }
  return sum
}
