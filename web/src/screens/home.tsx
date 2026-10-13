import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { editEvent, editNote, editProject, editTask, editTxn } from '../editors'
import { Icon } from '../icons'
import { goTab, push } from '../nav'
import { EventRow, projectReceived, projectValue, TaskRow } from '../rows'
import { expiresAt, productStats, rentalState } from './rentals'
import { rentalKind } from '../types'
import { togglePrivacy, useApp } from '../store'
import { InMain } from './money'
import { salesBetween, stockOf, stockState } from './stock'
import { duration, isRunning, type Note, type Project } from '../types'
import { Btn, Card, CountInt, CountMoney, Eyebrow, Hero, MainHeader, Ring, Spark, Tile, useNow, type TileColor } from '../ui'

/** Eye button that blurs every amount on screen (for working in public). */
export function PrivacyButton() {
  const s = useApp()
  return (
    <button class="hero-eye press" aria-label={s.prefs.privacy ? 'Show amounts' : 'Hide amounts'} onClick={e => { e.stopPropagation(); togglePrivacy() }}>
      <Icon name={s.prefs.privacy ? 'eyeOff' : 'eye'} size={16} />
    </button>
  )
}

/** This week against last week: spending, top category, hours and tasks. */
function WeekInsights() {
  const s = useApp()
  const { data } = s
  const cur = s.settings.currency
  const today = F.today()
  const dow = (F.fromEpochDay(today).getDay() + 6) % 7
  const start = today - dow
  const spent = (from: number, to: number) => data.txn.filter(t => t.kind === 'expense' && t.currency === cur && t.date >= from && t.date <= to).reduce((a, t) => a + t.amount, 0)
  const now = spent(start, today)
  const before = spent(start - 7, today - 7)
  const cats = new Map<string, number>()
  for (const t of data.txn) if (t.kind === 'expense' && t.currency === cur && t.date >= start && t.date <= today) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount)
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]
  const hours = data.time.filter(t => F.dayOfMs(t.start) >= start).reduce((a, t) => a + duration(t), 0)
  const weekTasks = data.task.filter(t => t.dueDate != null && t.dueDate >= start && t.dueDate < start + 7)
  const doneTasks = weekTasks.filter(t => t.done).length
  if (!now && !before && !hours && !weekTasks.length) return null
  const change = before > 0 ? Math.round(((now - before) / before) * 100) : null
  const line = change == null ? (now > 0 ? `You spent ${F.money(now, cur)} so far this week.` : 'No spending yet this week.')
    : change === 0 ? 'Same spending as this time last week.'
    : change < 0 ? `You spent ${-change}% less than this time last week. Nice!` : `You spent ${change}% more than this time last week.`
  const stats: [string, string, string, boolean][] = [
    ['expense', 'Spent', F.money(now, cur), true],
    ['tag', 'Top category', top ? top[0] : '—', false],
    ['timer', 'Tracked', `${F.hours(hours).toFixed(1)} h`, false],
    ['tasks', 'Tasks done', weekTasks.length ? `${doneTasks}/${weekTasks.length}` : '—', false],
  ]
  return (
    <Tile color="sky" i={4}>
      <div class="row"><Icon name="chart" size={16} /><h3 class="h-md grow">This week</h3>
        {change != null && <span class={'trend ' + (change <= 0 ? 'down' : 'up')}><Icon name={change <= 0 ? 'income' : 'expense'} size={11} stroke={2.6} />{Math.abs(change)}%</span>}</div>
      <div class="small semibold" style={{ opacity: .8, margin: '4px 0 10px' }}>{line}</div>
      <div class="insights">
        {stats.map(([icon, label, value, money]) => (
          <div key={label} class="insight">
            <Icon name={icon} size={14} />
            <div class="tiny" style={{ opacity: .7 }}>{label}</div>
            <div class={'semibold ellipsis num' + (money ? ' amt' : '')}>{value}</div>
          </div>
        ))}
      </div>
    </Tile>
  )
}

