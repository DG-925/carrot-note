import { useEffect, useRef, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { editDebt, editEvent, editGoal, editNote, editTask, editTime, editTxn } from '../editors'
import { categoryIcon, Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { DebtCard, EventRow, GoalCard, NoteCard, TaskRow, TimeRow, TxnRow } from '../rows'
import { countries, defaultCountries, useHolidays, type Country } from '../holidays'
import { WORK_MS, dropFocus, getFocus, startFocus, stopFocus, useFocus } from '../focus'
import { setPrefs, useApp } from '../store'
import { rentalKind } from '../types'
import { debtRemaining, debtSettled, duration, goalProgress, goalSaved, isRunning, type Invite } from '../types'
import {
  Avatar, Btn, Card, Chips, CountMoney, Empty, Eyebrow, Field, Hero, Hint, MainHeader, PageHeader, Ring, Round, SearchBar, SelectField, SheetTitle,
  SwitchRow, Tile, attempt, matches, openSheet, toast, useNow,
} from '../ui'

// ---------------------------------------------------------------- notes

let notesFilter = 'all'

export function NotesScreen() {
  const s = useApp()
  const [filter, setFilterState] = useState(notesFilter)
  const [query, setQuery] = useState('')
  const setFilter = (f: string) => { notesFilter = f; setFilterState(f) }
  const names = Object.fromEntries(s.data.project.map(p => [p.id, p.name]))
  const q = query.trim().toLowerCase()
  const shown = s.data.note
    .filter(n => filter === 'pinned' ? n.pinned : filter === 'personal' ? !n.projectId : filter === 'projects' ? !!n.projectId : filter === 'checklists' ? n.checklist.length > 0 : true)
    .filter(n => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.checklist.some(c => c.text.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  const personal = s.data.note.filter(n => !n.projectId).length
  return (
    <>
      <div class="scroll">
        <MainHeader title="Notes" sub={`${F.plural(s.data.note.length, 'note')} · ${personal} personal`} />
        <div class="content">
          <SearchBar i={1} value={query} onInput={setQuery} placeholder="Search notes and checklists" />
          <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['all', 'personal', 'projects', 'pinned', 'checklists']} value={filter} onChange={setFilter}
              label={v => ({ all: 'All', personal: 'Personal', projects: 'Projects', pinned: 'Pinned', checklists: 'Checklists' } as any)[v]} />
          </div>
          {!shown.length && (
            <Empty icon="note" title="No notes here" text="Write ideas, client requests or a to-do checklist. Notes are personal unless you put them in a project.">
              <Btn icon="pen" onClick={() => editNote()}>New note</Btn>
              <Btn kind="t-lilac" class="t-lilac" icon="checkSquare" onClick={() => editNote(undefined, { checklist: true })}>Checklist</Btn>
            </Empty>
          )}
          <div class="notes">{shown.map((n, i) => <NoteCard key={n.id} n={n} project={names[n.projectId ?? '']} i={Math.min(i, 8) + 3} />)}</div>
        </div>
      </div>
      <button class="add-fab" onClick={() => editNote()}><Icon name="plus" size={15} />Note</button>
    </>
  )
}

// ---------------------------------------------------------------- calendar

let calSel: number | null = null
let calMonth: number | null = null

interface Birthday { name: string; month: number; day: number; year?: number | null }
let birthdayCache: Birthday[] | null = null
const regionName = (() => {
  try { const d = new Intl.DisplayNames(undefined, { type: 'region' }); return (cc: string) => d.of(cc) ?? cc } catch { return (cc: string) => cc }
})()

/** Phone contacts' birthdays, when the user turned them on and allowed contacts. */
function useBirthdays(on: boolean) {
  const [list, setList] = useState<Birthday[]>(on ? birthdayCache ?? [] : [])
  useEffect(() => {
    if (!on) { setList([]); return }
    if (birthdayCache) { setList(birthdayCache); return }
    call<Birthday[] | null>('contacts.birthdays').then(r => { birthdayCache = r ?? []; setList(birthdayCache) }).catch(() => {})
  }, [on])
  return list
}

export function CalendarScreen() {
  const s = useApp()
  const [selected, setSelectedState] = useState(calSel ?? F.today())
  const [month, setMonthState] = useState(calMonth ?? F.monthStart(F.today()))
  const [dir, setDir] = useState('')
  const [query, setQuery] = useState('')
  const setSelected = (d: number) => { calSel = d; setSelectedState(d) }
  const setMonth = (m: number) => { setDir(m > month ? 'slide-l' : 'slide-r'); calMonth = m; setMonthState(m) }
  const { data } = s
  const today = F.today()
  const has = (days: (number | null | undefined)[]) => new Set(days.filter((d): d is number => d != null))
  const taskDays = has(data.task.map(t => t.dueDate)), eventDays = has(data.event.filter(e => !e.done).map(e => e.date)), noteDays = has(data.note.map(n => n.date))
  const moneyDays = has(data.txn.map(t => t.date))
  const dueDays = has([...data.project.map(p => p.deadline), ...data.debt.filter(d => !debtSettled(d)).map(d => d.dueDate), ...data.rental.filter(r => r.status === 'active').map(r => r.expiryDate)])

  const codes = s.prefs.holidays ?? defaultCountries()
  const thisYear = F.fromEpochDay(today).getFullYear()
  const years = [...new Set([F.fromEpochDay(month).getFullYear(), thisYear, thisYear + 1])].sort()
  const { map: holidays, error: holidayError } = useHolidays(years, codes)
  const birthdays = useBirthdays(s.prefs.birthdays)
  const birthdaysOn = (d: number) => {
    const x = F.fromEpochDay(d)
    return birthdays.filter(b => b.month === x.getMonth() + 1 && b.day === x.getDate())
  }

  const dayTasks = data.task.filter(t => t.dueDate === selected).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueTime ?? 9999) - (b.dueTime ?? 9999))
  const dayEvents = data.event.filter(e => e.date === selected).sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.time ?? -1) - (b.time ?? -1))
  const dayNotes = data.note.filter(n => n.date === selected)
  const dayTx = data.txn.filter(t => t.date === selected)
  const deadlines = data.project.filter(p => p.deadline === selected)
  const dayDebts = data.debt.filter(d => !debtSettled(d) && d.dueDate === selected)
  const dayRentals = data.rental.filter(r => r.status === 'active' && r.expiryDate === selected)
  const dayHolidays = holidays.get(selected) ?? []
  const dayBirthdays = birthdaysOn(selected)
  const names = Object.fromEntries(data.project.map(p => [p.id, p.name]))
  const empty = !dayTasks.length && !dayEvents.length && !dayNotes.length && !dayTx.length && !deadlines.length && !dayDebts.length && !dayRentals.length && !dayHolidays.length && !dayBirthdays.length
  const upcoming = [...holidays.entries()].filter(([d]) => d > today && d < today + 366).sort((a, b) => a[0] - b[0]).slice(0, 4)

  const first = F.fromEpochDay(month)
  const firstDow = 1 // weeks start on Monday
  const offset = (first.getDay() - firstDow + 7) % 7
  const days = F.monthEnd(month) - month + 1
  const weekNames = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }))

  const add = () => openSheet(close => (
    <>
      <div class="h-lg" style={{ padding: '0 4px' }}>Add to {F.relativeDay(selected)}</div>
      <div class="body">
        <div class="grid2">
          {([['Task', 'tasks', 'butter', () => editTask(undefined, { date: selected })], ['Event', 'calendar', 'sky', () => editEvent(undefined, { date: selected })],
            ['Note', 'note', 'lilac', () => editNote(undefined, { date: selected })], ['Money', 'wallet', 'mint', () => editTxn(undefined, { date: selected })]] as const)
            .map(([l, ic, c, run], i) => (
              <button key={l} class={`tile t-${c} press pop`} style={{ '--i': i, alignItems: 'center', padding: '18px 0', gap: 10 } as any} onClick={() => { close(); setTimeout(run, 120) }}>
                <span class="tile-ico"><Icon name={ic} size={17} /></span><b>{l}</b>
              </button>
            ))}
        </div>
      </div>
    </>
  ))

  // search across everything with a date
  type Hit = { day: number; icon: string; tint: string; title: string; sub: string }
  const hits: Hit[] = !query.trim() ? [] : [
    ...data.event.filter(e => matches(query, e.title, e.note)).map(e => ({ day: e.date, icon: 'calendar', tint: 'sky', title: e.title, sub: e.done ? 'Event · done' : 'Event' })),
    ...data.task.filter(t => t.dueDate != null && matches(query, t.title, t.notes)).map(t => ({ day: t.dueDate!, icon: 'tasks', tint: 'butter', title: t.title, sub: t.done ? 'Task · done' : 'Task' })),
    ...data.note.filter(n => n.date != null && matches(query, n.title, n.body)).map(n => ({ day: n.date!, icon: 'note', tint: 'lilac', title: n.title || n.body.slice(0, 40), sub: 'Note' })),
    ...data.project.filter(p => p.deadline != null && matches(query, p.name, p.clientName)).map(p => ({ day: p.deadline!, icon: 'flag', tint: 'rose', title: p.name, sub: 'Deadline' })),
    ...data.rental.filter(r => r.expiryDate != null && matches(query, r.name, r.clientName, r.provider)).map(r => ({ day: r.expiryDate!, icon: rentalKind(r.kind).icon, tint: 'sky', title: r.name || rentalKind(r.kind).label, sub: 'Rental expires' })),
    ...[...holidays.entries()].flatMap(([d, l]) => l.filter(h => matches(query, h.name, h.localName, regionName(h.cc))).map(h => ({ day: d, icon: 'party', tint: 'orange', title: h.name, sub: `${F.flag(h.cc)} Holiday · ${regionName(h.cc)}` }))),
  ].sort((a, b) => Math.abs(a.day - today) - Math.abs(b.day - today)).slice(0, 40)

  return (
    <>
      <div class="scroll">
        <PageHeader title="Calendar" onBack={popNav}>
          <Round icon="globe" label="Holidays and birthdays" onClick={() => openSheet(close => <CalendarOptions close={close} />)} />
          <Btn kind="ink" sm icon="today" onClick={() => { setSelected(today); setMonth(F.monthStart(today)) }}>Today</Btn>
        </PageHeader>
        <div class="content no-tabbar">
          <SearchBar i={1} value={query} onInput={setQuery} placeholder="Search events, tasks, holidays…" />
          {query.trim() ? <>
            {!hits.length && <Empty icon="search" title="Nothing found" text="Try another word." />}
            {hits.length > 0 && <div class="card flush pop" style={{ '--i': 2 } as any}>
              {hits.map((h, i) => (
                <div key={i} class="item" onClick={() => { setSelected(h.day); setMonth(F.monthStart(h.day)); setQuery('') }}>
                  <div class={`badge-ico t-${h.tint}`}><Icon name={h.icon} size={16} /></div>
                  <div class="main"><div class="t">{h.title}</div><div class="s">{h.sub} · {F.date(h.day)}</div></div>
                  <Icon name="right" size={12} class="muted" />
                </div>
              ))}
            </div>}
          </> : <>
          <Card i={2}>
            <div class="row" style={{ marginBottom: 8 }}>
              <Round icon="left" sm onBg label="Previous month" onClick={() => setMonth(F.addMonths(month, -1))} />
              <div key={month} class={'grow center h-md ' + dir}>{F.month(month)}</div>
              <Round icon="right" sm onBg label="Next month" onClick={() => setMonth(F.addMonths(month, 1))} />
            </div>
            <div key={'g' + month} class={'cal-grid ' + dir}>
              {weekNames.map((w, i) => <div key={'w' + i} class="wd">{w}</div>)}
              {Array.from({ length: offset }, (_, i) => <div key={'e' + i} />)}
              {Array.from({ length: days }, (_, i) => {
                const d = month + i
                const hol = holidays.has(d)
                const dots = [hol && '#E89A00', birthdaysOn(d).length > 0 && '#FF4F8B', taskDays.has(d) && 'var(--accent)', eventDays.has(d) && '#7C5CE0', noteDays.has(d) && 'var(--good)', dueDays.has(d) && 'var(--bad)', moneyDays.has(d) && 'var(--muted)'].filter(Boolean) as string[]
                return (
                  <button key={d} class={'day' + (d === today ? ' today' : '') + (d === selected ? ' sel' : '') + (hol ? ' holiday' : '')} onClick={() => setSelected(d)}>
                    <span>{i + 1}</span>
                    <span class="dots">{dots.slice(0, 4).map((c, j) => <i key={j} style={{ background: c }} />)}</span>
                  </button>
                )
              })}
            </div>
            <div class="legend">
              {[['Holiday', '#E89A00'], ...(s.prefs.birthdays ? [['Birthday', '#FF4F8B']] : []), ['Task', 'var(--accent)'], ['Event', '#7C5CE0'], ['Note', 'var(--good)'], ['Due', 'var(--bad)'], ['Money', 'var(--muted)']]
                .map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
            </div>
          </Card>
          <div class="section-h"><h3>{F.relativeDay(selected) === F.date(selected) ? F.date(selected) : `${F.relativeDay(selected)} · ${F.dateShort(selected)}`}</h3></div>
          {empty && <Hint>Nothing planned. Tap Add to put a task, event or note on this day.</Hint>}
          {dayHolidays.map(h => (
            <Tile key={h.cc + h.name} color="butter">
              <div class="row"><span style={{ fontSize: 24 }}>{F.flag(h.cc)}</span>
                <div class="grow"><div class="bold">{h.name}</div><div class="small" style={{ opacity: .75 }}>{h.localName !== h.name ? h.localName + ' · ' : ''}Public holiday in {regionName(h.cc)}</div></div></div>
            </Tile>
          ))}
          {dayBirthdays.map(b => {
            const age = b.year ? F.fromEpochDay(selected).getFullYear() - b.year : null
            return (
              <Tile key={b.name} color="rose">
                <div class="row"><Icon name="cake" size={20} />
                  <div class="grow"><div class="bold">{b.name}'s birthday</div>{age != null && age > 0 && <div class="small" style={{ opacity: .75 }}>Turns {age}</div>}</div>
                  <Btn sm kind="ink" icon="whatsapp" onClick={() => call('app.whatsapp', { text: `Happy birthday, ${b.name.split(' ')[0]}! 🎉` })}>Wish</Btn></div>
              </Tile>
            )
          })}
          {deadlines.map(p => (
            <Tile key={p.id} color="rose" onClick={() => push({ name: 'project', id: p.id })}><div class="row bold"><Icon name="flag" size={14} />Deadline: {p.name}</div></Tile>
          ))}
          {dayRentals.map(r => (
            <Tile key={r.id} color="sky" onClick={() => push({ name: 'rental', id: r.id })}>
              <div class="row bold"><Icon name={rentalKind(r.kind).icon} size={14} />{r.name || rentalKind(r.kind).label} expires{r.clientName ? ` · ${r.clientName}` : ''}</div>
            </Tile>
          ))}
          {dayDebts.map(d => (
            <Tile key={d.id} color="butter" onClick={() => push({ name: 'debts' })}>
              <div class="row bold"><Icon name="flag" size={14} />{d.direction === 'owed_to_me' ? `${d.person} should pay you ${F.money(debtRemaining(d), d.currency)}` : `Pay ${d.person} ${F.money(debtRemaining(d), d.currency)}`}</div>
            </Tile>
          ))}
          {(dayEvents.length > 0 || dayTasks.length > 0) && (
            <div class="card flush pop" style={{ '--i': 3 } as any}>
              {dayEvents.map(e => <EventRow key={e.id} e={e} />)}
              {dayTasks.map(t => <TaskRow key={t.id} task={t} project={names[t.projectId ?? '']} />)}
            </div>
          )}
          {dayNotes.length > 0 && <div class="notes">{dayNotes.map(n => <NoteCard key={n.id} n={n} project={names[n.projectId ?? '']} />)}</div>}
          {dayTx.length > 0 && <><div class="section-h"><h3>Money</h3></div><div class="card flush">{dayTx.map(t => <TxnRow key={t.id} t={t} />)}</div></>}

          <div class="section-h"><h3>Upcoming holidays</h3><button class="link" onClick={() => openSheet(close => <CalendarOptions close={close} />)}>{codes.map(F.flag).join(' ')} Change</button></div>
          {holidayError && <Hint>{holidayError}</Hint>}
          {!holidayError && !upcoming.length && <Hint>No upcoming public holidays found.</Hint>}
          {upcoming.length > 0 && <div class="card flush">
            {upcoming.map(([d, l]) => (
              <div key={d} class="item" onClick={() => { setSelected(d); setMonth(F.monthStart(d)) }}>
                <div class="event-time"><b>{F.fromEpochDay(d).getDate()}</b><span>{F.fromEpochDay(d).toLocaleDateString(undefined, { month: 'short' })}</span></div>
                <div class="main"><div class="t">{l.map(h => h.name).filter((x, i, a) => a.indexOf(x) === i).join(' · ')}</div>
                  <div class="s">{l.map(h => F.flag(h.cc)).join(' ')} {F.daysLeft(d)}</div></div>
              </div>
            ))}
          </div>}
          </>}
        </div>
      </div>
      <button class="add-fab low" onClick={add}><Icon name="plus" size={15} />Add</button>
    </>
  )
}

