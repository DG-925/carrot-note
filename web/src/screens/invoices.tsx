// Invoices: numbered, with line items, discount and tax, partial payments, a PDF to send and a
// reminder when they are overdue.

import { useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { askForPayment, CustomerPicker, ProjectPicker } from '../editors'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { Categories, duration, newId, type Invoice, type InvoiceItem } from '../types'
import {
  Btn, Card, Chips, CurrencyField, DateField, Empty, Eyebrow, Field, FieldLabel, Form, Hero, Hint, PageHeader, Round, SearchBar, Seg,
  SheetTitle, SwitchRow, attempt, cx, matches, openForm, openSheet, toast,
} from '../ui'

// ---------------------------------------------------------------- maths

export function invoiceTotals(inv: Pick<Invoice, 'items' | 'discount' | 'discountPercent' | 'taxPercent' | 'payments'>) {
  const subtotal = inv.items.reduce((a, i) => a + i.qty * i.price, 0)
  const discount = Math.min(subtotal, inv.discountPercent ? (subtotal * inv.discount) / 100 : inv.discount)
  const tax = ((subtotal - discount) * inv.taxPercent) / 100
  const total = Math.round((subtotal - discount + tax) * 100) / 100
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0)
  return { subtotal, discount, tax, total, paid, due: Math.max(0, Math.round((total - paid) * 100) / 100) }
}