export function HomeScreen() {
  const s = useApp()
  const { data, settings } = s
  const cur = settings.currency
  const today = F.today()
  const mStart = F.monthStart(today)
  const monthTx = data.txn.filter(t => t.date >= mStart && t.date <= today)
  const income = F.sumBy(monthTx.filter(t => t.kind === 'income'), t => t.currency, t => t.amount)
  const expense = F.sumBy(monthTx.filter(t => t.kind === 'expense'), t => t.currency, t => t.amount)
  const net: Record<string, number> = {}
  for (const c of new Set([...Object.keys(income), ...Object.keys(expense)])) net[c] = (income[c] ?? 0) - (expense[c] ?? 0)

  // running balance through the month, for the sparkline
  const trend: number[] = []
  let run = 0
  for (let d = mStart; d <= today; d++) {
    for (const t of monthTx) if (t.date === d && t.currency === cur) run += t.kind === 'income' ? t.amount : -t.amount
    trend.push(run)
  }

  const names = Object.fromEntries(data.project.map(p => [p.id, p.name]))
  const active = data.project.filter(p => p.status === 'active' || p.status === 'on_hold')
    .sort((a, b) => (a.deadline ?? 1e12) - (b.deadline ?? 1e12) || b.createdAt - a.createdAt)
  const due = data.task.filter(t => !t.done && t.dueDate != null && t.dueDate <= today)
    .sort((a, b) => a.dueDate! - b.dueDate! || (a.dueTime ?? 9999) - (b.dueTime ?? 9999))
  const late = due.filter(t => t.dueDate! < today).length
  const events = data.event.filter(e => e.date === today).sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.time ?? -1) - (b.time ?? -1))
  const openEvents = events.filter(e => !e.done)
  const notes = [...data.note].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt).slice(0, 3)
  const running = data.time.filter(isRunning).sort((a, b) => b.start - a.start)[0]
  const todayMs = data.time.filter(t => !isRunning(t) && F.dayOfMs(t.start) === today).reduce((a, t) => a + duration(t), 0)
  const isNew = !data.project.length && !data.txn.length && !data.note.length && !data.task.length

  const desktop = useWide()
  const hour = new Date().getHours()
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = s.user?.name.trim().split(' ')[0] || s.user?.username || ''

  const hero = (
    <Hero i={1} onClick={() => goTab('money')}>
      <div class="row"><div class="grow"><Eyebrow>{F.monthName(today)}, so far</Eyebrow></div><PrivacyButton /></div>
      <CountMoney totals={net} currency={cur} sign class="h-display amt" />
      <InMain totals={net} cur={cur} />
      {trend.some(v => v !== 0) && <div style={{ marginTop: 10 }}><Spark values={trend} /></div>}
      <div class="row" style={{ marginTop: 12, gap: 8 }}>
        <span class="hero-pill amt">↓ {F.totals(income, cur)} in</span>
        <span class="hero-pill amt">↑ {F.totals(expense, cur)} out</span>
      </div>
      <div class="row" style={{ marginTop: 14 }}>
        <button class="hero-btn" onClick={e => { e.stopPropagation(); editTxn(undefined, { kind: 'expense' }) }}><Icon name="expense" size={13} />Expense</button>
        <button class="hero-btn" onClick={e => { e.stopPropagation(); editTxn(undefined, { kind: 'income' }) }}><Icon name="income" size={13} />Income</button>
      </div>
    </Hero>
  )
  const timer = <TimerTile runningStart={running?.start} project={running ? names[running.projectId ?? ''] ?? (running.note || 'No project') : undefined} todayMs={todayMs} />
  const dueTile = (
    <Tile color="butter" onClick={() => push({ name: 'calendar' })}>
      <Eyebrow>Due today</Eyebrow>
      <CountInt value={due.length} class="big-count" />
      <div class="small semibold">{!due.length ? 'Nothing due' : `task${due.length === 1 ? '' : 's'}${late ? `, ${late} late` : ''}`}</div>
      {openEvents.length > 0 && <div class="small semibold">+ {F.plural(openEvents.length, 'event')}</div>}
    </Tile>
  )
  const welcome = isNew && (
    <Tile color="sky" i={3}>
      <h3 class="h-md">Welcome to Carrot Note 👋</h3>
      <div class="small" style={{ opacity: .75, marginBottom: 8 }}>Start with one of these:</div>
      {([['project', 'Add your first project', () => editProject()], ['note', 'Write a note', () => editNote()], ['tasks', 'Add a task for today', () => editTask(undefined, { date: today })]] as const)
        .map(([icon, label, run]) => (
          <button key={label} class="card press row" style={{ margin: '4px 0', color: 'var(--fg)' }} onClick={run}>
            <Icon name={icon} size={16} class="accent" /><span class="grow semibold" style={{ textAlign: 'start' }}>{label}</span><Icon name="right" size={12} class="muted" />
          </button>
        ))}
    </Tile>
  )
  const todayCard = (
    <Card i={3}>
      <div class="row"><h3 class="h-md grow">Today</h3><Btn kind="soft-bg" sm icon="plus" onClick={() => editTask(undefined, { date: today })}>Task</Btn></div>
      <div style={{ marginTop: 6 }}>
        {!due.length && !events.length
          ? <p class="muted" style={{ margin: '8px 0' }}>Nothing due today. Enjoy it 🥕</p>
          : <>
            {events.slice(0, 3).map(e => <EventRow key={e.id} e={e} />)}
            {due.slice(0, 5).map(t => <TaskRow key={t.id} task={t} project={names[t.projectId ?? '']} />)}
            {due.length > 5 && <button class="link" onClick={() => push({ name: 'calendar' })}>+{due.length - 5} more in the calendar</button>}
          </>}
      </div>
      <button class="link" style={{ marginTop: 8 }} onClick={() => editEvent(undefined, { date: today })}>+ Add an event for today</button>
    </Card>
  )
  const projectsCard = data.project.length > 0 && (
    <Card i={4}>
      <div class="row"><h3 class="h-md grow">Projects</h3><button class="link" onClick={() => goTab('projects')}>See all</button></div>
      {!active.length && <p class="muted" style={{ margin: '8px 0' }}>No projects in progress.</p>}
      {active.slice(0, desktop ? 6 : 3).map(p => <ProjectLine key={p.id} p={p} />)}
    </Card>
  )
  const notesCard = data.note.length > 0 && (
    <Tile color="lilac" i={5}>
      <div class="row"><h3 class="h-md grow">Notes</h3><button class="link" style={{ color: 'inherit' }} onClick={() => goTab('notes')}>See all</button></div>
      {notes.map(n => <NoteLine key={n.id} n={n} />)}
    </Tile>
  )
  const shortcuts = (
    <div class="chips pop home-shortcuts" style={{ '--i': 6 } as any}>
      {([['Calendar', 'calendar', 'sky', 'calendar'], ['Time', 'timer', 'mint', 'time'], ['Customers', 'users', 'rose', 'customers'],
        ['Rentals', 'server', 'sky', 'rentals'], ['Stock', 'box', 'butter', 'stock'], ['Debts', 'debt', 'butter', 'debts'], ['Savings', 'goal', 'lilac', 'goals']] as const).map(([label, icon, color, route]) => (
        <button key={label} class={`shortcut t-${color} press`} onClick={() => push({ name: route } as any)}>
          <span class="box"><Icon name={icon} size={16} /></span>{label}
        </button>
      ))}
    </div>
  )

  // Wide window: a dashboard with the money and work on the left, today's list on the right.
  if (desktop) {
    return (
      <div class="scroll">
        <MainHeader title={`${greeting}, ${first}`} sub={F.longDay(today)} big />
        <div class="dash">
          <div class="dash-main">
            <div class="dash-top">
              {hero}
              <div class="dash-tiles pop" style={{ '--i': 2 } as any}>{timer}{dueTile}</div>
            </div>
            {welcome}
            <div class="dash-cards">
              <WeekInsights />
              {projectsCard}
              {notesCard}
              <StockAlert />
            </div>
          </div>
          <div class="dash-side">
            {todayCard}
            <RentalsDue />
            {shortcuts}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="scroll">
      <MainHeader title={`${greeting}, ${first}`} sub={F.longDay(today)} big />
      <div class="content">
        {hero}
        <div class="grid2 pop" style={{ '--i': 2 } as any}>{timer}{dueTile}</div>
        {welcome}
        {todayCard}
        <RentalsDue />
        <StockAlert />
        <WeekInsights />
        {projectsCard}
        {notesCard}
        {shortcuts}
      </div>
    </div>
  )
}

