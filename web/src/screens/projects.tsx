import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { askForPayment, editEvent, editNote, editProject, editTask, editTime, editTxn } from '../editors'
import { languageColor, repoInfo, repoPath, type GhRepo } from '../github'
import { ago } from '../net'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { EventRow, NoteCard, ProjectCard, TaskRow, TimeRow, TxnRow, projectReceived, projectValue } from '../rows'
import { useApp } from '../store'
import { RentalCard, editRental, productStats } from './rentals'
import { PartnersPanel, editSplit } from './partners'
import { InvoiceCard, editInvoice } from './invoices'
import { setTaskDone, save as saveItem } from '../store'
import type { TaskItem } from '../types'
import { duration, isRunning, type Project, type PublicUser, type SpaceInfo, type SpaceMember } from '../types'
import {
  Avatar, AvatarStack, Bar, Btn, Card, Chips, Empty, Eyebrow, Hero, Hint, MainHeader, PageHeader, Round, SearchBar, Seg, SheetTitle,
  StatusChip, Tile, attempt, matches, openSheet, toast, useNow,
} from '../ui'

let savedFilter = 'open'
let savedTaskView = 0

export function ProjectsScreen() {
  const s = useApp()
  const [filter, setFilterState] = useState(savedFilter)
  const [query, setQuery] = useState('')
  const setFilter = (f: string) => { savedFilter = f; setFilterState(f) }
  const customers = Object.fromEntries(s.data.customer.map(c => [c.id, c.name]))
  const shown = s.data.project
    .filter(p => filter === 'open' ? p.status === 'active' || p.status === 'on_hold'
      : filter === 'done' ? p.status === 'done'
      : filter === 'shared' ? s.spaces.some(sp => sp.projectId === p.id) : true)
    .filter(p => matches(query, p.name, p.clientName, p.description, p.repo, customers[p.customerId ?? '']))
    .sort((a, b) => (a.deadline ?? 1e12) - (b.deadline ?? 1e12) || b.createdAt - a.createdAt)
  const activeCount = s.data.project.filter(p => p.status === 'active').length
  return (
    <>
      <div class="scroll">
        <MainHeader title="Projects" sub={`${activeCount} active · ${s.data.project.length} total`} />
        <div class="content">
          <SearchBar i={1} value={query} onInput={setQuery} placeholder="Search projects, clients or repos" />
          <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['open', 'done', 'shared', 'all']} value={filter} onChange={setFilter}
              label={v => ({ open: 'In progress', done: 'Done', shared: 'Shared', all: 'All' } as any)[v]} />
          </div>
          {!shown.length && query.trim() && <Empty icon="search" title="No matches" text="Try another name, or switch the filter to All." />}
          {!shown.length && !query.trim() && <Empty icon="project" title="No projects here" text="Add your freelance projects to track price, payments, time, tasks and notes, and invite your team." />}
          {shown.map((p, i) => <ProjectCard key={p.id} p={p} space={s.spaces.find(sp => sp.projectId === p.id)} i={Math.min(i, 8) + 3} />)}
        </div>
      </div>
      <button class="add-fab" onClick={() => editProject()}><Icon name="plus" size={15} />Project</button>
    </>
  )
}

