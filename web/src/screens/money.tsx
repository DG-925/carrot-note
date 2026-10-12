import { useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { editBudget, editTxn, openConverter } from '../editors'
import { categoryIcon, Icon, methodIcon } from '../icons'
import { TxnRow } from '../rows'
import { useApp } from '../store'
import { push } from '../nav'
import { convertTotal, useRates } from '../rates'
import type { Txn } from '../types'
import { Bar, Btn, Card, Chips, CountMoney, Empty, Eyebrow, Hero, MainHeader, Round, SearchBar, Seg, attempt, matches } from '../ui'
import { PrivacyButton } from './home'

let savedMonth: number | null = null
let savedTab = 0

export function MoneyScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const [month, setMonthState] = useState(savedMonth ?? F.monthStart(F.today()))
  const [dir, setDir] = useState<'l' | 'r' | ''>('')
  const [tab, setTabState] = useState(savedTab)
  const [filter, setFilter] = useState('all')
  const setMonth = (m: number) => { setDir(m > month ? 'l' : 'r'); savedMonth = m; setMonthState(m) }
  const setTab = (t: number) => { savedTab = t; setTabState(t) }

  const end = F.monthEnd(month)
  const monthTx = s.data.txn.filter(t => t.date >= month && t.date <= end)
  const expense = monthTx.filter(t => t.kind === 'expense')
  const incomeSum = F.sumBy(monthTx.filter(t => t.kind === 'income'), t => t.currency, t => t.amount)
  const expenseSum = F.sumBy(expense, t => t.currency, t => t.amount)
  const net: Record<string, number> = {}
  for (const c of new Set([...Object.keys(incomeSum), ...Object.keys(expenseSum)])) net[c] = (incomeSum[c] ?? 0) - (expenseSum[c] ?? 0)
  const inc = incomeSum[cur] ?? 0, exp = expenseSum[cur] ?? 0

  return (
    <div class="scroll">
      <MainHeader title="Money" sub="Income, spending and budgets" />
      <div class="content">
        <div class="card pop row wide" style={{ '--i': 1, padding: 6, borderRadius: 99 } as any}>
          <Round icon="left" sm onBg label="Previous month" onClick={() => setMonth(F.addMonths(month, -1))} />
          <div key={month} class={'grow center h-sm ' + (dir === 'l' ? 'slide-l' : dir === 'r' ? 'slide-r' : '')}>{F.month(month)}</div>
          <Round icon="right" sm onBg label="Next month" onClick={() => setMonth(F.addMonths(month, 1))} />
        </div>

        <Hero i={2}>
          <div class="row"><div class="grow"><Eyebrow>Balance</Eyebrow></div>
            <div class="hero-tools">
              <button class="hero-eye press" aria-label="Currency converter" onClick={openConverter}><Icon name="convert" size={16} /></button>
              <PrivacyButton />
            </div>
          </div>
          <CountMoney totals={net} currency={cur} sign class="h-display amt" />
          <InMain totals={net} cur={cur} />
          <div class="row" style={{ marginTop: 14, gap: 3, height: 12 }}>
            {inc + exp > 0
              ? <>
                <i style={{ flex: inc || 0.0001, height: '100%', borderRadius: 6, background: '#fff', transition: 'flex 1s' }} />
                <i style={{ flex: exp || 0.0001, height: '100%', borderRadius: 6, background: 'rgba(255,255,255,.35)', transition: 'flex 1s' }} />
              </>
              : <i style={{ flex: 1, height: '100%', borderRadius: 6, background: 'rgba(255,255,255,.22)' }} />}
          </div>
          <div class="row" style={{ marginTop: 12 }}>
            <div class="grow"><div class="eyebrow">↓ Income</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{F.totals(incomeSum, cur)}</div></div>
            <div class="grow"><div class="eyebrow">↑ Spent</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{F.totals(expenseSum, cur)}</div></div>
          </div>
          <div class="row" style={{ marginTop: 16 }}>
            <button class="hero-btn" onClick={() => editTxn(undefined, { kind: 'expense' })}><Icon name="expense" size={13} />Expense</button>
            <button class="hero-btn" onClick={() => editTxn(undefined, { kind: 'income' })}><Icon name="income" size={13} />Income</button>
          </div>
        </Hero>

        <Seg i={3} options={[{ label: 'Transactions', icon: 'receipt' }, { label: 'Summary', icon: 'chart' }]} value={tab} onChange={setTab} />

        {tab === 0
          ? <Transactions list={monthTx.filter(t => filter === 'all' || t.kind === filter)} filter={filter} setFilter={setFilter} />
          : <Summary expense={expense} month={month} end={end} />}
      </div>
    </div>
  )
}

let savedQuery = ''

