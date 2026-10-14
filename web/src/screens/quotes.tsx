// Quotes: a price offer with items, discount and tax, sent as a PDF or on WhatsApp. When the client
// says yes, one tap turns it into a project and an invoice.

import { ClientReplies, openClientLink } from './clientlink'
import { useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { CustomerPicker, ProjectPicker } from '../editors'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { newId, type InvoiceItem, type Quote } from '../types'
import {
  Btn, Card, Chips, CurrencyField, DateField, Empty, Eyebrow, Field, FieldLabel, Form, Hero, Hint, PageHeader, Round, SearchBar, Seg,
  attempt, cx, matches, openForm, toast,
} from '../ui'
import { invoiceTotals, nextInvoiceNumber } from './invoices'
import { pickPrice } from './prices'
import { sendMessage } from './messages'

export const quoteTotals = (q: Quote) => invoiceTotals({ ...q, payments: [] })

export type QuoteState = 'draft' | 'sent' | 'expired' | 'accepted' | 'declined'
export function quoteState(q: Quote): QuoteState {
  if (q.status === 'accepted' || q.status === 'declined' || q.status === 'draft') return q.status
  return q.validUntil != null && q.validUntil < F.today() ? 'expired' : 'sent'
}
const stateLabel: Record<QuoteState, string> = { draft: 'Draft', sent: 'Waiting', expired: 'Expired', accepted: 'Accepted', declined: 'Declined' }
const stateTint: Record<QuoteState, string> = { draft: 'lilac', sent: 'sky', expired: 'butter', accepted: 'mint', declined: 'rose' }

export function nextQuoteNumber(): string {
  let max = 0
  for (const q of getState().data.quote) {
    const m = /(\d+)\s*$/.exec(q.number)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return 'QUO-' + String(max + 1).padStart(4, '0')
}
const clientOf = (q: Quote) => byId('customer', q.customerId)?.name ?? (q.clientName || 'No client')

// ---------------------------------------------------------------- list

let savedFilter = 'open'

export function QuotesScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const [filter, setFilterState] = useState(savedFilter)
  const [query, setQuery] = useState('')
  const setFilter = (f: string) => { savedFilter = f; setFilterState(f) }
  const all = s.data.quote
  const waiting = all.filter(q => quoteState(q) === 'sent')
  const decided = all.filter(q => ['accepted', 'declined'].includes(quoteState(q)))
  const won = decided.filter(q => quoteState(q) === 'accepted')
  const winRate = decided.length ? Math.round((won.length / decided.length) * 100) : null
  const shown = all
    .filter(q => { const st = quoteState(q); return filter === 'all' ? true : filter === 'open' ? st === 'sent' || st === 'draft' : st === filter })
    .filter(q => matches(query, q.number, q.title, clientOf(q), ...q.items.map(x => x.description)))
    .sort((a, b) => b.issueDate - a.issueDate || b.number.localeCompare(a.number))
  return (
    <>
      <div class="scroll">
        <PageHeader title="Quotes" onBack={popNav} />
        <div class="content no-tabbar">
          <Hero i={1}>
            <Eyebrow>Waiting for an answer</Eyebrow>
            <div class="h-display num amt">{F.totals(F.sumBy(waiting, q => q.currency, q => quoteTotals(q).total), cur)}</div>
            <div class="row" style={{ marginTop: 12 }}>
              <div class="grow"><div class="eyebrow">Open quotes</div><div class="num h-sm" style={{ fontWeight: 800 }}>{waiting.length}</div></div>
              <div class="grow"><div class="eyebrow">Accepted</div><div class="num h-sm" style={{ fontWeight: 800 }}>{won.length}</div></div>
              <div class="grow"><div class="eyebrow">Win rate</div><div class="num h-sm" style={{ fontWeight: 800 }}>{winRate == null ? '—' : winRate + '%'}</div></div>
            </div>
          </Hero>
          {all.length > 0 && <SearchBar i={2} value={query} onInput={setQuery} placeholder="Search number, client or item" />}
          {all.length > 0 && <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['open', 'accepted', 'declined', 'expired', 'all']} value={filter} onChange={setFilter}
              label={v => ({ open: 'Open', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', all: 'All' } as Record<string, string>)[v]} />
          </div>}
          {!all.length && <Empty icon="pen" title="No quotes yet" text="Send clients a price offer as a PDF or on WhatsApp. When they say yes, turn it into a project and an invoice with one tap.">
            <Btn icon="plus" onClick={() => editQuote()}>New quote</Btn>
          </Empty>}
          {all.length > 0 && !shown.length && <Hint>Nothing here.</Hint>}
          {shown.map((q, i) => <QuoteCard key={q.id} q={q} i={Math.min(i, 8) + 3} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editQuote()}><Icon name="plus" size={15} />Quote</button>
    </>
  )
}

export function QuoteCard({ q, i }: { q: Quote; i?: number }) {
  const st = quoteState(q)
  return (
    <div class={'card press' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => push({ name: 'quote', id: q.id })}>
      <div class="row">
        <div class={`badge-ico t-${stateTint[st]}`}><Icon name="pen" size={16} /></div>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row" style={{ gap: 8 }}><div class="h-sm ellipsis">{q.title || q.number}</div><span class={`inv-chip t-${stateTint[st]}`}>{stateLabel[st]}</span></div>
          <div class="small muted ellipsis">{q.number} · {clientOf(q)} · {F.dateShort(q.issueDate)}</div>
        </div>
        <div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(quoteTotals(q).total, q.currency)}</div>
      </div>
      {st === 'sent' && q.validUntil != null && <div class="small muted semibold" style={{ marginTop: 8 }}>Valid until {F.dateShort(q.validUntil)}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function QuoteDetail({ id }: { id: string }) {
  const s = useApp()
  const q = s.data.quote.find(x => x.id === id)
  if (!q) {
    return <div class="scroll"><PageHeader title="Quote" onBack={popNav} />
      <Empty icon="pen" title="This quote is gone" text="It was deleted."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  }
  const t = quoteTotals(q)
  const st = quoteState(q)
  const invoice = q.invoiceId ? byId('invoice', q.invoiceId) : undefined
  const project = byId('project', q.projectId)
  const message = () => sendMessage('quote', { name: clientOf(q), customerId: q.customerId, amount: t.total, currency: q.currency, date: q.validUntil, what: q.title || 'the work', number: q.number }, 'Send quote')
  return (
    <div class="scroll">
      <PageHeader title={q.number} onBack={popNav}>
        <Round icon="link" label="Client link" onClick={() => openClientLink('quote', q.id, { title: q.number, client: clientOf(q), customerId: q.customerId })} />
        <Round icon="share" label="Share PDF" onClick={() => shareQuotePdf(q)} />
        <Round icon="edit" label="Edit" onClick={() => editQuote(q)} />
      </PageHeader>
      <div class="content no-tabbar">
        <div class={cx('hero', st === 'declined' && 'hero-muted', st === 'expired' && 'hero-bad')}>
          <div class="row"><span class="hero-pill">{stateLabel[st]}</span><span class="grow" /><span class="hero-pill">{q.currency}</span></div>
          <div class="eyebrow" style={{ marginTop: 14 }}>{q.title || 'Quote'} · {clientOf(q)}</div>
          <div class="h-display num amt">{F.money(t.total, q.currency)}</div>
          <div class="small" style={{ marginTop: 8, opacity: .88 }}>
            Sent {F.dateShort(q.issueDate)}{q.validUntil != null ? ` · valid until ${F.dateShort(q.validUntil)}` : ''}
          </div>
        </div>
        <ClientReplies type="quote" id={q.id} onAccept={() => acceptQuote(q)} />
        <div class="row wrap pop" style={{ '--i': 2 } as any}>
          {(st === 'sent' || st === 'draft' || st === 'expired') && <Btn icon="check" onClick={() => acceptQuote(q)}>Client said yes</Btn>}
          {(st === 'sent' || st === 'expired') && <Btn kind="ghost" icon="close" onClick={() => attempt(() => save('quote', { ...q, status: 'declined' }))}>Declined</Btn>}
          {st === 'draft' && <Btn kind="soft" icon="check" onClick={() => attempt(() => save('quote', { ...q, status: 'sent' }))}>Mark as sent</Btn>}
          <Btn kind="t-mint" class="t-mint" icon="whatsapp" onClick={message}>Message</Btn>
          <Btn kind="soft-bg" icon="share" onClick={() => shareQuotePdf(q)}>PDF</Btn>
          {st === 'declined' && <Btn kind="ghost" onClick={() => attempt(() => save('quote', { ...q, status: 'sent' }))}>Reopen</Btn>}
        </div>
        {st === 'accepted' && <Card>
          <div class="row"><Icon name="checkCircle" size={18} class="good" /><b class="grow">Accepted</b></div>
          <div class="info-rows" style={{ marginTop: 8 }}>
            {project && <div onClick={() => push({ name: 'project', id: project.id })}><span>Project</span><b>{project.name}</b><Icon name="right" size={12} class="muted" /></div>}
            {invoice && <div onClick={() => push({ name: 'invoice', id: invoice.id })}><span>Invoice</span><b>{invoice.number}</b><Icon name="right" size={12} class="muted" /></div>}
          </div>
        </Card>}
        <div class="section-h"><h3>Items</h3></div>
        <div class="card flush">
          {q.items.map(x => (
            <div key={x.id} class="item">
              <div class="main"><div class="t">{x.description || 'Item'}</div><div class="s num">{F.amount(x.qty)} × {F.money(x.price, q.currency)}</div></div>
              <div class="num bold amt">{F.money(x.qty * x.price, q.currency)}</div>
            </div>
          ))}
        </div>
        <Card>
          <div class="totals-list">
            <div><span>Subtotal</span><b class="num amt">{F.money(t.subtotal, q.currency)}</b></div>
            {t.discount > 0 && <div><span>Discount</span><b class="num amt">−{F.money(t.discount, q.currency)}</b></div>}
            {t.tax > 0 && <div><span>Tax ({q.taxPercent}%)</span><b class="num amt">{F.money(t.tax, q.currency)}</b></div>}
            <div class="strong"><span>Total</span><b class="num amt">{F.money(t.total, q.currency)}</b></div>
          </div>
        </Card>
        {q.notes && <><div class="section-h"><h3>Notes</h3></div><div class="card" style={{ whiteSpace: 'pre-wrap' }}>{q.notes}</div></>}
      </div>
    </div>
  )
}

/** Client accepted: create (or reuse) the project and an invoice with the same items. */
export async function acceptQuote(q: Quote) {
  await attempt(async () => {
    const st = getState()
    const t = quoteTotals(q)
    let projectId = q.projectId ?? null
    if (!projectId) {
      projectId = newId()
      await save('project', {
        id: projectId, name: q.title || `${clientOf(q)} · ${q.number}`, customerId: q.customerId ?? null, clientName: byId('customer', q.customerId)?.name ?? q.clientName,
        price: t.total, currency: q.currency, status: 'active', startDate: F.today(), deadline: null, description: q.notes, info: [], billing: 'fixed', hourlyRate: 0,
        repo: '', createdAt: Date.now(), kind: 'work',
      })
    }
    const invoiceId = newId()
    await save('invoice', {
      id: invoiceId, number: nextInvoiceNumber(), customerId: q.customerId ?? null, projectId, clientName: q.clientName, clientDetails: '',
      issueDate: F.today(), dueDate: F.today() + 14, currency: q.currency, items: q.items.map(x => ({ ...x, id: newId() })),
      discount: q.discount, discountPercent: q.discountPercent, taxPercent: q.taxPercent, total: t.total, status: 'draft', payments: [],
      notes: `From quote ${q.number}`, createdAt: Date.now(),
    })
    await save('quote', { ...q, status: 'accepted', projectId, invoiceId })
    toast(st.data.project.some(p => p.id === projectId) ? 'Accepted · invoice created' : 'Accepted · project and invoice created 🎉')
  })
}

export function shareQuotePdf(q: Quote) {
  const u = getState().user
  const t = quoteTotals(q)
  const customer = byId('customer', q.customerId)
  const m = (v: number) => F.money(v, q.currency)
  const totals: [string, string, boolean?][] = [['Subtotal', m(t.subtotal)]]
  if (t.discount > 0) totals.push([`Discount${q.discountPercent ? ` (${q.discount}%)` : ''}`, '−' + m(t.discount)])
  if (t.tax > 0) totals.push([`Tax (${q.taxPercent}%)`, m(t.tax)])
  totals.push(['Total', m(t.total), true])
  const doc = {
    file: q.number, title: 'QUOTE', subtitle: [q.number, q.title].filter(Boolean).join(' · '),
    headerRight: [u?.name || (u ? '@' + u.username : ''), u?.email ?? '', u?.username ? '@' + u.username : ''].filter(Boolean),
    footer: 'Thank you for considering this offer · Made with Carrot Note',
    blocks: [
      {
        type: 'columns',
        left: { label: 'Prepared for', lines: [clientOf(q), ...[customer?.company, customer?.email, customer?.phone].filter(Boolean) as string[]] },
        right: { label: 'Details', lines: [`Date ${F.date(q.issueDate)}`, q.validUntil != null ? `Valid until ${F.date(q.validUntil)}` : '', `Currency ${q.currency}`].filter(Boolean) },
      },
      {
        type: 'table',
        columns: [{ title: 'Description', weight: 3 }, { title: 'Qty', weight: 0.8, align: 'right' }, { title: 'Price', weight: 1.3, align: 'right' }, { title: 'Amount', weight: 1.5, align: 'right' }],
        rows: q.items.map(x => [x.description || 'Item', F.amount(x.qty), m(x.price), m(x.qty * x.price)]),
      },
      { type: 'totals', rows: totals },
      ...(q.notes ? [{ type: 'heading', text: 'Notes' }, { type: 'text', text: q.notes }] : []),
    ],
  }
  attempt(() => call('pdf.share', { doc }))
}

// ---------------------------------------------------------------- editor

export function editQuote(item?: Quote, defaults: { customerId?: string | null; projectId?: string | null } = {}) {
  openForm(close => <QuoteForm item={item} defaults={defaults} close={close} />)
}

function QuoteForm({ item, defaults, close }: { item?: Quote; defaults: { customerId?: string | null; projectId?: string | null }; close: () => void }) {
  const s = useApp()
  const base: Quote = item ?? {
    id: newId(), number: nextQuoteNumber(), title: '', customerId: defaults.customerId ?? null, clientName: '', projectId: defaults.projectId ?? null,
    issueDate: F.today(), validUntil: F.today() + 14, currency: s.settings.currency, items: [{ id: newId(), description: '', qty: 1, price: 0 }],
    discount: 0, discountPercent: false, taxPercent: 0, total: 0, status: 'sent', notes: '', invoiceId: null, createdAt: Date.now(),
  }
  const [q, set] = useState(base)
  const [texts, setTexts] = useState<Record<string, { qty: string; price: string }>>(
    Object.fromEntries(base.items.map(x => [x.id, { qty: F.amountText(x.qty) || '1', price: F.amountText(x.price) }])))
  const [discount, setDiscount] = useState(F.amountText(base.discount))
  const [tax, setTax] = useState(F.amountText(base.taxPercent))
  const up = (p: Partial<Quote>) => set(prev => ({ ...prev, ...p }))
  const items = q.items.map(x => ({ ...x, qty: F.parseAmount(texts[x.id]?.qty ?? '') ?? 0, price: F.parseAmount(texts[x.id]?.price ?? '') ?? 0 }))
  const current: Quote = { ...q, items, discount: F.parseAmount(discount) ?? 0, taxPercent: F.parseAmount(tax) ?? 0 }
  const t = quoteTotals(current)
  const setItem = (id: string, p: Partial<InvoiceItem>) => up({ items: q.items.map(x => (x.id === id ? { ...x, ...p } : x)) })
  const setText = (id: string, k: 'qty' | 'price', v: string) => setTexts(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }))
  const addItem = (x: InvoiceItem) => {
    setTexts(prev => ({ ...prev, [x.id]: { qty: F.amountText(x.qty) || '1', price: F.amountText(x.price) } }))
    set(prev => ({ ...prev, items: [...prev.items.filter(y => y.description || (F.parseAmount(texts[y.id]?.price ?? '') ?? 0) > 0), x] }))
  }
  return (
    <Form title={item ? 'Edit quote' : 'New quote'} close={close} saveEnabled={!!q.number.trim() && items.some(x => x.qty * x.price > 0)}
      onSave={async () => {
        const customer = byId('customer', q.customerId)
        await save('quote', {
          ...current, number: q.number.trim(), title: q.title.trim(), clientName: customer?.name ?? q.clientName.trim(), notes: q.notes.trim(),
          items: items.filter(x => x.description.trim() || x.qty * x.price > 0), total: t.total,
        })
        close()
        if (!item) push({ name: 'quote', id: q.id })
      }}
      onDelete={item ? () => { remove('quote', item.id); close(); popNav() } : undefined}>
      <Seg options={[{ label: 'Draft', icon: 'pen' }, { label: 'Sent', icon: 'check' }]} value={q.status === 'draft' ? 0 : 1}
        onChange={i => up({ status: i ? (q.status === 'draft' ? 'sent' : q.status) : 'draft' })} />
      <Field label="What is it for?" value={q.title} placeholder="e.g. POS system for a bakery" onInput={v => up({ title: v })} autoFocus={!item} />
      <div class="row">
        <div style={{ flex: 1 }}><Field label="Quote number" value={q.number} onInput={v => up({ number: v })} /></div>
        <div style={{ flex: 1 }}><CurrencyField value={q.currency} onChange={v => up({ currency: v })} /></div>
      </div>
      <CustomerPicker value={q.customerId} onChange={v => up({ customerId: v })} none="Not a saved customer" />
      {!q.customerId && <Field label="Client name" value={q.clientName} icon="user" onInput={v => up({ clientName: v })} />}
      <ProjectPicker value={q.projectId} onChange={v => up({ projectId: v })} none="New project when accepted" />
      <DateField label="Valid until" value={q.validUntil} onChange={v => up({ validUntil: v })} />
      <div class="chips">
        {[7, 14, 30].map(d => <button key={d} class={cx('chip', q.validUntil === q.issueDate + d && 'on')} onClick={() => up({ validUntil: q.issueDate + d })}>{d} days</button>)}
      </div>

      <FieldLabel>Items</FieldLabel>
      {q.items.map(x => (
        <div key={x.id} class="card in-card inv-item">
          <div class="row">
            <input class="grow inv-desc" placeholder="Description (e.g. Setup and training)" value={x.description} onInput={e => setItem(x.id, { description: (e.target as HTMLInputElement).value })} />
            {q.items.length > 1 && <button class="muted" style={{ padding: 4 }} aria-label="Remove item" onClick={() => up({ items: q.items.filter(y => y.id !== x.id) })}><Icon name="close" size={14} /></button>}
          </div>
          <div class="row">
            <label class="inv-num"><span>Qty</span><input inputMode="decimal" value={texts[x.id]?.qty ?? ''} onInput={e => setText(x.id, 'qty', (e.target as HTMLInputElement).value)} /></label>
            <label class="inv-num grow"><span>Price</span><input inputMode="decimal" value={texts[x.id]?.price ?? ''} onInput={e => setText(x.id, 'price', (e.target as HTMLInputElement).value)} /></label>
            <div class="num bold amt" style={{ minWidth: 90, textAlign: 'end' }}>{F.money((F.parseAmount(texts[x.id]?.qty ?? '') ?? 0) * (F.parseAmount(texts[x.id]?.price ?? '') ?? 0), q.currency)}</div>
          </div>
        </div>
      ))}
      <div class="row wrap">
        <Btn kind="soft" sm icon="plus" onClick={() => addItem({ id: newId(), description: '', qty: 1, price: 0 })}>Add item</Btn>
        <Btn kind="soft" sm icon="tag" onClick={() => pickPrice(p => addItem({ id: newId(), description: p.name, qty: 1, price: p.price }))}>From price list</Btn>
      </div>
      <div class="row">
        <div style={{ flex: 1 }}><Field label={q.discountPercent ? 'Discount %' : `Discount (${q.currency})`} value={discount} inputMode="decimal" onInput={setDiscount} /></div>
        <div class="mini-seg">
          <button class={!q.discountPercent ? 'on' : ''} onClick={() => up({ discountPercent: false })}>{q.currency}</button>
          <button class={q.discountPercent ? 'on' : ''} onClick={() => up({ discountPercent: true })}>%</button>
        </div>
      </div>
      <Field label="Tax % (VAT…)" value={tax} inputMode="decimal" onInput={setTax} />
      <div class="card in-card totals-list">
        <div><span>Subtotal</span><b class="num">{F.money(t.subtotal, q.currency)}</b></div>
        {t.discount > 0 && <div><span>Discount</span><b class="num">−{F.money(t.discount, q.currency)}</b></div>}
        {t.tax > 0 && <div><span>Tax</span><b class="num">{F.money(t.tax, q.currency)}</b></div>}
        <div class="strong"><span>Total</span><b class="num">{F.money(t.total, q.currency)}</b></div>
      </div>
      <Field label="Notes (what's included, timeline, payment terms…)" multiline value={q.notes} onInput={v => up({ notes: v })} />
    </Form>
  )
}