export function ProjectDetail({ id }: { id: string }) {
  const s = useApp()
  const [tab, setTab] = useState(0)
  const [taskView, setTaskViewState] = useState(savedTaskView)
  const setTaskView = (v: number) => { savedTaskView = v; setTaskViewState(v) }
  const p = s.data.project.find(x => x.id === id)
  const space = s.spaces.find(sp => sp.kind === 'project' && sp.projectId === id)
  const pTime = s.data.time.filter(t => t.projectId === id).sort((a, b) => b.start - a.start)
  const running = pTime.find(isRunning)
  const now = useNow(!!running)
  if (!p) {
    return (
      <div class="scroll"><PageHeader title="Project" onBack={popNav} />
        <Empty icon="project" title="This project is gone" text="It was deleted or you left the team."><Btn onClick={popNav}>Go back</Btn></Empty>
      </div>
    )
  }
  const isOwner = !space || space.ownerId === s.user?.id
  const customer = s.data.customer.find(c => c.id === p.customerId)
  const received = projectReceived(p, s.data.txn)
  const trackedMs = pTime.reduce((a, t) => a + duration(t, now), 0)
  const value = projectValue(p, trackedMs)
  const tasks = s.data.task.filter(t => t.projectId === id).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? 1e12) - (b.dueDate ?? 1e12))
  const notes = s.data.note.filter(n => n.projectId === id).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  const txns = s.data.txn.filter(t => t.projectId === id).sort((a, b) => b.date - a.date)
  const events = s.data.event.filter(e => e.projectId === id).sort((a, b) => Number(!!a.done) - Number(!!b.done) || a.date - b.date)
  const costs = txns.filter(t => t.kind === 'expense' && t.currency === p.currency).reduce((a, t) => a + t.amount, 0)
  const product = p.kind === 'product'
  const stats = productStats(id, s.data.rental)
  const addRenter = () => editRental(undefined, { projectId: id, kind: 'app', name: p.name, price: p.price, priceCurrency: p.currency, costCurrency: p.currency })
  type TabKey = 'renters' | 'partners' | 'tasks' | 'notes' | 'money' | 'info'
  const tabs: { key: TabKey; label: string; fab: [string, () => void] }[] = [
    ...(product ? [{ key: 'renters' as const, label: 'Renters', fab: ['Renter', addRenter] as [string, () => void] }] : []),
    { key: 'tasks', label: 'Tasks', fab: ['Task', () => editTask(undefined, { projectId: id })] },
    { key: 'notes', label: 'Notes', fab: ['Note', () => editNote(undefined, { projectId: id })] },
    { key: 'partners', label: 'Partners', fab: ['Earnings', () => editSplit(p)] },
    { key: 'money', label: 'Money', fab: ['Payment', () => editTxn(undefined, { kind: 'income', projectId: id, customerId: p.customerId })] },
    { key: 'info', label: 'Info', fab: ['Event', () => editEvent(undefined, { projectId: id })] },
  ]
  const current = tabs[Math.min(tab, tabs.length - 1)]
  const on = (k: TabKey) => current.key === k
  return (
    <>
      <div class="scroll">
        <PageHeader title={p.name} onBack={popNav}>
          <Round icon="invoice" label="New invoice" onClick={() => editInvoice(undefined, { projectId: id, customerId: p.customerId })} />
          <Round icon="edit" label="Edit" onClick={() => editProject(p)} />
        </PageHeader>
        <div class="content no-tabbar">
          {product ? <Hero i={1}>
            <div class="row top">
              <div class="grow">
                <Eyebrow>Product we rent out</Eyebrow>
                <div class="h-md">{F.plural(stats.active.length, 'active renter')}</div>
              </div>
              <span class="hero-pill">{({ active: 'Active', on_hold: 'On hold', done: 'Done', cancelled: 'Cancelled' } as any)[p.status]}</span>
            </div>
            <div class="row" style={{ marginTop: 14 }}>
              {[['Renters pay / mo', F.totals(stats.income, p.currency)], ['Costs / mo', F.totals(stats.cost, p.currency)], ['Profit / mo', F.totals(stats.profit, p.currency)]]
                .map(([l, v]) => <div key={l} class="grow" style={{ minWidth: 0 }}><div class="eyebrow">{l}</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{v}</div></div>)}
            </div>
            <div class="small" style={{ marginTop: 12, opacity: .88 }}>
              {stats.attention ? `${F.plural(stats.attention, 'renter')} to renew soon` : stats.active.length ? 'Every renter is paid up' : 'Add the people or businesses renting it'}
            </div>
          </Hero> : <Hero i={1}>
            <div class="row top">
              <div class="grow" onClick={() => customer && push({ name: 'customer', id: customer.id })}>
                <Eyebrow>Client</Eyebrow>
                <div class="h-md">{customer?.name ?? (p.clientName || '—')}</div>
              </div>
              <span class="hero-pill">{({ active: 'Active', on_hold: 'On hold', done: 'Done', cancelled: 'Cancelled' } as any)[p.status]}</span>
            </div>
            <div class="row" style={{ marginTop: 14 }}>
              {(p.billing === 'hourly'
                ? [['Hours', `${F.hours(trackedMs).toFixed(1)} h`], ['Rate', F.money(p.hourlyRate, p.currency)], ['Earned', F.money(value, p.currency)]]
                : [['Price', F.money(p.price, p.currency)], ['Received', F.money(received, p.currency)], ['Remaining', F.money(Math.max(0, p.price - received), p.currency)]]
              ).map(([l, v]) => <div key={l} class="grow"><div class="eyebrow">{l}</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800 }}>{v}</div></div>)}
            </div>
            {value > 0 && <div style={{ marginTop: 12 }}><Bar value={received / value} height={10} /></div>}
            <div class="small" style={{ marginTop: 12, opacity: .88 }}>
              {[p.startDate != null ? 'Started ' + F.dateShort(p.startDate) : null, p.deadline != null ? `Due ${F.dateShort(p.deadline)} · ${F.daysLeft(p.deadline)}` : null].filter(Boolean).join('  ·  ') || 'No dates set'}
            </div>
          </Hero>}

          <div class="grid2 pop" style={{ '--i': 2 } as any}>
            <Tile color="lilac" onClick={() => teamSheet(p, space, isOwner)}>
              <div style={{ minHeight: 28 }}>{space && space.members.length ? <AvatarStack people={space.members} size={28} /> : <Icon name="userPlus" size={18} />}</div>
              <div class="h-sm" style={{ marginTop: 6 }}>Team</div>
              <div class="tiny ellipsis" style={{ opacity: .75 }}>{!space ? 'Invite people' : F.plural(space.members.length, 'member') + (space.pending.length ? ` · ${space.pending.length} invited` : '')}</div>
            </Tile>
            <Tile color="mint" onClick={() => call(running ? 'timer.stop' : 'timer.start', { projectId: id })}>
              <div class="row">
                <span class="tile-ico" style={running ? { background: 'var(--bad)', color: '#fff' } : undefined}><Icon name={running ? 'stop' : 'play'} size={14} /></span>
                {running && <span class="pulse" />}
              </div>
              <div class="h-sm" style={{ marginTop: 6 }}>{running ? 'Stop timer' : 'Start timer'}</div>
              <div class="tiny num bold" style={{ opacity: .75 }}>{F.duration(trackedMs)}</div>
            </Tile>
          </div>

          {space && s.sync.lastSync > 0 && (s.sync.apiVersion ?? 0) < 3 && <Card class="wide">
            <div class="row top"><Icon name="warning" size={16} class="warn" />
              <div class="grow small"><b>Rentals and invoices aren't shared yet.</b> Your Carrot Note server is an older version. Update it (run "Deploy API" on GitHub, or <code>npx wrangler deploy</code> in the server folder) and everyone in this project will see them.</div></div>
          </Card>}
          {p.repo && <RepoCard repo={p.repo} />}

          <Seg i={4} options={tabs.map(t => ({ label: t.label }))} value={tabs.indexOf(current)} onChange={setTab} />

          {on('renters') && <>
            {!stats.all.length && <Hint>Add everyone who rents {p.name}: what they pay, when it started and when it runs out. You get a reminder before each one expires.</Hint>}
            {stats.all.sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || (a.expiryDate ?? 1e12) - (b.expiryDate ?? 1e12)).map(r => <RentalCard key={r.id} r={r} />)}
            <Btn kind="soft" icon="plus" onClick={addRenter}>Add a renter</Btn>
          </>}
          {on('partners') && <PartnersPanel p={p} space={space} />}
          {on('tasks') && <>
            {!tasks.length ? <Hint>No tasks yet. Break the project into steps.</Hint> : <>
              <div class="row small muted" style={{ padding: '0 4px' }}>
                <span class="grow semibold">{tasks.filter(t => t.done).length} of {tasks.length} done</span>
                <div class="mini-seg">
                  <button class={taskView === 0 ? 'on' : ''} onClick={() => setTaskView(0)}><Icon name="list" size={13} />List</button>
                  <button class={taskView === 1 ? 'on' : ''} onClick={() => setTaskView(1)}><Icon name="chart" size={13} />Board</button>
                </div>
              </div>
              <Bar value={tasks.filter(t => t.done).length / tasks.length} />
              {taskView === 0 ? <div class="card flush">{tasks.map(t => <TaskRow key={t.id} task={t} />)}</div> : <TaskBoard tasks={tasks} projectId={id} />}
            </>}
          </>}
          {on('notes') && <>
            {!notes.length && <Hint>{space ? 'Notes here are shared with your team.' : 'Save requirements, ideas and client feedback here.'}</Hint>}
            <div class="notes">{notes.map(n => <NoteCard key={n.id} n={n} />)}</div>
          </>}
          {on('money') && <>
            <div class="card row">
              {[['Received', F.money(received, p.currency), 'var(--good)'], ['Costs', F.money(costs, p.currency), 'var(--bad)'], ['Profit', F.money(received - costs, p.currency), undefined]]
                .map(([l, v, c]) => <div key={l} class="grow"><div class="tiny muted semibold">{l}</div><div class="num h-sm ellipsis amt" style={{ fontWeight: 800, color: c }}>{v}</div></div>)}
            </div>
            <div class="row wrap">
              {!product && p.billing !== 'hourly' && p.price - received > 0 && <Btn kind="t-butter" class="t-butter" sm icon="bell" onClick={() => askForPayment({
                person: customer?.name ?? (p.clientName || 'there'), amount: p.price - received, currency: p.currency, customerId: p.customerId, dueDate: p.deadline, what: `“${p.name}”`,
              })}>Ask for payment</Btn>}
              <Btn kind="t-rose" class="t-rose" sm icon="expense" onClick={() => editTxn(undefined, { kind: 'expense', projectId: id })}>Add cost</Btn>
              <Btn kind="t-sky" class="t-sky" sm icon="invoice" onClick={() => editInvoice(undefined, { projectId: id, customerId: p.customerId })}>New invoice</Btn>
            </div>
            {s.data.invoice.some(x => x.projectId === id) && <>
              <div class="section-h"><h3>Invoices</h3></div>
              {s.data.invoice.filter(x => x.projectId === id).sort((a, b) => b.issueDate - a.issueDate).map(x => <InvoiceCard key={x.id} inv={x} />)}
            </>}
            {!txns.length ? <Hint>Payments you receive for this project show here (only you see your money).</Hint>
              : <div class="card flush">{txns.map(t => <TxnRow key={t.id} t={t} extra={F.dateShort(t.date)} />)}</div>}
            <div class="section-h"><h3>Time logged</h3><button class="link" onClick={() => editTime(undefined, { projectId: id })}>+ Add</button></div>
            {pTime.length ? <div class="card flush">{pTime.map(e => <TimeRow key={e.id} e={e} />)}</div> : <Hint>No time tracked yet.</Hint>}
          </>}
          {on('info') && <>
            {p.description && <><div class="section-h"><h3>Description</h3></div><div class="card" style={{ whiteSpace: 'pre-wrap' }}>{p.description}</div></>}
            <div class="section-h"><h3>Info</h3><button class="link" onClick={() => editProject(p)}>Edit</button></div>
            {!p.info.length && <Hint>Add links, logins, specs, or anything you need for this project.</Hint>}
            {p.info.map((it, i) => (
              <Card key={i} onClick={() => call('app.copy', { text: it.value })}>
                <div class="row"><div class="grow"><div class="small muted semibold">{it.label}</div><div style={{ overflowWrap: 'anywhere' }}>{it.value}</div></div><Icon name="copy" size={14} class="muted" /></div>
              </Card>
            ))}
            {!product && <>
              <div class="section-h"><h3>Rentals</h3><button class="link" onClick={() => editRental(undefined, { projectId: id, customerId: p.customerId })}>+ Add</button></div>
              {s.data.rental.filter(r => r.projectId === id).length
                ? s.data.rental.filter(r => r.projectId === id).map(r => <RentalCard key={r.id} r={r} />)
                : <Hint>VPS, hosting, bots or domains you rent for this project.</Hint>}
            </>}
            <div class="section-h"><h3>Events & meetings</h3><button class="link" onClick={() => editEvent(undefined, { projectId: id })}>+ Add</button></div>
            {events.length ? <div class="card flush">{events.map(e => <EventRow key={e.id} e={e} showDate />)}</div> : <Hint>No events. Add meetings, calls or delivery dates.</Hint>}
          </>}
        </div>
      </div>
      <button key={current.key} class="add-fab low" onClick={current.fab[1]}><Icon name="plus" size={15} />{current.fab[0]}</button>
    </>
  )
}