export type InvoiceState = 'draft' | 'sent' | 'partial' | 'overdue' | 'paid' | 'cancelled'
export function invoiceState(inv: Invoice): InvoiceState {
  if (inv.status === 'cancelled') return 'cancelled'
  if (inv.status === 'draft') return 'draft'
  const t = invoiceTotals(inv)
  if (t.total > 0 && t.due <= 0.0001) return 'paid'
  if (inv.dueDate != null && inv.dueDate < F.today()) return 'overdue'
  return t.paid > 0 ? 'partial' : 'sent'
}
const stateLabel: Record<InvoiceState, string> = { draft: 'Draft', sent: 'Sent', partial: 'Part paid', overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled' }
const stateTint: Record<InvoiceState, string> = { draft: 'lilac', sent: 'sky', partial: 'butter', overdue: 'rose', paid: 'mint', cancelled: 'lilac' }

export function nextInvoiceNumber(): string {
  let max = 0
  for (const i of getState().data.invoice) {
    const m = /(\d+)\s*$/.exec(i.number)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return 'INV-' + String(max + 1).padStart(4, '0')
}

const clientOf = (inv: Invoice) => byId('customer', inv.customerId)?.name ?? (inv.clientName || 'No client')

export function StateChip({ st }: { st: InvoiceState }) {
  return <span class={`inv-chip t-${stateTint[st]}`}>{stateLabel[st]}</span>
}

// ---------------------------------------------------------------- list

let savedFilter = 'unpaid'

export function InvoicesScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const [filter, setFilterState] = useState(savedFilter)
  const [query, setQuery] = useState('')
  const setFilter = (f: string) => { savedFilter = f; setFilterState(f) }
  const all = s.data.invoice
  const open = all.filter(i => ['sent', 'partial', 'overdue'].includes(invoiceState(i)))
  const outstanding = F.sumBy(open, i => i.currency, i => invoiceTotals(i).due)
  const overdue = all.filter(i => invoiceState(i) === 'overdue')
  const yearStart = F.toEpochDay(new Date(new Date().getFullYear(), 0, 1))
  const paidYear = F.sumBy(all.filter(i => i.issueDate >= yearStart && invoiceState(i) !== 'cancelled'), i => i.currency, i => invoiceTotals(i).paid)
  const shown = all
    .filter(i => {
      const st = invoiceState(i)
      return filter === 'all' ? true : filter === 'unpaid' ? ['sent', 'partial', 'overdue'].includes(st) : st === filter
    })
    .filter(i => matches(query, i.number, clientOf(i), i.notes, ...i.items.map(x => x.description)))
    .sort((a, b) => b.issueDate - a.issueDate || b.number.localeCompare(a.number))
  return (
    <>
      <div class="scroll">
        <PageHeader title="Invoices" onBack={popNav} />
        <div class="content no-tabbar">
          <Hero i={1}>
            <Eyebrow>Waiting to be paid</Eyebrow>
            <div class={cx('num amt', Object.keys(outstanding).length > 1 ? 'h-lg' : 'h-display')}>{F.totals(outstanding, cur)}</div>
            <div class="row" style={{ marginTop: 12 }}>
              <div class="grow"><div class="eyebrow">Open invoices</div><div class="num h-sm" style={{ fontWeight: 800 }}>{open.length}</div></div>
              <div class="grow"><div class="eyebrow">Overdue</div><div class="num h-sm" style={{ fontWeight: 800 }}>{overdue.length}</div></div>
              <div class="grow"><div class="eyebrow">Paid this year</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{F.totals(paidYear, cur)}</div></div>
            </div>
          </Hero>
          {all.length > 0 && <SearchBar i={2} value={query} onInput={setQuery} placeholder="Search number, client or item" />}
          {all.length > 0 && <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['unpaid', 'overdue', 'paid', 'draft', 'all']} value={filter} onChange={setFilter}
              label={v => ({ unpaid: 'Unpaid', overdue: 'Overdue', paid: 'Paid', draft: 'Drafts', all: 'All' } as Record<string, string>)[v]} />
          </div>}
          {!all.length && <Empty icon="invoice" title="No invoices yet" text="Create numbered invoices with items, discount and tax, send them as a PDF and track what's been paid.">
            <Btn icon="plus" onClick={() => editInvoice()}>New invoice</Btn>
          </Empty>}
          {all.length > 0 && !shown.length && <Empty icon="invoice" title="Nothing here" text="Try another filter." />}
          {shown.map((inv, i) => <InvoiceCard key={inv.id} inv={inv} i={Math.min(i, 8) + 3} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editInvoice()}><Icon name="plus" size={15} />Invoice</button>
    </>
  )
}

export function InvoiceCard({ inv, i }: { inv: Invoice; i?: number }) {
  const t = invoiceTotals(inv)
  const st = invoiceState(inv)
  const dueText = st === 'paid' ? 'Paid in full' : st === 'draft' ? 'Not sent yet' : st === 'cancelled' ? 'Cancelled'
    : inv.dueDate != null ? (st === 'overdue' ? `Overdue · was due ${F.dateShort(inv.dueDate)}` : `Due ${F.relativeDay(inv.dueDate).toLowerCase()}`) : 'No due date'
  return (
    <div class={'card press' + (i != null ? ' pop' : '') + (st === 'overdue' ? ' rental-expired' : '')} style={i != null ? ({ '--i': i } as any) : undefined}
      onClick={() => push({ name: 'invoice', id: inv.id })}>
      <div class="row">
        <div class={`badge-ico t-${stateTint[st]}`}><Icon name="invoice" size={17} /></div>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row" style={{ gap: 8 }}><div class="h-sm">{inv.number}</div><StateChip st={st} /></div>
          <div class="small muted ellipsis">{clientOf(inv)} · {F.dateShort(inv.issueDate)}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(st === 'paid' || st === 'draft' ? t.total : t.due, inv.currency)}</div>
          {st !== 'paid' && st !== 'draft' && t.paid > 0 && <div class="tiny muted amt">of {F.money(t.total, inv.currency)}</div>}
        </div>
      </div>
      <div class={'small semibold' + (st === 'overdue' ? ' bad' : ' muted')} style={{ marginTop: 10 }}>{dueText}</div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function InvoiceDetail({ id }: { id: string }) {
  const s = useApp()
  const inv = s.data.invoice.find(x => x.id === id)
  if (!inv) {
    return <div class="scroll"><PageHeader title="Invoice" onBack={popNav} />
      <Empty icon="invoice" title="This invoice is gone" text="It was deleted."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  }
  const t = invoiceTotals(inv)
  const st = invoiceState(inv)
  const project = byId('project', inv.projectId)
  const customer = byId('customer', inv.customerId)
  const open = ['sent', 'partial', 'overdue'].includes(st)
  return (
    <div class="scroll">
      <PageHeader title={inv.number} onBack={popNav}>
        <Round icon="share" label="Share PDF" onClick={() => shareInvoicePdf(inv)} />
        <Round icon="edit" label="Edit" onClick={() => editInvoice(inv)} />
      </PageHeader>
      <div class="content no-tabbar">
        <div class={cx('hero', st === 'overdue' && 'hero-bad', (st === 'cancelled' || st === 'draft') && 'hero-muted')}>
          <div class="row"><span class="hero-pill">{stateLabel[st]}</span><span class="grow" /><span class="hero-pill">{inv.currency}</span></div>
          <div class="eyebrow" style={{ marginTop: 14 }}>{st === 'paid' ? 'Paid in full' : 'Balance due'}</div>
          <div class="h-display num amt">{F.money(st === 'paid' ? t.total : t.due, inv.currency)}</div>
          <div class="row" style={{ marginTop: 10 }}>
            <div class="grow"><div class="eyebrow">Total</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(t.total, inv.currency)}</div></div>
            <div class="grow"><div class="eyebrow">Paid</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(t.paid, inv.currency)}</div></div>
            <div class="grow"><div class="eyebrow">Due date</div><div class="h-sm" style={{ fontWeight: 800 }}>{inv.dueDate != null ? F.dateShort(inv.dueDate) : '—'}</div></div>
          </div>
        </div>

        <div class="row wrap pop" style={{ '--i': 2 } as any}>
          {st === 'draft' && <Btn icon="check" onClick={() => attempt(() => save('invoice', { ...inv, status: 'sent' }))}>Mark as sent</Btn>}
          {open && <Btn icon="income" onClick={() => recordPayment(inv)}>Record payment</Btn>}
          {open && <Btn kind="t-butter" class="t-butter" icon="bell" onClick={() => askForPayment({
            person: clientOf(inv), amount: t.due, currency: inv.currency, customerId: inv.customerId, dueDate: inv.dueDate, what: `invoice ${inv.number}`,
          })}>Remind</Btn>}
          <Btn kind="soft-bg" icon="share" onClick={() => shareInvoicePdf(inv)}>PDF</Btn>
        </div>

        <Card i={3}>
          <div class="info-rows">
            <div onClick={() => customer && push({ name: 'customer', id: customer.id })}><span>Client</span><b>{clientOf(inv)}</b>{customer && <Icon name="right" size={12} class="muted" />}</div>
            {project && <div onClick={() => push({ name: 'project', id: project.id })}><span>Project</span><b>{project.name}</b><Icon name="right" size={12} class="muted" /></div>}
            <div><span>Issued</span><b>{F.date(inv.issueDate)}</b></div>
          </div>
        </Card>

        <div class="section-h"><h3>Items</h3></div>
        <div class="card flush">
          {inv.items.map(x => (
            <div key={x.id} class="item">
              <div class="main"><div class="t">{x.description || 'Item'}</div><div class="s num">{F.amount(x.qty)} × {F.money(x.price, inv.currency)}</div></div>
              <div class="num bold amt">{F.money(x.qty * x.price, inv.currency)}</div>
            </div>
          ))}
        </div>
        <Card>
          <div class="totals-list">
            <div><span>Subtotal</span><b class="num amt">{F.money(t.subtotal, inv.currency)}</b></div>
            {t.discount > 0 && <div><span>Discount{inv.discountPercent ? ` (${inv.discount}%)` : ''}</span><b class="num amt">−{F.money(t.discount, inv.currency)}</b></div>}
            {t.tax > 0 && <div><span>Tax ({inv.taxPercent}%)</span><b class="num amt">{F.money(t.tax, inv.currency)}</b></div>}
            <div class="strong"><span>Total</span><b class="num amt">{F.money(t.total, inv.currency)}</b></div>
          </div>
        </Card>

        <div class="section-h"><h3>Payments</h3>{open && <button class="link" onClick={() => recordPayment(inv)}>+ Add</button>}</div>
        {!inv.payments.length && <Hint>No payments yet. Partial payments are fine: record each one as it comes in.</Hint>}
        {inv.payments.length > 0 && <div class="card flush">
          {inv.payments.map(p => (
            <div key={p.id} class="item">
              <div class="badge-ico t-mint"><Icon name="income" size={15} /></div>
              <div class="main"><div class="t">{F.date(p.date)}</div><div class="s">{p.method}</div></div>
              <div class="num good bold amt">+{F.money(p.amount, inv.currency)}</div>
              <button class="muted" style={{ padding: 6 }} aria-label="Remove payment" onClick={() => removePayment(inv, p.id)}><Icon name="close" size={13} /></button>
            </div>
          ))}
        </div>}
        {inv.notes && <><div class="section-h"><h3>Notes</h3></div><div class="card" style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</div></>}
        {st !== 'cancelled' && st !== 'paid' && <Btn kind="ghost" onClick={() => attempt(() => save('invoice', { ...inv, status: 'cancelled' }))}>Cancel this invoice</Btn>}
        {st === 'cancelled' && <Btn kind="ghost" onClick={() => attempt(() => save('invoice', { ...inv, status: 'sent' }))}>Restore this invoice</Btn>}
      </div>
    </div>
  )
}

