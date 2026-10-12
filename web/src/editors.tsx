// Every "add / edit" form, opened as a sliding page or sheet.

import { useEffect, useMemo, useState } from 'preact/hooks'
import { call } from './bridge'
import * as F from './format'
import { categoryIcon, Icon, methodIcon } from './icons'
import { openOverlay, push } from './nav'
import { myRepos, repoPath, repoUrl, verifyRepo, languageColor, type GhRepo } from './github'
import { ago, getJson } from './net'
import { byId, getState, remove, save, setTaskDone, useApp } from './store'
import { linkGithub } from './screens/account'
import {
  Categories, newId, debtRemaining, goalSaved,
  type Budget, type CalEvent, type CheckItem, type Customer, type Debt, type Goal, type InfoItem, type Note,
  type PhoneContact, type Project, type TaskItem, type TimeEntry, type Txn,
} from './types'
import {
  AmountBox, Btn, Chips, CurrencyField, DateField, Field, FieldLabel, Form, Hint, MoreOptions, Round, SearchBar, Seg,
  SelectField, SheetTitle, SwitchRow, TimeField, attempt, matches, openForm, openSheet, toast,
} from './ui'
import { dateLocale } from './i18n'

const now = () => Date.now()

export function ProjectPicker({ value, onChange, label = 'Project (optional)', none = 'No project · just for me' }: { value?: string | null; onChange: (v: string | null) => void; label?: string; none?: string }) {
  const s = useApp()
  const opts = [{ value: '', label: none }, ...[...s.data.project].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))]
  return <SelectField label={label} value={value ?? ''} options={opts} onChange={v => onChange(v || null)} />
}

export function CustomerPicker({ value, onChange, none = 'None' }: { value?: string | null; onChange: (v: string | null) => void; none?: string }) {
  const s = useApp()
  const opts = [{ value: '', label: none }, ...[...s.data.customer].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ value: c.id, label: c.name }))]
  return <SelectField label="Customer" value={value ?? ''} options={opts} onChange={v => onChange(v || null)} />
}

// ---------------------------------------------------------------- task

export function editTask(item?: TaskItem, defaults: { projectId?: string | null; date?: number | null; title?: string; notes?: string; doing?: boolean } = {}) {
  openForm(close => <TaskForm item={item} defaults={defaults} close={close} />)
}