function TimerTile({ runningStart, project, todayMs }: { runningStart?: number; project?: string; todayMs: number }) {
  const now = useNow(runningStart != null)
  const color: TileColor = 'mint'
  if (runningStart != null) {
    return (
      <Tile color={color} onClick={() => push({ name: 'time' })}>
        <div class="row" style={{ gap: 8 }}><span class="pulse" /><Eyebrow>Tracking</Eyebrow></div>
        <div class="timer-clock" style={{ marginTop: 4 }}>{F.duration(now - runningStart)}</div>
        <div class="small semibold ellipsis">{project}</div>
        <div style={{ marginTop: 'auto', paddingTop: 10 }}>
          <Btn sm icon="stop" class="mint-btn" kind="ink" onClick={() => call('timer.stop')}>Stop</Btn>
        </div>
      </Tile>
    )
  }
  return (
    <Tile color={color} onClick={() => push({ name: 'time' })}>
      <Eyebrow>Tracked today</Eyebrow>
      <div class="timer-clock" style={{ marginTop: 4 }}>{F.duration(todayMs)}</div>
      <div class="small semibold">No timer running</div>
      <div style={{ marginTop: 'auto', paddingTop: 10 }}><Btn sm icon="play" kind="ink" onClick={() => push({ name: 'time' })}>Start</Btn></div>
    </Tile>
  )
}

