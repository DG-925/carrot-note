import './styles.css'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { call, on, ready } from './bridge'
import { editNote, editTask, editTxn, quickAdd } from './editors'
import * as F from './format'
import { Icon } from './icons'
import { closeAllOverlays, closeOverlay, getNav, goTab, onNav, openOverlay, push, setDrawer, type Route, type Tab } from './nav'
import { getState, isDark, setLanguage, setPrefs, useApp } from './store'
import { currentLang, startArabic } from './i18n'
import { debtSettled, duration, isRunning } from './types'
import { Avatar, Btn, Logo, ToastHost, attempt, cx } from './ui'
import { ProfileScreen, SettingsScreen, signOut } from './screens/account'
import { AuthScreen, ChooseUsername, LockScreen } from './screens/auth'
import { CustomerDetail, CustomersScreen } from './screens/customers'
import { HomeScreen } from './screens/home'
import { MoneyScreen } from './screens/money'
import { CalendarScreen, DebtsScreen, GoalsScreen, InvitesScreen, NotesScreen, SearchScreen, TimeScreen } from './screens/more'
import { ProjectDetail, ProjectsScreen } from './screens/projects'
import { RentalDetail, RentalsScreen, rentalState } from './screens/rentals'
import { InvoiceDetail, InvoicesScreen, invoiceState } from './screens/invoices'
import { ReportScreen } from './screens/report'
import { VaultScreen } from './screens/vault'
import { RecurringScreen } from './screens/recurring'
import { ItemDetail, StockScreen, stockOf, stockState } from './screens/stock'
import { runRecurring } from './recurring'
import { startMasonry } from './masonry'
import { startWheelScroll } from './wheel'

function useNav() {
  const [, setTick] = useState(0)
  const seen = getNav()
  useEffect(() => {
    const force = () => setTick(n => n + 1)
    const off = onNav(force)
    if (getNav() !== seen) force()
    return off
  }, [])
  return getNav()
}

function App() {
  const s = useApp()
  const dark = isDark(s)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    if (s.loaded) call('app.systemBars', { dark }).catch(() => {})
  }, [dark, s.loaded])

  if (!s.loaded) return <div class="layer" style={{ display: 'grid', placeItems: 'center' }}><Logo size={84} popIn /></div>
  let body
  if (!s.signedIn) body = <div class="layer enter-tab"><AuthScreen /></div>
  else if (s.locked) body = <div class="layer enter-tab"><LockScreen /></div>
  else if (!s.user?.username) body = <div class="layer enter-tab"><ChooseUsername /></div>
  else body = <Main />
  return (
    <>
      {body}
      {s.release && !s.locked && <UpdateDialog />}
      <ToastHost />
    </>
  )
}

function tabScreen(tab: Tab) {
  switch (tab) {
    case 'money': return <MoneyScreen />
    case 'projects': return <ProjectsScreen />
    case 'notes': return <NotesScreen />
    default: return <HomeScreen />
  }
}

function routeScreen(r: Route) {
  switch (r.name) {
    case 'project': return <ProjectDetail id={r.id} />
    case 'customer': return <CustomerDetail id={r.id} />
    case 'rental': return <RentalDetail id={r.id} />
    case 'rentals': return <RentalsScreen />
    case 'invoices': return <InvoicesScreen />
    case 'invoice': return <InvoiceDetail id={r.id} />
    case 'report': return <ReportScreen />
    case 'vault': return <VaultScreen />
    case 'recurring': return <RecurringScreen />
    case 'stock': return <StockScreen />
    case 'item': return <ItemDetail id={r.id} />
    case 'calendar': return <CalendarScreen />
    case 'time': return <TimeScreen />
    case 'customers': return <CustomersScreen />
    case 'debts': return <DebtsScreen />
    case 'goals': return <GoalsScreen />
    case 'invites': return <InvitesScreen />
    case 'search': return <SearchScreen />
    case 'profile': return <ProfileScreen />
    case 'settings': return <SettingsScreen />
  }
}

// Long-press shortcuts on the launcher icon. They wait until the app is unlocked.
let pendingShortcut: string | null = null
on('shortcut', (id: string) => { pendingShortcut = id; runShortcut() })