function TaskForm({ item, defaults, close }: { item?: TaskItem; defaults: { projectId?: string | null; date?: number | null; title?: string; notes?: string; doing?: boolean }; close: () => void }) {
  const s = useApp()
  const base: TaskItem = item ?? {
    id: newId(), title: defaults.title ?? '', notes: defaults.notes ?? '', projectId: defaults.projectId ?? null, dueDate: defaults.date ?? null, dueTime: null,
    reminder: false, done: false, priority: 1, createdAt: now(), repeat: '', doing: !!defaults.doing, subtasks: [], assignee: null,
  }
  const [t, set] = useState(base)
  const up = (p: Partial<TaskItem>) => set({ ...t, ...p })
  const prios = ['Low', 'Normal', 'High']
  return (
    <Form title={item ? 'Edit task' : 'New task'} close={close} saveEnabled={!!t.title.trim()}
      onSave={async () => {
        const final = {
          ...t, title: t.title.trim(), notes: t.notes.trim(), dueTime: t.dueDate == null ? null : t.dueTime, reminder: t.reminder && t.dueDate != null,
          subtasks: (t.subtasks ?? []).filter(x => x.text.trim()), doing: !t.done && !!t.doing,
        }
        if (item && !item.done && final.done) await setTaskDone({ ...final, done: false }, true)
        else await save('task', final)
        close()
      }}
      onDelete={item ? () => { remove('task', item.id); close() } : undefined}>
      <Field label="What needs to be done?" value={t.title} onInput={v => up({ title: v })} autoFocus={!item} />
      <DateField label="Due date" value={t.dueDate} onChange={v => up({ dueDate: v, repeat: v == null ? '' : t.repeat })} />
      <FieldLabel>Repeat</FieldLabel>
      <Chips options={['', 'daily', 'weekly', 'monthly']} value={t.repeat ?? ''} icon={v => (v ? 'repeat' : 'close')}
        label={v => ({ '': 'Never', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' } as any)[v]}
        onChange={v => up({ repeat: v, dueDate: v && t.dueDate == null ? F.today() : t.dueDate })} />
      {!!t.repeat && <Hint>When you tick it off, the next one is added for {t.dueDate != null ? F.relativeDay(F.nextRepeat(t.dueDate, t.repeat)).toLowerCase() : 'later'}.</Hint>}
      {item && <>
        <FieldLabel>Status</FieldLabel>
        <Seg options={[{ label: 'To do', icon: 'square' }, { label: 'Doing', icon: 'play' }, { label: 'Done', icon: 'checkSquare' }]}
          value={t.done ? 2 : t.doing ? 1 : 0} onChange={i => up({ done: i === 2, doing: i === 1 })} />
      </>}
      <FieldLabel>Steps {(t.subtasks ?? []).length > 0 && `· ${(t.subtasks ?? []).filter(x => x.done).length}/${(t.subtasks ?? []).length}`}</FieldLabel>
      {(t.subtasks ?? []).map((c, i) => (
        <div class="row" key={c.id}>
          <button class={'check' + (c.done ? ' on' : '')} onClick={() => up({ subtasks: (t.subtasks ?? []).map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}><i>{c.done && <Icon name="check" size={12} stroke={3} />}</i></button>
          <input class="subtask-input" placeholder="Step" value={c.text} style={{ textDecoration: c.done ? 'line-through' : 'none' }}
            ref={el => { if (el && !c.text && i === (t.subtasks ?? []).length - 1 && document.activeElement?.tagName !== 'INPUT') el.focus() }}
            onInput={e => up({ subtasks: (t.subtasks ?? []).map((x, j) => (j === i ? { ...x, text: (e.target as HTMLInputElement).value } : x)) })}
            onKeyDown={e => { if (e.key === 'Enter') up({ subtasks: [...(t.subtasks ?? []), { id: newId(), text: '', done: false }] }) }} />
          <button class="muted" style={{ padding: 6 }} aria-label="Remove step" onClick={() => up({ subtasks: (t.subtasks ?? []).filter((_, j) => j !== i) })}><Icon name="close" size={14} /></button>
        </div>
      ))}
      <Btn kind="soft" sm icon="plus" onClick={() => up({ subtasks: [...(t.subtasks ?? []), { id: newId(), text: '', done: false }] })}>Add a step</Btn>
      {(() => {
        const space = t.projectId ? s.spaces.find(sp => sp.kind === 'project' && sp.projectId === t.projectId) : undefined
        return space && space.members.length > 1 ? (
          <SelectField label="Assigned to" value={t.assignee ?? ''} onChange={v => up({ assignee: v || null })}
            options={[{ value: '', label: 'Nobody' }, ...space.members.map(m => ({ value: m.id, label: (m.name || '@' + m.username) + (m.id === s.user?.id ? ' (me)' : '') }))]} />
        ) : null
      })()}
      <MoreOptions startOpen={!!base.notes || base.reminder || base.priority !== 1 || base.dueTime != null}>
        <Field label="Details" multiline value={t.notes} onInput={v => up({ notes: v })} />
        {t.dueDate != null && <>
          <TimeField label="Time" value={t.dueTime} onChange={v => up({ dueTime: v })} />
          <div class="card in-card"><SwitchRow title="Remind me" sub="Notification at the due time (9:00 AM if no time)" on={t.reminder} onChange={v => up({ reminder: v })} /></div>
        </>}
        <FieldLabel>Priority</FieldLabel>
        <Chips options={prios} value={prios[t.priority] ?? 'Normal'} onChange={v => up({ priority: prios.indexOf(v) })}
          icon={v => (v === 'High' ? 'flag' : v === 'Low' ? 'list' : 'tasks')} />
        <ProjectPicker value={t.projectId} onChange={v => up({ projectId: v })} />
      </MoreOptions>
    </Form>
  )
}

// ---------------------------------------------------------------- note

export function noteText(n: Note) {
  const parts: string[] = []
  if (n.title) parts.push(n.title, '')
  if (n.body) parts.push(n.body)
  if (n.checklist.length) {
    if (n.body) parts.push('')
    n.checklist.forEach(c => parts.push((c.done ? '☑ ' : '☐ ') + c.text))
  }
  return parts.join('\n').trim()
}

export function editNote(item?: Note, defaults: { projectId?: string | null; date?: number | null; checklist?: boolean; title?: string; body?: string } = {}) {
  openForm(close => <NoteForm item={item} defaults={defaults} close={close} />)
}

const noteColors = ['', '#FFE3D1', '#FFE58F', '#C7F0D8', '#CFE6FF', '#E6DEFF', '#FFD6DE']

function NoteForm({ item, defaults, close }: { item?: Note; defaults: { projectId?: string | null; date?: number | null; checklist?: boolean; title?: string; body?: string }; close: () => void }) {
  const s = useApp()
  const base: Note = item ?? {
    id: newId(), title: defaults.title ?? '', body: defaults.body ?? '', checklist: defaults.checklist ? [{ id: newId(), text: '', done: false }] : [],
    projectId: defaults.projectId ?? null, date: defaults.date ?? null, pinned: false, color: 0, createdAt: now(),
  }
  const [n, set] = useState(base)
  const up = (p: Partial<Note>) => set({ ...n, ...p })
  const setItem = (i: number, p: Partial<CheckItem>) => up({ checklist: n.checklist.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const shared = !!n.projectId && s.spaces.some(sp => sp.kind === 'project' && sp.projectId === n.projectId)
  const current = (): Note => ({ ...n, title: n.title.trim(), body: n.body.trim(), checklist: n.checklist.filter(c => c.text.trim()) })
  const canSave = !!(n.title.trim() || n.body.trim() || n.checklist.some(c => c.text.trim()))
  return (
    <Form title={item ? 'Edit note' : 'New note'} close={close} saveEnabled={canSave}
      onSave={async () => { await save('note', current()); close() }}
      onDelete={item ? () => { remove('note', item.id); close() } : undefined}
      actions={<>
        <Round icon="pin" label="Pin" onClick={() => up({ pinned: !n.pinned })} style={n.pinned ? { background: 'var(--accent)', color: '#fff' } : undefined} />
        <Round icon="share" label="Share" onClick={() => call('app.share', { subject: n.title || 'Note', text: noteText(current()) })} />
      </>}>
      <div class="card in-card" style={n.color ? { background: noteColors[n.color], color: '#2A211B' } : undefined}>
        <input class="h-lg" style={{ width: '100%', border: 0, outline: 0, background: 'transparent', padding: 0 }} placeholder="Title" value={n.title}
          onInput={e => up({ title: (e.target as HTMLInputElement).value })} />
        <textarea style={{ width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'none', padding: 0, marginTop: 8, fontSize: 16, lineHeight: 1.5, minHeight: n.checklist.length ? 60 : 180 }}
          placeholder="Write anything…" value={n.body} onInput={e => up({ body: (e.target as HTMLTextAreaElement).value })} />
        {n.checklist.length > 0 && <div class="col tight" style={{ marginTop: 6 }}>
          <div class="field-label" style={{ color: 'inherit', opacity: .7 }}>Checklist · {n.checklist.filter(c => c.done).length}/{n.checklist.length}</div>
          {n.checklist.map((c, i) => (
            <div class="row" key={c.id}>
              <button class={'check' + (c.done ? ' on' : '')} onClick={() => setItem(i, { done: !c.done })}><i>{c.done && <Icon name="check" size={12} stroke={3} />}</i></button>
              <input style={{ flex: 1, border: 0, outline: 0, background: 'transparent', fontSize: 16, textDecoration: c.done ? 'line-through' : 'none', opacity: c.done ? .6 : 1 }}
                placeholder="Item" value={c.text} ref={el => { if (el && !c.text && i === n.checklist.length - 1 && document.activeElement?.tagName !== 'INPUT') el.focus() }}
                onInput={e => setItem(i, { text: (e.target as HTMLInputElement).value })}
                onKeyDown={e => { if (e.key === 'Enter') up({ checklist: [...n.checklist, { id: newId(), text: '', done: false }] }) }} />
              <button class="muted" style={{ padding: 6 }} onClick={() => up({ checklist: n.checklist.filter((_, j) => j !== i) })}><Icon name="close" size={14} /></button>
            </div>
          ))}
        </div>}
      </div>
      <Btn kind="t-lilac" icon="checkSquare" class="t-lilac" onClick={() => up({ checklist: [...n.checklist, { id: newId(), text: '', done: false }] })}>
        {n.checklist.length ? 'Add item' : 'Add checklist'}
      </Btn>
      <MoreOptions startOpen={base.projectId != null || base.date != null || base.color !== 0}>
        <FieldLabel>Color</FieldLabel>
        <div class="swatches">
          {noteColors.map((c, i) => (
            <button key={i} class={'swatch' + (n.color === i ? ' on' : '')} style={{ background: c || 'var(--card)' }} onClick={() => up({ color: i })}>
              {n.color === i && <Icon name="check" size={12} stroke={3} />}
            </button>
          ))}
        </div>
        <ProjectPicker value={n.projectId} onChange={v => up({ projectId: v })} />
        <Hint>{!n.projectId ? 'Personal note. Only you can see it.' : shared ? 'This project is shared: your team can see and edit this note.' : 'Saved under the project.'}</Hint>
        <DateField label="Show on calendar" value={n.date} onChange={v => up({ date: v })} />
      </MoreOptions>
    </Form>
  )
}

// ---------------------------------------------------------------- money

export function editTxn(item?: Txn, defaults: { kind?: string; projectId?: string | null; customerId?: string | null; date?: number; note?: string; amount?: number } = {}) {
  openForm(close => <TxnForm item={item} defaults={defaults} close={close} />)
}

function TxnForm({ item, defaults, close }: { item?: Txn; defaults: { kind?: string; projectId?: string | null; customerId?: string | null; date?: number; note?: string; amount?: number }; close: () => void }) {
  const st = getState()
  const kind0 = defaults.kind ?? 'expense'
  const base: Txn = item ?? {
    id: newId(), kind: kind0, amount: defaults.amount ?? 0,
    currency: (defaults.projectId && byId('project', defaults.projectId)?.currency) || st.settings.currency,
    category: kind0 === 'income' ? (defaults.projectId ? 'Project payment' : 'Freelance') : 'Food',
    method: 'Cash', date: defaults.date ?? F.today(), note: defaults.note ?? '', projectId: defaults.projectId ?? null, customerId: defaults.customerId ?? null, createdAt: now(),
  }
  const [t, set] = useState(base)
  const [repeat, setRepeat] = useState('')
  // Receipt photo: '' = none, a data URL = new/kept photo, null = still loading the saved one.
  const [receipt, setReceipt] = useState<string | null>(base.receiptId ? null : '')
  useEffect(() => {
    if (base.receiptId) call<{ data?: string } | null>('receipt.get', { id: base.receiptId }).then(r => setReceipt(r?.data ?? '')).catch(() => setReceipt(''))
  }, [])
  const [amount, setAmount] = useState(F.amountText(base.amount))
  const up = (p: Partial<Txn>) => set({ ...t, ...p })
  const income = t.kind === 'income'
  const parsed = F.parseAmount(amount)
  const cats = income ? Categories.income : Categories.expense
  return (
    <Form title={item ? 'Edit transaction' : income ? 'Money received' : 'New expense'} close={close}
      saveEnabled={parsed != null && parsed > 0 && !!t.currency}
      onSave={async () => {
        let receiptId = t.receiptId ?? null
        if (receipt && !receiptId) {
          receiptId = newId()
          await save('receipt' as any, { id: receiptId, txnId: t.id, data: receipt, createdAt: now() } as any)
        } else if (receipt === '' && receiptId) {
          remove('receipt' as any, receiptId)
          receiptId = null
        }
        const final = { ...t, amount: parsed ?? 0, category: t.category.trim() || 'Other', note: t.note.trim(), receiptId }
        await save('txn', final)
        if (!item && repeat) {
          const { nextOccurrence } = await import('./recurring')
          await save('recurring', {
            id: newId(), kind: final.kind, amount: final.amount, currency: final.currency, category: final.category, method: final.method, note: final.note,
            projectId: final.projectId ?? null, customerId: final.customerId ?? null, period: repeat, nextDate: nextOccurrence(final.date, repeat), active: true, createdAt: now(),
          })
          toast('Saved. It will be added again by itself.')
        }
        close()
      }}
      onDelete={item ? () => { remove('txn', item.id); if (item.receiptId) remove('receipt' as any, item.receiptId); close() } : undefined}>
      <Seg options={[{ label: 'Expense', icon: 'expense' }, { label: 'Income', icon: 'income' }]} value={income ? 1 : 0}
        onChange={i => { const k = i === 1 ? 'income' : 'expense'; if (k !== t.kind) up({ kind: k, category: k === 'income' ? 'Freelance' : 'Food' }) }} />
      <AmountBox value={amount} onInput={setAmount} currency={t.currency} onCurrency={c => up({ currency: c })} color={income ? 'var(--good)' : 'var(--fg)'} />
      <Field label={income ? 'From who / what for (optional)' : 'What was it for? (optional)'} value={t.note} onInput={v => up({ note: v })} />
      <FieldLabel>Category</FieldLabel>
      <Chips options={cats.includes(t.category) || !t.category ? cats : [...cats, t.category]} value={t.category} onChange={v => up({ category: v })} icon={categoryIcon} />
      <FieldLabel>{income ? 'Received via' : 'Paid with'}</FieldLabel>
      <Chips options={Categories.methods} value={t.method} onChange={v => up({ method: v })} icon={methodIcon} />
      <DateField label="Date" value={t.date} onChange={v => up({ date: v ?? F.today() })} clearable={false} />
      <FieldLabel>Receipt</FieldLabel>
      {receipt === null && <div class="receipt-box"><span class="spinner" /></div>}
      {receipt && <div class="receipt-box" onClick={() => viewPhoto(receipt)}>
        <img src={receipt} alt="Receipt" />
        <Round icon="close" sm label="Remove receipt" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => setReceipt('')} />
      </div>}
      {receipt === '' && <div class="row">
        <Btn kind="soft" sm icon="camera" onClick={async () => { const r = await attempt(() => call<string | null>('receipt.capture', { source: 'camera' })); if (r) setReceipt(r) }}>Take photo</Btn>
        <Btn kind="soft" sm icon="image" onClick={async () => { const r = await attempt(() => call<string | null>('receipt.capture', { source: 'gallery' })); if (r) setReceipt(r) }}>From gallery</Btn>
      </div>}
      {!item && <>
        <FieldLabel>Repeats</FieldLabel>
        <Chips options={['', 'weekly', 'monthly', 'yearly']} value={repeat} onChange={setRepeat} icon={v => (v ? 'repeat' : 'close')}
          label={v => ({ '': 'Never', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' } as Record<string, string>)[v]} />
      </>}
      <MoreOptions startOpen={base.customerId != null || (!!item && base.projectId != null)}>
        <ProjectPicker value={t.projectId} onChange={v => up({ projectId: v })} />
        <CustomerPicker value={t.customerId} onChange={v => up({ customerId: v })} />
      </MoreOptions>
    </Form>
  )
}

/** Full-screen view of a photo (receipts). */
export function viewPhoto(src: string) {
  openOverlay('page', close => (
    <div class="photo-view" onClick={close}>
      <img src={src} alt="" />
      <Round icon="close" label="Close" style={{ position: 'absolute', top: 'calc(var(--sat) + 12px)', right: 12 }} onClick={close} />
    </div>
  ))
}

// ---------------------------------------------------------------- project

export function editProject(item?: Project, defaults: { customerId?: string | null } = {}) {
  openForm(close => <ProjectForm item={item} defaults={defaults} close={close} />)
}

function ProjectForm({ item, defaults, close }: { item?: Project; defaults: { customerId?: string | null }; close: () => void }) {
  const s = useApp()
  const base: Project = item ?? {
    id: newId(), name: '', customerId: defaults.customerId ?? null, clientName: '', price: 0, currency: s.settings.currency, status: 'active',
    startDate: F.today(), deadline: null, description: '', info: [], billing: 'fixed', hourlyRate: 0, repo: '', createdAt: now(),
  }
  const space = s.spaces.find(sp => sp.kind === 'project' && sp.projectId === base.id)
  const isOwner = !space || space.role === 'owner'
  const [p, set] = useState(base)
  const [price, setPrice] = useState(F.amountText(base.price))
  const [rate, setRate] = useState(F.amountText(base.hourlyRate))
  const up = (x: Partial<Project>) => set({ ...p, ...x })
  const setInfo = (i: number, x: Partial<InfoItem>) => up({ info: p.info.map((it, j) => (j === i ? { ...it, ...x } : it)) })
  const product = p.kind === 'product'
  const hourly = !product && p.billing === 'hourly'
  return (
    <Form title={item ? 'Edit project' : 'New project'} close={close} saveEnabled={!!p.name.trim()}
      onSave={async () => {
        const customer = byId('customer', p.customerId)
        // Partners and earnings may have changed (or synced from a partner) while this form was open.
        const latest = byId('project', p.id)
        await save('project', {
          ...p, partners: latest?.partners ?? p.partners, splits: latest?.splits ?? p.splits, name: p.name.trim(), clientName: customer?.name ?? p.clientName.trim(),
          price: F.parseAmount(price) ?? 0, hourlyRate: F.parseAmount(rate) ?? 0, currency: p.currency || s.settings.currency,
          description: p.description.trim(), repo: p.repo.trim(), info: p.info.filter(i => i.label.trim() || i.value.trim()),
        })
        close()
      }}
      onDelete={item && isOwner ? () => { remove('project', item.id); close() } : undefined}>
      <div class="kind-pick">
        {([['work', 'briefcase', 'Client work', 'I build it for a client'], ['product', 'laptop', 'Product we rent', 'We built it and rent it out']] as const).map(([k, icon, t, sub]) => (
          <button key={k} class={(p.kind ?? 'work') === k ? 'on' : ''} onClick={() => up({ kind: k, billing: k === 'product' ? 'fixed' : p.billing })}>
            <Icon name={icon} size={18} /><b>{t}</b><span class="tiny muted">{sub}</span>
          </button>
        ))}
      </div>
      <Field label={product ? 'Product name' : 'Project name'} value={p.name} placeholder={product ? 'e.g. CarrotPOS' : undefined} onInput={v => up({ name: v })} autoFocus={!item} />
      {!product && (!p.customerId || !isOwner) && <Field label="Client name (optional)" value={p.clientName} onInput={v => up({ clientName: v })} />}
      <div class="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1.4 }}>
          {hourly
            ? <Field label="Rate per hour" value={rate} inputMode="decimal" onInput={setRate} />
            : <Field label={product ? 'Usual rent price (per month)' : 'Price'} value={price} inputMode="decimal" onInput={setPrice} />}
        </div>
        <div style={{ flex: 1 }}><CurrencyField value={p.currency} onChange={v => up({ currency: v })} /></div>
      </div>
      <SelectField label="Status" value={p.status} onChange={v => up({ status: v })}
        options={[{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On hold' }, { value: 'done', label: 'Done' }, { value: 'cancelled', label: 'Cancelled' }]} />
      {!product && <DateField label="Deadline" value={p.deadline} onChange={v => up({ deadline: v })} />}
      <MoreOptions startOpen={!!base.repo || (!!item && (!!base.description || base.info.length > 0 || base.billing === 'hourly'))}>
        {isOwner && !product && <CustomerPicker value={p.customerId} onChange={v => up({ customerId: v })} none="No saved customer" />}
        {!product && <>
          <FieldLabel>Billing</FieldLabel>
          <Seg options={[{ label: 'Fixed price', icon: 'tag' }, { label: 'Hourly', icon: 'timer' }]} value={hourly ? 1 : 0} onChange={i => up({ billing: i === 1 ? 'hourly' : 'fixed' })} />
        </>}
        <DateField label="Start date" value={p.startDate} onChange={v => up({ startDate: v })} />
        <Field label="Description / scope" multiline value={p.description} onInput={v => up({ description: v })} />
        <RepoField value={p.repo} onChange={v => up({ repo: v })} />
        <FieldLabel>Project info (links, accounts, specs…)</FieldLabel>
        {p.info.map((it, i) => (
          <div class="row" key={i}>
            <div style={{ flex: 0.8 }}><Field label="Label" value={it.label} onInput={v => setInfo(i, { label: v })} /></div>
            <div style={{ flex: 1.2 }}><Field label="Value" value={it.value} onInput={v => setInfo(i, { value: v })} /></div>
            <Round icon="close" sm label="Remove" onClick={() => up({ info: p.info.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <Btn kind="soft" icon="plus" onClick={() => up({ info: [...p.info, { label: '', value: '' }] })}>Add info field</Btn>
      </MoreOptions>
    </Form>
  )
}

/** The project's repository, chosen from the user's own GitHub repos. */
function RepoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const path = repoPath(value)
  return (
    <div class="field with-icon press" onClick={() => pickRepo(onChange)}>
      <Icon name="github" size={17} />
      <div class="inner">
        <label>GitHub repository (optional)</label>
        <div class={path ? 'semibold ellipsis' : 'muted'} style={{ padding: '2px 0' }}>{path ?? (value ? value : 'Choose one of your repositories')}</div>
      </div>
      {value ? <Round icon="close" sm onBg label="Remove" onClick={() => onChange('')} /> : <Icon name="right" size={13} class="muted" />}
    </div>
  )
}

export function pickRepo(onPick: (url: string) => void) {
  openSheet(close => <RepoPicker close={close} onPick={url => { onPick(url); close() }} />)
}

function RepoPicker({ close, onPick }: { close: () => void; onPick: (url: string) => void }) {
  const s = useApp()
  const login = s.user?.github ?? ''
  const [repos, setRepos] = useState<GhRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [link, setLink] = useState('')
  const [checking, setChecking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  useEffect(() => {
    if (!login) return
    setRepos(null); setError(null)
    myRepos(login).then(setRepos).catch(e => setError(e.message))
  }, [login])
  if (!login) {
    return (
      <>
        <SheetTitle title="Link your GitHub" sub="Projects can only use repositories from your own GitHub account, so link it first." />
        <div class="body">
          <div class="tile t-lilac row" style={{ flexDirection: 'row' }}><Icon name="github" size={28} /><div class="small semibold grow">Your repos show up here after linking. Nothing private is read: only public repositories.</div></div>
          <Btn block icon="github" onClick={() => linkGithub('')}>Link GitHub account</Btn>
          <Btn kind="soft" onClick={close}>Cancel</Btn>
        </div>
      </>
    )
  }
  const shown = (repos ?? []).filter(r => matches(q, r.name, r.description, r.language))
  const checkLink = async () => {
    const path = repoPath(link)
    if (!path) { setLinkError('Paste a GitHub link like github.com/owner/repo'); return }
    setChecking(true); setLinkError(null)
    try { onPick(repoUrl((await verifyRepo(path, login)).full_name)) } catch (e) { setLinkError((e as Error).message) } finally { setChecking(false) }
  }
  return (
    <>
      <SheetTitle title="Choose repository" sub={`Public repositories of @${login}`} />
      <SearchBar value={q} onInput={setQ} placeholder="Search your repositories" />
      <div class="body" style={{ minHeight: 220 }}>
        {error && <div class="error-box"><Icon name="warning" size={16} />{error}</div>}
        {!repos && !error && <div class="row" style={{ justifyContent: 'center', padding: 30 }}><span class="spinner" /></div>}
        {repos && !shown.length && <Hint>{repos.length ? 'No repository matches.' : `@${login} has no public repositories yet.`}</Hint>}
        {shown.length > 0 && <div class="card flush in-card">
          {shown.map(r => (
            <button key={r.full_name} class="item" style={{ width: '100%', textAlign: 'start' }} onClick={() => onPick(r.html_url)}>
              <div class="badge-ico t-lilac"><Icon name="github" size={16} /></div>
              <div class="main">
                <div class="t">{r.owner.login.toLowerCase() === login.toLowerCase() ? r.name : r.full_name}{r.fork && <span class="muted small"> · fork</span>}</div>
                <div class="s">{r.description || 'No description'}</div>
                <div class="repo-meta">
                  {r.language && <span><i style={{ background: languageColor(r.language) }} />{r.language}</span>}
                  {r.stargazers_count > 0 && <span><Icon name="star" size={11} />{r.stargazers_count}</span>}
                  <span>Updated {ago(r.pushed_at)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>}
        <div class="field-label">Not listed? Paste its link</div>
        <Field label="Repository link" value={link} icon="link" placeholder="github.com/owner/repo" onInput={v => { setLink(v); setLinkError(null) }}
          hint={linkError ?? 'Only repositories you own or contribute to are accepted.'} hintTone={linkError ? 'bad' : undefined} />
        <Btn kind="soft" icon="check" busy={checking} disabled={!link.trim()} onClick={checkLink}>Check and use</Btn>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- payment reminder

/** Sheet with a friendly "please pay" message to send on WhatsApp or anywhere else. */
export function askForPayment(o: { person: string; amount: number; currency: string; customerId?: string | null; dueDate?: number | null; what?: string }) {
  openSheet(close => <PaymentReminder o={o} close={close} />)
}

function PaymentReminder({ o, close }: { o: Parameters<typeof askForPayment>[0]; close: () => void }) {
  const s = useApp()
  const customer = byId('customer', o.customerId)
  const first = (customer?.name || o.person).trim().split(' ')[0]
  const me = s.user?.name.trim().split(' ')[0]
  const due = o.dueDate != null ? (o.dueDate < F.today() ? `, which was due on ${F.date(o.dueDate)}` : `, due on ${F.date(o.dueDate)}`) : ''
  const [text, setText] = useState(
    `Hi ${first}, hope you're doing well! Just a friendly reminder about the ${F.money(o.amount, o.currency)}${o.what ? ` for ${o.what}` : ''}${due}. ` +
    `Let me know if you have any questions. Thank you!${me ? `\n\n${me}` : ''}`)
  const phone = customer?.phone ?? ''
  return (
    <>
      <SheetTitle title="Ask for payment" sub={`${F.money(o.amount, o.currency)} from ${customer?.name || o.person}`} />
      <div class="body">
        <Field label="Message" multiline value={text} onInput={setText} />
        <Btn block kind="t-mint" class="t-mint" icon="whatsapp" onClick={() => { call('app.whatsapp', { phone, text }); close() }}>
          {phone ? `WhatsApp ${first}` : 'Send on WhatsApp'}
        </Btn>
        <div class="grid2">
          <Btn kind="soft" icon="share" onClick={() => { call('app.share', { subject: 'Payment reminder', text }); close() }}>Share</Btn>
          <Btn kind="soft" icon="copy" onClick={() => { call('app.copy', { text }); close() }}>Copy</Btn>
        </div>
        {!phone && <Hint>Tip: save {first} as a customer with a phone number to open the chat directly.</Hint>}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- currency converter

interface Rates { result: string; base_code: string; time_last_update_unix: number; rates: Record<string, number> }
const ratesFor = (cur: string) => getJson<Rates>(`https://open.er-api.com/v6/latest/${cur}`, `fx.${cur}`, 6 * 3_600_000)
/** USDT follows the US dollar. */
const fxCode = (c: string) => (c === 'USDT' ? 'USD' : c)

export function openConverter() {
  openSheet(close => <Converter close={close} />)
}

function Converter({ close }: { close: () => void }) {
  const s = useApp()
  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState(s.settings.currency === 'USD' ? 'EUR' : s.settings.currency)
  const [to, setTo] = useState('USD')
  const [rates, setRates] = useState<Rates | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setError(null)
    ratesFor(fxCode(from)).then(r => { if (live) { if (r.result !== 'success') throw new Error('No rates for ' + from); setRates(r) } })
      .catch(e => { if (live) { setRates(null); setError(e.message) } })
    return () => { live = false }
  }, [from])
  const value = F.parseAmount(amount)
  const rate = rates?.rates[fxCode(to)]
  const result = value != null && rate != null ? value * rate : null
  const codes = rates ? [...new Set([...Categories.currencies, ...Object.keys(rates.rates).sort()])] : Categories.currencies
  const opts = (keep: string) => (codes.includes(keep) ? codes : [keep, ...codes]).map(c => ({ value: c, label: c }))
  const others = Categories.currencies.filter(c => c !== from && c !== to && rates?.rates[fxCode(c)] != null).slice(0, 6)
  return (
    <>
      <SheetTitle title="Currency converter" sub="Live rates from open.er-api.com" />
      <div class="body">
        <AmountBox value={amount} onInput={setAmount} currency={from} onCurrency={setFrom} color="var(--fg)" />
        <div class="row">
          <div class="grow"><SelectField label="Convert to" value={to} options={opts(to)} onChange={setTo} /></div>
          <Round icon="sync" label="Swap" onClick={() => { setFrom(to); setTo(from) }} />
        </div>
        {error && <div class="error-box"><Icon name="warning" size={16} />{error}</div>}
        {!rates && !error && <div class="row" style={{ justifyContent: 'center', padding: 16 }}><span class="spinner" /></div>}
        {result != null && (
          <div class="hero" style={{ gap: 4 }}>
            <div class="eyebrow">{F.money(value!, from)} is</div>
            <div class="h-display num">{F.money(result, to)}</div>
            <div class="small" style={{ opacity: .85 }}>1 {from} = {rate! < 1 ? Number(rate!.toPrecision(3)) : F.amount(rate!)} {to}</div>
          </div>
        )}
        {value != null && others.length > 0 && <div class="card flush in-card">
          {others.map(c => (
            <div key={c} class="item"><div class="badge-ico t-sky" style={{ fontSize: 11, fontWeight: 800 }}>{c}</div>
              <div class="main"><div class="t num">{F.money(value * rates!.rates[fxCode(c)], c)}</div></div></div>
          ))}
        </div>}
        {rates && <Hint>Updated {new Date(rates.time_last_update_unix * 1000).toLocaleString(dateLocale())}. {from === 'USDT' || to === 'USDT' ? 'USDT is counted as 1 USD.' : ''}</Hint>}
        <Btn kind="soft" onClick={close}>Done</Btn>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- customer

export function editCustomer(item?: Customer, prefill?: Partial<Customer>) {
  openForm(close => <CustomerForm item={item} prefill={prefill} close={close} />)
}

function CustomerForm({ item, prefill, close }: { item?: Customer; prefill?: Partial<Customer>; close: () => void }) {
  const base: Customer = item ?? { id: newId(), name: '', phone: '', email: '', company: '', notes: '', createdAt: now(), ...prefill }
  const [c, set] = useState(base)
  const up = (x: Partial<Customer>) => set({ ...c, ...x })
  return (
    <Form title={item ? 'Edit customer' : 'New customer'} close={close} saveEnabled={!!c.name.trim()}
      onSave={async () => {
        await save('customer', { ...c, name: c.name.trim(), phone: c.phone.trim(), email: c.email.trim(), company: c.company.trim(), notes: c.notes.trim() })
        close()
      }}
      onDelete={item ? () => { remove('customer', item.id); close() } : undefined}>
      <Btn kind="soft" icon="contacts" block onClick={() => pickContact(p => up({
        name: p.name || c.name, phone: p.phones[0] ?? c.phone, email: p.emails[0] ?? c.email, company: p.company || c.company,
      }))}>Fill from phone contacts</Btn>
      <Field label="Name" value={c.name} icon="user" onInput={v => up({ name: v })} />
      <Field label="Phone" value={c.phone} icon="phone" type="tel" inputMode="tel" onInput={v => up({ phone: v })} />
      <Field label="Email" value={c.email} icon="mail" type="email" inputMode="email" onInput={v => up({ email: v })} />
      <Field label="Company" value={c.company} icon="briefcase" onInput={v => up({ company: v })} />
      <Field label="Notes" multiline value={c.notes} onInput={v => up({ notes: v })} />
    </Form>
  )
}

/** Sheet listing every contact on the phone; calls [onPick] with the chosen one. */
export function pickContact(onPick: (c: PhoneContact) => void) {
  openSheet(close => <ContactPicker close={close} onPick={c => { onPick(c); close() }} />)
}

function ContactPicker({ close, onPick }: { close: () => void; onPick: (c: PhoneContact) => void }) {
  const contacts = usePhoneContacts()
  const [q, setQ] = useState('')
  const list = useMemo(() => filterContacts(contacts.list ?? [], q).slice(0, 300), [contacts.list, q])
  return (
    <>
      <SheetTitle title="Phone contacts" sub={contacts.list ? `${contacts.list.length} on this phone` : undefined} />
      <div class="search"><Icon name="search" size={17} /><input placeholder="Search name, number or company" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} /></div>
      <div class="body" style={{ minHeight: 200 }}>
        {contacts.denied && <ContactsDenied retry={contacts.load} />}
        {!contacts.list && !contacts.denied && <div class="row" style={{ justifyContent: 'center', padding: 30 }}><span class="spinner" /></div>}
        <div class="card flush in-card">
          {list.map(p => (
            <button key={p.id} class="item" style={{ width: '100%', textAlign: 'start' }} onClick={() => onPick(p)}>
              <ContactAvatar name={p.name} />
              <div class="main"><div class="t">{p.name}</div><div class="s">{[p.phones[0], p.company].filter(Boolean).join(' · ') || p.emails[0] || 'No number'}</div></div>
            </button>
          ))}
        </div>
      </div>
      <Btn kind="soft" onClick={close}>Cancel</Btn>
    </>
  )
}

// shared phone-contacts loader (cached for the session)
let contactsCache: PhoneContact[] | null = null
export function usePhoneContacts() {
  const [list, setList] = useState<PhoneContact[] | null>(contactsCache)
  const [denied, setDenied] = useState(false)
  const load = () => {
    setDenied(false)
    call<PhoneContact[] | null>('contacts.all').then(r => {
      if (r == null) { setDenied(true); return }
      contactsCache = r
      setList(r)
    }).catch(e => toast(e.message))
  }
  useEffect(() => { if (!contactsCache) load() }, [])
  return { list, denied, load }
}

export function filterContacts(list: PhoneContact[], q: string) {
  const t = q.trim().toLowerCase()
  if (!t) return list
  const digits = t.replace(/\D/g, '')
  return list.filter(c =>
    c.name.toLowerCase().includes(t) || c.company.toLowerCase().includes(t) || c.emails.some(e => e.toLowerCase().includes(t)) ||
    (digits.length >= 3 && c.phones.some(p => p.replace(/\D/g, '').includes(digits))))
}

export function ContactAvatar({ name, size = 42 }: { name: string; size?: number }) {
  const palette = ['mint', 'butter', 'lilac', 'sky', 'rose']
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const c = palette[h % palette.length]
  return <div class="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: `var(--${c})`, color: `var(--on-${c})` }}>{F.initials(name)}</div>
}

export function ContactsDenied({ retry }: { retry: () => void }) {
  return (
    <div class="tile t-butter" style={{ gap: 10 }}>
      <div class="h-sm">Allow access to your contacts</div>
      <div class="small">Carrot Note needs permission to show the people saved on your phone. Nothing is uploaded.</div>
      <div><Btn kind="ink" sm icon="contacts" onClick={retry}>Allow contacts</Btn></div>
    </div>
  )
}

// ---------------------------------------------------------------- debt

export function editDebt(item?: Debt, defaults: { customerId?: string | null; person?: string } = {}) {
  openForm(close => <DebtForm item={item} defaults={defaults} close={close} />)
}

function DebtForm({ item, defaults, close }: { item?: Debt; defaults: { customerId?: string | null; person?: string }; close: () => void }) {
  const s = useApp()
  const base: Debt = item ?? {
    id: newId(), direction: 'owed_to_me', person: defaults.person ?? '', customerId: defaults.customerId ?? null, amount: 0,
    currency: s.settings.currency, dueDate: null, note: '', payments: [], createdAt: now(),
  }
  const [d, set] = useState(base)
  const [amount, setAmount] = useState(F.amountText(base.amount))
  const up = (x: Partial<Debt>) => set({ ...d, ...x })
  const parsed = F.parseAmount(amount)
  const customer = byId('customer', d.customerId)
  const owed = d.direction === 'owed_to_me'
  return (
    <Form title={item ? 'Edit debt' : 'New debt'} close={close}
      saveEnabled={parsed != null && parsed > 0 && (!!d.person.trim() || !!customer)}
      onSave={async () => {
        await save('debt', { ...d, person: customer?.name ?? d.person.trim(), amount: parsed ?? 0, currency: d.currency || s.settings.currency, note: d.note.trim() })
        close()
      }}
      onDelete={item ? () => { remove('debt', item.id); close() } : undefined}>
      <Seg options={[{ label: 'They owe me', icon: 'income' }, { label: 'I owe', icon: 'expense' }]} value={owed ? 0 : 1}
        onChange={i => up({ direction: i === 0 ? 'owed_to_me' : 'i_owe' })} />
      <AmountBox value={amount} onInput={setAmount} currency={d.currency} onCurrency={c => up({ currency: c })} color={owed ? 'var(--good)' : 'var(--bad)'} />
      <CustomerPicker value={d.customerId} onChange={v => up({ customerId: v })} none="Not a saved customer" />
      {!customer && <Field label="Person name" value={d.person} icon="user" onInput={v => up({ person: v })}
        trail={<Round icon="contacts" sm onBg label="Pick from contacts" onClick={() => pickContact(c => up({ person: c.name }))} />} />}
      <DateField label="Due date" value={d.dueDate} onChange={v => up({ dueDate: v })} />
      <Field label="Note" multiline value={d.note} onInput={v => up({ note: v })} />
    </Form>
  )
}

export function payDebt(debt: Debt) {
  openSheet(close => <DebtPay debt={debt} close={close} />)
}

function DebtPay({ debt, close }: { debt: Debt; close: () => void }) {
  const incoming = debt.direction === 'owed_to_me'
  const [amount, setAmount] = useState(F.amountText(debtRemaining(debt)))
  const [record, setRecord] = useState(true)
  const parsed = F.parseAmount(amount)
  return (
    <>
      <SheetTitle title={incoming ? 'Payment received' : 'Payment made'} sub={`${debt.person} · ${F.money(debtRemaining(debt), debt.currency)} left`} />
      <div class="body">
        <AmountBox value={amount} onInput={setAmount} currency={debt.currency} onCurrency={() => {}} color={incoming ? 'var(--good)' : 'var(--bad)'} />
        <div class="card in-card"><SwitchRow title={incoming ? 'Add to income' : 'Add to expenses'} sub="Also record it in Money" on={record} onChange={setRecord} /></div>
        <Btn block disabled={!(parsed && parsed > 0)} onClick={async () => {
          const a = parsed!
          await attempt(async () => {
            await save('debt', { ...debt, payments: [...debt.payments, { id: newId(), amount: a, date: F.today(), note: '' }] })
            if (record) await save('txn', {
              id: newId(), kind: incoming ? 'income' : 'expense', amount: a, currency: debt.currency, category: 'Other', method: 'Cash',
              date: F.today(), note: (incoming ? 'Debt repaid by ' : 'Debt paid to ') + debt.person, customerId: debt.customerId ?? null, projectId: null, createdAt: now(),
            })
          })
          close()
        }}>Save payment</Btn>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- goals

export function editGoal(item?: Goal) {
  openForm(close => <GoalForm item={item} close={close} />)
}

function GoalForm({ item, close }: { item?: Goal; close: () => void }) {
  const s = useApp()
  const base: Goal = item ?? { id: newId(), name: '', target: 0, currency: s.settings.currency, deadline: null, note: '', deposits: [], createdAt: now() }
  const [g, set] = useState(base)
  const [target, setTarget] = useState(F.amountText(base.target))
  const [initial, setInitial] = useState('')
  const up = (x: Partial<Goal>) => set({ ...g, ...x })
  const parsed = F.parseAmount(target)
  return (
    <Form title={item ? 'Edit goal' : 'New savings goal'} close={close} saveEnabled={!!g.name.trim() && parsed != null && parsed > 0}
      onSave={async () => {
        const start = F.parseAmount(initial)
        const deposits = !item && start && start > 0 ? [{ id: newId(), amount: start, date: F.today(), note: 'Starting amount' }] : g.deposits
        await save('goal', { ...g, name: g.name.trim(), target: parsed ?? 0, note: g.note.trim(), deposits })
        close()
      }}
      onDelete={item ? () => { remove('goal', item.id); close() } : undefined}>
      <Field label="Goal (e.g. New laptop, Emergency fund)" value={g.name} onInput={v => up({ name: v })} autoFocus={!item} />
      <AmountBox value={target} onInput={setTarget} currency={g.currency} onCurrency={c => up({ currency: c })} color="var(--good)" />
      {!item && <Field label="Already saved (optional)" value={initial} inputMode="decimal" onInput={setInitial} />}
      <DateField label="Target date" value={g.deadline} onChange={v => up({ deadline: v })} />
      <Field label="Note" multiline value={g.note} onInput={v => up({ note: v })} />
    </Form>
  )
}

export function moveGoal(goal: Goal) {
  openSheet(close => <GoalMove goal={goal} close={close} />)
}

function GoalMove({ goal, close }: { goal: Goal; close: () => void }) {
  const [amount, setAmount] = useState('')
  const [withdraw, setWithdraw] = useState(0)
  const [note, setNote] = useState('')
  const parsed = F.parseAmount(amount)
  return (
    <>
      <SheetTitle title={goal.name} sub={`Saved ${F.money(goalSaved(goal), goal.currency)} of ${F.money(goal.target, goal.currency)}`} />
      <div class="body">
        <Seg options={[{ label: 'Add', icon: 'plus' }, { label: 'Withdraw', icon: 'expense' }]} value={withdraw} onChange={setWithdraw} />
        <AmountBox value={amount} onInput={setAmount} currency={goal.currency} onCurrency={() => {}} color={withdraw ? 'var(--bad)' : 'var(--good)'} />
        <Field label="Note (optional)" value={note} onInput={setNote} />
        <Btn block disabled={!(parsed && parsed > 0)} onClick={async () => {
          await attempt(() => save('goal', { ...goal, deposits: [...goal.deposits, { id: newId(), amount: withdraw ? -parsed! : parsed!, date: F.today(), note: note.trim() }] }))
          close()
        }}>{withdraw ? 'Withdraw' : 'Add to goal'}</Btn>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- event

export function editEvent(item?: CalEvent, defaults: { date?: number; projectId?: string | null; customerId?: string | null } = {}) {
  openForm(close => <EventForm item={item} defaults={defaults} close={close} />)
}

function EventForm({ item, defaults, close }: { item?: CalEvent; defaults: { date?: number; projectId?: string | null; customerId?: string | null }; close: () => void }) {
  const base: CalEvent = item ?? {
    id: newId(), title: '', date: defaults.date ?? F.today(), time: null, note: '', reminder: true,
    projectId: defaults.projectId ?? null, customerId: defaults.customerId ?? null, createdAt: now(),
  }
  const [e, set] = useState(base)
  const up = (x: Partial<CalEvent>) => set({ ...e, ...x })
  return (
    <Form title={item ? 'Edit event' : 'New event'} close={close} saveEnabled={!!e.title.trim()}
      onSave={async () => { await save('event', { ...e, title: e.title.trim(), note: e.note.trim() }); close() }}
      onDelete={item ? () => { remove('event', item.id); close() } : undefined}>
      <Field label="Title (meeting, call, delivery…)" value={e.title} onInput={v => up({ title: v })} autoFocus={!item} />
      <DateField label="Date" value={e.date} onChange={v => up({ date: v ?? F.today() })} clearable={false} />
      <TimeField label="Time" value={e.time} onChange={v => up({ time: v })} />
      <div class="card in-card">
        <SwitchRow title="Remind me" sub="Notification at the event time (9:00 AM if no time)" on={e.reminder && !e.done} disabled={!!e.done} onChange={v => up({ reminder: v })} />
        {item && <SwitchRow title="Done" sub="It happened. Ticked-off events don't send reminders." on={!!e.done} onChange={v => up({ done: v })} />}
      </div>
      <MoreOptions startOpen={!!base.note || base.customerId != null || (!!item && base.projectId != null)}>
        <Field label="Note" multiline value={e.note} onInput={v => up({ note: v })} />
        <ProjectPicker value={e.projectId} onChange={v => up({ projectId: v })} />
        <CustomerPicker value={e.customerId} onChange={v => up({ customerId: v })} />
      </MoreOptions>
    </Form>
  )
}

// ---------------------------------------------------------------- time

export function editTime(item?: TimeEntry, defaults: { projectId?: string | null } = {}) {
  openForm(close => <TimeForm item={item} defaults={defaults} close={close} />)
}

function TimeForm({ item, defaults, close }: { item?: TimeEntry; defaults: { projectId?: string | null }; close: () => void }) {
  const t0 = now()
  const base: TimeEntry = item ?? { id: newId(), projectId: defaults.projectId ?? null, start: t0 - 3_600_000, end: t0, note: '', createdAt: t0 }
  const running = item != null && item.end == null
  const [projectId, setProject] = useState(base.projectId ?? null)
  const [day, setDay] = useState(F.dayOfMs(base.start))
  const [startMin, setStart] = useState<number | null>(F.minutesOfMs(base.start))
  const [endMin, setEnd] = useState<number | null>(base.end != null ? F.minutesOfMs(base.end) : null)
  const [note, setNote] = useState(base.note)
  const startMs = startMin != null ? F.msAt(day, startMin) : null
  let endMs = endMin != null ? F.msAt(day, endMin) : null
  if (endMs != null && startMs != null && endMs < startMs) endMs += 86_400_000
  return (
    <Form title={item ? 'Edit time' : 'Add time'} close={close} saveEnabled={startMs != null && (running || endMs != null)}
      onSave={async () => {
        await save('time', { ...base, projectId, start: startMs ?? base.start, end: running && endMs == null ? null : endMs, note: note.trim() })
        close()
      }}
      onDelete={item ? () => { remove('time', item.id); close() } : undefined}>
      <ProjectPicker value={projectId} onChange={setProject} label="Project" />
      <DateField label="Day" value={day} onChange={v => setDay(v ?? F.today())} clearable={false} />
      <div class="grid2">
        <TimeField label="Start" value={startMin} onChange={setStart} />
        <TimeField label="End" value={endMin} onChange={setEnd} />
      </div>
      {startMs != null && endMs != null && <div class="tile t-mint"><div class="eyebrow">Duration</div><div class="timer-clock">{F.duration(endMs - startMs)}</div></div>}
      <Field label="What did you work on?" value={note} onInput={setNote} />
    </Form>
  )
}

// ---------------------------------------------------------------- budget

export function editBudget(item?: Budget) {
  openForm(close => <BudgetForm item={item} close={close} />)
}

function BudgetForm({ item, close }: { item?: Budget; close: () => void }) {
  const s = useApp()
  const base: Budget = item ?? { id: newId(), category: '', limit: 0, currency: s.settings.currency, createdAt: now() }
  const [b, set] = useState(base)
  const [limit, setLimit] = useState(F.amountText(base.limit))
  const parsed = F.parseAmount(limit)
  return (
    <Form title={item ? 'Edit budget' : 'New budget'} close={close} saveEnabled={parsed != null && parsed > 0}
      onSave={async () => { await save('budget', { ...b, limit: parsed ?? 0 }); close() }}
      onDelete={item ? () => { remove('budget', item.id); close() } : undefined}>
      <Hint>Set how much you want to spend per month, in total or on one category.</Hint>
      <AmountBox value={limit} onInput={setLimit} currency={b.currency} onCurrency={c => set({ ...b, currency: c })} color="var(--accent)" />
      <FieldLabel>Applies to</FieldLabel>
      <Chips wrap options={['', ...Categories.expense]} value={b.category} onChange={v => set({ ...b, category: v })}
        label={v => (v ? v : 'All spending')} icon={v => (v ? categoryIcon(v) : 'wallet')} />
    </Form>
  )
}

// ---------------------------------------------------------------- quick add

export function quickAdd() {
  const items: [string, string, string, () => void][] = [
    ['Expense', 'expense', 'rose', () => editTxn(undefined, { kind: 'expense' })],
    ['Income', 'income', 'mint', () => editTxn(undefined, { kind: 'income' })],
    ['Task', 'tasks', 'butter', () => editTask(undefined, { date: F.today() })],
    ['Note', 'note', 'lilac', () => editNote()],
    ['Event', 'calendar', 'sky', () => editEvent(undefined, { date: F.today() })],
    ['Project', 'project', 'orange', () => editProject()],
    ['Rental', 'server', 'sky', () => import('./screens/rentals').then(m => m.editRental())],
    ['Debt', 'debt', 'butter', () => editDebt()],
    ['Invoice', 'invoice', 'orange', () => import('./screens/invoices').then(m => m.editInvoice())],
    ['Recurring', 'repeat', 'mint', () => import('./screens/recurring').then(m => m.editRecurring())],
    ['Login', 'lock', 'lilac', () => push({ name: 'vault' })],
    ['Report', 'chart', 'sky', () => push({ name: 'report' })],
  ]
  openOverlay('sheet', close => {
    const shut = close
    return (
      <>
        <SheetTitle title="Add new" sub="Pick one. You can fill in the details next." />
        <div class="body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {items.map(([label, icon, color, run], i) => (
              <button key={label} class={`tile t-${color} press pop`} style={{ '--i': i, alignItems: 'center', padding: '18px 0', gap: 10 } as any}
                onClick={() => { shut(); setTimeout(run, 120) }}>
                <span class="tile-ico"><Icon name={icon} size={17} /></span>
                <b style={{ fontSize: 13.5 }}>{label}</b>
              </button>
            ))}
          </div>
        </div>
      </>
    )
  }, 'quickadd')
}
