// Price list: the services and products you sell with their usual price, so invoices, quotes and
// renters can pick them instead of typing the same prices again.

import { useState } from 'preact/hooks'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav } from '../nav'
import { getState, remove, save, useApp } from '../store'
import { newId, rentalPeriods, rentalPeriod, type PriceItem } from '../types'
import {
  Btn, Chips, CurrencyField, Empty, Field, FieldLabel, Form, Hint, PageHeader, Round, SearchBar, SheetTitle, cx, matches, openForm, openSheet,
} from '../ui'

export const priceKinds: { value: string; label: string; icon: string }[] = [
  { value: 'service', label: 'Service', icon: 'briefcase' },
  { value: 'product', label: 'Product', icon: 'box' },
  { value: 'rental', label: 'Rental / subscription', icon: 'repeat' },
]
const kindOf = (k: string) => priceKinds.find(x => x.value === k) ?? priceKinds[0]
const priceLine = (p: PriceItem) =>
  F.money(p.price, p.currency) + (p.kind === 'rental' && rentalPeriod(p.period).months ? ` / ${rentalPeriod(p.period).short}` : p.unit ? ` / ${p.unit}` : '')

let savedKind = 'all'

export function PricesScreen() {
  const s = useApp()
  const [query, setQuery] = useState('')
  const [kind, setKindState] = useState(savedKind)
  const setKind = (k: string) => { savedKind = k; setKindState(k) }
  const all = [...s.data.price].sort((a, b) => a.name.localeCompare(b.name))
  const shown = all.filter(p => (kind === 'all' || p.kind === kind) && matches(query, p.name, p.notes, p.unit))
  return (
    <>
      <div class="scroll">
        <PageHeader title="Price list" onBack={popNav}><Round icon="plus" label="New price" onClick={() => editPrice()} /></PageHeader>
        <div class="content no-tabbar">
          {all.length > 0 && <SearchBar i={1} value={query} onInput={setQuery} placeholder="Search services and products" />}
          {all.length > 0 && <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['all', ...priceKinds.map(k => k.value)]} value={kind} onChange={setKind}
              label={v => (v === 'all' ? 'All' : kindOf(v).label)} icon={v => (v === 'all' ? 'list' : kindOf(v).icon)} />
          </div>}
          {!all.length && <Empty icon="tag" title="No prices yet" text="Save what you sell and its usual price: POS setup, monthly rent, a website, a domain… Then pick them in invoices, quotes and renters.">
            <Btn icon="plus" onClick={() => editPrice()}>Add a price</Btn>
          </Empty>}
          {shown.map((p, i) => <PriceCard key={p.id} p={p} i={Math.min(i, 8) + 3} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editPrice()}><Icon name="plus" size={15} />Price</button>
    </>
  )
}

function PriceCard({ p, i }: { p: PriceItem; i: number }) {
  return (
    <div class="card press pop row" style={{ '--i': i } as any} onClick={() => editPrice(p)}>
      <span class="badge-ico t-butter"><Icon name={kindOf(p.kind).icon} size={16} /></span>
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="semibold ellipsis">{p.name}</div>
        <div class="tiny muted ellipsis">{[kindOf(p.kind).label, p.notes].filter(Boolean).join(' · ')}</div>
      </div>
      <b class="num amt">{priceLine(p)}</b>
    </div>
  )
}

export function editPrice(item?: PriceItem) {
  openForm(close => <PriceForm item={item} close={close} />)
}

function PriceForm({ item, close }: { item?: PriceItem; close: () => void }) {
  const base: PriceItem = item ?? { id: newId(), name: '', kind: 'service', price: 0, currency: getState().settings.currency, unit: '', period: 'monthly', notes: '', createdAt: Date.now() }
  const [p, set] = useState(base)
  const [price, setPrice] = useState(F.amountText(base.price))
  const up = (x: Partial<PriceItem>) => set({ ...p, ...x })
  return (
    <Form title={item ? 'Edit price' : 'New price'} close={close} saveEnabled={!!p.name.trim()}
      onSave={async () => { await save('price', { ...p, name: p.name.trim(), unit: p.unit.trim(), notes: p.notes.trim(), price: F.parseAmount(price) ?? 0 }); close() }}
      onDelete={item ? () => { remove('price', item.id); close() } : undefined}>
      <Chips wrap options={priceKinds.map(k => k.value)} value={p.kind} onChange={v => up({ kind: v })} label={v => kindOf(v).label} icon={v => kindOf(v).icon} />
      <Field label="Name" value={p.name} placeholder="e.g. CarrotPOS monthly rent" onInput={v => up({ name: v })} autoFocus={!item} />
      <div class="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1.4 }}><Field label="Price" value={price} inputMode="decimal" onInput={setPrice} /></div>
        <div style={{ flex: 1 }}><CurrencyField value={p.currency} onChange={v => up({ currency: v })} /></div>
      </div>
      {p.kind === 'rental'
        ? <><FieldLabel>Billed</FieldLabel><Chips wrap options={rentalPeriods.map(x => x.value)} value={p.period} onChange={v => up({ period: v })} label={v => rentalPeriod(v).label} /></>
        : <Field label="Per (optional: hour, page, piece…)" value={p.unit} onInput={v => up({ unit: v })} />}
      <Field label="Notes (what's included…)" multiline value={p.notes} onInput={v => up({ notes: v })} />
    </Form>
  )
}

/** Opens the price list to pick one or more entries (for invoice and quote lines, or a renter's price). */
export function pickPrice(onPick: (p: PriceItem) => void, kind?: string) {
  openSheet(close => <PricePicker kind={kind} onPick={p => { onPick(p) }} close={close} />)
}

function PricePicker({ kind, onPick, close }: { kind?: string; onPick: (p: PriceItem) => void; close: () => void }) {
  const s = useApp()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const list = s.data.price.filter(p => (!kind || p.kind === kind) && matches(query, p.name, p.notes)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <SheetTitle title="From your price list" sub={kind ? undefined : 'Tap to add. You can pick several.'} />
      <div class="body">
        {s.data.price.length > 5 && <SearchBar value={query} onInput={setQuery} placeholder="Search" />}
        {!s.data.price.length && <Hint>Your price list is empty. Add what you sell in Price list (in the menu).</Hint>}
        <div class="card flush in-card">
          {list.map(p => (
            <div key={p.id} class={cx('item', picked.includes(p.id) && 'picked')} onClick={() => {
              onPick(p)
              if (kind) close()
              else setPicked([...picked, p.id])
            }}>
              <span class="badge-ico t-butter"><Icon name={picked.includes(p.id) ? 'check' : kindOf(p.kind).icon} size={15} /></span>
              <div class="main"><div class="t">{p.name}</div><div class="s">{p.notes || kindOf(p.kind).label}</div></div>
              <b class="num amt">{priceLine(p)}</b>
            </div>
          ))}
        </div>
        {!kind && <Btn block onClick={close}>{picked.length ? `Done (${picked.length} added)` : 'Done'}</Btn>}
        <Btn kind="ghost" icon="plus" onClick={() => { close(); setTimeout(() => editPrice(), 150) }}>New price</Btn>
      </div>
    </>
  )
}

