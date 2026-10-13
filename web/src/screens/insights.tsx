// Insights: how the business is doing, from the data already in the app. Money in and out over the
// last 12 months, best clients, most profitable projects, rental income, stock that sells fastest
// and how many quotes turn into work.

import { useState } from 'preact/hooks'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { projectReceived } from '../rows'
import { useApp } from '../store'
import { Bar, Card, Chips, Eyebrow, Hero, Hint, PageHeader } from '../ui'
import { dateLocale } from '../i18n'
import { monthlyTotals } from './rentals'
import { stockOf } from './stock'
import { quoteState } from './quotes'
import { invoiceState, invoiceTotals } from './invoices'

const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString(dateLocale(), { month: 'short' })

let savedRange = '12'

export function InsightsScreen() {
  const s = useApp()
  const { data } = s
  const cur = s.settings.currency
  const [range, setRangeState] = useState(savedRange)
  const setRange = (r: string) => { savedRange = r; setRangeState(r) }
  const months = Number(range)
  const now = new Date()
  const today = F.today()
  const from = F.toEpochDay(new Date(now.getFullYear(), now.getMonth() - months + 1, 1))
  const tx = data.txn.filter(t => t.date >= from && t.date <= today && t.currency === cur)

  // Money in and out per month.
  const series = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
    const a = F.toEpochDay(d), b = F.toEpochDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    const inc = tx.filter(t => t.kind === 'income' && t.date >= a && t.date <= b).reduce((x, t) => x + t.amount, 0)
    const exp = tx.filter(t => t.kind === 'expense' && t.date >= a && t.date <= b).reduce((x, t) => x + t.amount, 0)
    return { label: monthLabel(d.getFullYear(), d.getMonth()), inc, exp }
  })
  const max = Math.max(1, ...series.map(m => Math.max(m.inc, m.exp)))
  const income = series.reduce((a, m) => a + m.inc, 0), spent = series.reduce((a, m) => a + m.exp, 0)
  const best = series.reduce((a, m) => (m.inc - m.exp > a.inc - a.exp ? m : a), series[0])

  // Best clients.
  const names = Object.fromEntries(data.customer.map(c => [c.id, c.name]))
  const projects = Object.fromEntries(data.project.map(p => [p.id, p]))
  const byClient = new Map<string, number>()
  for (const t of tx) {
    if (t.kind !== 'income') continue
    const who = (t.customerId && names[t.customerId]) || (t.projectId && (projects[t.projectId]?.clientName || projects[t.projectId]?.name)) || ''
    if (who) byClient.set(who, (byClient.get(who) ?? 0) + t.amount)
  }
  const clients = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Most profitable projects (all time, main currency).
  const projectProfit = data.project.filter(p => p.currency === cur).map(p => {
    const got = projectReceived(p, data.txn)
    const costs = data.txn.filter(t => t.projectId === p.id && t.kind === 'expense' && t.currency === cur).reduce((a, t) => a + t.amount, 0)
    return { p, profit: got - costs }
  }).filter(x => x.profit !== 0).sort((a, b) => b.profit - a.profit).slice(0, 5)

  // Rentals.
  const activeRentals = data.rental.filter(r => r.status === 'active')
  const mrr = monthlyTotals(activeRentals)
  const stopped = data.rental.filter(r => r.status !== 'active').length
  const soon = activeRentals.filter(r => r.expiryDate != null && r.expiryDate >= today && r.expiryDate <= today + 30).length

  // Stock that sells fastest (last 90 days) and best margins.
  const sold90 = data.item.map(it => {
    const st = stockOf(it)
    const units = it.moves.filter(m => m.kind === 'sell' && m.date >= today - 90).reduce((a, m) => a + m.qty, 0)
    return { it, units, margin: it.sellPrice - st.avg, profit: st.profit }
  })
  const fastest = sold90.filter(x => x.units > 0).sort((a, b) => b.units - a.units).slice(0, 5)

  // Quotes and invoices.
  const decided = data.quote.filter(q => ['accepted', 'declined'].includes(quoteState(q)))
  const won = decided.filter(q => quoteState(q) === 'accepted').length
  const paidInvoices = data.invoice.filter(i => invoiceState(i) === 'paid' && i.payments.length)
  const daysToPay = paidInvoices.length
    ? Math.round(paidInvoices.reduce((a, i) => a + Math.max(0, Math.max(...i.payments.map(p => p.date)) - i.issueDate), 0) / paidInvoices.length) : null
  const owed = F.sumBy(data.invoice.filter(i => ['sent', 'partial', 'overdue'].includes(invoiceState(i))), i => i.currency, i => invoiceTotals(i).due)

  const topClient = clients[0]?.[1] ?? 1
  const topProject = Math.max(1, ...projectProfit.map(x => Math.abs(x.profit)))
  const topUnits = fastest[0]?.units ?? 1
  return (
    <div class="scroll">
      <PageHeader title="Insights" onBack={popNav} />
      <div class="content no-tabbar">
        <div class="pop wide" style={{ '--i': 1 } as any}>
          <Chips options={['3', '6', '12']} value={range} onChange={setRange} label={v => `Last ${v} months`} />
        </div>
        <Hero i={2}>
          <Eyebrow>Profit · last {months} months</Eyebrow>
          <div class="h-display num amt">{F.money(income - spent, cur)}</div>
          <div class="row" style={{ marginTop: 12 }}>
            <div class="grow"><div class="eyebrow">Came in</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(income, cur)}</div></div>
            <div class="grow"><div class="eyebrow">Went out</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(spent, cur)}</div></div>
            <div class="grow"><div class="eyebrow">Best month</div><div class="h-sm" style={{ fontWeight: 800 }}>{best && best.inc - best.exp > 0 ? best.label : '—'}</div></div>
          </div>
        </Hero>
        <Card i={3} class="wide">
          <div class="row" style={{ marginBottom: 12 }}><h3 class="h-md grow">Money in and out</h3>
            <span class="legend-dot" style={{ background: 'var(--good)' }} /><span class="tiny muted">In</span>
            <span class="legend-dot" style={{ background: 'var(--accent)' }} /><span class="tiny muted">Out</span></div>
          <div class="year-bars">
            {series.map((m, i) => (
              <div key={i} class="yb">
                <div class="pair"><i style={{ height: `${(m.inc / max) * 100}%`, background: 'var(--good)' }} /><i style={{ height: `${(m.exp / max) * 100}%`, background: 'var(--accent)' }} /></div>
                <span>{m.label.slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <Hint>In {cur} only. Money in other currencies isn't counted here.</Hint>
        </Card>

        <Card i={4}>
          <h3 class="h-md" style={{ marginBottom: 10 }}>Best clients</h3>
          {!clients.length && <p class="muted small">No income from clients in this time.</p>}
          {clients.map(([k, v]) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <div class="row"><span class="grow semibold ellipsis">{k}</span><b class="num amt">{F.money(v, cur)}</b></div>
              <div style={{ marginTop: 4 }}><Bar value={v / topClient} color="var(--good)" height={6} /></div>
            </div>
          ))}
        </Card>

        <Card i={5}>
          <h3 class="h-md" style={{ marginBottom: 10 }}>Most profitable projects</h3>
          {!projectProfit.length && <p class="muted small">Record project payments and costs to see this.</p>}
          {projectProfit.map(({ p, profit }) => (
            <div key={p.id} style={{ marginBottom: 8 }} class="press" onClick={() => push({ name: 'project', id: p.id })}>
              <div class="row"><span class="grow semibold ellipsis">{p.name}</span><b class={'num amt' + (profit < 0 ? ' bad' : '')}>{F.money(profit, cur)}</b></div>
              <div style={{ marginTop: 4 }}><Bar value={Math.abs(profit) / topProject} color={profit < 0 ? 'var(--bad)' : 'var(--accent)'} height={6} /></div>
            </div>
          ))}
        </Card>

        <Card i={6}>
          <h3 class="h-md" style={{ marginBottom: 10 }}>Rentals</h3>
          <div class="totals-list">
            <div><span>Renters pay you each month</span><b class="num amt good">{F.totals(mrr.income, cur)}</b></div>
            <div><span>Profit each month</span><b class="num amt">{F.totals(mrr.profit, cur)}</b></div>
            <div><span>Active</span><b class="num">{activeRentals.length}</b></div>
            <div><span>Renewing in the next 30 days</span><b class="num">{soon}</b></div>
            <div class="strong"><span>Stopped</span><b class="num">{stopped}</b></div>
          </div>
        </Card>

        <Card i={7}>
          <h3 class="h-md" style={{ marginBottom: 10 }}>Selling fastest · 90 days</h3>
          {!fastest.length && <p class="muted small">No stock sold in the last 90 days.</p>}
          {fastest.map(x => (
            <div key={x.it.id} style={{ marginBottom: 8 }} class="press" onClick={() => push({ name: 'item', id: x.it.id })}>
              <div class="row"><span class="grow semibold ellipsis">{x.it.name}</span><b class="num">{x.units} sold</b></div>
              <div class="row tiny muted"><span class="grow">Profit each {F.money(x.margin, x.it.currency)}</span></div>
              <div style={{ marginTop: 4 }}><Bar value={x.units / topUnits} color="var(--sky-strong, #3b82f6)" height={6} /></div>
            </div>
          ))}
        </Card>

        <Card i={8}>
          <h3 class="h-md" style={{ marginBottom: 10 }}>Quotes & invoices</h3>
          <div class="totals-list">
            <div><span>Quotes accepted</span><b class="num">{decided.length ? `${won} of ${decided.length} · ${Math.round((won / decided.length) * 100)}%` : '—'}</b></div>
            <div><span>Days clients take to pay</span><b class="num">{daysToPay == null ? '—' : F.plural(daysToPay, 'day')}</b></div>
            <div class="strong"><span>Still owed to you</span><b class="num amt">{F.totals(owed, cur)}</b></div>
          </div>
        </Card>
        {!data.txn.length && <Hint><Icon name="info" size={13} /> Insights fill in as you record income, expenses, projects and sales.</Hint>}
      </div>
    </div>
  )
}
