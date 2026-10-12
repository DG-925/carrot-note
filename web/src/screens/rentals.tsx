// Rentals: VPS, hosting, bots, domains… rented to clients, with what they cost me, what the
// client pays, and a live countdown to the next renewal.

import { useEffect, useState } from 'preact/hooks'
import { getJson } from '../net'
import { call } from '../bridge'
import * as F from '../format'
import { askForPayment, CustomerPicker, ProjectPicker } from '../editors'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { newId, rentalKind, rentalKinds, rentalPeriod, rentalPeriods, type Rental } from '../types'
import {
  Btn, Card, Chips, CurrencyField, DateField, Empty, Eyebrow, Field, FieldLabel, Form, Hero, Hint, PageHeader, Ring, Round,
  SearchBar, SheetTitle, SwitchRow, TimeField, attempt, cx, matches, openForm, openSheet, toast, useNow,
} from '../ui'
import { dateLocale } from '../i18n'
import { addRentalSplit, partnersOf } from './partners'

// ---------------------------------------------------------------- maths

/** When the rental runs out: the expiry time, or the end of the expiry day. */
export const expiresAt = (r: Rental) =>
  r.expiryDate == null ? null : r.expiryTime != null ? F.msAt(r.expiryDate, r.expiryTime) : F.msAt(r.expiryDate + 1, 0)

/** Start of the period the client is currently paid up for. */
function periodStartMs(r: Rental): number | null {
  if (r.expiryDate == null) return null
  const months = rentalPeriod(r.period).months
  const last = r.renewals[r.renewals.length - 1]
  let day = last?.from ?? (months ? F.addMonthsKeep(r.expiryDate, -months) : r.startDate ?? null)
  if (day == null) return null
  // Renewed early: the time already paid for started a period (or more) before.
  const today = F.today()
  for (let i = 0; months && day > today && i < 24; i++) day = F.addMonthsKeep(day, -months)
  return F.msAt(Math.max(day, r.startDate ?? day), 0)
}

export const nextExpiry = (r: Rental) => {
  const months = rentalPeriod(r.period).months || 1
  return F.addMonthsKeep(r.expiryDate ?? F.today(), months)
}

export type RentalState = 'stopped' | 'expired' | 'soon' | 'ok' | 'nodate'
export function rentalState(r: Rental, now = Date.now()): RentalState {
  if (r.status !== 'active') return 'stopped'
  const end = expiresAt(r)
  if (end == null) return 'nodate'
  if (end <= now) return 'expired'
  return end - now <= Math.max(7, r.remindDays) * 86_400_000 ? 'soon' : 'ok'
}
const stateColor: Record<RentalState, string> = { stopped: 'var(--muted)', expired: 'var(--bad)', soon: '#E08A00', ok: 'var(--good)', nodate: 'var(--muted)' }

/** Per-month amounts of the active, repeating rentals: what I pay, what I get, and the profit. */
export function monthlyTotals(list: Rental[]) {
  const cost: Record<string, number> = {}, income: Record<string, number> = {}, profit: Record<string, number> = {}
  for (const r of list) {
    const m = rentalPeriod(r.period).months
    if (r.status !== 'active' || !m) continue
    cost[r.costCurrency] = (cost[r.costCurrency] ?? 0) + r.cost / m
    income[r.priceCurrency] = (income[r.priceCurrency] ?? 0) + r.price / m
    profit[r.priceCurrency] = (profit[r.priceCurrency] ?? 0) + r.price / m
    profit[r.costCurrency] = (profit[r.costCurrency] ?? 0) - r.cost / m
  }
  return { cost, income, profit }
}

/** A product's renters: the active ones, what they pay a month, the profit, and how many need renewing. */
export function productStats(projectId: string, rentals: Rental[]) {
  const mine = rentals.filter(r => r.projectId === projectId)
  const active = mine.filter(r => r.status === 'active')
  const t = monthlyTotals(active)
  const now = Date.now()
  return { all: mine, active, income: t.income, cost: t.cost, profit: t.profit, attention: active.filter(r => ['expired', 'soon'].includes(rentalState(r, now))).length }
}

const clientOf = (r: Rental) => byId('customer', r.customerId)?.name ?? (r.clientName || '')
const perPeriod = (r: Rental) => (rentalPeriod(r.period).months ? ' / ' + rentalPeriod(r.period).short : '')

