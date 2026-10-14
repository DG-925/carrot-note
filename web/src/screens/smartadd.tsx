// "Say it": add an expense, income, task, event or note by voice or by typing one sentence.

import { useEffect, useRef, useState } from 'preact/hooks'
import { call } from '../bridge'
import { editEvent, editNote, editTask, editTxn } from '../editors'
import * as F from '../format'
import { currentLang } from '../i18n'
import { Icon } from '../icons'
import { parseSmart, type Parsed, type SmartKind } from '../smart'
import { getState, save } from '../store'
import { newId } from '../types'
import { Btn, Chips, Hint, SheetTitle, attempt, cx, openSheet, toast } from '../ui'

const kinds: { value: SmartKind; label: string; icon: string }[] = [
  { value: 'expense', label: 'Expense', icon: 'expense' },
  { value: 'income', label: 'Income', icon: 'income' },
  { value: 'task', label: 'Task', icon: 'tasks' },
  { value: 'event', label: 'Event', icon: 'calendar' },
  { value: 'note', label: 'Note', icon: 'note' },
]

const examples = () => currentLang() === 'ar'
  ? ['صرفت ٢٠٠ على الغدا', 'كريم دفع ١٥٠٠ للكاشير', 'فكرني ابعت الفاتورة بكرة', 'اجتماع مع نور الخميس الساعة ١١']
  : ['spent 200 on lunch', 'Karim paid 1500 for the POS', 'remind me to send the invoice tomorrow', 'call Lina tomorrow at 5']

/** Opens "Say it"; with [listen] it starts listening right away (phone only). */
export function openSmartAdd(listen = false) {
  openSheet(close => <SmartSheet close={close} listenNow={listen} />)
}

