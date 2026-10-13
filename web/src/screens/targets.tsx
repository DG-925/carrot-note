// Monthly targets: "earn 20,000 EGP", "sell 10 laptops", "4 new clients"… with progress rings on Home.

import { useState } from 'preact/hooks'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { getState, remove, save, useApp } from '../store'
import { duration, newId, type Tables, type Target } from '../types'
import { Btn, Chips, CurrencyField, Empty, Field, FieldLabel, Form, Hint, PageHeader, Ring, Round, Tile, openForm } from '../ui'

export const metrics: { value: string; label: string; icon: string; money: boolean; unit?: string }[] = [
  { value: 'income', label: 'Income', icon: 'income', money: true },
  { value: 'profit', label: 'Profit', icon: 'chart', money: true },
  { value: 'sold', label: 'Pieces sold', icon: 'box', money: false, unit: 'pieces' },
  { value: 'clients', label: 'New clients', icon: 'users', money: false, unit: 'clients' },
  { value: 'hours', label: 'Hours worked', icon: 'timer', money: false, unit: 'h' },
]
const metricOf = (m: string) => metrics.find(x => x.value === m) ?? metrics[0]

/** How far this month's numbers are towards a target. */
export function progressOf(t: Target, data: Tables) {
  const today = F.today()
  const start = F.monthStart(today)
  const tx = data.txn.filter(x => x.date >= start && x.date <= today && x.currency === t.currency)
  let value = 0
  switch (t.metric) {
    case 'income': value = tx.filter(x => x.kind === 'income').reduce((a, x) => a + x.amount, 0); break
    case 'profit': value = tx.reduce((a, x) => a + (x.kind === 'income' ? x.amount : -x.amount), 0); break
    case 'sold': value = data.item.reduce((a, it) => a + it.moves.filter(m => m.kind === 'sell' && m.date >= start).reduce((b, m) => b + m.qty, 0), 0); break
    case 'clients': value = data.customer.filter(c => F.dayOfMs(c.createdAt) >= start).length; break
    case 'hours': value = F.hours(data.time.filter(x => F.dayOfMs(x.start) >= start).reduce((a, x) => a + duration(x), 0)); break
  }
  // Where we'd expect to be by today, if the month went evenly.
  const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const expected = (t.amount * new Date().getDate()) / days
  return { value, ratio: t.amount > 0 ? value / t.amount : 0, ahead: value >= expected }
}
const show = (t: Target, v: number) => {
  const m = metricOf(t.metric)
  if (m.money) return F.money(v, t.currency)
  if (m.value === 'hours') return `${v.toFixed(1)} h`
  const n = Math.round(v)
  return `${n} ${n === 1 ? m.unit!.replace(/s$/, '') : m.unit}`
}
/** "8 of 10 pieces": the unit only once. */
const showOf = (t: Target, v: number) => {
  const m = metricOf(t.metric)
  return m.money || m.value === 'hours' ? `${show(t, v)} of ${show(t, t.amount)}` : `${Math.round(v)} of ${show(t, t.amount)}`
}

/** The Home card: one ring per target. */
export function TargetsCard() {
  const s = useApp()
  const list = s.data.target
  if (!list.length) return null
  return (
    <Tile color="lilac" i={4} onClick={() => push({ name: 'targets' })}>
      <div class="row"><Icon name="flag" size={16} /><h3 class="h-md grow">This month's targets</h3><Icon name="right" size={13} /></div>
      <div class="target-rings">
        {list.map(t => {
          const p = progressOf(t, s.data)
          return (
            <div key={t.id} class="target-ring">
              <Ring value={p.ratio} size={64} stroke={6} color={p.ratio >= 1 ? 'var(--good)' : 'var(--accent)'}>{Math.min(999, Math.round(p.ratio * 100))}%</Ring>
              <div class="tiny semibold ellipsis">{metricOf(t.metric).label}</div>
              <div class="tiny ellipsis amt" style={{ opacity: .75 }}>{show(t, p.value)}</div>
            </div>
          )
        })}
      </div>
    </Tile>
  )
}

export function TargetsScreen() {
  const s = useApp()
  const list = s.data.target
  const day = new Date().getDate(), days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  return (
    <>
      <div class="scroll">
        <PageHeader title="Monthly targets" onBack={popNav}><Round icon="plus" label="New target" onClick={() => editTarget()} /></PageHeader>
        <div class="content no-tabbar">
          {!list.length && <Empty icon="flag" title="No targets yet" text="Set a goal for each month, like earning 20,000 EGP, selling 10 laptops or getting 4 new clients, and watch the rings fill up.">
            <Btn icon="plus" onClick={() => editTarget()}>Add a target</Btn>
          </Empty>}
          {list.length > 0 && <Hint>Day {day} of {days}. Targets start again on the 1st of each month.</Hint>}
          {list.map((t, i) => {
            const p = progressOf(t, s.data)
            const left = Math.max(0, t.amount - p.value)
            return (
              <div key={t.id} class="card press pop row" style={{ '--i': i + 1 } as any} onClick={() => editTarget(t)}>
                <Ring value={p.ratio} size={70} stroke={6} color={p.ratio >= 1 ? 'var(--good)' : 'var(--accent)'}>{Math.round(p.ratio * 100)}%</Ring>
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="h-sm">{metricOf(t.metric).label}</div>
                  <div class="small num amt bidi">{showOf(t, p.value)}</div>
                  <div class={'tiny bold ' + (p.ratio >= 1 ? 'good' : p.ahead ? 'good' : 'warn')}>
                    {p.ratio >= 1 ? 'Done this month 🎉' : `${show(t, left)} to go · ${p.ahead ? 'on track' : 'behind'}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editTarget()}><Icon name="plus" size={15} />Target</button>
    </>
  )
}

function editTarget(item?: Target) {
  openForm(close => <TargetForm item={item} close={close} />)
}

function TargetForm({ item, close }: { item?: Target; close: () => void }) {
  const base: Target = item ?? { id: newId(), metric: 'income', amount: 0, currency: getState().settings.currency, createdAt: Date.now() }
  const [t, set] = useState(base)
  const [amount, setAmount] = useState(F.amountText(base.amount))
  const up = (x: Partial<Target>) => set({ ...t, ...x })
  const m = metricOf(t.metric)
  return (
    <Form title={item ? 'Edit target' : 'New target'} close={close} saveEnabled={(F.parseAmount(amount) ?? 0) > 0}
      onSave={async () => { await save('target', { ...t, amount: F.parseAmount(amount) ?? 0 }); close() }}
      onDelete={item ? () => { remove('target', item.id); close() } : undefined}>
      <FieldLabel>What to count</FieldLabel>
      <Chips wrap options={metrics.map(x => x.value)} value={t.metric} onChange={v => up({ metric: v })} label={v => metricOf(v).label} icon={v => metricOf(v).icon} />
      <div class="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1.4 }}><Field label={m.money ? 'Each month' : `Each month (${m.unit})`} value={amount} inputMode="decimal" onInput={setAmount} autoFocus={!item} /></div>
        {m.money && <div style={{ flex: 1 }}><CurrencyField value={t.currency} onChange={v => up({ currency: v })} /></div>}
      </div>
      <Hint>{m.money ? `Counts money in ${t.currency} recorded this month.` : t.metric === 'sold' ? 'Counts stock pieces sold this month.' : t.metric === 'clients' ? 'Counts customers added this month.' : 'Counts time tracked this month.'}</Hint>
    </Form>
  )
}