async function removePayment(inv: Invoice, paymentId: string) {
  const p = inv.payments.find(x => x.id === paymentId)
  await attempt(() => save('invoice', { ...inv, payments: inv.payments.filter(x => x.id !== paymentId) }))
  if (p?.txnId && byId('txn', p.txnId)) remove('txn', p.txnId)
}

// ---------------------------------------------------------------- payment

export function recordPayment(inv: Invoice) {
  openSheet(close => <PaymentSheet inv={inv} close={close} />)
}

function PaymentSheet({ inv, close }: { inv: Invoice; close: () => void }) {
  const due = invoiceTotals(inv).due
  const [amount, setAmount] = useState(F.amountText(due))
  const [date, setDate] = useState(F.today())
  const [method, setMethod] = useState('Bank transfer')
  const [toMoney, setToMoney] = useState(true)
  const value = F.parseAmount(amount)
  return (
    <>
      <SheetTitle title="Payment received" sub={`${inv.number} · ${F.money(due, inv.currency)} left`} />
      <div class="body">
        <Field label={`Amount (${inv.currency})`} value={amount} inputMode="decimal" onInput={setAmount} />
        <DateField label="Date" value={date} onChange={v => setDate(v ?? F.today())} clearable={false} />
        <FieldLabel>Received via</FieldLabel>
        <Chips options={Categories.methods} value={method} onChange={setMethod} />
        <div class="card in-card"><SwitchRow title="Add to income" sub="Also record it in Money" on={toMoney} onChange={setToMoney} /></div>
        <Btn block disabled={!(value && value > 0)} onClick={async () => {
          const txnId = toMoney ? newId() : null
          await attempt(async () => {
            if (txnId) await save('txn', {
              id: txnId, kind: 'income', amount: value!, currency: inv.currency, category: inv.projectId ? 'Project payment' : 'Freelance', method, date,
              note: `Invoice ${inv.number}`, projectId: inv.projectId ?? null, customerId: inv.customerId ?? null, createdAt: Date.now(),
            })
            await save('invoice', { ...inv, status: inv.status === 'draft' ? 'sent' : inv.status, payments: [...inv.payments, { id: newId(), amount: value!, date, method, txnId }] })
            toast(value! >= due - 0.0001 ? 'Paid in full 🎉' : 'Payment saved')
          })
          close()
        }}>Save payment</Btn>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- PDF

export function shareInvoicePdf(inv: Invoice) {
  const s = getState()
  const u = s.user
  const t = invoiceTotals(inv)
  const st = invoiceState(inv)
  const customer = byId('customer', inv.customerId)
  const m = (v: number) => F.money(v, inv.currency)
  const totals: [string, string, boolean?][] = [['Subtotal', m(t.subtotal)]]
  if (t.discount > 0) totals.push([`Discount${inv.discountPercent ? ` (${inv.discount}%)` : ''}`, '−' + m(t.discount)])
  if (t.tax > 0) totals.push([`Tax (${inv.taxPercent}%)`, m(t.tax)])
  totals.push(['Total', m(t.total)])
  if (t.paid > 0) totals.push(['Paid', '−' + m(t.paid)])
  totals.push(['Balance due', m(t.due), true])
  const doc = {
    file: inv.number, title: 'INVOICE', subtitle: `${inv.number}${st === 'paid' ? ' · PAID' : ''}`,
    headerRight: [u?.name || (u ? '@' + u.username : ''), u?.email ?? '', u?.username ? '@' + u.username : ''].filter(Boolean),
    footer: 'Thank you for your business! · Made with Carrot Note',
    blocks: [
      {
        type: 'columns',
        left: { label: 'Bill to', lines: [clientOf(inv), ...[customer?.company, customer?.email, customer?.phone].filter(Boolean), ...inv.clientDetails.split('\n').filter(Boolean)] },
        right: { label: 'Details', lines: [`Issued ${F.date(inv.issueDate)}`, inv.dueDate != null ? `Due ${F.date(inv.dueDate)}` : 'Due on receipt', `Currency ${inv.currency}`] },
      },
      {
        type: 'table',
        columns: [{ title: 'Description', weight: 3 }, { title: 'Qty', weight: 0.8, align: 'right' }, { title: 'Price', weight: 1.3, align: 'right' }, { title: 'Amount', weight: 1.5, align: 'right' }],
        rows: inv.items.map(x => [x.description || 'Item', F.amount(x.qty), m(x.price), m(x.qty * x.price)]),
      },
      { type: 'totals', rows: totals },
      ...(inv.payments.length ? [{ type: 'heading', text: 'Payments received' }, {
        type: 'table', columns: [{ title: 'Date', weight: 2 }, { title: 'Method', weight: 2 }, { title: 'Amount', weight: 1.5, align: 'right' }],
        rows: inv.payments.map(p => [F.date(p.date), p.method, m(p.amount)]),
      }] : []),
      ...(inv.notes ? [{ type: 'heading', text: 'Notes' }, { type: 'text', text: inv.notes }] : []),
    ],
  }
  attempt(() => call('pdf.share', { doc }))
}

// ---------------------------------------------------------------- editor

export function editInvoice(item?: Invoice, defaults: { customerId?: string | null; projectId?: string | null } = {}) {
  openForm(close => <InvoiceForm item={item} defaults={defaults} close={close} />)
}

/** Items suggested from a project: its price, or the tracked hours at the hourly rate. */
function projectItems(projectId: string): InvoiceItem[] {
  const s = getState()
  const p = byId('project', projectId)
  if (!p) return []
  if (p.billing === 'hourly') {
    const hours = Math.round(F.hours(s.data.time.filter(t => t.projectId === p.id).reduce((a, t) => a + duration(t), 0)) * 100) / 100
    return [{ id: newId(), description: `${p.name} · work hours`, qty: hours, price: p.hourlyRate }]
  }
  return [{ id: newId(), description: p.name, qty: 1, price: p.price }]
}

function InvoiceForm({ item, defaults, close }: { item?: Invoice; defaults: { customerId?: string | null; projectId?: string | null }; close: () => void }) {
  const s = useApp()
  const project = byId('project', defaults.projectId)
  const base: Invoice = item ?? {
    id: newId(), number: nextInvoiceNumber(), customerId: defaults.customerId ?? project?.customerId ?? null, projectId: defaults.projectId ?? null,
    clientName: project?.clientName ?? '', clientDetails: '', issueDate: F.today(), dueDate: F.today() + 14, currency: project?.currency || s.settings.currency,
    items: defaults.projectId ? projectItems(defaults.projectId) : [{ id: newId(), description: '', qty: 1, price: 0 }],
    discount: 0, discountPercent: false, taxPercent: 0, total: 0, status: 'sent', payments: [], notes: '', createdAt: Date.now(),
  }
  const [inv, set] = useState(base)
  const [texts, setTexts] = useState<Record<string, { qty: string; price: string }>>(
    Object.fromEntries(base.items.map(x => [x.id, { qty: F.amountText(x.qty) || '1', price: F.amountText(x.price) }])))
  const [discount, setDiscount] = useState(F.amountText(base.discount))
  const [tax, setTax] = useState(F.amountText(base.taxPercent))
  const up = (p: Partial<Invoice>) => set({ ...inv, ...p })
  const items = inv.items.map(x => ({ ...x, qty: F.parseAmount(texts[x.id]?.qty ?? '') ?? 0, price: F.parseAmount(texts[x.id]?.price ?? '') ?? 0 }))
  const current: Invoice = { ...inv, items, discount: F.parseAmount(discount) ?? 0, taxPercent: F.parseAmount(tax) ?? 0 }
  const t = invoiceTotals(current)
  const setItem = (id: string, p: Partial<InvoiceItem>) => up({ items: inv.items.map(x => (x.id === id ? { ...x, ...p } : x)) })
  const setText = (id: string, k: 'qty' | 'price', v: string) => setTexts({ ...texts, [id]: { ...texts[id], [k]: v } })
  const addItems = (list: InvoiceItem[]) => {
    setTexts({ ...texts, ...Object.fromEntries(list.map(x => [x.id, { qty: F.amountText(x.qty) || '1', price: F.amountText(x.price) }])) })
    up({ items: [...inv.items.filter(x => x.description || (F.parseAmount(texts[x.id]?.price ?? '') ?? 0) > 0), ...list] })
  }
  return (
    <Form title={item ? 'Edit invoice' : 'New invoice'} close={close} saveEnabled={!!inv.number.trim() && items.some(x => x.qty * x.price > 0)}
      onSave={async () => {
        const customer = byId('customer', inv.customerId)
        await save('invoice', {
          ...current, number: inv.number.trim(), clientName: customer?.name ?? inv.clientName.trim(), clientDetails: inv.clientDetails.trim(),
          notes: inv.notes.trim(), items: items.filter(x => x.description.trim() || x.qty * x.price > 0), total: t.total,
        })
        close()
        if (!item) push({ name: 'invoice', id: inv.id })
      }}
      onDelete={item ? () => { remove('invoice', item.id); close(); popNav() } : undefined}>
      <Seg options={[{ label: 'Draft', icon: 'pen' }, { label: 'Sent', icon: 'check' }]} value={inv.status === 'draft' ? 0 : 1} onChange={i => up({ status: i ? 'sent' : 'draft' })} />
      <div class="row">
        <div style={{ flex: 1 }}><Field label="Invoice number" value={inv.number} onInput={v => up({ number: v })} /></div>
        <div style={{ flex: 1 }}><CurrencyField value={inv.currency} onChange={v => up({ currency: v })} /></div>
      </div>
      <CustomerPicker value={inv.customerId} onChange={v => up({ customerId: v })} none="Not a saved customer" />
      {!inv.customerId && <Field label="Client name" value={inv.clientName} icon="user" onInput={v => up({ clientName: v })} />}
      <ProjectPicker value={inv.projectId} onChange={v => up({ projectId: v })} none="No project" />
      <DateField label="Issue date" value={inv.issueDate} onChange={v => up({ issueDate: v ?? F.today() })} clearable={false} />
      <DateField label="Due date" value={inv.dueDate} onChange={v => up({ dueDate: v })} />
      <div class="chips">
        {[7, 14, 30].map(d => <button key={d} class={cx('chip', inv.dueDate === inv.issueDate + d && 'on')} onClick={() => up({ dueDate: inv.issueDate + d })}>{d} days</button>)}
      </div>

      <FieldLabel>Items</FieldLabel>
      {inv.items.map(x => (
        <div key={x.id} class="card in-card inv-item">
          <div class="row">
            <input class="grow inv-desc" placeholder="Description (e.g. Logo design)" value={x.description} onInput={e => setItem(x.id, { description: (e.target as HTMLInputElement).value })} />
            {inv.items.length > 1 && <button class="muted" style={{ padding: 4 }} aria-label="Remove item" onClick={() => up({ items: inv.items.filter(y => y.id !== x.id) })}><Icon name="close" size={14} /></button>}
          </div>
          <div class="row">
            <label class="inv-num"><span>Qty</span><input inputMode="decimal" value={texts[x.id]?.qty ?? ''} onInput={e => setText(x.id, 'qty', (e.target as HTMLInputElement).value)} /></label>
            <label class="inv-num grow"><span>Price</span><input inputMode="decimal" value={texts[x.id]?.price ?? ''} onInput={e => setText(x.id, 'price', (e.target as HTMLInputElement).value)} /></label>
            <div class="num bold amt" style={{ minWidth: 90, textAlign: 'end' }}>{F.money((F.parseAmount(texts[x.id]?.qty ?? '') ?? 0) * (F.parseAmount(texts[x.id]?.price ?? '') ?? 0), inv.currency)}</div>
          </div>
        </div>
      ))}
      <div class="row wrap">
        <Btn kind="soft" sm icon="plus" onClick={() => addItems([{ id: newId(), description: '', qty: 1, price: 0 }])}>Add item</Btn>
        {inv.projectId && <Btn kind="soft" sm icon="project" onClick={() => addItems(projectItems(inv.projectId!))}>Add from project</Btn>}
      </div>

      <div class="row">
        <div style={{ flex: 1 }}><Field label={inv.discountPercent ? 'Discount %' : `Discount (${inv.currency})`} value={discount} inputMode="decimal" onInput={setDiscount} /></div>
        <div class="mini-seg">
          <button class={!inv.discountPercent ? 'on' : ''} onClick={() => up({ discountPercent: false })}>{inv.currency}</button>
          <button class={inv.discountPercent ? 'on' : ''} onClick={() => up({ discountPercent: true })}>%</button>
        </div>
      </div>
      <Field label="Tax % (VAT…)" value={tax} inputMode="decimal" onInput={setTax} />
      <div class="card in-card totals-list">
        <div><span>Subtotal</span><b class="num">{F.money(t.subtotal, inv.currency)}</b></div>
        {t.discount > 0 && <div><span>Discount</span><b class="num">−{F.money(t.discount, inv.currency)}</b></div>}
        {t.tax > 0 && <div><span>Tax</span><b class="num">{F.money(t.tax, inv.currency)}</b></div>}
        <div class="strong"><span>Total</span><b class="num">{F.money(t.total, inv.currency)}</b></div>
      </div>
      <Field label="Client address / tax number (optional)" multiline value={inv.clientDetails} onInput={v => up({ clientDetails: v })} />
      <Field label="Notes (payment details, thanks…)" multiline value={inv.notes} onInput={v => up({ notes: v })} />
    </Form>
  )
}
