// Smart messages: ready-made WhatsApp texts for each situation (payment reminder, renewal, invoice,
// quote, thanks…) filled with the right name, amount and date. Templates can be edited and added in
// Settings › Message templates, and they sync between devices.

import { useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { currentLang } from '../i18n'
import { newId, type MsgTemplate } from '../types'
import { Btn, Chips, Empty, Field, FieldLabel, Form, Hint, PageHeader, Round, SheetTitle, openForm, openSheet } from '../ui'

export const msgKinds: { value: string; label: string; icon: string }[] = [
  { value: 'payment', label: 'Payment reminder', icon: 'bell' },
  { value: 'renewal', label: 'Renewal coming', icon: 'repeat' },
  { value: 'expired', label: 'Expired', icon: 'warning' },
  { value: 'invoice', label: 'Invoice sent', icon: 'invoice' },
  { value: 'quote', label: 'Quote sent', icon: 'pen' },
  { value: 'thanks', label: 'Thank you', icon: 'star' },
  { value: 'custom', label: 'Other', icon: 'note' },
]
export const msgKind = (k: string) => msgKinds.find(x => x.value === k) ?? msgKinds[msgKinds.length - 1]

const defaultsEn: Record<string, string> = {
  payment: 'Hi {name}, hope you are doing well! Just a friendly reminder about {amount}{for}{due}. Let me know if you have any questions. Thank you!\n\n{me}',
  renewal: 'Hi {name}! Your {what} renews on {date}. The price is {amount}. Please send the payment before then so it keeps running without a break. Thanks!\n\n{me}',
  expired: 'Hi {name}, your {what} ended on {date}. Send {amount} to renew it and I will switch it back on right away.\n\n{me}',
  invoice: 'Hi {name}, here is invoice {number} for {amount}{due}. Thank you for working with me!\n\n{me}',
  quote: 'Hi {name}, here is my offer {number} for {what}: {amount}{valid}. Happy to answer any questions.\n\n{me}',
  thanks: 'Hi {name}, I received {amount}. Thank you so much!\n\n{me}',
  custom: 'Hi {name}, ',
}
const defaultsAr: Record<string, string> = {
  payment: 'أهلاً {name}، أتمنى تكون بخير! تذكير بسيط بمبلغ {amount}{for}{due}. لو عندك أي سؤال أنا موجود. شكراً!\n\n{me}',
  renewal: 'أهلاً {name}! اشتراك {what} بيتجدد يوم {date}. السعر {amount}. ياريت تحوّل قبل الميعاد عشان الخدمة تفضل شغالة من غير توقف. شكراً!\n\n{me}',
  expired: 'أهلاً {name}، اشتراك {what} انتهى يوم {date}. حوّل {amount} للتجديد وهرجّعه يشتغل فوراً.\n\n{me}',
  invoice: 'أهلاً {name}، دي الفاتورة {number} بمبلغ {amount}{due}. شكراً لتعاملك معايا!\n\n{me}',
  quote: 'أهلاً {name}، ده عرض السعر {number} لـ {what}: {amount}{valid}. لو عندك أي سؤال أنا موجود.\n\n{me}',
  thanks: 'أهلاً {name}، وصلني {amount}. شكراً جداً!\n\n{me}',
  custom: 'أهلاً {name}، ',
}
const titlesAr: Record<string, string> = {
  payment: 'تذكير بالدفع', renewal: 'التجديد قرّب', expired: 'انتهى الاشتراك', invoice: 'إرسال فاتورة', quote: 'إرسال عرض سعر', thanks: 'شكر', custom: 'رسالة',
}

/** Built-in templates (one per kind) plus the user's own; an edited built-in replaces the original. */
export function allTemplates(): MsgTemplate[] {
  const ar = currentLang() === 'ar'
  const own = getState().data.msgtpl
  const builtIn = msgKinds.map(k => ({
    id: 'default-' + k.value, kind: k.value, title: ar ? titlesAr[k.value] : k.label, text: (ar ? defaultsAr : defaultsEn)[k.value], createdAt: 0,
  }))
  return [...builtIn.filter(b => !own.some(o => o.id === b.id)), ...own]
}

export interface MsgContext {
  name?: string; phone?: string; customerId?: string | null; amount?: number; currency?: string
  /** Due date (payment, invoice), renewal or end date (renewal, expired) or validity (quote). */
  date?: number | null; what?: string; number?: string
}

/** Fills a template's {placeholders} from the context. */
export function fill(text: string, c: MsgContext): string {
  const ar = currentLang() === 'ar'
  const customer = byId('customer', c.customerId)
  const first = (customer?.name || c.name || '').trim().split(' ')[0] || (ar ? 'يا فندم' : 'there')
  const me = getState().user?.name.trim().split(' ')[0] ?? ''
  const amount = c.amount != null ? F.money(c.amount, c.currency ?? getState().settings.currency) : ''
  const date = c.date != null ? F.date(c.date) : ''
  const past = c.date != null && c.date < F.today()
  return text
    .replace(/\{name\}/g, first)
    .replace(/\{amount\}/g, amount)
    .replace(/\{date\}/g, date)
    .replace(/\{what\}/g, c.what ?? '')
    .replace(/\{number\}/g, c.number ?? '')
    .replace(/\{me\}/g, me)
    .replace(/\{for\}/g, c.what ? (ar ? ` مقابل ${c.what}` : ` for ${c.what}`) : '')
    .replace(/\{due\}/g, c.date != null ? (ar ? (past ? `، وكان ميعاده ${date}` : `، والميعاد ${date}`) : past ? `, which was due on ${date}` : `, due on ${date}`) : '')
    .replace(/\{valid\}/g, c.date != null ? (ar ? `، العرض سارٍ حتى ${date}` : `, valid until ${date}`) : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Opens the message sheet for a situation, with the matching template already filled in. */
export function sendMessage(kind: string, c: MsgContext, title?: string) {
  openSheet(close => <MessageSheet kind={kind} c={c} title={title} close={close} />)
}

function MessageSheet({ kind, c, title, close }: { kind: string; c: MsgContext; title?: string; close: () => void }) {
  useApp()
  const templates = allTemplates()
  const first = templates.find(t => t.kind === kind) ?? templates[0]
  const [tplId, setTplId] = useState(first.id)
  const [text, setText] = useState(fill(first.text, c))
  const customer = byId('customer', c.customerId)
  const phone = c.phone || customer?.phone || ''
  const who = customer?.name || c.name || ''
  const pick = (id: string) => { const t = templates.find(x => x.id === id); if (t) { setTplId(id); setText(fill(t.text, c)) } }
  // Templates for this situation first, then the rest.
  const ordered = [...templates.filter(t => t.kind === kind), ...templates.filter(t => t.kind !== kind)]
  return (
    <>
      <SheetTitle title={title ?? msgKind(kind).label} sub={who || undefined} />
      <div class="body">
        <Chips options={ordered.map(t => t.id)} value={tplId} onChange={pick} label={id => templates.find(t => t.id === id)?.title ?? ''}
          icon={id => msgKind(templates.find(t => t.id === id)?.kind ?? 'custom').icon} />
        <Field label="Message" multiline value={text} onInput={setText} />
        <Btn block kind="t-mint" class="t-mint" icon="whatsapp" onClick={() => { call('app.whatsapp', { phone, text }); close() }}>
          {phone ? `WhatsApp ${who.split(' ')[0]}` : 'Send on WhatsApp'}
        </Btn>
        <div class="grid2">
          <Btn kind="soft" icon="share" onClick={() => { call('app.share', { subject: title ?? msgKind(kind).label, text }); close() }}>Share</Btn>
          <Btn kind="soft" icon="copy" onClick={() => { call('app.copy', { text }); close() }}>Copy</Btn>
        </div>
        {!phone && <Hint>Tip: save them as a customer with a phone number to open the chat directly.</Hint>}
        <button class="link" style={{ alignSelf: 'center' }} onClick={() => { close(); setTimeout(() => push({ name: 'messages' } as any), 150) }}>Edit templates</button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- templates page

export function MessagesScreen() {
  useApp()
  const list = allTemplates()
  return (
    <>
      <div class="scroll">
        <PageHeader title="Message templates" onBack={popNav}><Round icon="plus" label="New template" onClick={() => editTemplate()} /></PageHeader>
        <div class="content no-tabbar">
          <Hint>Words in braces are filled in for you: {'{name}'} first name, {'{amount}'}, {'{date}'}, {'{what}'} (the project, rental or item), {'{number}'} (invoice or quote), {'{me}'} your name.</Hint>
          {!list.length && <Empty icon="whatsapp" title="No templates" text="Add the messages you send most." />}
          {msgKinds.map(k => {
            const items = list.filter(t => t.kind === k.value)
            if (!items.length) return null
            return (
              <div key={k.value} class="card flush wide">
                <div class="row" style={{ padding: '12px 14px 4px' }}><Icon name={k.icon} size={15} class="accent" /><b class="grow">{k.label}</b></div>
                {items.map(t => (
                  <div key={t.id} class="item" onClick={() => editTemplate(t)}>
                    <div class="main"><div class="t">{t.title}</div><div class="s ellipsis">{t.text.replace(/\n+/g, ' ')}</div></div>
                    <Icon name="edit" size={13} class="muted" />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editTemplate()}><Icon name="plus" size={15} />Template</button>
    </>
  )
}

function editTemplate(item?: MsgTemplate) {
  openForm(close => <TemplateForm item={item} close={close} />)
}

function TemplateForm({ item, close }: { item?: MsgTemplate; close: () => void }) {
  const base: MsgTemplate = item ?? { id: newId(), kind: 'custom', title: '', text: 'Hi {name}, ', createdAt: Date.now() }
  const [t, set] = useState(base)
  const up = (x: Partial<MsgTemplate>) => set({ ...t, ...x })
  const builtIn = t.id.startsWith('default-')
  const edited = getState().data.msgtpl.some(x => x.id === t.id)
  const sample = fill(t.text, { name: 'Omar Hassan', amount: 1200, currency: getState().settings.currency, date: F.today() + 3, what: 'CarrotPOS', number: 'INV-0012' })
  return (
    <Form title={item ? 'Edit template' : 'New template'} close={close} saveEnabled={!!t.title.trim() && !!t.text.trim()}
      onSave={async () => { await save('msgtpl', { ...t, title: t.title.trim(), text: t.text.trim(), createdAt: t.createdAt || Date.now() }); close() }}
      onDelete={item && (!builtIn || edited) ? () => { remove('msgtpl', t.id); close() } : undefined}>
      <FieldLabel>Used for</FieldLabel>
      <Chips wrap options={msgKinds.map(k => k.value)} value={t.kind} onChange={v => up({ kind: v })} label={v => msgKind(v).label} icon={v => msgKind(v).icon} />
      <Field label="Name" value={t.title} onInput={v => up({ title: v })} autoFocus={!item} />
      <Field label="Message" multiline value={t.text} onInput={v => up({ text: v })} />
      <div class="row wrap" style={{ gap: 6 }}>
        {['{name}', '{amount}', '{date}', '{what}', '{number}', '{me}'].map(tag => (
          <button key={tag} class="chip" onClick={() => up({ text: t.text + (t.text.endsWith(' ') || !t.text ? '' : ' ') + tag })}>{tag}</button>
        ))}
      </div>
      <FieldLabel>Preview</FieldLabel>
      <div class="card in-card" style={{ whiteSpace: 'pre-wrap' }}>{sample}</div>
      {builtIn && edited && <Hint>Deleting your edited version brings back the original.</Hint>}
    </Form>
  )
}