function Countdown({ r, big }: { r: Rental; big?: boolean }) {
  const now = useNow(r.status === 'active' && r.expiryDate != null)
  const end = expiresAt(r)
  const st = rentalState(r, now)
  if (st === 'stopped') return <span class="muted semibold">Stopped</span>
  if (end == null) return <span class="muted semibold">No expiry date</span>
  const left = end - now
  if (left <= 0) {
    const days = Math.floor(-left / 86_400_000)
    return <span class="bad bold">{big ? 'Expired' : 'Expired'} {days === 0 ? 'today' : F.plural(days, 'day') + ' ago'}</span>
  }
  return <span class={cx('num bold cd', big && 'countdown-big')} style={{ color: stateColor[st] }}>{F.countdown(left, big)}</span>
}

// ---------------------------------------------------------------- uptime and domain lookup

export interface UptimeResult { up: boolean; at: number; ms: number; error: string; since: number }
let uptimeCache: Record<string, UptimeResult> = {}
const uptimeSubs = new Set<() => void>()

/** Last uptime check of every monitored rental, refreshed every minute while shown. */
export function useUptime() {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN(n => n + 1)
    uptimeSubs.add(f)
    const load = () => call<Record<string, UptimeResult>>('uptime.status').then(r => { uptimeCache = r ?? {}; uptimeSubs.forEach(x => x()) }).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => { uptimeSubs.delete(f); clearInterval(t) }
  }, [])
  return uptimeCache
}

async function checkNow(id: string) {
  const r = await attempt(() => call<UptimeResult>('uptime.check', { id }))
  if (r) { uptimeCache = { ...uptimeCache, [id]: r }; uptimeSubs.forEach(x => x()); toast(r.up ? `Online · ${r.ms} ms` : `Down: ${r.error || 'no answer'}`) }
}

function UptimeDot({ r }: { r: Rental }) {
  const u = useUptime()[r.id]
  if (!r.monitor) return null
  return <span class={cx('up-dot', u ? (u.up ? 'up' : 'down') : 'unknown')} title={u ? (u.up ? 'Online' : 'Down') : 'Not checked yet'} />
}

interface DomainInfo { expiry: number | null; registered: number | null; registrar: string }

/** Real expiry date and registrar of a domain, from the public RDAP registry (free). */
export async function lookupDomain(name: string): Promise<DomainInfo> {
  const r = await getJson<any>(`https://rdap.org/domain/${encodeURIComponent(name.trim().toLowerCase())}`, `rdap.${name.trim().toLowerCase()}`, 6 * 3_600_000)
  const ev = (a: string) => (r?.events as any[] | undefined)?.find(e => e.eventAction === a)?.eventDate as string | undefined
  const day = (iso?: string) => (iso ? F.toEpochDay(new Date(iso)) : null)
  const registrar = (r?.entities as any[] | undefined)?.find(e => (e.roles ?? []).includes('registrar'))
  const fn = (registrar?.vcardArray?.[1] as any[] | undefined)?.find(x => x[0] === 'fn')?.[3]
  return { expiry: day(ev('expiration')), registered: day(ev('registration')), registrar: typeof fn === 'string' ? fn : '' }
}

// ---------------------------------------------------------------- list

let savedFilter = 'all'

