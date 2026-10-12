import './styles.css'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { call, ready } from './bridge'
import { quickAdd } from './editors'
import { Icon } from './icons'
import { closeOverlay, getNav, goTab, onNav, push, setDrawer, type Route, type Tab } from './nav'
import { isDark, useApp } from './store'
import { Avatar, Btn, Logo, ToastHost, attempt } from './ui'
import { ProfileScreen, SettingsScreen, signOut } from './screens/account'
import { AuthScreen, ChooseUsername, LockScreen } from './screens/auth'
import { CustomerDetail, CustomersScreen } from './screens/customers'
import { HomeScreen } from './screens/home'
import { MoneyScreen } from './screens/money'
import { CalendarScreen, DebtsScreen, GoalsScreen, InvitesScreen, NotesScreen, SearchScreen, TimeScreen } from './screens/more'
import { ProjectDetail, ProjectsScreen } from './screens/projects'

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

function Main() {
  const nav = useNav()
  useEffect(() => { call('app.started').catch(() => {}) }, [])
  const quickOpen = nav.overlays.some(o => o.tag === 'quickadd' && !o.closing)
  return (
    <>
      <div key={'tab-' + nav.tab} class="layer enter-tab">{tabScreen(nav.tab)}</div>
      {nav.stack.map((r, i) => (
        <div key={i + JSON.stringify(r)} class={'layer ' + (i === nav.stack.length - 1 && nav.dir === 'push' ? 'enter-push' : '')}>{routeScreen(r)}</div>
      ))}
      <TabBar tab={nav.tab} away={nav.stack.length > 0} open={quickOpen} />
      {nav.drawer && <Drawer />}
      {nav.overlays.map(o => (
        o.kind === 'page'
          ? <div key={o.key} class={'page-overlay' + (o.closing ? ' closing' : '')}>{o.render(() => closeOverlay(o.key))}</div>
          : <div key={o.key}>
            <div class={'scrim' + (o.closing ? ' closing' : '')} onClick={() => closeOverlay(o.key)} />
            {o.kind === 'sheet'
              ? <div class={'sheet' + (o.closing ? ' closing' : '')}><div class="grab" />{o.render(() => closeOverlay(o.key))}</div>
              : <div class="dialog-wrap" onClick={e => { if (e.target === e.currentTarget) closeOverlay(o.key) }}>
                <div class={'dialog' + (o.closing ? ' closing' : '')}>{o.render(() => closeOverlay(o.key))}</div>
              </div>}
          </div>
      ))}
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
      <span class="pill" style={{ left: `calc(${idx} * 20% + 10% - 29px)` }} />
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

const drawerSections: [string, [string, string, Tab | Route['name']][]][] = [
  ['', [['Home', 'home', 'home'], ['Money', 'wallet', 'money'], ['Projects', 'project', 'projects'], ['Notes', 'note', 'notes'], ['Calendar', 'calendar', 'calendar']]],
  ['More', [['Time tracker', 'timer', 'time'], ['Customers', 'users', 'customers'], ['Debts', 'debt', 'debts'], ['Savings', 'goal', 'goals'], ['Invitations', 'inbox', 'invites']]],
  ['Account', [['Profile', 'user', 'profile'], ['Settings', 'settings', 'settings']]],
]

function Drawer() {
  const s = useApp()
  const nav = getNav()
  const u = s.user!
  const current = nav.stack.length ? nav.stack[nav.stack.length - 1].name : nav.tab
  const go = (r: string) => {
    setDrawer(false)
    if (['home', 'money', 'projects', 'notes'].includes(r)) goTab(r as Tab)
    else { goTab(nav.tab); push({ name: r } as Route) }
  }
  return (
    <>
      <div class="scrim" onClick={() => setDrawer(false)} />
      <aside class="drawer">
        <div class="row" style={{ padding: '0 6px 14px' }}>
          <Logo size={42} />
          <div><div class="h-md">Carrot Note</div><div class="tiny muted">Freelancer workspace</div></div>
        </div>
        <button class="hero press row" style={{ padding: 14, borderRadius: 24, flexDirection: 'row', textAlign: 'left' }} onClick={() => go('profile')}>
          <Avatar userId={u.id} rev={u.avatarRev} name={u.name || u.username} size={46} />
          <div class="grow"><div class="h-sm ellipsis">{u.name || '@' + u.username}</div><div class="small" style={{ opacity: .85 }}>@{u.username}</div></div>
          <Icon name="right" size={13} />
        </button>
        {drawerSections.map(([title, rows]) => (
          <div key={title}>
            {title ? <div class="label">{title}</div> : <div style={{ height: 12 }} />}
            {rows.filter(([, , r]) => r !== 'invites' || s.invites > 0).map(([label, icon, r]) => (
              <button key={r} class={'drawer-row' + (current === r ? ' on' : '')} style={{ width: '100%' }} onClick={() => go(r)}>
                <span class="box"><Icon name={icon} size={15} /></span>
                <span class="grow" style={{ textAlign: 'left' }}>{label}</span>
                {r === 'invites' && <span class="badge" style={{ position: 'static' }}>{s.invites}</span>}
              </button>
            ))}
          </div>
        ))}
        <div style={{ flex: 1, minHeight: 16 }} />
        {s.lock.pinEnabled && <button class="drawer-row" onClick={() => { setDrawer(false); call('lock.now') }}><span class="box"><Icon name="lock" size={15} /></span>Lock</button>}
        <button class="drawer-row" onClick={() => { setDrawer(false); signOut() }}><span class="box"><Icon name="signOut" size={15} /></span>Sign out</button>
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
      <div class="scrim" style={{ zIndex: 50 }} onClick={() => !busy && call('update.later')} />
      <div class="dialog-wrap" style={{ zIndex: 51 }}>
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

render(<App />, document.getElementById('app')!)
ready()