function Transactions({ list: all, filter, setFilter }: { list: Txn[]; filter: string; setFilter: (f: string) => void }) {
  const s = useApp()
  const cur = s.settings.currency
  const [query, setQueryState] = useState(savedQuery)
  const setQuery = (q: string) => { savedQuery = q; setQueryState(q) }
  const names = Object.fromEntries([...s.data.project, ...s.data.customer].map(x => [x.id, x.name]))
  const list = all.filter(t => matches(query, t.note, t.category, t.method, F.amount(t.amount), t.amount, names[t.projectId ?? ''], names[t.customerId ?? '']))
  const days = [...new Set(list.map(t => t.date))].sort((a, b) => b - a)
  return (
    <>
      <SearchBar value={query} onInput={setQuery} placeholder="Search by note, category, amount…" />
      <Chips options={['all', 'expense', 'income']} value={filter} onChange={setFilter} label={v => ({ all: 'All', expense: 'Expenses', income: 'Income' } as any)[v]} />
      {query.trim() && <div class="small muted semibold" style={{ padding: '0 4px' }}>{F.plural(list.length, 'result')} this month</div>}
      {!list.length && (query.trim()
        ? <Empty icon="search" title="No matches" text="Try another word, or check another month." />
        : <Empty icon="receipt" title="Nothing this month" text="Use + Expense or + Income above to add one." />)}
      {days.map((d, i) => {
        const dayTx = list.filter(t => t.date === d).sort((a, b) => b.createdAt - a.createdAt)
        const got = F.sumBy(dayTx.filter(t => t.kind === 'income'), t => t.currency, t => t.amount)
        const spent = F.sumBy(dayTx.filter(t => t.kind === 'expense'), t => t.currency, t => t.amount)
        return (
          <div key={d} class="col tight pop" style={{ '--i': Math.min(i, 6) + 4 } as any}>
            <div class="row" style={{ padding: '6px 4px 0' }}>
              <div class="h-sm grow">{F.relativeDay(d)}</div>
              {Object.keys(got).length > 0 && <span class="num good small amt" style={{ fontWeight: 800 }}>+{F.totals(got, cur)}</span>}
              {Object.keys(spent).length > 0 && <span class="num muted small amt" style={{ fontWeight: 800 }}>−{F.totals(spent, cur)}</span>}
            </div>
            <div class="card flush">{dayTx.map(t => <TxnRow key={t.id} t={t} />)}</div>
          </div>
        )
      })}
    </>
  )
}

function groupTop(list: Txn[], key: (t: Txn) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + t.amount)
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1])
  if (sorted.length <= 6) return sorted
  return [...sorted.slice(0, 5), ['Other', sorted.slice(5).reduce((s, x) => s + x[1], 0)]]
}