export function RentalsScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const [filter, setFilterState] = useState(savedFilter)
  const [query, setQuery] = useState('')
  const setFilter = (f: string) => { savedFilter = f; setFilterState(f) }
  const now = useNow()
  const all = s.data.rental
  const active = all.filter(r => r.status === 'active')
  const totals = monthlyTotals(all)
  const attention = active.filter(r => ['expired', 'soon'].includes(rentalState(r, now)))
  const shown = all
    .filter(r => filter === 'all' ? true : filter === 'attention' ? ['expired', 'soon'].includes(rentalState(r, now)) : filter === 'stopped' ? r.status !== 'active' : r.kind === filter)
    .filter(r => matches(query, r.name, r.provider, clientOf(r), rentalKind(r.kind).label, r.details))
    .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || (expiresAt(a) ?? 9e15) - (expiresAt(b) ?? 9e15))
  return (
    <>
      <div class="scroll">
        <PageHeader title="Rentals" onBack={popNav} />
        <div class="content no-tabbar">
          <Hero i={1}>
            <Eyebrow>Monthly profit from rentals</Eyebrow>
            <div class={cx('num amt', Object.keys(totals.profit).length > 1 ? 'h-lg' : 'h-display')}>{F.totals(totals.profit, cur)}</div>
            <div class="row" style={{ marginTop: 12 }}>
              <div class="grow"><div class="eyebrow">Clients pay you</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{F.totals(totals.income, cur)}</div></div>
              <div class="grow"><div class="eyebrow">It costs you</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{F.totals(totals.cost, cur)}</div></div>
            </div>
            <div class="small" style={{ marginTop: 10, opacity: .88 }}>{F.plural(active.length, 'active rental')}{attention.length ? ` · ${attention.length} need attention` : ''}</div>
          </Hero>
          {attention.length > 0 && (
            <div class="tile t-butter pop" style={{ '--i': 2 } as any}>
              <div class="row"><Icon name="warning" size={16} /><b class="grow">Renew soon</b></div>
              {attention.map(r => (
                <button key={r.id} class="row press" style={{ width: '100%', textAlign: 'start', padding: '8px 0' }} onClick={() => push({ name: 'rental', id: r.id })}>
                  <Icon name={rentalKind(r.kind).icon} size={15} />
                  <span class="grow semibold ellipsis">{r.name || rentalKind(r.kind).label}{clientOf(r) ? ` · ${clientOf(r)}` : ''}</span>
                  <Countdown r={r} />
                </button>
              ))}
            </div>
          )}
          {all.length > 0 && <SearchBar i={3} value={query} onInput={setQuery} placeholder="Search name, client, provider…" />}
          {all.length > 0 && <div class="pop" style={{ '--i': 3 } as any}>
            <Chips options={['all', 'attention', ...rentalKinds.map(k => k.value), 'stopped']} value={filter} onChange={setFilter}
              label={v => ({ all: 'All', attention: 'Renew soon', stopped: 'Stopped' } as Record<string, string>)[v] ?? rentalKind(v).label}
              icon={v => (v === 'all' ? 'list' : v === 'attention' ? 'warning' : v === 'stopped' ? 'stop' : rentalKind(v).icon)} />
          </div>}
          {!all.length && <Empty icon="server" title="Nothing rented yet" text="Add the VPS, hosting, bots and domains you rent to clients. See when each one expires, what it costs you and what the client pays.">
            <Btn icon="plus" onClick={() => editRental()}>Add a rental</Btn>
          </Empty>}
          {all.length > 0 && !shown.length && <Empty icon="search" title="Nothing here" text="Try another filter or word." />}
          {shown.map((r, i) => <RentalCard key={r.id} r={r} i={Math.min(i, 8) + 4} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editRental()}><Icon name="plus" size={15} />Rental</button>
    </>
  )
}