function ProjectLine({ p }: { p: Project }) {
  const s = useApp()
  const tracked = s.data.time.filter(t => t.projectId === p.id).reduce((a, t) => a + duration(t), 0)
  const value = projectValue(p, tracked)
  const progress = value > 0 ? Math.min(1, projectReceived(p, s.data.txn) / value) : 0
  const late = p.deadline != null && p.deadline < F.today()
  if (p.kind === 'product') {
    const st = productStats(p.id, s.data.rental)
    return (
      <div class="item" onClick={() => push({ name: 'project', id: p.id })}>
        <Ring value={st.active.length ? 1 : 0} size={44}><Icon name="laptop" size={15} /></Ring>
        <div class="main">
          <div class="t" style={{ fontWeight: 700 }}>{p.name}</div>
          <div class="s" style={st.attention ? { color: 'var(--bad)' } : undefined}>{F.plural(st.active.length, 'renter')}{st.attention ? ` · ${st.attention} to renew` : ''}</div>
        </div>
        {st.active.length > 0 && <div class="num bold amt good small">{F.totals(st.income, p.currency)}/mo</div>}
      </div>
    )
  }
  return (
    <div class="item" onClick={() => push({ name: 'project', id: p.id })}>
      <Ring value={progress} size={44} />
      <div class="main">
        <div class="t" style={{ fontWeight: 700 }}>{p.name}</div>
        <div class="s" style={late ? { color: 'var(--bad)' } : undefined}>{[p.clientName, p.deadline != null ? F.daysLeft(p.deadline) : null].filter(Boolean).join(' · ') || 'In progress'}</div>
      </div>
      {value > 0 && <div class="num h-sm" style={{ fontWeight: 800 }}>{Math.round(progress * 100)}%</div>}
    </div>
  )
}

