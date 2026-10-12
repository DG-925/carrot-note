// List rows and cards used on several screens.

import * as F from './format'
import { askForPayment, editDebt, editEvent, editGoal, editNote, editTask, editTime, editTxn, moveGoal, payDebt } from './editors'
import { categoryIcon, Icon } from './icons'
import { push } from './nav'
import { setEventDone, setTaskDone, useApp } from './store'
import { productStats } from './screens/rentals'
import {
  debtPaid, debtRemaining, debtSettled, duration, goalProgress, goalSaved, isRunning,
  type CalEvent, type Debt, type Goal, type Note, type Project, type SpaceInfo, type TaskItem, type TimeEntry, type Txn,
} from './types'
import { AvatarStack, Btn, Ring, StatusChip, Bar, useNow } from './ui'

export function TaskRow({ task, project }: { task: TaskItem; project?: string }) {
  const overdue = !task.done && task.dueDate != null && task.dueDate < F.today()
  const s = useApp()
  const steps = task.subtasks ?? []
  const assignee = task.assignee ? s.spaces.flatMap(sp => sp.members).find(m => m.id === task.assignee) : undefined
  const meta = [
    task.doing && !task.done ? 'In progress' : null,
    task.dueDate != null ? F.relativeDay(task.dueDate) + (task.dueTime != null ? ' · ' + F.time(task.dueTime) : '') : null,
    steps.length ? `${steps.filter(x => x.done).length}/${steps.length} steps` : null,
    project, task.priority === 2 ? 'High priority' : null,
    assignee ? (assignee.id === s.user?.id ? 'You' : assignee.name || '@' + assignee.username) : null,
  ].filter(Boolean).join(' · ')
  return (
    <div class={'item' + (task.done ? ' task-done' : '')} onClick={() => editTask(task)}>
      <button class={'check' + (task.done ? ' on' : '')} aria-label="Done" onClick={e => { e.stopPropagation(); setTaskDone(task, !task.done) }}>
        <i>{task.done && <Icon name="check" size={12} stroke={3} />}</i>
      </button>
      <div class="main">
        <div class="t">{task.title}</div>
        {meta && <div class="s" style={overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{meta}</div>}
      </div>
      {task.priority === 2 && !task.done && <span class="dot" />}
      {!!task.repeat && !task.done && <Icon name="repeat" size={13} class="muted" />}
      {task.reminder && !task.done && <Icon name="bell" size={13} class="muted" />}
    </div>
  )
}

export function TxnRow({ t, extra }: { t: Txn; extra?: string }) {
  const s = useApp()
  const income = t.kind === 'income'
  const ex = extra ?? s.data.project.find(p => p.id === t.projectId)?.name ?? s.data.customer.find(c => c.id === t.customerId)?.name
  return (
    <div class="item" onClick={() => editTxn(t)}>
      <div class="badge-ico" style={{ background: income ? 'var(--mint)' : 'var(--accent-soft)', color: income ? 'var(--on-mint)' : 'var(--accent-deep)' }}>
        <Icon name={categoryIcon(t.category)} size={17} />
      </div>
      <div class="main">
        <div class="t">{t.note || t.category}</div>
        <div class="s">{[t.note ? t.category : null, t.method, ex].filter(Boolean).join(' · ')}</div>
      </div>
      {t.receiptId && <Icon name="image" size={13} class="muted" />}
      <div class="num bold amt" style={{ color: income ? 'var(--good)' : 'var(--fg)', fontWeight: 800 }}>{(income ? '+' : '−') + F.money(t.amount, t.currency)}</div>
    </div>
  )
}

export function NoteCard({ n, project, i }: { n: Note; project?: string; i?: number }) {
  const title = n.title || n.body.split('\n')[0] || n.checklist[0]?.text || ''
  const done = n.checklist.filter(c => c.done).length
  return (
    <button class={`note-card press${n.color ? ` note-colored note-c${n.color}` : ''}${i != null ? ' pop' : ''}`} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => editNote(n)}>
      <div class="row top"><h4 class="grow">{title}</h4>{n.pinned && <Icon name="pin" size={13} class={n.color ? '' : 'accent'} />}</div>
      {n.title && n.body && <p>{n.body}</p>}
      {n.checklist.length > 0 && <div style={{ marginTop: 6 }}>
        {n.checklist.slice(0, 4).map(c => (
          <div key={c.id} class={'li' + (c.done ? ' done' : '')}><Icon name={c.done ? 'checkSquare' : 'square'} size={12} />{c.text}</div>
        ))}
        {n.checklist.length > 4 && <div class="tiny" style={{ opacity: .6 }}>+{n.checklist.length - 4} more</div>}
        <div class="row" style={{ marginTop: 8, gap: 8 }}>
          <div class="grow"><Bar value={done / n.checklist.length} height={5} color={n.color ? '#2A211B' : undefined} /></div>
          <span class="tiny num bold">{done}/{n.checklist.length}</span>
        </div>
      </div>}
      {(project || n.date != null) && <div class="tiny" style={{ marginTop: 8, opacity: .65 }}>{[project, n.date != null ? F.dateShort(n.date) : null].filter(Boolean).join(' · ')}</div>}
    </button>
  )
}

