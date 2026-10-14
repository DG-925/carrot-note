// Client links: a private web page for an invoice, quote or project that clients open in any
// browser. They can accept a quote or say they've paid; their answers come back as "reply" records
// and show here with a one-tap action.

import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { currentLang } from '../i18n'
import { Icon } from '../icons'
import { push } from '../nav'
import { getState, save, useApp } from '../store'
import type { ClientReply, Invoice, Quote } from '../types'
import { Btn, Card, Hint, SheetTitle, attempt, confirm, openSheet, toast } from '../ui'

type LinkType = 'invoice' | 'quote' | 'project'

const what: Record<LinkType, string> = { invoice: 'invoice', quote: 'price offer', project: 'project progress' }

/** Opens the sheet with the client link for a record (made on first use). */
export function openClientLink(type: LinkType, id: string, opts: { title: string; client: string; customerId?: string | null }) {
  openSheet(close => <LinkSheet type={type} id={id} {...opts} close={close} />)
}

function LinkSheet({ type, id, title, client, customerId, close }: { type: LinkType; id: string; title: string; client: string; customerId?: string | null; close: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const phone = customerId ? getState().data.customer.find(c => c.id === customerId)?.phone ?? '' : ''
  useEffect(() => {
    call<{ url: string }>('api.request', { path: '/api/share', body: { type, id, lang: currentLang() } })
      .then(r => setUrl(r.url))
      .catch(e => setError(String(e?.message ?? e)))
  }, [])
  const first = client.split(' ')[0]
  const text = url ? (currentLang() === 'ar'
    ? `أهلاً ${first}، ده رابط ${type === 'invoice' ? 'الفاتورة' : type === 'quote' ? 'عرض السعر' : 'متابعة المشروع'} ${title}: ${url}`
    : `Hi ${first}, here's the ${what[type]} ${title}: ${url}`) : ''
  return (
    <>
      <SheetTitle title="Client link" sub={`${title}${client ? ' · ' + client : ''}`} />
      <div class="body">
        <Hint>{type === 'quote' ? 'Your client opens this page in any browser and can accept the offer. You get a notification when they do.'
          : type === 'invoice' ? 'Your client sees the invoice and can tell you they paid. You get a notification and record it with one tap.'
            : 'Your client sees how far the project is and what they paid. Task names and notes stay private.'}</Hint>
        {!url && !error && <div class="card in-card center"><span class="spinner" /></div>}
        {error && <div class="card in-card"><div class="bad semibold">{error}</div></div>}
        {url && <>
          <div class="card in-card link-box" onClick={() => call('app.copy', { text: url, toast: 'Link copied' })}>
            <Icon name="link" size={16} class="accent" /><span class="grow ellipsis num">{url.replace(/^https?:\/\//, '')}</span><Icon name="copy" size={16} />
          </div>
          <div class="grid2">
            <Btn kind="t-mint" class="t-mint" icon="whatsapp" onClick={() => call('app.whatsapp', { phone, text })}>WhatsApp</Btn>
            <Btn kind="soft-bg" icon="share" onClick={() => call('app.share', { text })}>Share</Btn>
            <Btn kind="soft-bg" icon="copy" onClick={() => call('app.copy', { text: url, toast: 'Link copied' })}>Copy link</Btn>
            <Btn kind="soft-bg" icon="open" onClick={() => call('app.openUrl', { url })}>Open</Btn>
          </div>
          <button class="link bad" style={{ marginTop: 14 }} onClick={async () => {
            if (!(await confirm('Stop sharing?', 'The link stops working. You can make a new one any time.', 'Stop sharing'))) return
            await attempt(() => call('api.request', { path: '/api/share/revoke', body: { type, id } }))
            toast('Link stopped')
            close()
          }}>Stop sharing this link</button>
        </>}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- client answers

const replyText = (r: ClientReply) => {
  const who = r.name || r.clientName || 'Your client'
  if (r.kind === 'accept') return `${who} accepted the offer`
  if (r.kind === 'decline') return `${who} declined the offer`
  return `${who} says they paid${r.amount ? ` ${F.money(r.amount, r.currency)}` : ''}${r.method ? ` · ${r.method}` : ''}`
}

const handled = (r: ClientReply) => save('reply', { ...r, handled: true })

/** Answers waiting on this invoice or quote, with what to do about them. */
export function ClientReplies({ type, id, onAccept, onPaid }: { type: 'invoice' | 'quote'; id: string; onAccept?: () => Promise<void> | void; onPaid?: (r: ClientReply) => void }) {
  const s = useApp()
  const list = s.data.reply.filter(r => r.targetType === type && r.targetId === id && !r.handled).sort((a, b) => b.at - a.at)
  if (!list.length) return null
  return (
    <>
      {list.map(r => (
        <Card key={r.id} class="wide reply-card">
          <div class="row"><Icon name={r.kind === 'decline' ? 'close' : r.kind === 'accept' ? 'checkCircle' : 'income'} size={18} class={r.kind === 'decline' ? 'bad' : 'good'} />
            <b class="grow">{replyText(r)}</b><span class="tiny muted">{F.relativeDay(F.dayOfMs(r.at))}</span></div>
          {r.note && <p class="reply-note">“{r.note}”</p>}
          <div class="row wrap" style={{ marginTop: 8 }}>
            {r.kind === 'accept' && onAccept && <Btn sm icon="check" onClick={async () => { await onAccept(); await handled(r) }}>Make it a project and invoice</Btn>}
            {r.kind === 'decline' && <Btn sm kind="ghost" icon="close" onClick={async () => {
              const q = getState().data.quote.find(x => x.id === id)
              if (q) await attempt(() => save('quote', { ...q, status: 'declined' } as Quote))
              await handled(r)
            }}>Mark as declined</Btn>}
            {r.kind === 'paid' && onPaid && <Btn sm icon="income" onClick={() => onPaid(r)}>Record the payment</Btn>}
            <Btn sm kind="ghost" onClick={() => handled(r)}>Dismiss</Btn>
          </div>
        </Card>
      ))}
    </>
  )
}

/** Home: answers from clients that still need something done. */
export function RepliesCard() {
  const s = useApp()
  const list = s.data.reply.filter(r => !r.handled).sort((a, b) => b.at - a.at)
  if (!list.length) return null
  return (
    <div class="card flush wide pop" style={{ '--i': 2 } as any}>
      <div class="row" style={{ padding: '12px 0 4px' }}><Icon name="link" size={15} class="accent" /><b class="grow">Clients answered</b></div>
      {list.slice(0, 4).map(r => (
        <div key={r.id} class="item" onClick={() => push({ name: r.targetType === 'quote' ? 'quote' : 'invoice', id: r.targetId })}>
          <div class={'badge-ico ' + (r.kind === 'decline' ? 't-rose' : 't-mint')}><Icon name={r.kind === 'paid' ? 'income' : r.kind === 'accept' ? 'check' : 'close'} size={15} /></div>
          <div class="main"><div class="t">{replyText(r)}</div><div class="s">{r.number} · {F.relativeDay(F.dayOfMs(r.at))}</div></div>
          <Icon name="right" size={13} class="muted" />
        </div>
      ))}
    </div>
  )
}

/** Marks the "paid" answers of an invoice handled once its payment is recorded. */
export function settleReplies(inv: Invoice) {
  for (const r of getState().data.reply) if (r.targetType === 'invoice' && r.targetId === inv.id && r.kind === 'paid' && !r.handled) handled(r)
}