function NoteLine({ n }: { n: Note }) {
  const title = n.title || n.body.split('\n')[0] || n.checklist[0]?.text || ''
  const sub = n.checklist.length ? `${n.checklist.filter(c => c.done).length}/${n.checklist.length} done` : n.title ? n.body : ''
  return (
    <button class="row press" style={{ width: '100%', textAlign: 'start', padding: 12, margin: '3px 0', borderRadius: 16, background: 'color-mix(in srgb, var(--card) 60%, transparent)' }}
      onClick={() => editNote(n)}>
      <Icon name={n.checklist.length ? 'checkSquare' : 'note'} size={14} />
      <div class="grow">
        <div class="semibold ellipsis">{title}</div>
        {sub && <div class="small ellipsis" style={{ opacity: .7 }}>{sub}</div>}
      </div>
      {n.pinned && <Icon name="pin" size={12} />}
    </button>
  )
}

/** Rentals that ran out or run out within a week. */
function RentalsDue() {
  const s = useApp()
  const now = useNow()
  const due = s.data.rental.filter(r => ['expired', 'soon'].includes(rentalState(r, now))).sort((a, b) => (expiresAt(a) ?? 0) - (expiresAt(b) ?? 0))
  if (!due.length) return null
  return (
    <Tile color="butter" i={4} onClick={() => push({ name: 'rentals' })}>
      <div class="row"><Icon name="server" size={16} /><h3 class="h-md grow">Renew soon</h3><Icon name="right" size={13} /></div>
      {due.slice(0, 4).map(r => {
        const left = (expiresAt(r) ?? 0) - now
        return (
          <div key={r.id} class="row" style={{ padding: '6px 0' }}>
            <Icon name={rentalKind(r.kind).icon} size={14} />
            <span class="grow semibold ellipsis">{r.name || rentalKind(r.kind).label}{r.clientName ? ` · ${r.clientName}` : ''}</span>
            <span class={'num bold small cd' + (left <= 0 ? ' bad' : '')}>{left <= 0 ? 'Expired' : F.countdown(left)}</span>
          </div>
        )
      })}
      {due.length > 4 && <div class="small semibold">+{due.length - 4} more</div>}
    </Tile>
  )
}

/** Items running low, and what sales made today. */
function StockAlert() {
  const s = useApp()
  const items = s.data.item.filter(i => !i.archived)
  if (!items.length) return null
  const low = items.filter(i => i.lowStock > 0 && stockState(i) !== 'ok')
  const today = salesBetween(items, F.today(), F.today())
  if (!low.length && !today.count) return null
  return (
    <Tile color="butter" i={4} onClick={() => push({ name: 'stock' })}>
      <div class="row"><Icon name="box" size={16} /><h3 class="h-md grow">Stock</h3><Icon name="right" size={13} /></div>
      {today.count > 0 && <div class="small semibold" style={{ marginTop: 6 }}>Sold {today.count} today · profit {F.totals(today.profit, s.settings.currency)}</div>}
      {low.slice(0, 4).map(i => {
        const q = stockOf(i).qty
        return <div key={i.id} class="row small semibold" style={{ marginTop: 6 }}><span class="grow ellipsis">{i.name}</span><span class={q <= 0 ? 'bad' : ''}>{q <= 0 ? 'Sold out' : `${q} left`}</span></div>
      })}
    </Tile>
  )
}

/** True on the PC app when the window is wide enough for the dashboard layout. */
function useWide() {
  const query = '(min-width: 1100px)'
  const pc = document.documentElement.classList.contains('desktop')
  const [wide, setWide] = useState(() => pc && matchMedia(query).matches)
  useEffect(() => {
    if (!pc) return
    const m = matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}
