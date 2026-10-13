// Suppliers: the people and shops you buy from (stock, servers, domains…), what you paid them, what
// you still owe them, and the stock that came from them.

import { useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { ContactAvatar, editDebt, editTxn } from '../editors'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { DebtCard, TxnRow } from '../rows'
import { getState, remove, save, useApp } from '../store'
import { debtRemaining, debtSettled, newId, type Supplier } from '../types'
import { Btn, Card, Empty, Eyebrow, Field, Form, Hint, PageHeader, Round, SearchBar, SelectField, matches, openForm } from '../ui'

function supplierStats(id: string) {
  const d = getState().data
  const txns = d.txn.filter(t => t.supplierId === id && t.kind === 'expense')
  const debts = d.debt.filter(x => x.supplierId === id && x.direction === 'i_owe')
  const buys = d.item.flatMap(it => it.moves.filter(m => m.kind === 'buy' && (m as any).supplierId === id).map(m => ({ it, m })))
  return {
    txns, debts, buys,
    paid: F.sumBy(txns, t => t.currency, t => t.amount),
    owe: F.sumBy(debts.filter(x => !debtSettled(x)), x => x.currency, x => debtRemaining(x)),
  }
}

export function SuppliersScreen() {
  const s = useApp()
  const [query, setQuery] = useState('')
  const all = [...s.data.supplier].sort((a, b) => a.name.localeCompare(b.name))
  const shown = all.filter(x => matches(query, x.name, x.company, x.phone, x.email, x.notes))
  const totalOwe = F.sumBy(s.data.debt.filter(d => d.supplierId && d.direction === 'i_owe' && !debtSettled(d)), d => d.currency, d => debtRemaining(d))
  return (
    <>
      <div class="scroll">
        <PageHeader title="Suppliers" onBack={popNav}><Round icon="plus" label="New supplier" onClick={() => editSupplier()} /></PageHeader>
        <div class="content no-tabbar">
          {Object.values(totalOwe).some(v => v > 0) && <Card i={1}>
            <Eyebrow>You owe suppliers</Eyebrow>
            <div class="num h-md bad" style={{ fontWeight: 800 }}>{F.totals(totalOwe, s.settings.currency)}</div>
          </Card>}
          {all.length > 0 && <SearchBar i={2} value={query} onInput={setQuery} placeholder="Search suppliers" />}
          {!all.length && <Empty icon="box" title="No suppliers yet" text="Add the people and shops you buy from: wholesalers, server providers, domain sellers… See what you paid each one and what you still owe.">
            <Btn icon="plus" onClick={() => editSupplier()}>Add a supplier</Btn>
          </Empty>}
          {shown.map((x, i) => {
            const st = supplierStats(x.id)
            const owes = Object.values(st.owe).some(v => v > 0)
            return (
              <div key={x.id} class="card press pop row" style={{ '--i': Math.min(i, 8) + 3 } as any} onClick={() => push({ name: 'supplier', id: x.id })}>
                <ContactAvatar name={x.name} size={44} />
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="semibold ellipsis">{x.name}</div>
                  <div class="tiny muted ellipsis">{[x.company, x.phone].filter(Boolean).join(' · ') || 'Supplier'}</div>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <div class="num bold amt">{F.totals(st.paid, s.settings.currency)}</div>
                  {owes && <div class="tiny bad bold amt">owe {F.totals(st.owe, s.settings.currency)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editSupplier()}><Icon name="plus" size={15} />Supplier</button>
    </>
  )
}

export function SupplierDetail({ id }: { id: string }) {
  const s = useApp()
  const x = s.data.supplier.find(y => y.id === id)
  if (!x) return <div class="scroll"><PageHeader title="Supplier" onBack={popNav} /><Empty icon="box" title="Supplier was deleted" text="Go back to your list."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  const st = supplierStats(id)
  const cur = s.settings.currency
  return (
    <div class="scroll">
      <PageHeader title={x.name} onBack={popNav}><Round icon="edit" label="Edit" onClick={() => editSupplier(x)} /></PageHeader>
      <div class="content no-tabbar">
        <Card i={1}>
          <div class="row" style={{ gap: 14 }}>
            <ContactAvatar name={x.name} size={60} />
            <div class="grow"><div class="h-lg">{x.name}</div>{x.company && <div class="muted semibold">{x.company}</div>}</div>
          </div>
          {(x.phone || x.email) && <div class="chips" style={{ marginTop: 12 }}>
            {x.phone && <Btn sm icon="phone" onClick={() => call('app.dial', { phone: x.phone })}>Call</Btn>}
            {x.phone && <Btn sm kind="t-mint" class="t-mint" icon="whatsapp" onClick={() => call('app.whatsapp', { phone: x.phone })}>WhatsApp</Btn>}
            {x.email && <Btn sm kind="t-sky" class="t-sky" icon="mail" onClick={() => call('app.email', { to: x.email })}>Email</Btn>}
          </div>}
          <div class="row" style={{ marginTop: 14 }}>
            <div class="grow"><Eyebrow>You paid them</Eyebrow><div class="num h-md" style={{ fontWeight: 800 }}>{F.totals(st.paid, cur)}</div></div>
            <div class="grow"><Eyebrow>You still owe</Eyebrow><div class="num h-md bad" style={{ fontWeight: 800 }}>{F.totals(st.owe, cur)}</div></div>
          </div>
          {x.notes && <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{x.notes}</p>}
        </Card>
        <div class="chips pop" style={{ '--i': 2 } as any}>
          <Btn sm kind="t-rose" class="t-rose" icon="expense" onClick={() => editTxn(undefined, { kind: 'expense', supplierId: id })}>I paid them</Btn>
          <Btn sm kind="t-butter" class="t-butter" icon="debt" onClick={() => editDebt(undefined, { person: x.name, supplierId: id, direction: 'i_owe' })}>I owe them</Btn>
        </div>
        {st.debts.length > 0 && <><div class="section-h"><h3>What you owe</h3></div>{st.debts.map(d => <DebtCard key={d.id} d={d} />)}</>}
        {st.buys.length > 0 && <>
          <div class="section-h"><h3>Stock bought</h3></div>
          <div class="card flush">
            {st.buys.sort((a, b) => b.m.date - a.m.date).map(({ it, m }) => (
              <div key={m.id} class="item" onClick={() => push({ name: 'item', id: it.id })}>
                <div class="badge-ico t-butter"><Icon name="box" size={15} /></div>
                <div class="main"><div class="t">{it.name} × {m.qty}</div><div class="s">{F.dateShort(m.date)}</div></div>
                <b class="num amt">{F.money(m.qty * m.price, it.currency)}</b>
              </div>
            ))}
          </div>
        </>}
        <div class="section-h"><h3>Payments</h3></div>
        {!st.txns.length ? <Hint>Expenses where you pick this supplier show here.</Hint>
          : <div class="card flush">{st.txns.sort((a, b) => b.date - a.date).map(t => <TxnRow key={t.id} t={t} extra={F.dateShort(t.date)} />)}</div>}
      </div>
    </div>
  )
}

export function editSupplier(item?: Supplier) {
  openForm(close => <SupplierForm item={item} close={close} />)
}

function SupplierForm({ item, close }: { item?: Supplier; close: () => void }) {
  const base: Supplier = item ?? { id: newId(), name: '', phone: '', email: '', company: '', notes: '', createdAt: Date.now() }
  const [x, set] = useState(base)
  const up = (p: Partial<Supplier>) => set({ ...x, ...p })
  return (
    <Form title={item ? 'Edit supplier' : 'New supplier'} close={close} saveEnabled={!!x.name.trim()}
      onSave={async () => { await save('supplier', { ...x, name: x.name.trim(), phone: x.phone.trim(), email: x.email.trim(), company: x.company.trim(), notes: x.notes.trim() }); close() }}
      onDelete={item ? () => { remove('supplier', item.id); close(); popNav() } : undefined}>
      <Field label="Name" value={x.name} onInput={v => up({ name: v })} autoFocus={!item} />
      <Field label="Company (optional)" value={x.company} icon="briefcase" onInput={v => up({ company: v })} />
      <Field label="Phone" value={x.phone} icon="phone" inputMode="tel" onInput={v => up({ phone: v })} />
      <Field label="Email" value={x.email} icon="mail" type="email" onInput={v => up({ email: v })} />
      <Field label="Notes (what they sell, prices, bank details…)" multiline value={x.notes} onInput={v => up({ notes: v })} />
    </Form>
  )
}

export function SupplierPicker({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const s = useApp()
  if (!s.data.supplier.length) return null
  return <SelectField label="Supplier (optional)" value={value ?? ''} onChange={v => onChange(v || null)}
    options={[{ value: '', label: 'None' }, ...[...s.data.supplier].sort((a, b) => a.name.localeCompare(b.name)).map(x => ({ value: x.id, label: x.name }))]} />
}
