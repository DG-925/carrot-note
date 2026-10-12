// Stock: physical things bought to sell again (PCs, phones, parts…). Every buy, sale and recount
// is a move on the item, so the count, the average cost and the profit of each sale stay right.

import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { CustomerPicker, viewPhoto } from '../editors'
import { Icon, methodIcon } from '../icons'
import { pop as popNav, push } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { Categories, newId, type StockItem, type StockMove } from '../types'
import {
  Btn, Card, Chips, CurrencyField, DateField, Empty, Eyebrow, Field, FieldLabel, Form, Hero, Hint, PageHeader, Round,
  SearchBar, Seg, SheetTitle, SwitchRow, attempt, cx, matches, openForm, openSheet, toast,
} from '../ui'

// ---------------------------------------------------------------- maths

const byTime = (a: StockMove, b: StockMove) => a.date - b.date || a.createdAt - b.createdAt

/** Replays the moves: how many are left, the average cost of one, and what sales brought in. */
export function stockOf(it: StockItem) {
  let qty = 0, avg = 0, sold = 0, revenue = 0, profit = 0, bought = 0, spent = 0
  for (const m of [...it.moves].sort(byTime)) {
    if (m.kind === 'buy') {
      const have = Math.max(qty, 0)
      avg = have + m.qty > 0 ? (avg * have + m.price * m.qty) / (have + m.qty) : m.price
      qty += m.qty; bought += m.qty; spent += m.price * m.qty
    } else if (m.kind === 'sell') {
      qty -= m.qty; sold += m.qty; revenue += m.price * m.qty
      profit += (m.price - (m.unitCost ?? avg)) * m.qty
    } else {
      qty += m.qty
    }
  }
  return { qty, avg, sold, revenue, profit, bought, spent, value: Math.max(qty, 0) * avg }
}

export type StockState = 'out' | 'low' | 'ok'
export function stockState(it: StockItem, qty = stockOf(it).qty): StockState {
  return qty <= 0 ? 'out' : qty <= it.lowStock ? 'low' : 'ok'
}
const stateColor: Record<StockState, string> = { out: 'var(--bad)', low: '#E08A00', ok: 'var(--good)' }

/** Sales of every item between two days: how many, what they brought in and the profit, by currency. */
export function salesBetween(items: StockItem[], from: number, to: number) {
  const revenue: Record<string, number> = {}, profit: Record<string, number> = {}
  let count = 0
  for (const it of items) {
    let qty = 0, avg = 0
    for (const m of [...it.moves].sort(byTime)) {
      if (m.kind === 'buy') { const have = Math.max(qty, 0); avg = have + m.qty > 0 ? (avg * have + m.price * m.qty) / (have + m.qty) : m.price; qty += m.qty }
      else if (m.kind === 'sell') {
        if (m.date >= from && m.date <= to) {
          count += m.qty
          revenue[it.currency] = (revenue[it.currency] ?? 0) + m.price * m.qty
          profit[it.currency] = (profit[it.currency] ?? 0) + (m.price - (m.unitCost ?? avg)) * m.qty
        }
        qty -= m.qty
      } else qty += m.qty
    }
  }
  return { count, revenue, profit }
}

export const conditions = ['new', 'used', 'refurbished']
const conditionLabel = (c: string) => ({ new: 'New', used: 'Used', refurbished: 'Refurbished' } as Record<string, string>)[c] ?? c

// ---------------------------------------------------------------- photos

const photos = new Map<string, string>()
function usePhoto(id?: string | null) {
  const [src, setSrc] = useState(id ? photos.get(id) ?? null : null)
  useEffect(() => {
    if (!id) { setSrc(null); return }
    if (photos.has(id)) { setSrc(photos.get(id)!); return }
    call<{ data?: string } | null>('receipt.get', { id }).then(r => { if (r?.data) { photos.set(id, r.data); setSrc(r.data) } }).catch(() => {})
  }, [id])
  return src
}

function Thumb({ it, size = 52 }: { it: StockItem; size?: number }) {
  const src = usePhoto(it.photoId)
  return src
    ? <img class="stock-thumb" src={src} alt="" style={{ width: size, height: size }} />
    : <span class="stock-thumb t-butter" style={{ width: size, height: size }}><Icon name="box" size={size * 0.38} /></span>
}

// ---------------------------------------------------------------- list

let savedFilter = 'all'