export function EventRow({ e, showDate }: { e: CalEvent; showDate?: boolean }) {
  const parts = e.time != null ? F.time(e.time).split(/[\s  ]+/) : null
  const meta = [showDate ? F.relativeDay(e.date) : null, e.note.split('\n')[0] || null].filter(Boolean).join(' · ')
  return (
    <div class={'item' + (e.done ? ' task-done event-done' : '')} onClick={() => editEvent(e)}>
      <div class="event-time"><b>{parts ? parts[0] : 'All'}</b><span>{parts ? parts[1] ?? '' : 'day'}</span></div>
      <div class="main"><div class="t">{e.title}</div>{(meta || e.done) && <div class="s">{[e.done ? 'Done' : null, meta].filter(Boolean).join(' · ')}</div>}</div>
      {e.reminder && !e.done && <Icon name="bell" size={13} class="muted" />}
      <button class={'check' + (e.done ? ' on' : '')} aria-label={e.done ? 'Mark as not done' : 'Mark as done'} onClick={ev => { ev.stopPropagation(); setEventDone(e, !e.done) }}>
        <i>{e.done && <Icon name="check" size={12} stroke={3} />}</i>
      </button>
    </div>
  )
}

export function DebtCard({ d, i }: { d: Debt; i?: number }) {
  const owed = d.direction === 'owed_to_me'
  const color = owed ? 'var(--good)' : 'var(--bad)'
  const late = !debtSettled(d) && d.dueDate != null && d.dueDate < F.today()
  return (
    <div class={'card press' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => editDebt(d)}>
      <div class="row">
        <Ring value={d.amount > 0 ? debtPaid(d) / d.amount : 0} size={46} color={color}><Icon name={owed ? 'income' : 'expense'} size={13} /></Ring>
        <div class="grow"><div class="h-sm ellipsis">{d.person}</div><div class="small semibold" style={{ color }}>{owed ? 'Owes you' : 'You owe'}</div></div>
        <div style={{ textAlign: 'end' }}>
          <div class="num h-sm amt" style={{ fontWeight: 800, color: debtSettled(d) ? 'var(--muted)' : undefined }}>{F.money(debtRemaining(d), d.currency)}</div>
          <div class="small muted amt">of {F.money(d.amount, d.currency)}</div>
        </div>
      </div>
      <div class="row" style={{ marginTop: 12 }}>
        <div class={'small grow semibold' + (late ? ' bad' : ' muted')}>{debtSettled(d) ? 'Settled ✓' : d.dueDate != null ? F.daysLeft(d.dueDate) : 'No due date'}</div>
        {!debtSettled(d) && owed && <Btn kind="t-butter" class="t-butter" sm icon="bell" onClick={() => askForPayment({
          person: d.person, amount: debtRemaining(d), currency: d.currency, customerId: d.customerId, dueDate: d.dueDate, what: d.note,
        })}>Remind</Btn>}
        {!debtSettled(d) && <Btn kind="ink" sm onClick={() => payDebt(d)}>{owed ? 'Got paid' : 'I paid'}</Btn>}
      </div>
    </div>
  )
}

export function GoalCard({ g, i }: { g: Goal; i?: number }) {
  const left = Math.max(0, g.target - goalSaved(g))
  return (
    <div class={'card press' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => editGoal(g)}>
      <div class="row">
        <Ring value={goalProgress(g)} size={54} stroke={5} color="var(--good)">{Math.round(goalProgress(g) * 100)}%</Ring>
        <div class="grow">
          <div class="h-sm ellipsis">{g.name}</div>
          <div class="small muted num semibold amt">{F.money(goalSaved(g), g.currency)} of {F.money(g.target, g.currency)}</div>
        </div>
      </div>
      <div class="row" style={{ marginTop: 12 }}>
        <div class="small muted grow semibold">{left <= 0 ? 'Goal reached 🎉' : `${F.money(left, g.currency)} to go` + (g.deadline != null ? ' · ' + F.daysLeft(g.deadline) : '')}</div>
        <Btn kind="t-mint" class="t-mint" sm onClick={() => moveGoal(g)}>Add / withdraw</Btn>
      </div>
    </div>
  )
}

export const projectReceived = (p: Project, txns: Txn[]) =>
  txns.filter(t => t.projectId === p.id && t.kind === 'income' && t.currency === p.currency).reduce((s, t) => s + t.amount, 0)
