// Public holidays around the world from Nager.Date (free, no key): https://date.nager.at

import { useEffect, useState } from 'preact/hooks'
import { getJson } from './net'
import * as F from './format'

export interface Country { countryCode: string; name: string }
export interface Holiday { date: string; localName: string; name: string; countryCode: string; global: boolean; types: string[] }
export interface DayHoliday { name: string; localName: string; cc: string }

export const countries = () =>
  getJson<Country[]>('https://date.nager.at/api/v3/AvailableCountries', 'hol.countries', 30 * 86_400_000)
    .then(l => [...(l ?? [])].sort((a, b) => a.name.localeCompare(b.name)))

const yearHolidays = (year: number, cc: string) =>
  getJson<Holiday[] | null>(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`, `hol.${year}.${cc}`, 7 * 86_400_000).then(l => l ?? [])

/** The phone's country (from its language setting), used until the user picks countries. */
export function defaultCountries(): string[] {
  for (const lang of navigator.languages ?? [navigator.language]) {
    const m = /[-_]([A-Z]{2})\b/i.exec(lang)
    if (m) return [m[1].toUpperCase()]
  }
  return ['US']
}

/** Holidays for [years] in [codes], by epoch day. Empty while loading or offline with no copy. */
export function useHolidays(years: number[], codes: string[]) {
  const [map, setMap] = useState<Map<number, DayHoliday[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const key = years.join(',') + '|' + codes.join(',')
  useEffect(() => {
    let live = true
    if (!codes.length) { setMap(new Map()); return }
    Promise.allSettled(years.flatMap(y => codes.map(cc => yearHolidays(y, cc)))).then(results => {
      if (!live) return
      const next = new Map<number, DayHoliday[]>()
      let failed = 0
      for (const r of results) {
        if (r.status === 'rejected') { failed++; continue }
        for (const h of r.value) {
          const d = F.fromIso(h.date)
          const list = next.get(d) ?? []
          if (!list.some(x => x.cc === h.countryCode && x.name === h.name)) list.push({ name: h.name, localName: h.localName, cc: h.countryCode })
          next.set(d, list)
        }
      }
      setMap(next)
      setError(failed && failed === results.length ? "Couldn't load holidays. Check your internet." : null)
    })
    return () => { live = false }
  }, [key])
  return { map, error }
}