function SmartSheet({ close, listenNow }: { close: () => void; listenNow: boolean }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<SmartKind | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const st = getState()
  const ctx = {
    today: F.today(), currency: st.settings.currency,
    customers: st.data.customer.map(c => ({ id: c.id, name: c.name })),
    projects: st.data.project.map(p => ({ id: p.id, name: p.name, clientName: p.clientName, customerId: p.customerId })),
  }
  const parsed: Parsed | null = text.trim() ? parseSmart(text, ctx) : null
  const p = parsed && kind ? { ...parsed, kind } : parsed

  const listen = async () => {
    setBusy(true)
    try {
      const heard = await call<string | null>('speech.listen', { lang: currentLang() === 'ar' ? 'ar-EG' : 'en-US', prompt: currentLang() === 'ar' ? 'قول اللي عايز تضيفه' : 'Say what to add' })
      if (heard) { setText(heard); setKind(null) }
    } catch (e) {
      toast(String((e as Error)?.message ?? e))
      input.current?.focus()
    } finally { setBusy(false) }
  }
  useEffect(() => { if (listenNow) listen(); else setTimeout(() => input.current?.focus(), 250) }, [])

  const edit = () => {
    if (!p) return
    close()
    setTimeout(() => {
      if (p.kind === 'expense' || p.kind === 'income') editTxn(undefined, {
        kind: p.kind, amount: p.amount ?? undefined, note: p.title, date: p.date, projectId: p.projectId, customerId: p.customerId,
        category: p.category ?? undefined, method: p.method ?? undefined, currency: p.currency,
      })
      else if (p.kind === 'task') editTask(undefined, { title: p.title, date: p.date, projectId: p.projectId })
      else if (p.kind === 'event') editEvent(undefined, { title: p.title, date: p.date, time: p.time, projectId: p.projectId, customerId: p.customerId })
      else editNote(undefined, { title: p.title, projectId: p.projectId })
    }, 150)
  }

  const canSave = !!p && (p.kind === 'expense' || p.kind === 'income' ? (p.amount ?? 0) > 0 : !!p.title.trim())
  const saveIt = async () => {
    if (!p || !canSave) return
    const now = Date.now()
    await attempt(async () => {
      if (p.kind === 'expense' || p.kind === 'income') {
        await save('txn', {
          id: newId(), kind: p.kind, amount: p.amount!, currency: p.currency, category: p.category ?? 'Other', method: p.method ?? 'Cash',
          date: p.date, note: p.title, projectId: p.projectId, customerId: p.customerId, createdAt: now,
        })
        toast(`${p.kind === 'expense' ? 'Expense' : 'Income'} saved · ${F.money(p.amount!, p.currency)}`)
      } else if (p.kind === 'task') {
        await save('task', {
          id: newId(), title: p.title, notes: '', projectId: p.projectId, dueDate: p.date, dueTime: p.time, reminder: p.time != null,
          done: false, priority: 1, createdAt: now, repeat: '', doing: false, subtasks: [], assignee: null,
        })
        toast('Task saved')
      } else if (p.kind === 'event') {
        await save('event', { id: newId(), title: p.title, date: p.date, time: p.time, note: '', reminder: true, projectId: p.projectId, customerId: p.customerId, createdAt: now })
        toast('Event saved')
      } else {
        await save('note', { id: newId(), title: p.title, body: '', checklist: [], projectId: p.projectId, date: null, pinned: false, color: 0, createdAt: now })
        toast('Note saved')
      }
    })
    close()
  }

  const who = p && (p.projectId ? st.data.project.find(x => x.id === p.projectId)?.name : p.customerId ? st.data.customer.find(x => x.id === p.customerId)?.name : p.person)
  return (
    <>
      <SheetTitle title="Say it" sub="Say or type one sentence. Check it, then save." />
      <div class="body">
        <div class="smart-input">
          <textarea ref={input} rows={2} value={text} placeholder={examples()[0]} onInput={e => { setText((e.target as HTMLTextAreaElement).value); setKind(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveIt() } }} />
          <button class={cx('smart-mic', busy && 'on')} aria-label="Speak" onClick={listen}><Icon name="mic" size={22} /></button>
        </div>
        {!p && <div class="chips wrap" style={{ marginTop: 10 }}>
          {examples().map(x => <button key={x} class="chip" onClick={() => setText(x)}>{x}</button>)}
        </div>}
        {p && <>
          <div style={{ marginTop: 12 }}><Chips options={kinds.map(k => k.value)} value={p.kind} onChange={v => setKind(v as SmartKind)}
            label={v => kinds.find(k => k.value === v)!.label} icon={v => kinds.find(k => k.value === v)!.icon} /></div>
          <div class="card in-card smart-preview">
            {(p.kind === 'expense' || p.kind === 'income') && <div class={cx('h-lg num', p.kind === 'income' ? 'good' : '')}>
              {p.amount ? `${p.kind === 'income' ? '+' : '−'}${F.money(p.amount, p.currency)}` : 'How much?'}</div>}
            <div class="semibold" style={{ marginTop: 2 }}>{p.title || (p.kind === 'expense' || p.kind === 'income' ? p.category : '—')}</div>
            <div class="chips wrap" style={{ marginTop: 8 }}>
              {p.category && <span class="chip on-soft"><Icon name="tag" size={12} />{p.category}</span>}
              {p.method && <span class="chip on-soft"><Icon name="card" size={12} />{p.method}</span>}
              <span class="chip on-soft"><Icon name="calendar" size={12} />{F.relativeDay(p.date)}{p.time != null ? ' · ' + F.time(p.time) : ''}</span>
              {who && <span class="chip on-soft"><Icon name="user" size={12} />{who}</span>}
            </div>
          </div>
          <div class="grid2" style={{ marginTop: 12 }}>
            <Btn kind="soft-bg" icon="edit" onClick={edit}>Edit first</Btn>
            <Btn icon="check" disabled={!canSave} onClick={saveIt}>Save</Btn>
          </div>
          {!canSave && <Hint>{p.kind === 'expense' || p.kind === 'income' ? 'Say the amount too, or tap Edit first.' : 'Say what it is about.'}</Hint>}
        </>}
      </div>
    </>
  )
}