function Summary({ expense, month, end }: { expense: Txn[]; month: number; end: number }) {
  const s = useApp()
  const cur = s.settings.currency
  const main = expense.filter(t => t.currency === cur)
  const daily = Array.from({ length: end - month + 1 }, (_, i) => main.filter(t => t.date === month + i).reduce((a, t) => a + t.amount, 0))
  const today = F.today()
  const todayIdx = today >= month && today <= end ? today - month : -1
  let lastSpent = -1
  daily.forEach((v, i) => { if (v > 0) lastSpent = i })
  const [sel, setSel] = useState(todayIdx >= 0 ? todayIdx : lastSpent)
  const max = Math.max(1, ...daily)
  const others = expense.filter(t => t.currency !== cur)
  return (
    <>
      <div class="card pop wide" style={{ '--i': 4 } as any}>
        <div class="row"><div class="grow"><h3 class="h-md">Daily spending</h3><div class="tiny muted">In {cur} · tap a day</div></div>
          {sel >= 0 && <div style={{ textAlign: 'end' }}><div class="tiny muted">Day {sel + 1}</div><div class="num h-sm" style={{ fontWeight: 800 }}>{F.money(daily[sel], cur)}</div></div>}
        </div>
        <div class="bars" style={{ marginTop: 14 }}>
          {daily.map((v, i) => (
            <button key={i} class={[i === sel ? 'sel' : '', i === todayIdx ? 'today' : '', v <= 0 ? 'zero' : ''].join(' ')} onClick={() => setSel(i)}>
              <i style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 3}%`, '--i': i } as any} />
            </button>
          ))}
        </div>
        <div class="row between tiny muted" style={{ marginTop: 6 }}><span>1</span><span>{daily.length}</span></div>
      </div>
      <RankCard i={5} title="Where your money went" items={groupTop(main, t => t.category)} icon={categoryIcon} color="var(--accent)" empty="No spending this month" footer={others.length ? 'Also in other currencies: ' + F.totals(F.sumBy(others, t => t.currency, t => t.amount), cur) : undefined} />
      <RankCard i={6} title="How you paid" items={groupTop(main, t => t.method)} icon={methodIcon} color="#7C5CE0" empty="Nothing yet" />
      <div class="grid2">
        <button class="tile t-mint press" onClick={() => push({ name: 'recurring' })}><span class="tile-ico"><Icon name="repeat" size={16} /></span><b>Recurring</b>
          <span class="tiny" style={{ opacity: .75 }}>{s.data.recurring.filter(r => r.active).length} active</span></button>
        <button class="tile t-lilac press" onClick={() => push({ name: 'report' })}><span class="tile-ico"><Icon name="chart" size={16} /></span><b>Yearly report</b>
          <span class="tiny" style={{ opacity: .75 }}>PDF for your accountant</span></button>
      </div>
      <Budgets expense={expense} />
      <Btn kind="soft-bg" icon="download" onClick={() => attempt(() => call('money.exportCsv'))}>Export all transactions (CSV)</Btn>
    </>
  )
}

function RankCard({ title, items, icon, color, empty, footer, i }: { title: string; items: [string, number][]; icon: (k: string) => string; color: string; empty: string; footer?: string; i: number }) {
  const cur = useApp().settings.currency
  const total = items.reduce((a, x) => a + x[1], 0) || 1
  const max = Math.max(...items.map(x => x[1]), 0.0001)
  return (
    <div class="card pop" style={{ '--i': i } as any}>
      <h3 class="h-md" style={{ marginBottom: 12 }}>{title}</h3>
      {!items.length && <p class="muted small" style={{ margin: 0 }}>{empty}</p>}
      <div class="col">
        {items.map(([k, v]) => (
          <div key={k} class="row">
            <div class="badge-ico" style={{ width: 38, height: 38, background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon name={icon(k)} size={16} /></div>
            <div class="grow">
              <div class="row"><span class="grow semibold ellipsis">{k}</span><span class="num" style={{ fontWeight: 800 }}>{F.money(v, cur)}</span></div>
              <div class="row" style={{ marginTop: 6 }}><div class="grow"><Bar value={v / max} color={color} height={6} /></div><span class="tiny muted num bold" style={{ width: 34, textAlign: 'end' }}>{Math.round((v / total) * 100)}%</span></div>
            </div>
          </div>
        ))}
      </div>
      {footer && <p class="small muted" style={{ margin: '10px 0 0' }}>{footer}</p>}
    </div>
  )
}

function Budgets({ expense }: { expense: Txn[] }) {
  const s = useApp()
  const list = [...s.data.budget].sort((a, b) => (a.category ? 1 : 0) - (b.category ? 1 : 0) || a.category.localeCompare(b.category))
  return (
    <>
      <div class="section-h"><h3>Monthly budgets</h3><Btn sm icon="plus" onClick={() => editBudget()}>Add</Btn></div>
      {!list.length && <p class="muted" style={{ margin: '0 4px' }}>Set a monthly spending limit, for everything or for one category like Food.</p>}
      {list.map(b => {
        const spent = expense.filter(t => t.currency === b.currency && (!b.category || t.category === b.category)).reduce((a, t) => a + t.amount, 0)
        const ratio = b.limit > 0 ? spent / b.limit : 0
        const [label, color, icon] = ratio > 1 ? ['Over budget', 'var(--bad)', 'warning'] : ratio >= 0.8 ? ['Almost there', 'var(--warn)', 'warning'] : ['On track', 'var(--good)', 'checkCircle']
        return (
          <Card key={b.id} onClick={() => editBudget(b)}>
            <div class="row">
              <div class="badge-ico" style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)' }}><Icon name={b.category ? categoryIcon(b.category) : 'wallet'} size={17} /></div>
              <div class="grow"><div class="h-sm">{b.category || 'All spending'}</div><div class="small semibold row" style={{ gap: 4, color }}><Icon name={icon} size={11} />{label}</div></div>
              <div style={{ textAlign: 'end' }}><div class="num h-sm" style={{ fontWeight: 800 }}>{F.money(spent, b.currency)}</div><div class="tiny muted">of {F.money(b.limit, b.currency)}</div></div>
            </div>
            <div style={{ margin: '12px 0 8px' }}><Bar value={ratio} height={10} color={color === 'var(--good)' ? 'var(--accent)' : color} /></div>
            <div class="small muted semibold">{spent <= b.limit ? `${F.money(b.limit - spent, b.currency)} left this month` : `${F.money(spent - b.limit, b.currency)} over the limit`}</div>
          </Card>
        )
      })}
    </>
  )
}

/** "≈ 12,400 EGP in total" under a total that mixes currencies, at live rates. */
export function InMain({ totals, cur }: { totals: Record<string, number>; cur: string }) {
  const mixed = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.0001).length > 1
  const rates = useRates(cur, mixed)
  if (!mixed) return null
  const v = convertTotal(totals, cur, rates)
  return <div class="small semibold amt" style={{ opacity: .9, marginTop: 2 }}>{v == null ? 'Converting…' : `≈ ${F.money(Math.round(v), cur)} in total at today's rates`}</div>
}
