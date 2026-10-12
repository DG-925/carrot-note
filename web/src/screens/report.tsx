// Yearly report: income, spending and profit by month, client and category, hours and invoices,
// with a PDF for an accountant.

import { useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav } from '../nav'
import { useApp } from '../store'
import { duration } from '../types'
import { Bar, Btn, Card, Eyebrow, Hero, Hint, PageHeader, Round, attempt } from '../ui'
import { invoiceState, invoiceTotals } from './invoices'
import { dateLocale } from '../i18n'

const monthNames = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(dateLocale(), { month: 'short' }))

let savedYear: number | null = null

function useReport(year: number) {
  const s = useApp()
  const cur = s.settings.currency
  const start = F.toEpochDay(new Date(year, 0, 1)), end = F.toEpochDay(new Date(year, 11, 31))
  const tx = s.data.txn.filter(t => t.date >= start && t.date <= end)
  const main = tx.filter(t => t.currency === cur)
  const other = tx.filter(t => t.currency !== cur)
  const months = Array.from({ length: 12 }, (_, m) => {
    const a = F.toEpochDay(new Date(year, m, 1)), b = F.toEpochDay(new Date(year, m + 1, 0))
    const inc = main.filter(t => t.kind === 'income' && t.date >= a && t.date <= b).reduce((x, t) => x + t.amount, 0)
    const exp = main.filter(t => t.kind === 'expense' && t.date >= a && t.date <= b).reduce((x, t) => x + t.amount, 0)
    return { m, inc, exp, net: inc - exp }
  })
  const income = months.reduce((a, x) => a + x.inc, 0)
  const expense = months.reduce((a, x) => a + x.exp, 0)
  const names = Object.fromEntries(s.data.customer.map(c => [c.id, c.name]))
  const projects = Object.fromEntries(s.data.project.map(p => [p.id, p]))
  const group = (list: typeof main, key: (t: (typeof main)[number]) => string) => {
    const m = new Map<string, number>()
    for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + t.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const clients = group(main.filter(t => t.kind === 'income'), t =>
    (t.customerId && names[t.customerId]) || (t.projectId && (projects[t.projectId]?.clientName || projects[t.projectId]?.name)) || t.category)
  const categories = group(main.filter(t => t.kind === 'expense'), t => t.category)
  const hours = new Map<string, number>()
  for (const e of s.data.time) {
    if (F.dayOfMs(e.start) < start || F.dayOfMs(e.start) > end) continue
    const k = projects[e.projectId ?? '']?.name ?? 'No project'
    hours.set(k, (hours.get(k) ?? 0) + duration(e))
  }
  const hoursList = [...hours.entries()].sort((a, b) => b[1] - a[1])
  const invoices = s.data.invoice.filter(i => i.issueDate >= start && i.issueDate <= end && invoiceState(i) !== 'cancelled' && invoiceState(i) !== 'draft')
  const inv = {
    count: invoices.length,
    total: F.sumBy(invoices, i => i.currency, i => invoiceTotals(i).total),
    paid: F.sumBy(invoices, i => i.currency, i => invoiceTotals(i).paid),
    due: F.sumBy(invoices, i => i.currency, i => invoiceTotals(i).due),
  }
  const otherTotals = {
    income: F.sumBy(other.filter(t => t.kind === 'income'), t => t.currency, t => t.amount),
    expense: F.sumBy(other.filter(t => t.kind === 'expense'), t => t.currency, t => t.amount),
  }
  return { cur, months, income, expense, clients, categories, hoursList, inv, otherTotals, count: tx.length }
}

export function ReportScreen() {
  const s = useApp()
  const thisYear = new Date().getFullYear()
  const [year, setYearState] = useState(savedYear ?? thisYear)
  const setYear = (y: number) => { savedYear = y; setYearState(y) }
  const r = useReport(year)
  const max = Math.max(1, ...r.months.map(m => Math.max(m.inc, m.exp)))
  const m = (v: number) => F.money(v, r.cur)
  const exportPdf = () => {
    const u = s.user
    const doc = {
      file: `carrot-note-report-${year}`, title: `REPORT ${year}`, subtitle: `Income, spending and profit in ${r.cur}`,
      headerRight: [u?.name || (u ? '@' + u.username : ''), u?.email ?? ''].filter(Boolean),
      footer: `Made with Carrot Note · ${new Date().toLocaleDateString()}`,
      blocks: [
        { type: 'totals', rows: [['Income', m(r.income)], ['Spending', m(r.expense)], ['Profit', m(r.income - r.expense), true]] },
        { type: 'heading', text: 'By month' },
        { type: 'table', columns: [{ title: 'Month', weight: 1.4 }, { title: 'Income', weight: 1.5, align: 'right' }, { title: 'Spending', weight: 1.5, align: 'right' }, { title: 'Profit', weight: 1.5, align: 'right' }],
          rows: r.months.map(x => [monthNames[x.m], m(x.inc), m(x.exp), m(x.net)]) },
        { type: 'heading', text: 'Income by client' },
        { type: 'table', columns: [{ title: 'Client', weight: 3 }, { title: 'Amount', weight: 1.5, align: 'right' }, { title: 'Share', weight: 0.8, align: 'right' }],
          rows: r.clients.map(([k, v]) => [k, m(v), `${Math.round((v / (r.income || 1)) * 100)}%`]) },
        { type: 'heading', text: 'Spending by category' },
        { type: 'table', columns: [{ title: 'Category', weight: 3 }, { title: 'Amount', weight: 1.5, align: 'right' }, { title: 'Share', weight: 0.8, align: 'right' }],
          rows: r.categories.map(([k, v]) => [k, m(v), `${Math.round((v / (r.expense || 1)) * 100)}%`]) },
        ...(r.hoursList.length ? [{ type: 'heading', text: 'Hours tracked' }, { type: 'table', columns: [{ title: 'Project', weight: 3 }, { title: 'Hours', weight: 1, align: 'right' }],
          rows: r.hoursList.map(([k, v]) => [k, F.hours(v).toFixed(1)]) }] : []),
        ...(r.inv.count ? [{ type: 'heading', text: 'Invoices' }, { type: 'totals', rows: [['Invoices sent', String(r.inv.count)], ['Invoiced', F.totals(r.inv.total, r.cur)], ['Paid', F.totals(r.inv.paid, r.cur)], ['Still owed', F.totals(r.inv.due, r.cur), true]] }] : []),
        ...(Object.keys(r.otherTotals.income).length || Object.keys(r.otherTotals.expense).length
          ? [{ type: 'text', text: `Also in other currencies: income ${F.totals(r.otherTotals.income, r.cur)}, spending ${F.totals(r.otherTotals.expense, r.cur)}.` }] : []),
      ],
    }
    attempt(() => call('pdf.share', { doc }))
  }
  return (
    <div class="scroll">
      <PageHeader title="Yearly report" onBack={popNav}>
        <Round icon="download" label="Export PDF" onClick={exportPdf} />
      </PageHeader>
      <div class="content no-tabbar">
        <div class="card pop row wide" style={{ '--i': 1, padding: 6, borderRadius: 99 } as any}>
          <Round icon="left" sm onBg label="Previous year" onClick={() => setYear(year - 1)} />
          <div class="grow center h-sm">{year}</div>
          <Round icon="right" sm onBg label="Next year" onClick={() => year < thisYear && setYear(year + 1)} />
        </div>
        <Hero i={2}>
          <Eyebrow>Profit in {year}</Eyebrow>
          <div class="h-display num amt">{m(r.income - r.expense)}</div>
          <div class="row" style={{ marginTop: 12 }}>
            <div class="grow"><div class="eyebrow">↓ Income</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{m(r.income)}</div></div>
            <div class="grow"><div class="eyebrow">↑ Spending</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{m(r.expense)}</div></div>
          </div>
        </Hero>
        {!r.count && <Hint>Nothing recorded in {year}.</Hint>}
        <Card i={3} class="wide">
          <div class="row" style={{ marginBottom: 12 }}><h3 class="h-md grow">By month</h3>
            <span class="legend-dot" style={{ background: 'var(--good)' }} /><span class="tiny muted">In</span>
            <span class="legend-dot" style={{ background: 'var(--accent)' }} /><span class="tiny muted">Out</span></div>
          <div class="year-bars">
            {r.months.map(x => (
              <div key={x.m} class="yb">
                <div class="pair"><i style={{ height: `${(x.inc / max) * 100}%`, background: 'var(--good)' }} /><i style={{ height: `${(x.exp / max) * 100}%`, background: 'var(--accent)' }} /></div>
                <span>{monthNames[x.m].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </Card>
        <RankList i={4} title="Income by client" list={r.clients} total={r.income} cur={r.cur} color="var(--good)" empty="No income this year." />
        <RankList i={5} title="Spending by category" list={r.categories} total={r.expense} cur={r.cur} color="var(--accent)" empty="No spending this year." />
        {r.hoursList.length > 0 && <Card i={6}>
          <h3 class="h-md" style={{ marginBottom: 8 }}>Hours tracked</h3>
          {r.hoursList.map(([k, v]) => <div key={k} class="row" style={{ padding: '6px 0' }}><Icon name="timer" size={14} class="muted" /><span class="grow semibold ellipsis">{k}</span><b class="num">{F.hours(v).toFixed(1)} h</b></div>)}
        </Card>}
        {r.inv.count > 0 && <Card i={7}>
          <h3 class="h-md" style={{ marginBottom: 8 }}>Invoices</h3>
          <div class="totals-list">
            <div><span>Sent</span><b>{r.inv.count}</b></div>
            <div><span>Invoiced</span><b class="num amt">{F.totals(r.inv.total, r.cur)}</b></div>
            <div><span>Paid</span><b class="num amt good">{F.totals(r.inv.paid, r.cur)}</b></div>
            <div class="strong"><span>Still owed</span><b class="num amt">{F.totals(r.inv.due, r.cur)}</b></div>
          </div>
        </Card>}
        {(Object.keys(r.otherTotals.income).length > 0 || Object.keys(r.otherTotals.expense).length > 0) &&
          <Hint>Amounts above are in {r.cur}. Also in other currencies: income {F.totals(r.otherTotals.income, r.cur)}, spending {F.totals(r.otherTotals.expense, r.cur)}.</Hint>}
        <Btn block icon="download" onClick={exportPdf}>Export PDF for your accountant</Btn>
      </div>
    </div>
  )
}

function RankList({ title, list, total, cur, color, empty, i }: { title: string; list: [string, number][]; total: number; cur: string; color: string; empty: string; i: number }) {
  const top = list[0]?.[1] ?? 1
  return (
    <Card i={i}>
      <h3 class="h-md" style={{ marginBottom: 10 }}>{title}</h3>
      {!list.length && <p class="muted small" style={{ margin: 0 }}>{empty}</p>}
      <div class="col">
        {list.slice(0, 10).map(([k, v]) => (
          <div key={k}>
            <div class="row"><span class="grow semibold ellipsis">{k}</span><span class="num bold amt">{F.money(v, cur)}</span><span class="tiny muted num" style={{ width: 36, textAlign: 'end' }}>{Math.round((v / (total || 1)) * 100)}%</span></div>
            <div style={{ marginTop: 6 }}><Bar value={v / top} color={color} height={6} /></div>
          </div>
        ))}
      </div>
    </Card>
  )
}
