// Profile and Settings.

import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { duration, Categories, type GithubProfile } from '../types'
import { useApp, setLanguage } from '../store'
import { Avatar, Btn, Card, Chips, Field, FieldLabel, Hint, PageHeader, Round, SelectField, SheetTitle, SwitchRow, Tile, attempt, confirm, openDialog, openSheet, toast } from '../ui'
import { PinSetup } from './auth'
import { dateLocale } from '../i18n'

const cleanUsername = (s: string) => s.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)
const usernameRule = /^[a-z0-9_.]{3,20}$/

// ---------------------------------------------------------------- profile

export function ProfileScreen() {
  const s = useApp()
  const u = s.user
  const [gh, setGh] = useState<GithubProfile | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setGh(null)
    if (u?.github) call<GithubProfile | null>('github.profile', { login: u.github }).then(setGh).catch(() => {})
  }, [u?.github])
  if (!u) return null
  const tracked = s.data.time.reduce((a, t) => a + duration(t), 0)
  const stats: [string, string, string][] = [
    ['Projects', String(s.data.project.length), 'butter'],
    ['Done', String(s.data.project.filter(p => p.status === 'done').length), 'mint'],
    ['Hours', F.hours(tracked).toFixed(0), 'sky'],
    ['Notes', String(s.data.note.length), 'lilac'],
  ]
  const photo = async (action: () => Promise<unknown>) => {
    setBusy(true)
    await attempt(action)
    setBusy(false)
  }
  const photoSheet = () => openSheet(close => (
    <>
      <SheetTitle title="Profile photo" />
      <div class="body">
        <Btn block icon="image" onClick={() => { close(); photo(() => call('profile.pickPhoto')) }}>Choose from gallery</Btn>
        {u.github && <Btn block kind="soft" icon="github" onClick={() => { close(); photo(() => call('profile.githubPhoto', { login: u.github })) }}>Use my GitHub photo</Btn>}
        {u.avatarRev > 0 && <Btn block kind="soft" icon="trash" onClick={() => { close(); photo(() => call('profile.deletePhoto')) }}>Remove photo</Btn>}
      </div>
    </>
  ))
  return (
    <div class="scroll">
      <PageHeader title="Profile" onBack={popNav}><Round icon="settings" label="Settings" onClick={() => push({ name: 'settings' })} /></PageHeader>
      <div class="content no-tabbar">
        <div class="card pop" style={{ '--i': 1, padding: 0, overflow: 'hidden', textAlign: 'center' } as any}>
          <div class="cover" />
          <div style={{ marginTop: -58, display: 'flex', justifyContent: 'center' }}>
            <button class="press" style={{ position: 'relative' }} onClick={photoSheet}>
              <Avatar userId={u.id} rev={u.avatarRev} name={u.name || u.username} size={112} class="ring-card" />
              <span class="round sm" style={{ position: 'absolute', right: 2, bottom: 2, background: 'var(--accent)', color: '#fff', width: 34, height: 34 }}>
                {busy ? <span class="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icon name="camera" size={14} />}
              </span>
            </button>
          </div>
          <div style={{ padding: '10px 18px 18px' }}>
            <div class="h-xl">{u.name || '@' + u.username}</div>
            <div class="accent semibold">@{u.username}</div>
            {u.bio && <p style={{ margin: '8px auto 0', maxWidth: '32ch', whiteSpace: 'pre-wrap' }}>{u.bio}</p>}
            <div class="row" style={{ marginTop: 14 }}>
              <Btn class="grow" icon="pen" onClick={() => editProfile()}>Edit profile</Btn>
              <Btn class="grow" kind="soft-bg" icon="share" onClick={() => call('app.share', {
                subject: 'Carrot Note', text: `Find me on Carrot Note. My username is @${u.username}.\n\nGet the app: https://github.com/DG-925/carrot-note/releases/latest`,
              })}>Share</Btn>
            </div>
          </div>
        </div>
        <div class="grid2 pop" style={{ '--i': 2, gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } as any}>
          {stats.map(([l, v, c]) => <Tile key={l} color={c as any} style={{ alignItems: 'center', padding: '14px 4px' }}><div class="h-md num" style={{ fontWeight: 800 }}>{v}</div><div class="tiny semibold">{l}</div></Tile>)}
        </div>
        <Card i={3}>
          <div class="row"><Icon name="github" size={22} /><h3 class="h-md grow">GitHub</h3>
            <Btn sm kind="soft-bg" onClick={() => linkGithub(u.github)}>{u.github ? 'Change' : 'Link'}</Btn></div>
          {!u.github && <Hint>Link your GitHub account to show your public profile and use your GitHub photo.</Hint>}
          {u.github && (
            <div class="row" style={{ marginTop: 12 }}>
              {gh?.avatarUrl ? <img src={gh.avatarUrl} style={{ width: 48, height: 48, borderRadius: '50%' }} /> : <div class="avatar" style={{ width: 48, height: 48 }}><Icon name="github" size={20} /></div>}
              <div class="grow">
                <div class="semibold">{gh?.name || u.github}</div>
                <div class="small muted">github.com/{u.github}</div>
                {gh && <div class="tiny muted">{gh.publicRepos} repositories · {gh.followers} followers</div>}
              </div>
              <Round icon="open" sm onBg label="Open" onClick={() => call('app.openUrl', { url: `https://github.com/${u.github}` })} />
            </div>
          )}
          {gh?.bio && <p class="small muted" style={{ margin: '10px 0 0' }}>{gh.bio}</p>}
        </Card>
        <Card i={4}>
          <div class="eyebrow muted">Account</div>
          <div class="semibold" style={{ marginTop: 4 }}>{u.email}</div>
        </Card>
      </div>
    </div>
  )
}