/** Three columns: to do, doing, done. Arrows move a task to the next or previous column. */
function TaskBoard({ tasks, projectId }: { tasks: TaskItem[]; projectId: string }) {
  const s = useApp()
  const cols: [string, string, (t: TaskItem) => boolean][] = [
    ['To do', 'square', t => !t.done && !t.doing],
    ['Doing', 'play', t => !t.done && !!t.doing],
    ['Done', 'checkSquare', t => t.done],
  ]
  const move = (t: TaskItem, to: number) => {
    if (to === 2) setTaskDone({ ...t, doing: false }, true)
    else attempt(() => saveItem('task', { ...t, done: false, doing: to === 1 }))
  }
  const members = s.spaces.flatMap(sp => sp.members)
  return (
    <div class="board">
      {cols.map(([title, icon, test], ci) => {
        const list = tasks.filter(test)
        return (
          <div key={title} class={`board-col col-${ci}`}>
            <div class="board-head"><Icon name={icon} size={13} /><b class="grow">{title}</b><span class="tiny muted bold">{list.length}</span></div>
            {list.map(t => {
              const steps = t.subtasks ?? []
              const who = members.find(m => m.id === t.assignee)
              return (
                <div key={t.id} class="board-card press" onClick={() => editTask(t)}>
                  <div class={'semibold' + (t.done ? ' muted' : '')} style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</div>
                  <div class="tiny muted" style={{ marginTop: 4 }}>
                    {[t.dueDate != null ? F.relativeDay(t.dueDate) : null, steps.length ? `${steps.filter(x => x.done).length}/${steps.length} steps` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div class="row" style={{ marginTop: 6, gap: 4 }}>
                    {who && <Avatar userId={who.id} rev={who.avatarRev} name={who.name || who.username} size={22} />}
                    <span class="grow" />
                    {ci > 0 && <button class="board-move" aria-label="Move back" onClick={e => { e.stopPropagation(); move(t, ci - 1) }}><Icon name="left" size={12} /></button>}
                    {ci < 2 && <button class="board-move fwd" aria-label="Move forward" onClick={e => { e.stopPropagation(); move(t, ci + 1) }}><Icon name="right" size={12} /></button>}
                  </div>
                </div>
              )
            })}
            {ci === 0 && <button class="board-add" onClick={() => editTask(undefined, { projectId })}><Icon name="plus" size={13} />Task</button>}
            {ci === 1 && <button class="board-add" onClick={() => editTask(undefined, { projectId, doing: true })}><Icon name="plus" size={13} />Task</button>}
          </div>
        )
      })}
    </div>
  )
}

/** The project's GitHub repository with live stats. */
function RepoCard({ repo }: { repo: string }) {
  const path = repoPath(repo)
  const [info, setInfo] = useState<GhRepo | null>(null)
  useEffect(() => { if (path) repoInfo(path).then(setInfo).catch(() => setInfo(null)) }, [path])
  const url = path ? `https://github.com/${path}` : repo
  return (
    <Card i={3} onClick={() => call('app.openUrl', { url: url.startsWith('http') ? url : 'https://' + url })}>
      <div class="row"><Icon name="github" size={20} /><span class="grow ellipsis semibold">{path ?? repo}</span><Icon name="open" size={13} class="muted" /></div>
      {info?.description && <div class="small muted" style={{ marginTop: 6 }}>{info.description}</div>}
      {info && <div class="repo-meta" style={{ marginTop: 8 }}>
        {info.language && <span><i style={{ background: languageColor(info.language) }} />{info.language}</span>}
        <span><Icon name="star" size={11} />{info.stargazers_count}</span>
        <span><Icon name="share" size={11} />{info.forks_count} forks</span>
        <span><Icon name="info" size={11} />{info.open_issues_count} open issues</span>
        <span>Last push {ago(info.pushed_at)}</span>
      </div>}
    </Card>
  )
}

const clean = (q: string) => q.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '')

function teamSheet(project: Project, space: SpaceInfo | undefined, isOwner: boolean) {
  openSheet(close => <TeamSheet project={project} initialSpace={space} isOwner={isOwner} close={close} />)
}

function TeamSheet({ project, initialSpace, isOwner, close }: { project: Project; initialSpace?: SpaceInfo; isOwner: boolean; close: () => void }) {
  const s = useApp()
  const space = s.spaces.find(sp => sp.kind === 'project' && sp.projectId === project.id) ?? initialSpace
  const me = s.user
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicUser[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const members: SpaceMember[] = space?.members ?? (me ? [{ id: me.id, username: me.username, name: me.name, avatarRev: me.avatarRev, role: 'owner' }] : [])
  const q = clean(query)

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      call<PublicUser[]>('team.search', { query: q }).then(setResults).catch(() => setResults([])).finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const invite = async (username: string) => {
    setBusy(username)
    try {
      await call('team.invite', { projectId: project.id, username })
      toast(`Invitation sent to @${username}`)
      setQuery('')
    } catch (e) { toast((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <>
      <SheetTitle title="Team" sub={`Members can see and add tasks, notes, events, rentals and partner earnings in “${project.name}”. The rest of your money stays private.`} />
      <div class="body">
        <div class="card flush in-card">
          {[...members].sort((a, b) => Number(a.role !== 'owner') - Number(b.role !== 'owner')).map(m => (
            <PersonRow key={m.id} p={m} label={m.role === 'owner' ? 'Owner' : 'Member'}>
              {isOwner && space && m.id !== me?.id && <Btn kind="ghost" sm onClick={() => attempt(() => call('team.remove', { spaceId: space.id, userId: m.id }))}>Remove</Btn>}
            </PersonRow>
          ))}
          {space?.pending.map(m => <PersonRow key={m.id} p={m} label="Invited · waiting" />)}
        </div>
        {isOwner ? <>
          <div class="field-label">Invite by username</div>
          <div class="search"><span class="muted bold">@</span>
            <input placeholder="Search username" value={query} autoCapitalize="off" onInput={e => setQuery((e.target as HTMLInputElement).value)} />
            {searching && <span class="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
          </div>
          {results.filter(r => !members.some(m => m.id === r.id)).length > 0 && (
            <div class="card flush in-card">
              {results.filter(r => !members.some(m => m.id === r.id)).map(u => (
                <PersonRow key={u.id} p={u}><Btn sm busy={busy === u.username} disabled={!!busy} onClick={() => invite(u.username)}>Invite</Btn></PersonRow>
              ))}
            </div>
          )}
          {q.length >= 3 && !searching && !results.some(r => r.username === q) && <Btn kind="ghost" onClick={() => invite(q)}>Invite @{q}</Btn>}
          <Btn kind="soft" icon="share" onClick={() => call('app.share', {
            subject: 'Join my project on Carrot Note',
            text: `Hi! Join my project “${project.name}” on Carrot Note so we can work on it together.\n\n1. Download the app: https://github.com/DG-925/carrot-note/releases/latest\n2. Create an account and send me your username.\n\nMy username: @${me?.username}`,
          })}>Share an invite link</Btn>
        </> : space && (
          <Btn kind="soft" icon="signOut" class="bad" onClick={async () => { await attempt(() => call('team.leave', { spaceId: space.id })); close(); popNav() }}>Leave this project</Btn>
        )}
      </div>
    </>
  )
}

export function PersonRow({ p, label, children }: { p: { id: string; avatarRev: number; name: string; username: string }; label?: string; children?: any }) {
  return (
    <div class="item">
      <Avatar userId={p.id} rev={p.avatarRev} name={p.name || p.username} size={40} />
      <div class="main"><div class="t">{p.name || '@' + p.username}</div><div class="s">@{p.username}{label ? ' · ' + label : ''}</div></div>
      {children}
    </div>
  )
}

export { StatusChip }