export function RentalCard({ r, i }: { r: Rental; i?: number }) {
  const now = useNow(r.status === 'active')
  const st = rentalState(r, now)
  const kind = rentalKind(r.kind)
  const start = periodStartMs(r), end = expiresAt(r)
  const progress = start != null && end != null && end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0
  const sameCur = r.costCurrency === r.priceCurrency
  const client = clientOf(r)
  // A renter of one of my products is known by who rents it.
  const renter = r.kind === 'app' && !!client
  return (
    <div class={'card press' + (i != null ? ' pop' : '') + (st === 'expired' ? ' rental-expired' : '')} style={i != null ? ({ '--i': i } as any) : undefined}
      onClick={() => push({ name: 'rental', id: r.id })}>
      <div class="row">
        <Ring value={st === 'expired' ? 1 : progress} size={50} stroke={5} color={stateColor[st]}><Icon name={kind.icon} size={16} /></Ring>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row" style={{ gap: 6 }}><div class="h-sm ellipsis">{renter ? client : r.name || kind.label}</div><UptimeDot r={r} /></div>
          <div class="small muted ellipsis">{(renter ? [r.name || kind.label, r.provider] : [kind.label, client, r.provider]).filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div class="tiny muted semibold">{st === 'expired' ? '' : st === 'stopped' || st === 'nodate' ? '' : 'Expires in'}</div>
          <Countdown r={r} />
        </div>
      </div>
      <div class="rental-money">
        <div><span class="tiny muted">Costs you</span><b class="num amt">{F.money(r.cost, r.costCurrency)}</b></div>
        <div><span class="tiny muted">Client pays</span><b class="num amt good">{F.money(r.price, r.priceCurrency)}</b></div>
        <div><span class="tiny muted">Profit{perPeriod(r)}</span><b class="num amt">{sameCur ? F.money(r.price - r.cost, r.priceCurrency) : '—'}</b></div>
      </div>
      {r.status === 'active' && (st === 'expired' || st === 'soon') && <div class="row" style={{ marginTop: 10 }}>
        <Btn sm kind="ink" icon="sync" onClick={() => renewRental(r)}>Renew</Btn>
        {r.price > 0 && <Btn sm kind="t-butter" class="t-butter" icon="bell" onClick={() => remindClient(r)}>Ask client to pay</Btn>}
      </div>}
    </div>
  )
}

function remindClient(r: Rental) {
  askForPayment({
    person: clientOf(r) || 'there', amount: r.price, currency: r.priceCurrency, customerId: r.customerId, dueDate: r.expiryDate,
    what: `the ${rentalKind(r.kind).label.toLowerCase()}${r.name ? ` “${r.name}”` : ''}${rentalPeriod(r.period).months ? ` (${rentalPeriod(r.period).short})` : ''}`,
  })
}

// ---------------------------------------------------------------- detail

export function RentalDetail({ id }: { id: string }) {
  const s = useApp()
  const r = s.data.rental.find(x => x.id === id)
  const now = useNow(!!r && r.status === 'active')
  if (!r) {
    return <div class="scroll"><PageHeader title="Rental" onBack={popNav} />
      <Empty icon="server" title="This rental is gone" text="It was deleted."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  }
  const kind = rentalKind(r.kind)
  const st = rentalState(r, now)
  const start = periodStartMs(r), end = expiresAt(r)
  const progress = start != null && end != null && end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0
  const client = clientOf(r)
  const customer = byId('customer', r.customerId)
  const project = byId('project', r.projectId)
  const sameCur = r.costCurrency === r.priceCurrency
  const months = rentalPeriod(r.period).months
  const earned = r.renewals.reduce((a, x) => a + x.price, 0)
  const spent = r.renewals.reduce((a, x) => a + x.cost, 0)
  return (
    <div class="scroll">
      <PageHeader title={r.name || kind.label} onBack={popNav}>
        <Round icon="edit" label="Edit" onClick={() => editRental(r)} />
      </PageHeader>
      <div class="content no-tabbar">
        <div class={cx('hero', st === 'expired' && 'hero-bad', st === 'stopped' && 'hero-muted')} style={{ '--i': 1 } as any}>
          <div class="row"><span class="hero-pill"><Icon name={kind.icon} size={11} /> {kind.label}</span><span class="grow" />
            <span class="hero-pill">{st === 'stopped' ? 'Stopped' : st === 'expired' ? 'Expired' : st === 'soon' ? 'Renew soon' : 'Running'}</span></div>
          <div class="eyebrow" style={{ marginTop: 14 }}>{st === 'expired' ? 'Ran out' : 'Expires in'}</div>
          <div class="countdown-hero num cd">{st === 'expired' || st === 'stopped' || end == null ? <Countdown r={r} big /> : F.countdown(end - now, true)}</div>
          {end != null && <div class="small" style={{ opacity: .9 }}>{F.date(r.expiryDate!)}{r.expiryTime != null ? ' at ' + F.time(r.expiryTime) : ''}</div>}
          {end != null && st !== 'stopped' && <div style={{ marginTop: 12 }}><div class="bar" style={{ height: 8, background: 'rgba(255,255,255,.25)' }}><i style={{ width: `${progress * 100}%`, background: '#fff' }} /></div>
            <div class="row between tiny" style={{ marginTop: 6, opacity: .85 }}><span>{start != null ? 'Since ' + F.dateShort(F.dayOfMs(start)) : ''}</span><span>{Math.round(progress * 100)}% of this period used</span></div></div>}
        </div>

        {r.status === 'active' && <div class="row pop" style={{ '--i': 2 } as any}>
          <Btn class="grow" icon="sync" onClick={() => renewRental(r)}>Renew</Btn>
          {r.price > 0 && <Btn class="grow" kind="t-butter" icon="bell" onClick={() => remindClient(r)}>Ask to pay</Btn>}
        </div>}

        <Card i={3}>
          <div class="h-sm" style={{ marginBottom: 10 }}>Money {months ? `per ${rentalPeriod(r.period).short}` : '(one time)'}</div>
          <div class="rental-money big">
            <div><span class="tiny muted">It costs you</span><b class="num amt">{F.money(r.cost, r.costCurrency)}</b></div>
            <div><span class="tiny muted">Client pays you</span><b class="num amt good">{F.money(r.price, r.priceCurrency)}</b></div>
            <div><span class="tiny muted">Your profit</span><b class="num amt" style={{ color: sameCur && r.price - r.cost < 0 ? 'var(--bad)' : undefined }}>{sameCur ? F.money(r.price - r.cost, r.priceCurrency) : 'Different currencies'}</b></div>
          </div>
          {months > 1 && sameCur && <div class="small muted" style={{ marginTop: 8 }}>That's {F.money((r.price - r.cost) / months, r.priceCurrency)} profit a month, {F.money(((r.price - r.cost) * 12) / months, r.priceCurrency)} a year.</div>}
          {months === 1 && sameCur && <div class="small muted" style={{ marginTop: 8 }}>That's {F.money((r.price - r.cost) * 12, r.priceCurrency)} profit a year.</div>}
          {r.renewals.length > 0 && <div class="small muted" style={{ marginTop: 4 }}>So far: client paid <span class="amt">{F.money(earned, r.priceCurrency)}</span>, you paid <span class="amt">{F.money(spent, r.costCurrency)}</span>.</div>}
        </Card>

        <Card i={4}>
          <div class="info-rows">
            {client && <div onClick={() => customer && push({ name: 'customer', id: customer.id })}><span>Client</span><b>{client}</b>{customer && <Icon name="right" size={12} class="muted" />}</div>}
            {project && <div onClick={() => push({ name: 'project', id: project.id })}><span>Project</span><b>{project.name}</b><Icon name="right" size={12} class="muted" /></div>}
            {r.provider && <div><span>Provider</span><b>{r.provider}</b></div>}
            {r.startDate != null && <div><span>Started</span><b>{F.date(r.startDate)}</b></div>}
            <div><span>Billing</span><b>{rentalPeriod(r.period).label}</b></div>
            <div><span>Reminder</span><b>{r.reminder && r.status === 'active' ? `${F.plural(r.remindDays, 'day')} before, and on the day` : 'Off'}</b></div>
          </div>
          {r.details && <div class="rental-details" onClick={() => call('app.copy', { text: r.details })}>
            <div class="row"><span class="tiny muted semibold grow">Details (tap to copy)</span><Icon name="copy" size={12} class="muted" /></div>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.details}</div>
          </div>}
        </Card>

        {r.monitor && <UptimeCard r={r} />}

        <div class="section-h"><h3>Renewals</h3></div>
        {!r.renewals.length && <Hint>Each time you renew, it's listed here with what you paid and what the client paid.</Hint>}
        {r.renewals.length > 0 && <div class="card flush">
          {[...r.renewals].reverse().map(x => (
            <div key={x.id} class="item">
              <div class="badge-ico t-mint"><Icon name="sync" size={15} /></div>
              <div class="main"><div class="t">{x.to != null ? `Until ${F.dateShort(x.to)}` : 'Renewed'}</div><div class="s">Renewed {F.dateShort(x.date)}{x.note ? ' · ' + x.note : ''}</div></div>
              <div style={{ textAlign: 'end' }}><div class="num small good bold amt">+{F.money(x.price, r.priceCurrency)}</div><div class="num tiny muted amt">−{F.money(x.cost, r.costCurrency)}</div></div>
            </div>
          ))}
        </div>}
        <Btn kind="soft-bg" icon={r.status === 'active' ? 'stop' : 'play'} onClick={() => attempt(() => save('rental', { ...r, status: r.status === 'active' ? 'stopped' : 'active' }))}>
          {r.status === 'active' ? "Stop (client doesn't rent it anymore)" : 'Mark as active again'}
        </Btn>
      </div>
    </div>
  )
}

function UptimeCard({ r }: { r: Rental }) {
  const u = useUptime()[r.id]
  const [busy, setBusy] = useState(false)
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }
  return (
    <Card>
      <div class="row">
        <span class={cx('up-dot big', u ? (u.up ? 'up' : 'down') : 'unknown')} />
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="h-sm">{!u ? 'Not checked yet' : u.up ? 'Online' : 'Down'}</div>
          <div class="small muted ellipsis">{u ? (u.up ? `Answered in ${u.ms} ms · ${ago(u.at)}` : `${u.error || 'No answer'} · ${ago(u.at)}`) : r.monitorUrl}</div>
          {u && u.since > 0 && <div class="tiny muted">{u.up ? 'Up' : 'Down'} since {new Date(u.since).toLocaleString(dateLocale())}</div>}
        </div>
        <Btn sm kind="soft-bg" icon="sync" busy={busy} onClick={async () => { setBusy(true); await checkNow(r.id); setBusy(false) }}>Check</Btn>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- editor

export function editRental(item?: Rental, defaults: Partial<Rental> = {}) {
  openForm(close => <RentalForm item={item} defaults={defaults} close={close} />)
}

function RentalForm({ item, defaults, close }: { item?: Rental; defaults: Partial<Rental>; close: () => void }) {
  const st = getState()
  const cur = st.settings.currency
  const base: Rental = item ?? {
    id: newId(), kind: 'vps', name: '', provider: '', customerId: defaults.customerId ?? null, projectId: defaults.projectId ?? null, clientName: '',
    startDate: F.today(), expiryDate: F.addMonthsKeep(F.today(), 1), expiryTime: null, period: 'monthly',
    cost: 0, costCurrency: cur, price: 0, priceCurrency: cur, reminder: true, remindDays: 3, status: 'active', details: '', renewals: [], createdAt: Date.now(),
    ...defaults,
  }
  const [r, set] = useState(base)
  const [cost, setCost] = useState(F.amountText(base.cost))
  const [price, setPrice] = useState(F.amountText(base.price))
  const up = (p: Partial<Rental>) => set({ ...r, ...p })
  const [looking, setLooking] = useState(false)
  const [lookup, setLookup] = useState('')
  const [probe, setProbe] = useState('')
  const c = F.parseAmount(cost) ?? 0, p = F.parseAmount(price) ?? 0
  const domain = r.kind === 'domain'
  const months = rentalPeriod(r.period).months
  const product = byId('project', r.projectId)?.kind === 'product'
  const setPeriod = (period: string) => {
    const m = rentalPeriod(period).months
    // Keep the expiry in step with the start date while it is still the suggested one.
    const suggested = r.startDate != null && r.expiryDate === F.addMonthsKeep(r.startDate, rentalPeriod(r.period).months || 1)
    up({ period, expiryDate: suggested && r.startDate != null && m ? F.addMonthsKeep(r.startDate, m) : r.expiryDate })
  }
  return (
    <Form title={product ? (item ? 'Edit renter' : 'New renter') : item ? 'Edit rental' : 'New rental'} close={close} saveEnabled={!!r.name.trim() || !!r.clientName.trim() || !!r.customerId}
      onSave={async () => {
        const customer = byId('customer', r.customerId)
        await save('rental', { ...r, name: r.name.trim(), provider: r.provider.trim(), clientName: customer?.name ?? r.clientName.trim(), details: r.details.trim(), cost: c, price: p })
        close()
        if (!item) toast(product ? 'Renter added' : 'Rental added')
      }}
      onDelete={item ? () => { remove('rental', item.id); close(); popNav() } : undefined}>
      <FieldLabel>What is it?</FieldLabel>
      <Chips wrap options={rentalKinds.map(k => k.value)} value={r.kind} onChange={v => up({ kind: v })} label={v => rentalKind(v).label} icon={v => rentalKind(v).icon} />
      <Field label={domain ? 'Domain name' : 'Name'} value={r.name} placeholder={domain ? 'example.com' : r.kind === 'bot' ? 'e.g. Telegram store bot' : 'e.g. Client VPS 4GB'}
        onInput={v => { up({ name: domain ? v.trim().toLowerCase() : v }); setLookup('') }} autoFocus={!item} />
      {domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(r.name) && (
        <div class="row">
          <Btn kind="soft" sm icon="search" busy={looking} onClick={async () => {
            setLooking(true)
            try {
              const info = await lookupDomain(r.name)
              up({ expiryDate: info.expiry ?? r.expiryDate, provider: r.provider || info.registrar })
              setLookup(info.expiry != null
                ? `Expires ${F.date(info.expiry)}${info.registrar ? ` · ${info.registrar}` : ''}${info.registered != null ? ` · registered ${F.dateShort(info.registered)}` : ''}`
                : 'No expiry date found for this domain.')
            } catch (e) { setLookup((e as Error).message === 'Not found' ? "That domain isn't registered." : (e as Error).message) } finally { setLooking(false) }
          }}>Look up real expiry date</Btn>
        </div>
      )}
      {lookup && <Hint>{lookup}</Hint>}
      <CustomerPicker value={r.customerId} onChange={v => up({ customerId: v })} none="Not a saved customer" />
      {!r.customerId && <Field label={product ? 'Who rents it?' : 'Client name'} value={r.clientName} icon="user" onInput={v => up({ clientName: v })} />}

      <FieldLabel>Billing</FieldLabel>
      <Chips wrap options={rentalPeriods.map(x => x.value)} value={r.period} onChange={setPeriod} label={v => rentalPeriod(v).label} />
      <DateField label="Starts" value={r.startDate} onChange={v => up({ startDate: v, expiryDate: v != null && months && r.expiryDate == null ? F.addMonthsKeep(v, months) : r.expiryDate })} />
      <DateField label={domain ? 'Renews on' : 'Expires on'} value={r.expiryDate} onChange={v => up({ expiryDate: v })} />
      {r.startDate != null && months > 0 && r.expiryDate !== F.addMonthsKeep(r.startDate, months) && (
        <button class="link" style={{ alignSelf: 'flex-start' }} onClick={() => up({ expiryDate: F.addMonthsKeep(r.startDate!, months) })}>
          Set expiry to {F.dateShort(F.addMonthsKeep(r.startDate, months))} (one {rentalPeriod(r.period).short} after start)
        </button>
      )}

      <div class="money-pair">
        <div class="card in-card">
          <div class="tiny muted semibold">It costs me{months ? ` / ${rentalPeriod(r.period).short}` : ''}</div>
          <input class="money-input num" value={cost} inputMode="decimal" placeholder="0" onInput={e => setCost((e.target as HTMLInputElement).value)} />
          <CurrencyField value={r.costCurrency} onChange={v => up({ costCurrency: v })} />
        </div>
        <div class="card in-card">
          <div class="tiny muted semibold">Client pays me{months ? ` / ${rentalPeriod(r.period).short}` : ''}</div>
          <input class="money-input num good" value={price} inputMode="decimal" placeholder="0" onInput={e => setPrice((e.target as HTMLInputElement).value)} />
          <CurrencyField value={r.priceCurrency} onChange={v => up({ priceCurrency: v })} />
        </div>
      </div>
      {r.costCurrency === r.priceCurrency && (c > 0 || p > 0) && (
        <div class={cx('tile', p - c >= 0 ? 't-mint' : 't-rose')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={p - c >= 0 ? 'income' : 'warning'} size={16} />
          <div class="grow semibold">Profit: {F.money(p - c, r.priceCurrency)}{months ? ` per ${rentalPeriod(r.period).short}` : ''}{months > 1 ? ` (${F.money((p - c) / months, r.priceCurrency)} a month)` : ''}</div>
        </div>
      )}

      <div class="card in-card">
        <SwitchRow title="Remind me before it expires" sub="A notification before, and another on the day" on={r.reminder} onChange={v => up({ reminder: v })} />
        {r.reminder && <Chips options={['1', '3', '7', '14', '30']} value={String(r.remindDays)} onChange={v => up({ remindDays: Number(v) })} label={v => `${v} day${v === '1' ? '' : 's'} before`} />}
      </div>
      <TimeField label="Expiry time (optional)" value={r.expiryTime} onChange={v => up({ expiryTime: v })} />
      <Field label={domain ? 'Registrar (Namecheap, GoDaddy…)' : 'Provider (Hetzner, Contabo, DigitalOcean…)'} value={r.provider} icon="cloud" onInput={v => up({ provider: v })} />
      <div class="card in-card">
        <SwitchRow title="Check that it's online" sub="Every 15 minutes. You get a notification if it goes down or comes back."
          on={!!r.monitor} onChange={v => up({ monitor: v, monitorUrl: r.monitorUrl || (domain && r.name ? `https://${r.name}` : '') })} />
        {r.monitor && <>
          <Field label="Address to check" value={r.monitorUrl ?? ''} placeholder="https://example.com or 65.21.10.4:22" icon="link" onInput={v => { up({ monitorUrl: v }); setProbe('') }}
            hint={probe || 'A website (https://…) or a server address with its port (SSH is port 22).'} hintTone={probe.startsWith('✓') ? 'good' : probe ? 'bad' : undefined} />
          <Btn kind="soft" sm icon="sync" disabled={!r.monitorUrl?.trim()} onClick={async () => {
            setProbe('Checking…')
            const res = await call<UptimeResult>('uptime.probe', { target: r.monitorUrl }).catch(e => ({ up: false, error: (e as Error).message, ms: 0 } as UptimeResult))
            setProbe(res.up ? `✓ Online · answered in ${res.ms} ms` : `✗ Not answering: ${res.error || 'no response'}`)
          }}>Test now</Btn>
        </>}
      </div>
      <ProjectPicker value={r.projectId} onChange={v => up({ projectId: v })} none="No project" />
      <Field label={domain ? 'Details (DNS, nameservers, login…)' : 'Details (IP, panel, login, specs…)'} multiline value={r.details} onInput={v => up({ details: v })} />
      <Hint>{getState().spaces.some(sp => sp.kind === 'project' && sp.projectId === r.projectId)
        ? "This project is shared, so everyone in its team sees this rental and its money."
        : 'Only you see this rental. Link it to a shared project to show it to your team.'}</Hint>
    </Form>
  )
}

// ---------------------------------------------------------------- renew

export function renewRental(r: Rental) {
  openSheet(close => <RenewSheet r={r} close={close} />)
}

function RenewSheet({ r, close }: { r: Rental; close: () => void }) {
  const [until, setUntil] = useState<number>(nextExpiry(r))
  const [cost, setCost] = useState(F.amountText(r.cost))
  const [price, setPrice] = useState(F.amountText(r.price))
  const [recordCost, setRecordCost] = useState(r.cost > 0)
  const [recordPrice, setRecordPrice] = useState(r.price > 0)
  const [busy, setBusy] = useState(false)
  const c = F.parseAmount(cost) ?? 0, p = F.parseAmount(price) ?? 0
  const label = r.kind === 'app' && clientOf(r) ? clientOf(r) : r.name || rentalKind(r.kind).label
  const project = byId('project', r.projectId)
  const partners = project ? partnersOf(project, getState().spaces.find(sp => sp.kind === 'project' && sp.projectId === project.id)) : []
  const canSplit = partners.length > 1
  const [split, setSplit] = useState(canSplit)
  const renew = async () => {
    setBusy(true)
    const today = F.today()
    await attempt(async () => {
      await save('rental', {
        ...r, status: 'active', expiryDate: until,
        renewals: [...r.renewals, { id: newId(), date: today, from: r.expiryDate ?? today, to: until, cost: recordCost ? c : 0, price: recordPrice ? p : 0, note: '' }],
      })
      const txn = { method: 'Cash', date: today, projectId: r.projectId ?? null, customerId: r.customerId ?? null, createdAt: Date.now() }
      if (recordCost && c > 0) await save('txn', { ...txn, id: newId(), kind: 'expense', amount: c, currency: r.costCurrency, category: 'Hosting & domains', note: `${label} renewal`, customerId: null })
      if (recordPrice && p > 0) await save('txn', { ...txn, id: newId(), kind: 'income', amount: p, currency: r.priceCurrency, category: 'Rentals', note: `${label}${clientOf(r) ? ' · ' + clientOf(r) : ''}` })
      if (split && canSplit && project && p > 0) {
        await addRentalSplit(project.id, {
          date: today, title: `${clientOf(r) || label} · until ${F.dateShort(until)}`, amount: p,
          cost: recordCost && r.costCurrency === r.priceCurrency ? c : 0, currency: r.priceCurrency, rentalId: r.id, note: '',
        })
      }
      toast(`Renewed until ${F.dateShort(until)}`)
    })
    setBusy(false)
    close()
  }
  return (
    <>
      <SheetTitle title={`Renew ${label}`} sub={r.expiryDate != null ? `Now expires ${F.date(r.expiryDate)}` : undefined} />
      <div class="body">
        <DateField label="New expiry date" value={until} onChange={v => setUntil(v ?? nextExpiry(r))} clearable={false} />
        <div class="card in-card">
          <SwitchRow title="I paid the provider" sub="Adds it to your expenses" on={recordCost} onChange={setRecordCost} />
          {recordCost && <Field label={`Amount (${r.costCurrency})`} value={cost} inputMode="decimal" onInput={setCost} />}
          <SwitchRow title="The client paid me" sub="Adds it to your income" on={recordPrice} onChange={setRecordPrice} />
          {recordPrice && <Field label={`Amount (${r.priceCurrency})`} value={price} inputMode="decimal" onInput={setPrice} />}
        </div>
        {canSplit && recordPrice && <div class="card in-card">
          <SwitchRow title="Split it with partners" sub={`${partners.map(x => `${x.name} ${x.share}%`).join(' · ')}. You can change the amounts later in ${project!.name} › Partners.`} on={split} onChange={setSplit} />
        </div>}
        <Btn block busy={busy} icon="sync" onClick={renew}>Renew until {F.dateShort(until)}</Btn>
      </div>
    </>
  )
}