function editProfile() {
  openSheet(close => <EditProfile close={close} />)
}

function EditProfile({ close }: { close: () => void }) {
  const s = useApp()
  const u = s.user!
  const [name, setName] = useState(u.name)
  const [username, setUsername] = useState(u.username)
  const [bio, setBio] = useState(u.bio)
  const [check, setCheck] = useState<boolean | null>(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (username === u.username) { setCheck(true); return }
    setCheck(null)
    if (!usernameRule.test(username)) return
    const t = setTimeout(() => call<{ available: boolean }>('auth.usernameAvailable', { username }).then(r => setCheck(r.available)).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [username])
  return (
    <>
      <SheetTitle title="Edit profile" />
      <div class="body">
        <Field label="Name" value={name} icon="user" onInput={setName} />
        <Field label="Username" value={username} icon="userPlus" prefix="@" onInput={v => setUsername(cleanUsername(v))}
          hint={!usernameRule.test(username) ? '3–20 letters, numbers, _ or .' : check == null ? 'Checking…' : check ? (username === u.username ? 'Your username' : `✓ @${username} is available`) : 'That username is taken'}
          hintTone={check === true && username !== u.username ? 'good' : check === false ? 'bad' : undefined} />
        <Field label="Bio" value={bio} multiline maxLength={280} hint={`${bio.length}/280`} onInput={setBio} />
        <Btn block busy={busy} disabled={!check || !usernameRule.test(username)} onClick={async () => {
          setBusy(true)
          const ok = await attempt(() => call('profile.update', { name: name.trim(), username, bio: bio.trim() }))
          setBusy(false)
          if (ok) close()
        }}>Save</Btn>
      </div>
    </>
  )
}

export function linkGithub(current: string) {
  openSheet(close => <LinkGithub current={current} close={close} />)
}

function LinkGithub({ current, close }: { current: string; close: () => void }) {
  const [login, setLogin] = useState(current)
  const [found, setFound] = useState<GithubProfile | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setFound(undefined)
    const name = login.trim().replace(/^@/, '').replace(/.*github\.com\//, '').replace(/\/+$/, '')
    if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) return
    const t = setTimeout(() => call<GithubProfile | null>('github.profile', { login: name }).then(setFound).catch(() => setFound(null)), 500)
    return () => clearTimeout(t)
  }, [login])
  return (
    <>
      <SheetTitle title="Link GitHub" sub="Your public GitHub profile shows on your Carrot Note profile." />
      <div class="body">
        <Field label="GitHub username" value={login} icon="github" onInput={setLogin} />
        {found === null && <Hint>No GitHub user with that name.</Hint>}
        {found && <div class="card in-card row">
          <img src={found.avatarUrl} style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div class="grow"><div class="semibold">{found.name || found.login}</div><div class="small muted">{found.publicRepos} repositories · {found.followers} followers</div></div>
          <Icon name="checkCircle" size={18} class="good" />
        </div>}
        <Btn block busy={busy} disabled={!found} onClick={async () => {
          setBusy(true)
          const ok = await attempt(() => call('profile.update', { github: found!.login }))
          setBusy(false)
          if (ok) close()
        }}>Link {found ? '@' + found.login : 'account'}</Btn>
        {current && <Btn block kind="ghost" onClick={async () => { if (await attempt(() => call('profile.update', { github: '' }))) close() }}>Unlink GitHub</Btn>}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- settings

export function SettingsScreen() {
  const s = useApp()
  const [notif, setNotif] = useState(true)
  const [checking, setChecking] = useState(false)
  useEffect(() => { call<boolean>('notifications.granted').then(setNotif).catch(() => {}) }, [])
  const set = (patch: Record<string, unknown>) => attempt(() => call('settings.set', patch))
  const lock = s.lock
  const sync = s.sync
  return (
    <div class="scroll">
      <PageHeader title="Settings" onBack={popNav} />
      <div class="content no-tabbar">
        <Card i={1}>
          <div class="row">
            <Avatar userId={s.user?.id} rev={s.user?.avatarRev ?? 0} name={s.user?.name || s.user?.username || '?'} size={48} />
            <div class="grow"><div class="h-sm">{s.user?.name || 'Carrot Note user'}</div><div class="small muted ellipsis">{s.user?.email}</div></div>
          </div>
          <div class="small" style={{ marginTop: 10, color: sync.error ? 'var(--bad)' : 'var(--muted)' }}>
            {sync.syncing ? 'Syncing…' : sync.error ? `Sync problem: ${sync.error}` : sync.lastSync > 0 ? `Last synced ${new Date(sync.lastSync).toLocaleString(dateLocale())}` : 'Not synced yet'}
          </div>
          {sync.lastSync > 0 && (sync.apiVersion ?? 0) < 3 && <div class="small warn" style={{ marginTop: 4 }}>Your server is an older version, so rentals and invoices in shared projects aren't shared yet.</div>}
          <div class="row" style={{ marginTop: 12 }}>
            <Btn sm icon="sync" busy={sync.syncing} onClick={() => attempt(() => call('sync.now'))}>Sync now</Btn>
            <Btn sm kind="soft-bg" icon="lock" onClick={changePassword}>Password</Btn>
          </div>
        </Card>

        {document.documentElement.classList.contains('desktop') && <ZoomCard />}

        <Card i={2}>
          <h3 class="h-md" style={{ marginBottom: 10 }}>Preferences</h3>
          <div class="col">
            <SelectField label="Main currency" value={s.settings.currency} onChange={v => set({ currency: v })}
              options={(Categories.currencies.includes(s.settings.currency) ? Categories.currencies : [s.settings.currency, ...Categories.currencies]).map(c => ({ value: c, label: c }))} />
            <FieldLabel>Language</FieldLabel>
            <div class="chips" data-notr>
              <button class={'chip' + (s.prefs.lang === 'en' ? ' on' : '')} onClick={() => setLanguage('en')}>English</button>
              <button class={'chip' + (s.prefs.lang === 'ar' ? ' on' : '')} onClick={() => setLanguage('ar')}>العربية</button>
            </div>
            <FieldLabel>Theme</FieldLabel>
            <Chips wrap options={['1', '2', '0']} value={String(s.settings.theme)} onChange={v => set({ theme: Number(v) })}
              label={v => ({ '0': 'System', '1': 'Light', '2': 'Dark' } as any)[v]} icon={v => ({ '0': 'settings', '1': 'star', '2': 'moon' } as any)[v]} />
            {!notif && <Btn kind="soft-bg" icon="bell" onClick={async () => setNotif(!!(await attempt(() => call<boolean>('notifications.request'))))}>Allow notifications (reminders and updates)</Btn>}
            <Btn kind="soft-bg" icon="whatsapp" onClick={() => push({ name: 'messages' } as any)}>Message templates</Btn>
          </div>
        </Card>

        <Card i={3}>
          <h3 class="h-md" style={{ marginBottom: 4 }}>Security</h3>
          <SwitchRow title="PIN lock" sub="Ask for a PIN when opening the app" on={lock.pinEnabled}
            onChange={on => (on ? setPin() : attempt(() => call('lock.disable')))} />
          {lock.pinEnabled && <>
            <button class="link" onClick={setPin}>Change PIN</button>
            <SwitchRow title="Fingerprint / face unlock" disabled={!lock.biometricAvailable}
              sub={lock.biometricAvailable ? 'Unlock with biometrics instead of typing the PIN' : 'No fingerprint or face unlock set up on this phone'}
              on={lock.biometric} onChange={on => attempt(() => call('lock.setBiometric', { on }))} />
            <FieldLabel>Lock again after leaving the app</FieldLabel>
            <Chips wrap options={['0', '30', '60', '300']} value={String(lock.delay)} onChange={v => attempt(() => call('lock.setDelay', { seconds: Number(v) }))}
              label={v => ({ '0': 'Immediately', '30': '30 sec', '60': '1 min', '300': '5 min' } as any)[v]} />
            <button class="link" style={{ marginTop: 6 }} onClick={() => call('lock.now')}>Lock now</button>
          </>}
          <SwitchRow title="Hide in recent apps" sub="Blocks screenshots and hides content in the app switcher" on={lock.secureScreen} onChange={on => attempt(() => call('lock.setSecure', { on }))} />
        </Card>

        <Card i={4}>
          <h3 class="h-md">Your data</h3>
          <div class="muted small" style={{ margin: '2px 0 10px' }}>Everything is synced to your account. You can also keep your own copy.</div>
          <div class="row wrap">
            <Btn sm icon="backup" onClick={() => attempt(() => call('backup.export'))}>Full backup (JSON)</Btn>
            <Btn sm kind="soft-bg" icon="download" onClick={() => attempt(() => call('money.exportCsv'))}>Money (CSV)</Btn>
            <Btn sm kind="soft-bg" icon="sync" onClick={restoreBackup}>Restore backup</Btn>
          </div>
        </Card>

        <Card i={4}>
          <h3 class="h-md">Updates</h3>
          <div class="muted small" style={{ marginTop: 2 }}>Version {s.version}</div>
          <SwitchRow title="Check for updates automatically" sub="Get a notification when a new version is on GitHub" on={s.settings.autoUpdate} onChange={v => set({ autoUpdate: v })} />
          <Btn sm busy={checking} icon="download" onClick={async () => {
            setChecking(true)
            const r = await attempt(() => call<string | null>('update.check', { manual: true }))
            setChecking(false)
            if (r === null) toast('You have the latest version')
          }}>Check for updates</Btn>
        </Card>

        <div class="col pop" style={{ '--i': 5 } as any}>
          <Btn block kind="ink" icon="signOut" onClick={signOut}>Sign out</Btn>
          <Btn block kind="ghost" class="bad" onClick={deleteAccount}><span class="bad">Delete account</span></Btn>
        </div>
      </div>
    </div>
  )
}

async function restoreBackup() {
  if (!(await confirm('Restore a backup?', 'Pick a Carrot Note backup file. Everything in it is added back; items that still exist are replaced by the backup copy. Nothing else is deleted.', 'Choose file', false))) return
  const r = await attempt(() => call<Record<string, number> | null>('backup.import'))
  if (!r) return
  const total = Object.values(r).reduce((a, n) => a + n, 0)
  toast(total ? `Restored ${total} item${total === 1 ? '' : 's'}` : 'Nothing to restore in that file')
}

function setPin() {
  openDialog(close => <PinSetup close={close} />)
}

export async function signOut() {
  const unsynced = await call<boolean>('auth.hasUnsynced').catch(() => false)
  const ok = await confirm('Sign out?', unsynced
    ? 'Some changes have not synced yet. We will try to sync them first. Your data is removed from this phone after you sign out.'
    : 'Your data stays in your account and comes back when you sign in again.', 'Sign out')
  if (ok) attempt(() => call('auth.signOut'))
}

function changePassword() {
  openDialog(close => <PasswordDialog close={close} />)
}

function PasswordDialog({ close }: { close: () => void }) {
  const [old, setOld] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <h3>Change password</h3>
      <Field label="Current password" type="password" value={old} onInput={setOld} />
      <Field label="New password (8+ characters)" type="password" value={next} onInput={setNext} />
      <div class="actions">
        <Btn kind="ghost" onClick={close}>Cancel</Btn>
        <Btn busy={busy} disabled={!old || next.length < 8} onClick={async () => {
          setBusy(true)
          const ok = await attempt(() => call('auth.changePassword', { old, new: next }))
          setBusy(false)
          if (ok) { toast('Password changed'); close() }
        }}>Change</Btn>
      </div>
    </>
  )
}

function deleteAccount() {
  openDialog(close => <DeleteDialog close={close} />)
}

function DeleteDialog({ close }: { close: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <h3>Delete account?</h3>
      <p class="muted" style={{ margin: 0 }}>This permanently deletes your account and all your data from the cloud and this phone.</p>
      <Field label="Password" type="password" value={password} onInput={setPassword} />
      <div class="actions">
        <Btn kind="ghost" onClick={close}>Cancel</Btn>
        <Btn kind="danger" busy={busy} disabled={!password} onClick={async () => {
          setBusy(true)
          const ok = await attempt(() => call('auth.deleteAccount', { password }))
          setBusy(false)
          if (ok) close()
        }}>Delete forever</Btn>
      </div>
    </>
  )
}

/** PC only: how big everything is drawn. Auto scales up on very large screens. */
function ZoomCard() {
  const [z, setZ] = useState<{ setting: string; auto?: number } | null>(null)
  useEffect(() => { call<{ setting: string; auto: number }>('ui.zoom').then(setZ).catch(() => {}) }, [])
  if (!z) return null
  const pick = (v: string) => attempt(async () => { await call('ui.zoom', { value: v }); setZ({ ...z, setting: v }) })
  return (
    <Card i={2}>
      <h3 class="h-md" style={{ marginBottom: 4 }}>Interface size</h3>
      <div class="small muted" style={{ marginBottom: 10 }}>Make everything bigger on large screens. Ctrl + and Ctrl − also work.</div>
      <Chips wrap options={['auto', '1', '1.25', '1.5', '1.75', '2']} value={z.setting} onChange={pick}
        label={v => (v === 'auto' ? `Auto (${Math.round((z.auto ?? 1) * 100)}%)` : `${Math.round(Number(v) * 100)}%`)} />
    </Card>
  )
}