export function StockScreen() {
  const s = useApp()
  const [filter, setFilterState] = useState(savedFilter)
  const [query, setQuery] = useState('')
  const setFilter = (f: string) => { savedFilter = f; setFilterState(f) }
  const all = s.data.item.filter(i => !i.archived)
  const stats = new Map(all.map(i => [i.id, stockOf(i)]))
  const value = F.sumBy(all, i => i.currency, i => stats.get(i.id)!.value)
  const worth = F.sumBy(all, i => i.currency, i => Math.max(0, stats.get(i.id)!.qty) * i.sellPrice)
  const units = all.reduce((a, i) => a + Math.max(0, stats.get(i.id)!.qty), 0)
  const today = F.today()
  const month = salesBetween(all, F.monthStart(today), today)
  const low = all.filter(i => stockState(i, stats.get(i.id)!.qty) !== 'ok' && i.lowStock > 0)
  const shown = all
    .filter(i => filter === 'all' ? true : filter === 'in' ? stats.get(i.id)!.qty > 0 : stockState(i, stats.get(i.id)!.qty) === filter)
    .filter(i => matches(query, i.name, i.sku, i.category, i.notes, conditionLabel(i.condition)))
    .sort((a, b) => Number(stats.get(a.id)!.qty <= 0) - Number(stats.get(b.id)!.qty <= 0) || a.name.localeCompare(b.name))
  const cur = s.settings.currency
  return (
    <>
      <div class="scroll">
        <PageHeader title="Stock" onBack={popNav}>
          <Round icon="plus" label="New item" onClick={() => editItem()} />
        </PageHeader>
        <div class="content no-tabbar">
          {all.length > 0 && <Hero i={1}>
            <Eyebrow>Stock value · what it cost you</Eyebrow>
            <div class="h-display num amt">{F.totals(value, cur)}</div>
            <div class="row" style={{ marginTop: 12 }}>
              <div class="grow" style={{ minWidth: 0 }}><div class="eyebrow">Could sell for</div><div class="num h-sm amt ellipsis" style={{ fontWeight: 800 }}>{F.totals(worth, cur)}</div></div>
              <div class="grow" style={{ minWidth: 0 }}><div class="eyebrow">Pieces in stock</div><div class="num h-sm" style={{ fontWeight: 800 }}>{units}</div></div>
            </div>
            <div class="small" style={{ marginTop: 12, opacity: .88 }}>
              {month.count ? `Sold ${month.count} this month · profit ${F.totals(month.profit, cur)}` : 'Nothing sold yet this month'}
            </div>
          </Hero>}
          {low.length > 0 && <Card i={2}>
            <div class="row" style={{ marginBottom: 6 }}><Icon name="warning" size={16} class="warn" /><h3 class="h-sm grow">Running low</h3></div>
            {low.map(i => {
              const q = stats.get(i.id)!.qty
              return (
                <div key={i.id} class="row press" style={{ padding: '6px 0' }} onClick={() => push({ name: 'item', id: i.id })}>
                  <span class="grow semibold ellipsis">{i.name}</span>
                  <b class="num" style={{ color: stateColor[stockState(i, q)] }}>{q <= 0 ? 'Sold out' : `${q} left`}</b>
                </div>
              )
            })}
          </Card>}
          {all.length > 0 && <SearchBar i={3} value={query} onInput={setQuery} placeholder="Search name, serial, category…" />}
          {all.length > 0 && <div class="pop" style={{ '--i': 3 } as any}>
            <Chips options={['all', 'in', 'low', 'out']} value={filter} onChange={setFilter}
              label={v => ({ all: 'All', in: 'In stock', low: 'Running low', out: 'Sold out' } as Record<string, string>)[v]}
              icon={v => ({ all: 'list', in: 'box', low: 'warning', out: 'checkCircle' } as Record<string, string>)[v]} />
          </div>}
          {!all.length && <Empty icon="box" title="No stock yet" text="Add the things you buy to sell again, like PCs, phones or parts. See what's left, what each one cost you, and the profit on every sale.">
            <Btn icon="plus" onClick={() => editItem()}>Add an item</Btn>
          </Empty>}
          {all.length > 0 && !shown.length && <Hint>Nothing matches.</Hint>}
          {shown.map((it, i) => <ItemCard key={it.id} it={it} i={Math.min(i, 8) + 4} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editItem()}><Icon name="plus" size={15} />Item</button>
    </>
  )
}

export function ItemCard({ it, i }: { it: StockItem; i?: number }) {
  const st = stockOf(it)
  const state = stockState(it, st.qty)
  const each = it.sellPrice - st.avg
  return (
    <div class={'card press' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => push({ name: 'item', id: it.id })}>
      <div class="row">
        <Thumb it={it} />
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="h-sm ellipsis">{it.name}</div>
          <div class="small muted ellipsis">{[conditionLabel(it.condition), it.category, it.sku].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div class="num stock-qty" style={{ color: stateColor[state] }}>{Math.max(0, st.qty)}</div>
          <div class="tiny muted semibold">{state === 'out' ? 'sold out' : 'in stock'}</div>
        </div>
      </div>
      <div class="rental-money">
        <div><span class="tiny muted">Cost</span><b class="num amt">{F.money(st.avg, it.currency)}</b></div>
        <div><span class="tiny muted">Sells for</span><b class="num amt good">{F.money(it.sellPrice, it.currency)}</b></div>
        <div><span class="tiny muted">Profit each</span><b class={cx('num amt', each < 0 && 'bad')}>{F.money(each, it.currency)}</b></div>
      </div>
      <div class="row" style={{ marginTop: 10, gap: 8 }}>
        <Btn sm icon="income" disabled={st.qty <= 0} onClick={() => moveItem(it, 'sell')}>Sell</Btn>
        <Btn sm kind="soft" icon="plus" onClick={() => moveItem(it, 'buy')}>Buy more</Btn>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function ItemDetail({ id }: { id: string }) {
  const s = useApp()
  const it = s.data.item.find(x => x.id === id)
  const src = usePhoto(it?.photoId)
  if (!it) {
    return (
      <div class="scroll"><PageHeader title="Item" onBack={popNav} />
        <Empty icon="box" title="This item is gone" text="It was deleted."><Btn onClick={popNav}>Go back</Btn></Empty>
      </div>
    )
  }
  const st = stockOf(it)
  const state = stockState(it, st.qty)
  const moves = [...it.moves].sort((a, b) => byTime(b, a))
  return (
    <div class="scroll">
      <PageHeader title={it.name} onBack={popNav}>
        <Round icon="edit" label="Edit" onClick={() => editItem(it)} />
      </PageHeader>
      <div class="content no-tabbar">
        <Hero i={1}>
          <div class="row top">
            <div class="grow">
              <Eyebrow>{[conditionLabel(it.condition), it.category].filter(Boolean).join(' · ') || 'Stock'}</Eyebrow>
              <div class="h-display num">{Math.max(0, st.qty)} <span class="h-md">{state === 'out' ? 'left · sold out' : 'in stock'}</span></div>
            </div>
            {src && <img class="stock-thumb hero-thumb" src={src} alt="" onClick={() => viewPhoto(src)} />}
          </div>
          <div class="row" style={{ marginTop: 12 }}>
            {[['Average cost', F.money(st.avg, it.currency)], ['Sells for', F.money(it.sellPrice, it.currency)], ['Profit each', F.money(it.sellPrice - st.avg, it.currency)]]
              .map(([l, v]) => <div key={l} class="grow" style={{ minWidth: 0 }}><div class="eyebrow">{l}</div><div class="num h-sm amt ellipsis" style={{ fontWeight: 800 }}>{v}</div></div>)}
          </div>
          <div class="row" style={{ marginTop: 14 }}>
            <button class="hero-btn" disabled={st.qty <= 0} onClick={() => moveItem(it, 'sell')}><Icon name="income" size={13} />Sell</button>
            <button class="hero-btn" onClick={() => moveItem(it, 'buy')}><Icon name="plus" size={13} />Buy more</button>
          </div>
        </Hero>
        <Card i={2}>
          <h3 class="h-md" style={{ marginBottom: 8 }}>So far</h3>
          <div class="totals-list">
            <div><span>Bought</span><b class="num amt">{st.bought} · {F.money(st.spent, it.currency)}</b></div>
            <div><span>Sold</span><b class="num amt">{st.sold} · {F.money(st.revenue, it.currency)}</b></div>
            <div><span>Worth now (at cost)</span><b class="num amt">{F.money(st.value, it.currency)}</b></div>
            <div class="strong"><span>Profit from sales</span><b class="num amt">{F.money(st.profit, it.currency)}</b></div>
          </div>
        </Card>
        <div class="section-h"><h3>History</h3><button class="link" onClick={() => countItem(it)}>Fix the count</button></div>
        {!moves.length ? <Hint>Buys and sales of this item show here.</Hint> : (
          <div class="card flush">
            {moves.map(m => <MoveRow key={m.id} it={it} m={m} />)}
          </div>
        )}
        {(it.notes || it.sku) && <>
          <div class="section-h"><h3>Details</h3></div>
          <Card>
            {it.sku && <div class="row" style={{ marginBottom: it.notes ? 8 : 0 }} onClick={() => call('app.copy', { text: it.sku })}><span class="small muted grow">Serial / code</span><b>{it.sku}</b><Icon name="copy" size={13} class="muted" /></div>}
            {it.notes && <div style={{ whiteSpace: 'pre-wrap' }}>{it.notes}</div>}
          </Card>
        </>}
      </div>
    </div>
  )
}

function MoveRow({ it, m }: { it: StockItem; m: StockMove }) {
  const sell = m.kind === 'sell', buy = m.kind === 'buy'
  const who = (m.customerId && byId('customer', m.customerId)?.name) || m.person
  const title = buy ? `Bought ${m.qty}${who ? ` from ${who}` : ''}` : sell ? `Sold ${m.qty}${who ? ` to ${who}` : ''}` : `Count ${m.qty > 0 ? '+' : '−'}${Math.abs(m.qty)}${m.note ? ` · ${m.note}` : ''}`
  const debt = m.debtId ? byId('debt', m.debtId) : undefined
  return (
    <div class="item" onClick={() => moveSheet(it, m)}>
      <div class="badge-ico" style={{ background: buy ? 'var(--rose)' : sell ? 'var(--mint)' : 'var(--butter)', color: buy ? 'var(--on-rose)' : sell ? 'var(--on-mint)' : 'var(--on-butter)' }}>
        <Icon name={buy ? 'expense' : sell ? 'income' : 'edit'} size={15} />
      </div>
      <div class="main">
        <div class="t">{title}</div>
        <div class="s">{[F.dateShort(m.date), debt ? 'pays later' : '', !sell && !buy ? '' : m.note].filter(Boolean).join(' · ')}</div>
      </div>
      {(buy || sell) && <div style={{ textAlign: 'end' }}>
        <div class={cx('num bold amt', sell && 'good')}>{F.money(m.price * m.qty, it.currency)}</div>
        {sell && m.unitCost != null && <div class="tiny muted num amt">profit {F.money((m.price - m.unitCost) * m.qty, it.currency)}</div>}
      </div>}
    </div>
  )
}

function moveSheet(it: StockItem, m: StockMove) {
  openSheet(close => (
    <>
      <SheetTitle title={m.kind === 'sell' ? 'Sale' : m.kind === 'buy' ? 'Purchase' : 'Count change'} sub={F.date(m.date)} />
      <div class="body">
        <div class="card in-card totals-list">
          <div><span>Pieces</span><b class="num">{m.qty}</b></div>
          {m.kind !== 'adjust' && <div><span>Price each</span><b class="num amt">{F.money(m.price, it.currency)}</b></div>}
          {m.kind !== 'adjust' && <div class="strong"><span>Total</span><b class="num amt">{F.money(m.price * m.qty, it.currency)}</b></div>}
        </div>
        {m.note && <Hint>{m.note}</Hint>}
        <Btn kind="soft" class="bad" icon="trash" onClick={async () => {
          close()
          await attempt(() => save('item', { ...it, moves: it.moves.filter(x => x.id !== m.id) }))
          if (m.txnId && byId('txn', m.txnId)) remove('txn', m.txnId)
          if (m.debtId && byId('debt', m.debtId)) remove('debt', m.debtId)
        }}>Delete{m.txnId || m.debtId ? ' (and its money entry)' : ''}</Btn>
      </div>
    </>
  ))
}

// ---------------------------------------------------------------- buy / sell

export function moveItem(it: StockItem, kind: 'buy' | 'sell') {
  openForm(close => <MoveForm id={it.id} kind={kind} close={close} />)
}

function MoveForm({ id, kind, close }: { id: string; kind: 'buy' | 'sell'; close: () => void }) {
  const it = byId('item', id)!
  const st = stockOf(it)
  const sell = kind === 'sell'
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(F.amountText(sell ? it.sellPrice : st.avg || 0))
  const [date, setDate] = useState(F.today())
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [person, setPerson] = useState('')
  const [later, setLater] = useState(0)
  const [method, setMethod] = useState('Cash')
  const [record, setRecord] = useState(true)
  const [note, setNote] = useState('')
  const p = F.parseAmount(price) ?? 0
  const total = p * qty
  const tooMany = sell && qty > st.qty
  const profit = (p - st.avg) * qty
  return (
    <Form title={sell ? `Sell ${it.name}` : `Buy ${it.name}`} close={close} saveLabel={sell ? 'Sell' : 'Save'} saveEnabled={qty > 0 && !tooMany}
      onSave={async () => {
        const who = (customerId && byId('customer', customerId)?.name) || person.trim()
        const move: StockMove = {
          id: newId(), kind, qty, price: p, date, person: person.trim(), customerId, note: note.trim(), createdAt: Date.now(),
          ...(sell ? { unitCost: Math.round(st.avg * 100) / 100 } : {}),
        }
        const label = `${it.name}${qty > 1 ? ` × ${qty}` : ''}${who ? ` · ${who}` : ''}`
        if (sell && later === 1 && total > 0) {
          move.debtId = newId()
          await save('debt', { id: move.debtId, direction: 'owed_to_me', person: who || 'Customer', customerId, amount: total, currency: it.currency, dueDate: null, note: label, payments: [], createdAt: Date.now() })
        } else if (record && total > 0) {
          move.txnId = newId()
          await save('txn', {
            id: move.txnId, kind: sell ? 'income' : 'expense', amount: total, currency: it.currency, category: sell ? 'Sales' : 'Stock purchase',
            method, date, note: label, projectId: null, customerId: sell ? customerId : null, createdAt: Date.now(),
          })
        }
        const latest = byId('item', id) ?? it
        await save('item', { ...latest, moves: [...latest.moves, move] })
        close()
        toast(sell ? `Sold ${qty} · profit ${F.money(profit, it.currency)}` : `Added ${qty} to stock`)
      }}>
      <div class="card in-card">
        <div class="row">
          <div class="grow"><div class="tiny muted semibold">How many</div><div class="tiny muted">{Math.max(0, st.qty)} in stock now</div></div>
          <div class="stepper">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less"><Icon name="minus" size={13} /></button>
            <input class="num" value={qty} inputMode="numeric" onInput={e => setQty(Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value.replace(/\D/g, '')) || 0)))} />
            <button type="button" onClick={() => setQty(qty + 1)} aria-label="More"><Icon name="plus" size={12} /></button>
          </div>
        </div>
        {tooMany && <div class="tiny bold bad" style={{ marginTop: 6 }}>Only {Math.max(0, st.qty)} in stock. Buy more first, or fix the count.</div>}
      </div>
      <Field label={sell ? `Price each (${it.currency})` : `Cost each (${it.currency})`} value={price} inputMode="decimal" onInput={setPrice} />
      <div class={cx('tile', sell ? (profit >= 0 ? 't-mint' : 't-rose') : 't-sky')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={sell ? (profit >= 0 ? 'income' : 'warning') : 'box'} size={16} />
        <div class="grow semibold">Total {F.money(total, it.currency)}{sell ? ` · profit ${F.money(profit, it.currency)}` : ''}</div>
      </div>
      <DateField label="Date" value={date} onChange={v => setDate(v ?? F.today())} clearable={false} />
      {sell ? <>
        <CustomerPicker value={customerId} onChange={setCustomerId} none="Not a saved customer" />
        {!customerId && <Field label="Sold to (optional)" value={person} icon="user" onInput={setPerson} />}
        <Seg options={[{ label: 'Paid now', icon: 'cash' }, { label: 'Pays later', icon: 'clock' }]} value={later} onChange={setLater} />
        {later === 1 && <Hint>It goes to Debts as money they owe you.</Hint>}
      </> : <Field label="Bought from (optional)" value={person} icon="user" onInput={setPerson} />}
      {later === 0 && <>
        <div class="card in-card">
          <SwitchRow title={sell ? 'Add to my income' : 'Add to my expenses'} sub={sell ? 'As a "Sales" income in Money' : 'As a "Stock purchase" expense in Money'} on={record} onChange={setRecord} />
        </div>
        {record && <>
          <FieldLabel>{sell ? 'Paid with' : 'Paid with'}</FieldLabel>
          <Chips wrap options={Categories.methods} value={method} onChange={setMethod} icon={methodIcon} />
        </>}
      </>}
      <Field label="Note (optional)" value={note} onInput={setNote} />
    </Form>
  )
}

function countItem(it: StockItem) {
  openForm(close => <CountForm id={it.id} close={close} />)
}

function CountForm({ id, close }: { id: string; close: () => void }) {
  const it = byId('item', id)!
  const now = stockOf(it).qty
  const [count, setCount] = useState(String(Math.max(0, now)))
  const [reason, setReason] = useState('Counted again')
  const n = Math.floor(Number(count) || 0)
  return (
    <Form title="Fix the count" close={close} saveEnabled={n !== now && n >= 0} onSave={async () => {
      const latest = byId('item', id) ?? it
      await save('item', { ...latest, moves: [...latest.moves, { id: newId(), kind: 'adjust', qty: n - now, price: 0, date: F.today(), person: '', note: reason, createdAt: Date.now() }] })
      close()
    }}>
      <Hint>The app thinks there are {Math.max(0, now)}. How many do you really have?</Hint>
      <Field label="Pieces you have now" value={count} inputMode="numeric" onInput={v => setCount(v.replace(/\D/g, ''))} autoFocus />
      <FieldLabel>Why</FieldLabel>
      <Chips wrap options={['Counted again', 'Broken', 'Lost', 'Used it myself', 'Gift', 'Found more']} value={reason} onChange={setReason} />
    </Form>
  )
}

// ---------------------------------------------------------------- item form

export function editItem(item?: StockItem) {
  openForm(close => <ItemForm item={item} close={close} />)
}

function ItemForm({ item, close }: { item?: StockItem; close: () => void }) {
  const st = getState()
  const base: StockItem = item ?? {
    id: newId(), name: '', sku: '', category: '', condition: 'new', currency: st.settings.currency, sellPrice: 0, lowStock: 1, notes: '',
    photoId: null, moves: [], createdAt: Date.now(),
  }
  const [it, set] = useState(base)
  const up = (p: Partial<StockItem>) => set({ ...it, ...p })
  const [sellPrice, setSellPrice] = useState(F.amountText(base.sellPrice))
  const [startQty, setStartQty] = useState('1')
  const [cost, setCost] = useState('')
  const [from, setFrom] = useState('')
  const [record, setRecord] = useState(true)
  const [photo, setPhoto] = useState<string | null>(null)
  const saved = usePhoto(base.photoId)
  const shownPhoto = photo ?? (it.photoId ? saved : null)
  const cats = [...new Set(st.data.item.map(i => i.category).filter(Boolean))].sort()
  const q = Math.floor(Number(startQty) || 0), c = F.parseAmount(cost) ?? 0
  return (
    <Form title={item ? 'Edit item' : 'New item'} close={close} saveEnabled={!!it.name.trim()}
      onSave={async () => {
        let photoId = it.photoId ?? null
        if (photo) {
          photoId = photoId ?? newId()
          photos.set(photoId, photo)
          await save('receipt' as any, { id: photoId, itemId: it.id, data: photo, createdAt: Date.now() } as any)
        }
        const moves = [...it.moves]
        if (!item && q > 0) {
          const move: StockMove = { id: newId(), kind: 'buy', qty: q, price: c, date: F.today(), person: from.trim(), note: '', createdAt: Date.now() }
          if (record && c > 0) {
            move.txnId = newId()
            await save('txn', {
              id: move.txnId, kind: 'expense', amount: c * q, currency: it.currency, category: 'Stock purchase', method: 'Cash', date: F.today(),
              note: `${it.name.trim()}${q > 1 ? ` × ${q}` : ''}${from.trim() ? ` · ${from.trim()}` : ''}`, projectId: null, customerId: null, createdAt: Date.now(),
            })
          }
          moves.push(move)
        }
        const latest = item ? byId('item', item.id) : undefined
        await save('item', { ...it, moves: latest?.moves ?? moves, photoId, name: it.name.trim(), sku: it.sku.trim(), category: it.category.trim(), notes: it.notes.trim(), sellPrice: F.parseAmount(sellPrice) ?? 0 })
        close()
        if (!item) { toast('Item added'); push({ name: 'item', id: it.id }) }
      }}
      onDelete={item ? () => { remove('item', item.id); close(); popNav() } : undefined}>
      <div class="row" style={{ alignItems: 'center' }}>
        {shownPhoto
          ? <img class="stock-thumb" src={shownPhoto} alt="" style={{ width: 72, height: 72 }} onClick={() => viewPhoto(shownPhoto)} />
          : <span class="stock-thumb t-butter" style={{ width: 72, height: 72 }}><Icon name="box" size={26} /></span>}
        <div class="row wrap grow" style={{ gap: 6 }}>
          <Btn kind="soft" sm icon="camera" onClick={async () => { const r = await attempt(() => call<string | null>('receipt.capture', { source: 'camera' })); if (r) setPhoto(r) }}>Take photo</Btn>
          <Btn kind="soft" sm icon="image" onClick={async () => { const r = await attempt(() => call<string | null>('receipt.capture', { source: 'gallery' })); if (r) setPhoto(r) }}>Choose</Btn>
        </div>
      </div>
      <Field label="Name" value={it.name} placeholder="e.g. Dell Latitude 7490 · i7 16GB" onInput={v => up({ name: v })} autoFocus={!item} />
      <FieldLabel>Condition</FieldLabel>
      <Chips options={conditions} value={it.condition} onChange={v => up({ condition: v })} label={conditionLabel} />
      <Field label="Category (optional)" value={it.category} placeholder="Laptops, Phones, Parts…" onInput={v => up({ category: v })} />
      {cats.length > 0 && <Chips wrap options={cats} value={it.category} onChange={v => up({ category: v })} />}
      <div class="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1.4 }}><Field label="I sell one for" value={sellPrice} inputMode="decimal" onInput={setSellPrice} /></div>
        <div style={{ flex: 1 }}><CurrencyField value={it.currency} onChange={v => up({ currency: v })} /></div>
      </div>
      {!item && <>
        <FieldLabel>What you have now</FieldLabel>
        <div class="row" style={{ alignItems: 'stretch' }}>
          <div style={{ flex: 1 }}><Field label="Pieces" value={startQty} inputMode="numeric" onInput={v => setStartQty(v.replace(/\D/g, ''))} /></div>
          <div style={{ flex: 1.4 }}><Field label="Cost of one" value={cost} inputMode="decimal" onInput={setCost} /></div>
        </div>
        {q > 0 && c > 0 && <Hint>You paid {F.money(q * c, it.currency)}{F.parseAmount(sellPrice) ? `, and could sell them for ${F.money(q * (F.parseAmount(sellPrice) ?? 0), it.currency)}` : ''}.</Hint>}
        <Field label="Bought from (optional)" value={from} icon="user" onInput={setFrom} />
        {q > 0 && c > 0 && <div class="card in-card"><SwitchRow title="Add the purchase to my expenses" sub="As a &quot;Stock purchase&quot; expense in Money" on={record} onChange={setRecord} /></div>}
      </>}
      <FieldLabel>Warn me when it's running low</FieldLabel>
      <Chips options={['0', '1', '2', '3', '5', '10']} value={String(it.lowStock)} onChange={v => up({ lowStock: Number(v) })}
        label={v => (v === '0' ? 'Never' : `${v} or fewer`)} />
      <Field label="Serial number / code (optional)" value={it.sku} icon="tag" onInput={v => up({ sku: v })} />
      <Field label="Details (specs, where it's kept…)" multiline value={it.notes} onInput={v => up({ notes: v })} />
    </Form>
  )
}

// ---------------------------------------------------------------- quick sale

/** Pick an item, then sell it. */
export function quickSale() {
  const items = getState().data.item.filter(i => !i.archived && stockOf(i).qty > 0)
  if (!items.length) { editItem(); return }
  openSheet(close => <SalePicker items={items} close={close} />)
}

function SalePicker({ items, close }: { items: StockItem[]; close: () => void }) {
  const [query, setQuery] = useState('')
  const shown = items.filter(i => matches(query, i.name, i.sku, i.category)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <SheetTitle title="What did you sell?" />
      <div class="body">
        <SearchBar value={query} onInput={setQuery} placeholder="Search your stock" autoFocus />
        <div class="card flush in-card">
          {shown.map(it => (
            <div key={it.id} class="item" onClick={() => { close(); setTimeout(() => moveItem(it, 'sell'), 120) }}>
              <Thumb it={it} size={40} />
              <div class="main"><div class="t">{it.name}</div><div class="s">{stockOf(it).qty} in stock · {F.money(it.sellPrice, it.currency)}</div></div>
              <Icon name="right" size={13} class="muted" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