function runShortcut() {
  const s = getState()
  if (!pendingShortcut || !s.loaded || !s.signedIn || s.locked || !s.user?.username) return
  const id = pendingShortcut
  pendingShortcut = null
  closeAllOverlays()
  setDrawer(false)
  setTimeout(() => {
    if (id === 'expense') editTxn(undefined, { kind: 'expense' })
    else if (id === 'task') editTask(undefined, { date: F.today() })
    else if (id === 'timer') { goTab(getNav().tab); push({ name: 'time' }) }
    else if (id === 'search') push({ name: 'search' })
  }, 250)
}

// Text or a link shared from another app ("Share → Carrot Note").
let pendingShare: { text: string; subject: string } | null = null
on('shared', (p: { text: string; subject: string }) => { pendingShare = p; runShare() })

function runShare() {
  const s = getState()
  if (!pendingShare || !s.loaded || !s.signedIn || s.locked || !s.user?.username) return
  const { text, subject } = pendingShare
  pendingShare = null
  closeAllOverlays()
  setTimeout(() => openOverlay('sheet', close => <ShareSheet text={text} subject={subject} close={close} />), 250)
}

function ShareSheet({ text, subject, close }: { text: string; subject: string; close: () => void }) {
  const firstLine = (subject || text).split('\n')[0].slice(0, 120)
  const amountMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(text)
  const go = (run: () => void) => { close(); setTimeout(run, 150) }
  const options: [string, string, string, () => void][] = [
    ['Note', 'note', 'lilac', () => editNote(undefined, { title: subject, body: text })],
    ['Task', 'tasks', 'butter', () => editTask(undefined, { title: firstLine, notes: subject ? text : '', date: F.today() })],
    ['Expense', 'expense', 'rose', () => editTxn(undefined, { kind: 'expense', note: firstLine, amount: amountMatch ? F.parseAmount(amountMatch[1]) ?? 0 : 0 })],
    ['Income', 'income', 'mint', () => editTxn(undefined, { kind: 'income', note: firstLine, amount: amountMatch ? F.parseAmount(amountMatch[1]) ?? 0 : 0 })],
  ]
  return (
    <>
      <div style={{ padding: '0 4px' }}><h2 class="h-lg">Save to Carrot Note</h2></div>
      <div class="body">
        <div class="card in-card shared-preview">{subject && <b>{subject}</b>}<div>{text.slice(0, 400)}{text.length > 400 ? '…' : ''}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {options.map(([label, icon, color, run], i) => (
            <button key={label} class={`tile t-${color} press pop`} style={{ '--i': i, alignItems: 'center', padding: '16px 0', gap: 8 } as any} onClick={() => go(run)}>
              <span class="tile-ico"><Icon name={icon} size={17} /></span><b style={{ fontSize: 13 }}>{label}</b>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function Main() {
  const nav = useNav()
  useEffect(() => { call('app.started').catch(() => {}); runShortcut(); runShare(); setTimeout(runRecurring, 2500) }, [])
  const quickOpen = nav.overlays.some(o => o.tag === 'quickadd' && !o.closing)
  return (
    <>
      <div key={'tab-' + nav.tab} class="layer enter-tab">{tabScreen(nav.tab)}</div>
      {nav.stack.map((r, i) => (
        <div key={i + JSON.stringify(r)} class={'layer ' + (i === nav.stack.length - 1 && nav.dir === 'push' ? 'enter-push' : '')}>{routeScreen(r)}</div>
      ))}
      {isDesktop && <Sidebar />}
      <TabBar tab={nav.tab} away={nav.stack.length > 0} open={quickOpen} />
      {nav.drawer && <Drawer />}
      {nav.overlays.map((o, i) => {
        // Later overlays always sit above earlier ones (a sheet opened from a form, a dialog over a sheet…).
        const z = (n: number) => ({ zIndex: 40 + i * 4 + n })
        return o.kind === 'page'
          ? <div key={o.key} class={'page-overlay' + (o.closing ? ' closing' : '')} style={z(2)}>{o.render(() => closeOverlay(o.key))}</div>
          : <div key={o.key}>
            <div class={'scrim' + (o.closing ? ' closing' : '')} style={z(0)} onClick={() => closeOverlay(o.key)} />
            {o.kind === 'sheet'
              ? <div class={'sheet' + (o.closing ? ' closing' : '')} style={z(1)}><div class="grab" />{o.render(() => closeOverlay(o.key))}</div>
              : <div class="dialog-wrap" style={z(3)} onClick={e => { if (e.target === e.currentTarget) closeOverlay(o.key) }}>
                <div class={'dialog' + (o.closing ? ' closing' : '')}>{o.render(() => closeOverlay(o.key))}</div>
              </div>}
          </div>
      })}
    </>
  )
}

const tabs: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'money', label: 'Money', icon: 'wallet' },
  { tab: 'projects', label: 'Projects', icon: 'project' },
  { tab: 'notes', label: 'Notes', icon: 'note' },
]

function TabBar({ tab, away, open }: { tab: Tab; away: boolean; open: boolean }) {
  const slot = (i: number) => (i < 2 ? i : i + 1)
  const idx = slot(tabs.findIndex(t => t.tab === tab))
  return (
    <nav class={'tabbar' + (away ? ' away' : '')}>
      <span class="pill" style={{ insetInlineStart: `calc(${idx} * 20% + 10% - 29px)` }} />
      {tabs.slice(0, 2).map(t => <TabBtn key={t.tab} t={t} on={t.tab === tab} />)}
      <button class={'fab' + (open ? ' open' : '')} aria-label="Add" onClick={() => quickAdd()}><span><Icon name="plus" size={24} stroke={2.6} /></span></button>
      {tabs.slice(2).map(t => <TabBtn key={t.tab} t={t} on={t.tab === tab} />)}
    </nav>
  )
}

function TabBtn({ t, on }: { t: (typeof tabs)[number]; on: boolean }) {
  return (
    <button class={'tab' + (on ? ' on' : '')} onClick={() => goTab(t.tab)}>
      <Icon name={t.icon} size={19} />{t.label}
    </button>
  )
}

const isDesktop = document.documentElement.classList.contains('desktop')

/** Desktop: navigation always on the left (shown on wide windows instead of the tab bar). */
function Sidebar() {
  const s = useApp()
  const nav = getNav()
  const u = s.user!
  const { data } = s
  const current = nav.stack.length ? nav.stack[nav.stack.length - 1].name : nav.tab
  const go = (r: string) => {
    if (['home', 'money', 'projects', 'notes'].includes(r)) goTab(r as Tab)
    else { goTab(nav.tab); push({ name: r } as Route) }
  }
  const renew = data.rental.filter(r => ['expired', 'soon'].includes(rentalState(r))).length
  const unpaid = data.invoice.filter(i => ['sent', 'partial', 'overdue'].includes(invoiceState(i))).length
  const dueToday = data.task.filter(t => !t.done && t.dueDate != null && t.dueDate <= F.today()).length
  const lowStock = data.item.filter(i => !i.archived && i.lowStock > 0 && stockState(i) !== 'ok').length
  const groups: [string, [string, string, string, string, number?][]][] = [
    ['', [['Home', 'home', 'orange', 'home'], ['Money', 'wallet', 'mint', 'money'], ['Projects', 'project', 'sky', 'projects'], ['Notes', 'note', 'lilac', 'notes'],
      ['Calendar', 'calendar', 'butter', 'calendar', dueToday]]],
    ['Work', [['Time', 'timer', 'mint', 'time'], ['Invoices', 'invoice', 'orange', 'invoices', unpaid], ['Rentals', 'server', 'sky', 'rentals', renew],
      ['Stock', 'box', 'butter', 'stock', lowStock], ['Customers', 'users', 'rose', 'customers'], ...(s.invites > 0 ? [['Invitations', 'inbox', 'orange', 'invites', s.invites] as [string, string, string, string, number]] : [])]],
    ['Money', [['Recurring', 'repeat', 'mint', 'recurring'], ['Debts', 'debt', 'butter', 'debts'], ['Savings', 'goal', 'lilac', 'goals'], ['Report', 'chart', 'lilac', 'report']]],
    ['Private', [['Vault', 'lock', 'rose', 'vault']]],
  ]
  return (
    <aside class="sidebar">
      <div class="side-brand"><Logo size={36} /><div><div class="h-sm">Carrot Note</div><div class="tiny muted">Freelancer workspace</div></div></div>
      <button class="side-new press" onClick={() => quickAdd()}><Icon name="plus" size={17} stroke={2.6} />New</button>
      <button class="search side-search press" onClick={() => push({ name: 'search' })}><Icon name="search" size={16} /><span class="muted grow" style={{ textAlign: 'start' }}>Search everything…</span></button>
      <nav class="side-nav">
        {groups.map(([title, items]) => (
          <div key={title || 'main'}>
            {title && <div class="side-label">{title}</div>}
            {items.map(([label, icon, color, r, n]) => (
              <button key={r} class={cx('side-item', current === r && 'on')} onClick={() => go(r)}>
                <span class={`box t-${color}`}><Icon name={icon} size={15} /></span>
                <span class="grow">{label}</span>
                {!!n && <span class="side-count">{n}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div class="side-foot">
        <button class="side-item" onClick={() => go('settings')}><span class="box"><Icon name="settings" size={15} /></span><span class="grow">Settings</span></button>
        <button class="side-profile press" onClick={() => go('profile')}>
          <Avatar userId={u.id} rev={u.avatarRev} name={u.name || u.username} size={38} />
          <div class="grow" style={{ minWidth: 0, textAlign: 'start' }}><div class="semibold ellipsis">{u.name || '@' + u.username}</div><div class="tiny muted ellipsis">@{u.username}</div></div>
          <span class={'sync-dot' + (s.sync.error ? ' bad' : s.sync.syncing ? ' busy' : '')} title={s.sync.error ?? (s.sync.syncing ? 'Syncing…' : 'Synced')} />
        </button>
      </div>
    </aside>
  )
}

function Drawer() {
  const s = useApp()
  const nav = getNav()
  const u = s.user!
  const { data } = s
  const today = F.today()
  const current = nav.stack.length ? nav.stack[nav.stack.length - 1].name : nav.tab
  const [closing, setClosing] = useState(false)
  const close = (then?: () => void) => {
    setClosing(true)
    setTimeout(() => { setDrawer(false); then?.() }, 200)
  }
  const go = (r: string) => close(() => {
    if (['home', 'money', 'projects', 'notes'].includes(r)) goTab(r as Tab)
    else { goTab(nav.tab); push({ name: r } as Route) }
  })
  const later = (run: () => void) => close(() => setTimeout(run, 60))

  const cur = s.settings.currency
  const mStart = F.monthStart(today)
  const net = data.txn.filter(t => t.date >= mStart && t.currency === cur).reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0)
  const activeProjects = data.project.filter(p => p.status === 'active').length
  const dueToday = data.task.filter(t => !t.done && t.dueDate != null && t.dueDate <= today).length
  const eventsToday = data.event.filter(e => e.date === today && !e.done).length
  const running = data.time.find(isRunning)
  const trackedToday = data.time.filter(t => F.dayOfMs(t.start) === today).reduce((a, t) => a + duration(t), 0)
  const openDebts = data.debt.filter(d => !debtSettled(d)).length
  const activeRentals = data.rental.filter(r => r.status === 'active')
  const unpaidInvoices = data.invoice.filter(i => ['sent', 'partial', 'overdue'].includes(invoiceState(i))).length
  const renewSoon = activeRentals.filter(r => ['expired', 'soon'].includes(rentalState(r))).length

  const tiles: [string, string, string, string, string][] = [
    ['Home', 'home', 'orange', 'home', 'Your day'],
    ['Money', 'wallet', 'mint', 'money', (net >= 0 ? '+' : '−') + F.money(Math.abs(net), cur)],
    ['Projects', 'project', 'sky', 'projects', `${activeProjects} active`],
    ['Notes', 'note', 'lilac', 'notes', F.plural(data.note.length, 'note')],
    ['Calendar', 'calendar', 'butter', 'calendar', dueToday + eventsToday ? `${dueToday + eventsToday} today` : 'Holidays & plans'],
    ['Time', 'timer', 'mint', 'time', running ? 'Tracking now' : `${F.hours(trackedToday).toFixed(1)} h today`],
    ['Rentals', 'server', 'sky', 'rentals', renewSoon ? `${renewSoon} to renew` : `${activeRentals.length} active`],
    ['Invoices', 'invoice', 'orange', 'invoices', unpaidInvoices ? `${unpaidInvoices} unpaid` : `${data.invoice.length} total`],
    ['Stock', 'box', 'butter', 'stock', `${data.item.filter(i => !i.archived).reduce((a, i) => a + Math.max(0, stockOf(i).qty), 0)} in stock`],
    ['Recurring', 'repeat', 'mint', 'recurring', `${data.recurring.filter(r => r.active).length} active`],
    ['Report', 'chart', 'lilac', 'report', `${new Date().getFullYear()} so far`],
    ['Vault', 'lock', 'rose', 'vault', `${data.secret.length} saved`],
    ['Customers', 'users', 'rose', 'customers', `${data.customer.length} saved`],
    ['Debts', 'debt', 'butter', 'debts', openDebts ? `${openDebts} open` : 'All settled'],
    ['Savings', 'goal', 'lilac', 'goals', F.plural(data.goal.length, 'goal')],
    ...(s.invites > 0 ? [['Invitations', 'inbox', 'orange', 'invites', `${s.invites} waiting`] as [string, string, string, string, string]] : []),
  ]
  const quick: [string, string, string, () => void][] = [
    ['Expense', 'expense', 'rose', () => editTxn(undefined, { kind: 'expense' })],
    ['Income', 'income', 'mint', () => editTxn(undefined, { kind: 'income' })],
    ['Task', 'tasks', 'butter', () => editTask(undefined, { date: today })],
    ['Note', 'note', 'lilac', () => editNote()],
  ]
  return (
    <>
      <div class={cx('scrim', closing && 'closing')} onClick={() => close()} />
      <aside class={cx('drawer', closing && 'closing')}>
        <div class="row" style={{ padding: '0 4px 12px' }}>
          <Logo size={40} />
          <div class="grow"><div class="h-md">Carrot Note</div><div class="tiny muted">Freelancer workspace</div></div>
          <button class="round sm" aria-label="Close menu" onClick={() => close()}><Icon name="close" size={15} /></button>
        </div>
        <button class="drawer-profile press" onClick={() => go('profile')}>
          <div class="row">
            <Avatar userId={u.id} rev={u.avatarRev} name={u.name || u.username} size={48} />
            <div class="grow" style={{ textAlign: 'start', minWidth: 0 }}><div class="h-sm ellipsis">{u.name || '@' + u.username}</div><div class="small" style={{ opacity: .85 }}>@{u.username}</div></div>
            <Icon name="right" size={13} />
          </div>
          <div class="drawer-stats">
            <span><b>{activeProjects}</b> projects</span><span><b>{dueToday}</b> due</span><span class="amt"><b>{F.amount(Math.round(net))}</b> {cur}</span>
          </div>
        </button>
        <button class="search drawer-search press" onClick={() => go('search')}><Icon name="search" size={17} /><span class="muted grow" style={{ textAlign: 'start' }}>Search everything…</span></button>

        <div class="label">Quick add</div>
        <div class="drawer-quick">
          {quick.map(([label, icon, color, run]) => (
            <button key={label} class="press" onClick={() => later(run)}><span class={`box t-${color}`}><Icon name={icon} size={17} /></span>{label}</button>
          ))}
        </div>

        <div class="label">Go to</div>
        <div class="drawer-grid">
          {tiles.map(([label, icon, color, r, sub], i) => (
            <button key={r} class={cx(`drawer-tile t-${color} press`, current === r && 'on')} style={{ '--i': i } as any} onClick={() => go(r)}>
              <span class="box"><Icon name={icon} size={16} /></span>
              <b>{label}</b>
              <span class={cx('sub ellipsis', r === 'money' && 'amt')}>{sub}</span>
              {r === 'invites' && <span class="badge">{s.invites}</span>}
            </button>
          ))}
        </div>

        <div class="label">Preferences</div>
        <div class="drawer-prefs">
          <div class="drawer-theme">
            {([[1, 'sun', 'Light'], [2, 'moon', 'Dark'], [0, 'settings', 'Auto']] as const).map(([v, icon, label]) => (
              <button key={v} class={s.settings.theme === v ? 'on' : ''} onClick={() => attempt(() => call('settings.set', { theme: v }))}><Icon name={icon} size={14} />{label}</button>
            ))}
          </div>
          <div class="drawer-theme" data-notr>
            <button class={s.prefs.lang === 'en' ? 'on' : ''} onClick={() => setLanguage('en')}>English</button>
            <button class={s.prefs.lang === 'ar' ? 'on' : ''} onClick={() => setLanguage('ar')}>العربية</button>
          </div>
          <button class="drawer-row" onClick={() => setPrefs({ privacy: !s.prefs.privacy })}>
            <span class="box"><Icon name={s.prefs.privacy ? 'eyeOff' : 'eye'} size={15} /></span><span class="grow" style={{ textAlign: 'start' }}>Hide amounts</span>
            <span class={cx('switch', s.prefs.privacy && 'on')} />
          </button>
          <button class="drawer-row" onClick={() => go('settings')}><span class="box"><Icon name="settings" size={15} /></span><span class="grow" style={{ textAlign: 'start' }}>Settings</span><Icon name="right" size={12} class="muted" /></button>
          {s.lock.pinEnabled && <button class="drawer-row" onClick={() => close(() => call('lock.now'))}><span class="box"><Icon name="lock" size={15} /></span><span class="grow" style={{ textAlign: 'start' }}>Lock now</span></button>}
          <button class="drawer-row" onClick={() => close(signOut)}><span class="box bad"><Icon name="signOut" size={15} /></span><span class="grow bad" style={{ textAlign: 'start' }}>Sign out</span></button>
        </div>
        <div class="tiny muted center" style={{ padding: '14px 0 4px' }}>Carrot Note {s.version} · made for freelancers 🥕</div>
      </aside>
    </>
  )
}

function UpdateDialog() {
  const s = useApp()
  const r = s.release!
  const d = s.download
  const busy = d.state === 'downloading'
  return (
    <>
      <div class="scrim" style={{ zIndex: 150 }} onClick={() => !busy && call('update.later')} />
      <div class="dialog-wrap" style={{ zIndex: 151 }}>
        <div class="dialog">
          <div class="row"><div class="badge-ico t-orange"><Icon name="download" size={18} /></div><h3 class="grow">Update available</h3></div>
          <p style={{ margin: 0 }}>Carrot Note {r.version} is ready (you have {s.version}).</p>
          {r.notes && <div class="small muted" style={{ maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{r.notes.slice(0, 1200)}</div>}
          {busy && <><div class="bar"><i style={{ width: `${(d.progress ?? 0) * 100}%`, transition: 'width .3s' }} /></div><div class="small muted">Downloading… {Math.round((d.progress ?? 0) * 100)}%</div></>}
          {d.state === 'failed' && <div class="small bad">{d.message}</div>}
          {d.state === 'ready' && <div class="small muted">{d.canInstall ? "Downloaded. Tap Install if the installer didn't open." : 'Allow Carrot Note to install updates, then come back and tap Install.'}</div>}
          <div class="actions">
            <Btn kind="ghost" disabled={busy} onClick={() => call('update.later')}>Later</Btn>
            {d.state === 'ready'
              ? <Btn onClick={() => attempt(() => call('update.install'))}>Install</Btn>
              : <Btn busy={busy} onClick={() => attempt(() => call('update.download'))}>Update now</Btn>}
          </div>
        </div>
      </div>
    </>
  )
}

const root = document.getElementById('app')!
if (currentLang() === 'ar') startArabic(document.body)
if (isDesktop) { startMasonry(root); startWheelScroll() }
render(<App />, root)
ready()