/** Pick which countries' holidays to show, and turn contact birthdays on or off. */
function CalendarOptions({ close }: { close: () => void }) {
  const s = useApp()
  const chosen = s.prefs.holidays ?? defaultCountries()
  const [list, setList] = useState<Country[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => { countries().then(setList).catch(e => setError(e.message)) }, [])
  const toggle = (cc: string) => setPrefs({ holidays: chosen.includes(cc) ? chosen.filter(c => c !== cc) : [...chosen, cc] })
  const shown = (list ?? []).filter(c => matches(q, c.name, c.countryCode, regionName(c.countryCode)))
    .sort((a, b) => Number(chosen.includes(b.countryCode)) - Number(chosen.includes(a.countryCode)))
  return (
    <>
      <SheetTitle title="Holidays & birthdays" sub="Public holidays come from Nager.Date, a free service with 100+ countries." />
      <div class="body">
        <div class="card in-card">
          <SwitchRow title="Contacts' birthdays" sub="Show birthdays saved in your phone contacts" on={s.prefs.birthdays} onChange={async on => {
            if (!on) { setPrefs({ birthdays: false }); return }
            const r = await attempt(() => call<Birthday[] | null>('contacts.birthdays', { ask: true }))
            if (r == null) { toast('Allow contacts to show birthdays'); return }
            birthdayCache = r
            setPrefs({ birthdays: true })
            toast(r.length ? `${F.plural(r.length, 'birthday')} found` : 'No birthdays saved in your contacts')
          }} />
        </div>
        <div class="field-label">Countries · {chosen.length} selected</div>
        <div class="chips wrap">
          {chosen.map(cc => <button key={cc} class="chip on" onClick={() => toggle(cc)}>{F.flag(cc)} {regionName(cc)} <Icon name="close" size={11} /></button>)}
        </div>
        <SearchBar value={q} onInput={setQ} placeholder="Add a country" />
        {error && <div class="error-box"><Icon name="warning" size={16} />{error}</div>}
        {!list && !error && <div class="row" style={{ justifyContent: 'center', padding: 20 }}><span class="spinner" /></div>}
        {list && <div class="card flush in-card" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {shown.slice(0, 60).map(c => (
            <button key={c.countryCode} class="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => toggle(c.countryCode)}>
              <span style={{ fontSize: 22 }}>{F.flag(c.countryCode)}</span>
              <div class="main"><div class="t">{regionName(c.countryCode)}</div></div>
              <span class={'check' + (chosen.includes(c.countryCode) ? ' on' : '')}><i>{chosen.includes(c.countryCode) && <Icon name="check" size={12} stroke={3} />}</i></span>
            </button>
          ))}
        </div>}
        <Btn onClick={close}>Done</Btn>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- time tracker

let timeQuery = ''

export function TimeScreen() {
  const s = useApp()
  const running = s.data.time.filter(isRunning).sort((a, b) => b.start - a.start)[0]
  const now = useNow(!!running)
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [query, setQueryState] = useState(timeQuery)
  const setQuery = (q: string) => { timeQuery = q; setQueryState(q) }
  const names = Object.fromEntries(s.data.project.map(p => [p.id, p.name]))
  const today = F.today()
  const weekStart = today - ((F.fromEpochDay(today).getDay() + 6) % 7)
  const todayMs = s.data.time.filter(t => F.dayOfMs(t.start) === today).reduce((a, t) => a + duration(t, now), 0)
  const weekMs = s.data.time.filter(t => F.dayOfMs(t.start) >= weekStart).reduce((a, t) => a + duration(t, now), 0)
  const sorted = [...s.data.time].filter(t => matches(query, t.note, names[t.projectId ?? ''])).sort((a, b) => b.start - a.start)
  const days = [...new Set(sorted.map(t => F.dayOfMs(t.start)))]
  return (
    <div class="scroll">
      <PageHeader title="Time tracker" onBack={popNav}>
        <Round icon="plus" label="Add time" onClick={() => editTime()} />
      </PageHeader>
      <div class="content no-tabbar">
        <Hero i={1}>
          <div class="row" style={{ gap: 8 }}>{running && <span class="pulse" />}<Eyebrow>{running ? `Tracking · ${names[running.projectId ?? ''] ?? 'No project'}` : 'Ready when you are'}</Eyebrow></div>
          <div class="num center" style={{ font: '800 54px/1.1 var(--display)', letterSpacing: '-0.03em', margin: '10px 0' }}>{F.duration(running ? duration(running, now) : 0)}</div>
          {running?.note && <div class="center" style={{ opacity: .85 }}>{running.note}</div>}
          <div class="row" style={{ marginTop: 10 }}>
            <div class="grow"><div class="eyebrow">Today</div><div class="num h-sm" style={{ fontWeight: 800 }}>{F.duration(todayMs)}</div></div>
            <div class="grow"><div class="eyebrow">This week</div><div class="num h-sm" style={{ fontWeight: 800 }}>{F.duration(weekMs)}</div></div>
          </div>
        </Hero>
        <FocusCard projectId={projectId || null} running={!!running} />
        {running
          ? <Btn block kind="danger" icon="stop" onClick={() => { if (getFocus()?.phase === 'work') stopFocus(); else call('timer.stop') }}>Stop timer</Btn>
          : (
            <Card i={2}>
              <div class="col">
                <SelectField label="Project" value={projectId} onChange={setProjectId}
                  options={[{ value: '', label: 'No project' }, ...[...s.data.project].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))]} />
                <Field label="What are you working on?" value={note} onInput={setNote} />
                <Btn block icon="play" onClick={() => { call('timer.start', { projectId: projectId || null, note: note.trim() }); setNote('') }}>Start timer</Btn>
              </div>
            </Card>
          )}
        {!s.data.time.length && <Empty icon="timer" title="No time tracked yet" text="Track hours per project, then bill hourly clients with an invoice in one tap." />}
        {s.data.time.length > 0 && <SearchBar value={query} onInput={setQuery} placeholder="Search by what you worked on or project" />}
        {query.trim() && !sorted.length && <Hint>No time entries match.</Hint>}
        {days.map(d => {
          const entries = sorted.filter(t => F.dayOfMs(t.start) === d)
          return (
            <div key={d} class="col tight">
              <div class="row" style={{ padding: '6px 4px 0' }}><div class="h-sm grow">{F.relativeDay(d)}</div><div class="num accent h-sm" style={{ fontWeight: 800 }}>{F.duration(entries.reduce((a, t) => a + duration(t, now), 0))}</div></div>
              <div class="card flush">{entries.map(e => <TimeRow key={e.id} e={e} project={names[e.projectId ?? '']} />)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Pomodoro: 25 minutes of tracked focus, then a break. */
function FocusCard({ projectId, running }: { projectId: string | null; running: boolean }) {
  const focus = useFocus()
  const now = useNow(!!focus && focus.phase !== 'ready')
  useEffect(() => {
    // The timer was stopped somewhere else (notification, another screen): end the session too.
    if (focus?.phase === 'work' && !running && Date.now() - (focus.endsAt - WORK_MS) > 4000) dropFocus()
  }, [running, focus?.phase])
  if (!focus) {
    return (
      <Tile color="lilac" i={2}>
        <div class="row"><span class="tile-ico"><Icon name="focus" size={16} /></span>
          <div class="grow"><div class="h-sm">Focus mode</div><div class="small" style={{ opacity: .75 }}>25 minutes of deep work, then a 5 minute break. Time is tracked for you.</div></div></div>
        <div style={{ marginTop: 10 }}><Btn sm kind="ink" icon="play" onClick={() => startFocus(projectId)}>Start focus</Btn></div>
      </Tile>
    )
  }
  const total = focus.phase === 'work' ? WORK_MS : focus.done % 4 === 0 ? 15 * 60_000 : 5 * 60_000
  const left = Math.min(total, Math.max(0, focus.endsAt - now))
  const label = focus.phase === 'work' ? `Focus · round ${focus.done + 1}` : focus.phase === 'break' ? 'Break · stretch, drink water' : `${F.plural(focus.done, 'round')} done`
  return (
    <Tile color={focus.phase === 'work' ? 'lilac' : 'mint'} i={2}>
      <div class="row">
        <Ring value={focus.phase === 'ready' ? 1 : 1 - left / total} size={64} stroke={6} color="currentColor" track="rgba(0,0,0,.08)">
          <Icon name={focus.phase === 'work' ? 'focus' : 'checkCircle'} size={18} />
        </Ring>
        <div class="grow">
          <Eyebrow>{label}</Eyebrow>
          {focus.phase !== 'ready' ? <div class="timer-clock">{F.duration(left)}</div> : <div class="h-sm">Ready for the next round?</div>}
          <div class="pomodots">{Array.from({ length: 4 }, (_, i) => <i key={i} class={i < focus.done % 4 || (focus.done > 0 && focus.done % 4 === 0) ? 'on' : ''} />)}</div>
        </div>
      </div>
      <div class="row" style={{ marginTop: 10 }}>
        {focus.phase === 'ready' && <Btn sm kind="ink" icon="play" onClick={() => startFocus(focus.projectId)}>Next round</Btn>}
        {focus.phase === 'break' && <Btn sm kind="ink" icon="play" onClick={() => startFocus(focus.projectId)}>Skip break</Btn>}
        <Btn sm kind="ghost" onClick={() => { stopFocus(); toast(focus.done ? `Nice work: ${F.plural(focus.done, 'focus round')} today` : 'Focus stopped') }}>End</Btn>
      </div>
    </Tile>
  )
}

// ---------------------------------------------------------------- debts

export function DebtsScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')
  const open = s.data.debt.filter(d => !debtSettled(d))
  const owed = F.sumBy(open.filter(d => d.direction === 'owed_to_me'), d => d.currency, debtRemaining)
  const owe = F.sumBy(open.filter(d => d.direction === 'i_owe'), d => d.currency, debtRemaining)
  const shown = s.data.debt
    .filter(d => filter === 'open' ? !debtSettled(d) : filter === 'settled' ? debtSettled(d) : !debtSettled(d) && d.direction === filter)
    .filter(d => matches(query, d.person, d.note, F.amount(d.amount)))
    .sort((a, b) => (a.dueDate ?? 1e12) - (b.dueDate ?? 1e12) || b.createdAt - a.createdAt)
  return (
    <>
      <div class="scroll">
        <PageHeader title="Debts" onBack={popNav} />
        <div class="content no-tabbar">
          <div class="grid2 pop" style={{ '--i': 1 } as any}>
            <Tile color="mint"><Eyebrow>People owe you</Eyebrow><CountMoney totals={owed} currency={cur} class="h-md amt" />
              <div class="small semibold">{open.filter(d => d.direction === 'owed_to_me').length} open</div></Tile>
            <Tile color="rose"><Eyebrow>You owe</Eyebrow><CountMoney totals={owe} currency={cur} class="h-md amt" />
              <div class="small semibold">{open.filter(d => d.direction === 'i_owe').length} open</div></Tile>
          </div>
          {s.data.debt.length > 0 && <SearchBar i={2} value={query} onInput={setQuery} placeholder="Search people or notes" />}
          <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['open', 'owed_to_me', 'i_owe', 'settled']} value={filter} onChange={setFilter}
              label={v => ({ open: 'Open', owed_to_me: 'Owed to me', i_owe: 'I owe', settled: 'Settled' } as any)[v]} />
          </div>
          {!shown.length && <Empty icon="debt" title="No debts here" text="Track money people owe you and money you owe others." />}
          {shown.map((d, i) => <DebtCard key={d.id} d={d} i={Math.min(i, 8) + 3} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editDebt()}><Icon name="plus" size={15} />Debt</button>
    </>
  )
}

// ---------------------------------------------------------------- goals

export function GoalsScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const [query, setQuery] = useState('')
  const saved = F.sumBy(s.data.goal, g => g.currency, goalSaved)
  const sorted = [...s.data.goal].filter(g => matches(query, g.name, g.note)).sort((a, b) => Number(goalProgress(a) >= 1) - Number(goalProgress(b) >= 1) || (a.deadline ?? 1e12) - (b.deadline ?? 1e12))
  return (
    <>
      <div class="scroll">
        <PageHeader title="Savings goals" onBack={popNav} />
        <div class="content no-tabbar">
          <Hero i={1}>
            <Eyebrow>Total saved</Eyebrow>
            <CountMoney totals={saved} currency={cur} class="h-display amt" />
            <div class="semibold" style={{ marginTop: 6, opacity: .88 }}>{s.data.goal.filter(g => goalProgress(g) >= 1).length} of {s.data.goal.length} goals reached</div>
          </Hero>
          {s.data.goal.length > 2 && <SearchBar i={2} value={query} onInput={setQuery} placeholder="Search goals" />}
          {!sorted.length && <Empty icon="goal" title="No goals yet" text="Set a target (a new laptop, a trip, an emergency fund) and add to it as you save." />}
          {sorted.map((g, i) => <GoalCard key={g.id} g={g} i={Math.min(i, 8) + 2} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editGoal()}><Icon name="plus" size={15} />Goal</button>
    </>
  )
}

// ---------------------------------------------------------------- invitations

export function InvitesScreen() {
  const [list, setList] = useState<Invite[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = () => call<Invite[]>('invites.list').then(l => { setList(l); setError(null) }).catch(e => { setError(e.message); setList(l => l ?? []) })
  useEffect(() => { load() }, [])
  const answer = async (inv: Invite, accept: boolean) => {
    setBusy(inv.id)
    await attempt(() => call('invites.answer', { id: inv.id, accept }))
    await load()
    setBusy(null)
    if (accept) {
      const pid = inv.spaceId.replace(/^p_/, '')
      setTimeout(() => push({ name: 'project', id: pid }), 300)
    }
  }
  return (
    <div class="scroll">
      <PageHeader title="Invitations" onBack={popNav} />
      <div class="content no-tabbar">
        {list == null && <div class="row" style={{ justifyContent: 'center', padding: 40 }}><span class="spinner" /></div>}
        {error && <div class="error-box"><Icon name="warning" size={16} />{error}</div>}
        {list?.length === 0 && <Empty icon="inbox" title="No invitations" text="When someone invites you to their project, it shows up here. Share your username so people can find you." />}
        {list?.map((inv, i) => (
          <Card key={inv.id} i={i + 1}>
            <div class="row">
              <Avatar userId={inv.from.id} rev={inv.from.avatarRev} name={inv.from.name || inv.from.username} size={46} />
              <div class="grow"><div class="h-sm">{inv.projectName}</div><div class="small muted">{inv.from.name || '@' + inv.from.username} invited you</div></div>
            </div>
            <div class="row" style={{ marginTop: 12 }}>
              <Btn class="grow" icon="check" busy={busy === inv.id} disabled={!!busy} onClick={() => answer(inv, true)}>Accept</Btn>
              <Btn class="grow" kind="soft-bg" disabled={!!busy} onClick={() => answer(inv, false)}>Decline</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- search

export function SearchScreen() {
  const s = useApp()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => input.current?.focus(), 350) }, [])
  const q = query.trim().toLowerCase()
  const has = (...v: string[]) => v.some(x => x.toLowerCase().includes(q))
  type Hit = { icon: string; tint: string; title: string; sub: string; open: () => void }
  const groups: [string, Hit[]][] = q.length < 2 ? [] : ([
    ['Projects', s.data.project.filter(p => has(p.name, p.clientName, p.description)).map(p => ({ icon: 'project', tint: 'orange', title: p.name, sub: p.clientName || 'Project', open: () => push({ name: 'project', id: p.id }) }))],
    ['Notes', s.data.note.filter(n => has(n.title, n.body, ...n.checklist.map(c => c.text))).map(n => ({ icon: 'note', tint: 'lilac', title: n.title || n.body.slice(0, 40), sub: n.body.slice(0, 60), open: () => editNote(n) }))],
    ['Tasks', s.data.task.filter(t => has(t.title, t.notes)).map(t => ({ icon: 'tasks', tint: 'butter', title: t.title, sub: (t.done ? 'Done' : 'Open') + (t.dueDate != null ? ' · ' + F.dateShort(t.dueDate) : ''), open: () => editTask(t) }))],
    ['Customers', s.data.customer.filter(c => has(c.name, c.phone, c.company, c.email)).map(c => ({ icon: 'user', tint: 'rose', title: c.name, sub: [c.company, c.phone].filter(Boolean).join(' · '), open: () => push({ name: 'customer', id: c.id }) }))],
    ['Money', s.data.txn.filter(t => has(t.note, t.category, t.method)).sort((a, b) => b.date - a.date).slice(0, 30).map(t => ({ icon: categoryIcon(t.category), tint: t.kind === 'income' ? 'mint' : 'sky', title: t.note || t.category, sub: (t.kind === 'income' ? '+' : '−') + F.money(t.amount, t.currency) + ' · ' + F.dateShort(t.date), open: () => editTxn(t) }))],
    ['Events', s.data.event.filter(e => has(e.title, e.note)).map(e => ({ icon: 'calendar', tint: 'sky', title: e.title, sub: F.date(e.date) + (e.done ? ' · done' : ''), open: () => editEvent(e) }))],
    ['Rentals', s.data.rental.filter(r => has(r.name, r.clientName, r.provider, r.details)).map(r => ({ icon: rentalKind(r.kind).icon, tint: 'sky', title: r.name || rentalKind(r.kind).label, sub: [r.clientName, r.expiryDate != null ? 'Expires ' + F.dateShort(r.expiryDate) : ''].filter(Boolean).join(' · '), open: () => push({ name: 'rental', id: r.id }) }))],
  ] as [string, Hit[]][]).filter(g => g[1].length)
  return (
    <div class="scroll">
      <PageHeader title="Search" onBack={popNav} />
      <div class="content no-tabbar">
        <SearchBar i={1} inputRef={input} value={query} onInput={setQuery} placeholder="Projects, notes, tasks, customers, rentals…" />
        {q.length < 2 && <Hint>Type at least 2 letters to search everything in Carrot Note.</Hint>}
        {q.length >= 2 && !groups.length && <Empty icon="search" title="Nothing found" text="Try another word." />}
        {groups.map(([title, hits]) => (
          <div key={title} class="col tight">
            <div class="section-h"><h3>{title} · {hits.length}</h3></div>
            <div class="card flush">
              {hits.map((h, i) => (
                <div key={i} class="item" onClick={h.open}>
                  <div class={`badge-ico t-${h.tint}`}><Icon name={h.icon} size={16} /></div>
                  <div class="main"><div class="t">{h.title}</div>{h.sub && <div class="s">{h.sub}</div>}</div>
                  <Icon name="right" size={12} class="muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { MainHeader }
