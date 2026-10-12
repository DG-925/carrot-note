// Customers plus every contact saved on the phone.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { ContactAvatar, ContactsDenied, editCustomer, editDebt, editEvent, editProject, editTxn, filterContacts, usePhoneContacts } from '../editors'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { DebtCard, EventRow, TxnRow, projectReceived } from '../rows'
import { useApp } from '../store'
import { debtRemaining, debtSettled, type Customer, type PhoneContact } from '../types'
import { Btn, Card, Empty, Eyebrow, Hint, PageHeader, Round, StatusChip, Seg, openSheet } from '../ui'

const key = (phone: string) => phone.replace(/\D/g, '').slice(-9)

export function CustomersScreen() {
  const s = useApp()
  const contacts = usePhoneContacts()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(0)
  const [limit, setLimit] = useState(120)
  const sentinel = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const customers = [...s.data.customer]
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) ||
      (q.replace(/\D/g, '').length >= 3 && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))))
    .sort((a, b) => a.name.localeCompare(b.name))
  const byPhone = useMemo(() => {
    const m = new Map<string, Customer>()
    s.data.customer.forEach(c => { if (c.phone) m.set(key(c.phone), c) })
    return m
  }, [s.data.customer])
  const phone = useMemo(() => filterContacts(contacts.list ?? [], query), [contacts.list, query])
  const owes = (c: Customer) => F.sumBy(s.data.debt.filter(d => d.customerId === c.id && !debtSettled(d) && d.direction === 'owed_to_me'), d => d.currency, debtRemaining)

  useEffect(() => { setLimit(120) }, [query, tab])
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) setLimit(l => l + 120) }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [phone.length, tab])

  const showCustomers = tab === 0 || tab === 1
  const showPhone = tab === 0 || tab === 2
  let lastLetter = ''

  return (
    <>
      <div class="scroll">
        <PageHeader title="Customers" onBack={popNav}>
          <Round icon="plus" label="New customer" onClick={() => editCustomer()} />
        </PageHeader>
        <div class="content no-tabbar">
          <div class="search pop" style={{ '--i': 1 } as any}><Icon name="search" size={17} />
            <input placeholder="Search name, phone, company" value={query} onInput={e => setQuery((e.target as HTMLInputElement).value)} />
            {query && <button class="muted" onClick={() => setQuery('')}><Icon name="close" size={14} /></button>}
          </div>
          <Seg i={2} value={tab} onChange={setTab} options={[
            { label: 'All' }, { label: `Customers ${s.data.customer.length}` }, { label: `Phone ${contacts.list ? contacts.list.length : ''}`.trim() },
          ]} />

          {showCustomers && <>
            {tab === 0 && <div class="section-h"><h3>Your customers</h3><span class="muted small semibold">{customers.length}</span></div>}
            {!customers.length && !q && (tab === 1
              ? <Empty icon="users" title="No customers yet" text="Add clients by hand, or save anyone from your phone contacts in one tap."><Btn icon="plus" onClick={() => editCustomer()}>New customer</Btn></Empty>
              : <Hint>No saved customers yet. Tap a phone contact below to save it as a customer.</Hint>)}
            {customers.length > 0 && (
              <div class="card flush pop" style={{ '--i': 3 } as any}>
                {customers.map(c => {
                  const o = owes(c)
                  return (
                    <div key={c.id} class="item" onClick={() => push({ name: 'customer', id: c.id })}>
                      <ContactAvatar name={c.name} size={44} />
                      <div class="main">
                        <div class="t">{c.name}</div>
                        <div class="s">{[c.company, c.phone].filter(Boolean).join(' · ') || 'No contact info'}</div>
                        {Object.keys(o).length > 0 && <div class="tiny good bold num">Owes you {F.totals(o, s.settings.currency)}</div>}
                      </div>
                      {c.phone && <div class="contact-actions">
                        <Round icon="whatsapp" sm class="t-mint" label="WhatsApp" onClick={() => call('app.whatsapp', { phone: c.phone })} />
                        <Round icon="phone" sm label="Call" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => call('app.dial', { phone: c.phone })} />
                      </div>}
                    </div>
                  )
                })}
              </div>
            )}
          </>}

          {showPhone && <>
            <div class="section-h"><h3>On this phone</h3>{contacts.list && <span class="muted small semibold">{phone.length}</span>}</div>
            {contacts.denied && <ContactsDenied retry={contacts.load} />}
            {!contacts.list && !contacts.denied && <div class="row" style={{ justifyContent: 'center', padding: 30 }}><span class="spinner" /></div>}
            {contacts.list && !phone.length && <Hint>{q ? 'No phone contacts match.' : 'No contacts on this phone.'}</Hint>}
            {phone.length > 0 && (
              <div class="card flush pop" style={{ '--i': 4 } as any}>
                {phone.slice(0, limit).map(p => {
                  const letter = (p.name[0] ?? '#').toUpperCase()
                  const showLetter = !q && letter !== lastLetter
                  lastLetter = letter
                  const saved = p.phones.map(key).map(k => byPhone.get(k)).find(Boolean)
                  return (
                    <div key={p.id}>
                      {showLetter && <div class="letter">{letter}</div>}
                      <div class="item" onClick={() => contactSheet(p, saved)}>
                        <ContactAvatar name={p.name} size={44} />
                        <div class="main">
                          <div class="t">{p.name}</div>
                          <div class="s">{[p.phones[0], p.company].filter(Boolean).join(' · ') || p.emails[0] || 'No number'}</div>
                        </div>
                        {saved && <span class="status st-done">Customer</span>}
                        {p.phones[0] && !saved && <div class="contact-actions">
                          <Round icon="whatsapp" sm class="t-mint" label="WhatsApp" onClick={() => call('app.whatsapp', { phone: p.phones[0] })} />
                          <Round icon="phone" sm onBg label="Call" onClick={() => call('app.dial', { phone: p.phones[0] })} />
                        </div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {phone.length > limit && <div ref={sentinel} class="row" style={{ justifyContent: 'center', padding: 16 }}><span class="spinner" /></div>}
          </>}
        </div>
      </div>
    </>
  )
}

function contactSheet(p: PhoneContact, saved?: Customer) {
  openSheet(close => <ContactSheet p={p} saved={saved} close={close} />)
}

function ContactSheet({ p, saved, close }: { p: PhoneContact; saved?: Customer; close: () => void }) {
  const go = (f: () => void) => { close(); setTimeout(f, 150) }
  return (
    <>
      <div class="row" style={{ padding: '0 4px', gap: 14 }}>
        <ContactAvatar name={p.name} size={64} />
        <div class="grow"><h2 class="h-lg">{p.name}</h2>{p.company && <div class="muted semibold">{p.company}</div>}</div>
      </div>
      <div class="body">
        {p.phones.length > 0 && <div class="card flush in-card">
          {p.phones.map(n => (
            <div key={n} class="item">
              <div class="badge-ico t-sky"><Icon name="phone" size={16} /></div>
              <div class="main"><div class="t num">{n}</div><div class="s">Phone</div></div>
              <Round icon="copy" sm onBg label="Copy" onClick={() => call('app.copy', { text: n })} />
              <Round icon="whatsapp" sm class="t-mint" label="WhatsApp" onClick={() => call('app.whatsapp', { phone: n })} />
              <Round icon="phone" sm label="Call" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => call('app.dial', { phone: n })} />
            </div>
          ))}
        </div>}
        {p.emails.length > 0 && <div class="card flush in-card">
          {p.emails.map(e => (
            <div key={e} class="item">
              <div class="badge-ico t-lilac"><Icon name="mail" size={16} /></div>
              <div class="main"><div class="t">{e}</div><div class="s">Email</div></div>
              <Round icon="mail" sm onBg label="Email" onClick={() => call('app.email', { to: e })} />
            </div>
          ))}
        </div>}
        {saved
          ? <Btn block icon="user" onClick={() => go(() => push({ name: 'customer', id: saved.id }))}>Open customer</Btn>
          : <Btn block icon="userPlus" onClick={() => go(() => editCustomer(undefined, { name: p.name, phone: p.phones[0] ?? '', email: p.emails[0] ?? '', company: p.company }))}>Save as customer</Btn>}
        <div class="grid2">
          <Btn kind="t-butter" class="t-butter" icon="debt" onClick={() => go(() => editDebt(undefined, { customerId: saved?.id, person: p.name }))}>Add debt</Btn>
          <Btn kind="t-mint" class="t-mint" icon="income" onClick={() => go(() => editTxn(undefined, { kind: 'income', customerId: saved?.id }))}>Payment</Btn>
        </div>
      </div>
    </>
  )
}

export function CustomerDetail({ id }: { id: string }) {
  const s = useApp()
  const c = s.data.customer.find(x => x.id === id)
  if (!c) {
    return <div class="scroll"><PageHeader title="Customer" onBack={popNav} />
      <Empty icon="user" title="Customer was deleted" text="Go back to your list."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  }
  const projects = s.data.project.filter(p => p.customerId === id).sort((a, b) => b.createdAt - a.createdAt)
  const pids = new Set(projects.map(p => p.id))
  const txns = s.data.txn.filter(t => t.customerId === id || (t.projectId && pids.has(t.projectId))).sort((a, b) => b.date - a.date)
  const paid = F.sumBy(txns.filter(t => t.kind === 'income'), t => t.currency, t => t.amount)
  const debts = s.data.debt.filter(d => d.customerId === id).sort((a, b) => Number(debtSettled(a)) - Number(debtSettled(b)))
  const events = s.data.event.filter(e => e.customerId === id && e.date >= F.today()).sort((a, b) => a.date - b.date)
  return (
    <div class="scroll">
      <PageHeader title={c.name} onBack={popNav}><Round icon="edit" label="Edit" onClick={() => editCustomer(c)} /></PageHeader>
      <div class="content no-tabbar">
        <Card i={1}>
          <div class="row" style={{ gap: 14 }}>
            <ContactAvatar name={c.name} size={60} />
            <div class="grow"><div class="h-lg">{c.name}</div>{c.company && <div class="muted semibold">{c.company}</div>}</div>
          </div>
          {(c.phone || c.email) && <div class="chips" style={{ marginTop: 12 }}>
            {c.phone && <Btn sm icon="phone" onClick={() => call('app.dial', { phone: c.phone })}>Call</Btn>}
            {c.phone && <Btn sm kind="t-mint" class="t-mint" icon="whatsapp" onClick={() => call('app.whatsapp', { phone: c.phone })}>WhatsApp</Btn>}
            {c.email && <Btn sm kind="t-sky" class="t-sky" icon="mail" onClick={() => call('app.email', { to: c.email })}>Email</Btn>}
          </div>}
          <div style={{ marginTop: 14 }}><Eyebrow>Total paid to you</Eyebrow><div class="num h-md good" style={{ fontWeight: 800 }}>{F.totals(paid, s.settings.currency)}</div></div>
          {c.notes && <p style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{c.notes}</p>}
        </Card>
        <div class="chips pop" style={{ '--i': 2 } as any}>
          <Btn sm kind="t-butter" class="t-butter" icon="plus" onClick={() => editProject(undefined, { customerId: id })}>Project</Btn>
          <Btn sm kind="t-mint" class="t-mint" icon="plus" onClick={() => editTxn(undefined, { kind: 'income', customerId: id })}>Payment</Btn>
          <Btn sm kind="t-rose" class="t-rose" icon="plus" onClick={() => editDebt(undefined, { customerId: id })}>Debt</Btn>
          <Btn sm kind="t-sky" class="t-sky" icon="plus" onClick={() => editEvent(undefined, { customerId: id })}>Event</Btn>
        </div>
        <div class="section-h"><h3>Projects</h3></div>
        {!projects.length && <Hint>No projects with this customer yet.</Hint>}
        {projects.map(p => (
          <Card key={p.id} onClick={() => push({ name: 'project', id: p.id })}>
            <div class="row"><div class="grow"><div class="h-sm ellipsis">{p.name}</div>
              <div class="small muted num">Paid {F.money(projectReceived(p, s.data.txn), p.currency)} of {F.money(p.price, p.currency)}</div></div>
              <StatusChip status={p.status} /></div>
          </Card>
        ))}
        {debts.length > 0 && <><div class="section-h"><h3>Debts</h3></div>{debts.map(d => <DebtCard key={d.id} d={d} />)}</>}
        {events.length > 0 && <><div class="section-h"><h3>Upcoming</h3></div><div class="card flush">{events.map(e => <EventRow key={e.id} e={e} showDate />)}</div></>}
        {txns.length > 0 && <><div class="section-h"><h3>Payments</h3></div><div class="card flush">{txns.map(t => <TxnRow key={t.id} t={t} extra={F.dateShort(t.date)} />)}</div></>}
      </div>
    </div>
  )
}