export const projectValue = (p: Project, trackedMs: number) => (p.billing === 'hourly' ? F.hours(trackedMs) * p.hourlyRate : p.price)

export function ProjectCard({ p, space, i }: { p: Project; space?: SpaceInfo; i?: number }) {
  const s = useApp()
  const tracked = s.data.time.filter(t => t.projectId === p.id).reduce((a, t) => a + duration(t), 0)
  const value = projectValue(p, tracked)
  const received = projectReceived(p, s.data.txn)
  const progress = value > 0 ? Math.min(1, received / value) : 0
  const open = s.data.task.filter(t => t.projectId === p.id && !t.done).length
  const color = p.status === 'done' ? 'var(--good)' : p.status === 'cancelled' ? 'var(--bad)' : p.status === 'active' ? 'var(--accent)' : '#7C5CE0'
  if (p.kind === 'product') {
    const st = productStats(p.id, s.data.rental)
    return (
      <div class={'card press' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => push({ name: 'project', id: p.id })}>
        <div class="row">
          <Ring value={st.active.length ? 1 : 0} size={54} stroke={5} color={color}><Icon name="laptop" size={18} /></Ring>
          <div class="grow">
            <div class="row" style={{ gap: 6 }}><div class="h-sm ellipsis">{p.name}</div>{space && <Icon name="team" size={13} class="muted" />}</div>
            <div class="small muted ellipsis">Product · {F.plural(st.active.length, 'renter')}</div>
            <div style={{ marginTop: 6 }}><StatusChip status={p.status} /></div>
          </div>
        </div>
        {st.active.length > 0 && <div class="row between small" style={{ marginTop: 12 }}>
          <span class="num bold amt good">{F.totals(st.income, p.currency)} / month</span><span class="muted amt">profit {F.totals(st.profit, p.currency)}</span>
        </div>}
        {(st.attention > 0 || (space && space.members.length > 1)) && <div class="row" style={{ marginTop: 12, gap: 8 }}>
          {st.attention > 0 && <span class="meta bad"><Icon name="warning" size={10} />{st.attention} to renew</span>}
          <span class="grow" />
          {space && space.members.length > 1 && <AvatarStack people={space.members} size={24} />}
        </div>}
      </div>
    )
  }
  return (
    <div class={'card press' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => push({ name: 'project', id: p.id })}>
      <div class="row">
        <Ring value={progress} size={54} stroke={5} color={color}>{value > 0 ? `${Math.round(progress * 100)}%` : '—'}</Ring>
        <div class="grow">
          <div class="row" style={{ gap: 6 }}><div class="h-sm ellipsis">{p.name}</div>{space && <Icon name="team" size={13} class="muted" />}</div>
          <div class="small muted ellipsis">{p.clientName || 'No client'}</div>
          <div style={{ marginTop: 6 }}><StatusChip status={p.status} /></div>
        </div>
      </div>
      {value > 0 && <>
        <div style={{ marginTop: 14 }}><Bar value={progress} color={color} /></div>
        <div class="row between small" style={{ marginTop: 8 }}>
          <span class="num bold amt">Paid {F.money(received, p.currency)}</span><span class="muted amt">of {F.money(value, p.currency)}</span>
        </div>
      </>}
      {(open > 0 || p.deadline != null || (space && space.members.length > 1)) && <div class="row" style={{ marginTop: 12, gap: 8 }}>
        {open > 0 && <span class="meta"><Icon name="tasks" size={10} />{open} to do</span>}
        {p.deadline != null && <span class={'meta' + (p.deadline < F.today() && p.status === 'active' ? ' bad' : '')}><Icon name="flag" size={10} />{F.daysLeft(p.deadline)}</span>}
        <span class="grow" />
        {space && space.members.length > 1 && <AvatarStack people={space.members} size={24} />}
      </div>}
    </div>
  )
}

export function TimeRow({ e, project }: { e: TimeEntry; project?: string }) {
  const now = useNow(isRunning(e))
  const hm = (ms: number) => F.time(F.minutesOfMs(ms))
  return (
    <div class="item" onClick={() => editTime(e)}>
      <div class="badge-ico" style={{ background: isRunning(e) ? 'var(--rose)' : 'var(--mint)', color: isRunning(e) ? 'var(--on-rose)' : 'var(--on-mint)' }}>
        <Icon name={isRunning(e) ? 'timer' : 'clock'} size={16} />
      </div>
      <div class="main">
        <div class="t">{e.note || project || 'Work'}</div>
        <div class="s">{[e.note ? project : null, hm(e.start) + ' – ' + (e.end != null ? hm(e.end) : 'now')].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="num" style={{ fontWeight: 800, color: isRunning(e) ? 'var(--bad)' : undefined }}>{F.duration(duration(e, now))}</div>
    </div>
  )
}
