// Sign in / create account, choosing a username, the lock screen and PIN setup.

import { useEffect, useRef, useState } from 'preact/hooks'
import { call } from '../bridge'
import { Icon } from '../icons'
import { useApp } from '../store'
import { Btn, Field, Hero, Logo, Seg, attempt, toast } from '../ui'

const cleanUsername = (s: string) => s.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20)
const usernameRule = /^[a-z0-9_.]{3,20}$/

function strength(p: string) {
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
  return Math.max(1, Math.min(4, s))
}

function useUsernameCheck(username: string) {
  const [state, setState] = useState<{ name: string; ok: boolean | null; reason?: string | null }>({ name: '', ok: null })
  useEffect(() => {
    if (!usernameRule.test(username)) { setState({ name: username, ok: null }); return }
    const t = setTimeout(() => {
      call<{ available: boolean; reason: string | null }>('auth.usernameAvailable', { username })
        .then(r => setState({ name: username, ok: r.available, reason: r.reason })).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [username])
  return state.name === username ? state : { name: username, ok: null }
}

export function AuthScreen() {
  const [tab, setTab] = useState(0)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const check = useUsernameCheck(username)
  const register = tab === 1
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const match = !!confirmPw && confirmPw === password
  const can = !busy && (register ? !!name.trim() && check.ok === true && emailOk && password.length >= 8 && match : !!login.trim() && !!password)
  const level = strength(password)
  const colors = ['transparent', 'var(--bad)', 'var(--warn)', 'var(--accent)', 'var(--good)']

  const submit = async () => {
    if (!can) return
    setBusy(true); setError(null)
    try {
      if (register) await call('auth.register', { username, name: name.trim(), email: email.trim(), password })
      else await call('auth.login', { login: login.trim(), password })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const eye = <button class="muted" style={{ padding: 8 }} onClick={e => { e.stopPropagation(); setShow(!show) }}><Icon name={show ? 'eyeOff' : 'eye'} size={18} /></button>

  return (
    <div class="scroll">
      <div class="content" style={{ paddingTop: 'calc(var(--sat) + 16px)', paddingBottom: 'calc(var(--sab) + 30px)' }}>
        <Hero i={0}>
          <div class="row"><Logo size={56} popIn /><span class="grow" /><span class="hero-pill">for freelancers</span></div>
          <div class="h-display" style={{ marginTop: 18 }}>Carrot Note</div>
          <div style={{ opacity: .9, marginTop: 4, fontSize: 16 }}>Projects, money, notes and your team, in one place.</div>
        </Hero>
        <div class="grid2 pop" style={{ '--i': 1, gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 } as any}>
          {[['Projects', 'project', 'butter'], ['Money', 'wallet', 'mint'], ['Notes', 'note', 'lilac']].map(([l, i, c]) => (
            <div key={l} class={`tile t-${c} row`} style={{ justifyContent: 'center', padding: '12px 0', gap: 8, flexDirection: 'row' }}><Icon name={i} size={14} /><b style={{ fontSize: 13.5 }}>{l}</b></div>
          ))}
        </div>
        <Seg i={2} options={[{ label: 'Sign in', icon: 'lock' }, { label: 'Create account', icon: 'userPlus' }]} value={tab} onChange={t => { setTab(t); setError(null) }} />
        {register ? <>
          <Field label="Full name" icon="user" value={name} onInput={setName} />
          <Field label="Username" icon="userPlus" prefix="@" value={username} onInput={v => setUsername(cleanUsername(v))}
            hint={!username || !usernameRule.test(username) ? '3–20 letters, numbers, _ or .' : check.ok == null ? 'Checking…' : check.ok ? `✓ @${username} is available` : check.reason || 'That username is taken'}
            hintTone={check.ok === true ? 'good' : check.ok === false ? 'bad' : undefined} />
          <Field label="Email" icon="mail" type="email" inputMode="email" value={email} onInput={setEmail} />
        </> : <Field label="Email or username" icon="user" type="email" inputMode="email" value={login} onInput={setLogin} />}
        <Field label="Password" icon="lock" type={show ? 'text' : 'password'} value={password} onInput={setPassword} trail={eye} />
        {register && <>
          <div class="strength" style={{ padding: '0 6px' }}>
            {[1, 2, 3, 4].map(i => <i key={i} style={{ background: i <= level ? colors[level] : undefined }} />)}
            <span class="tiny semibold" style={{ width: 52, textAlign: 'right', color: colors[level] }}>{['', 'Weak', 'Okay', 'Good', 'Strong'][level]}</span>
          </div>
          <Field label="Type the password again" icon="lock" type={show ? 'text' : 'password'} value={confirmPw} onInput={setConfirmPw}
            hint={!confirmPw ? undefined : match ? '✓ Passwords match' : "Passwords don't match"} hintTone={!confirmPw ? undefined : match ? 'good' : 'bad'} />
        </>}
        {error && <div class="error-box pop"><Icon name="warning" size={16} />{error}</div>}
        <Btn block busy={busy} disabled={!can} onClick={submit}>{register ? 'Create my account' : 'Sign in'}</Btn>
        <Btn kind="ghost" onClick={() => { setTab(1 - tab); setError(null) }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</Btn>
        <p class="small muted center" style={{ margin: 0 }}>Your data is saved on this phone and synced to your account.</p>
      </div>
    </div>
  )
}

export function ChooseUsername() {
  const s = useApp()
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const check = useUsernameCheck(username)
  return (
    <div class="lock" style={{ gap: 14 }}>
      <div style={{ height: 30 }} />
      <Logo size={76} popIn />
      <h1 class="h-xl center">Pick a username</h1>
      <p class="muted center" style={{ margin: 0 }}>People use it to find you and invite you to projects{s.user?.name ? `, ${s.user.name}` : ''}.</p>
      <div style={{ width: '100%' }}>
        <Field label="Username" icon="userPlus" prefix="@" value={username} onInput={v => setUsername(cleanUsername(v))}
          hint={!usernameRule.test(username) ? '3–20 letters, numbers, _ or .' : check.ok == null ? 'Checking…' : check.ok ? '✓ Available' : 'That username is taken'}
          hintTone={check.ok === true ? 'good' : check.ok === false ? 'bad' : undefined} />
      </div>
      <Btn block busy={busy} disabled={check.ok !== true} onClick={async () => {
        setBusy(true)
        await attempt(() => call('profile.update', { username }))
        setBusy(false)
      }}>Continue</Btn>
      <Btn kind="ghost" onClick={() => call('auth.signOut')}>Sign out</Btn>
    </div>
  )
}

// ---------------------------------------------------------------- PIN

export function PinDots({ count, total, error, shakeKey }: { count: number; total: number; error?: boolean; shakeKey?: number }) {
  return (
    <div key={shakeKey} class={'pin-dots' + (error ? ' error shake' : '')}>
      {Array.from({ length: total }, (_, i) => <i key={i} class={i < count ? 'on' : ''} />)}
    </div>
  )
}

export function PinPad({ onDigit, onBack, onBio }: { onDigit: (d: string) => void; onBack: () => void; onBio?: () => void }) {
  return (
    <div class="pad">
      {'123456789'.split('').map(d => <button key={d} class="key" onClick={() => onDigit(d)}>{d}</button>)}
      {onBio ? <button class="key accent" aria-label="Use fingerprint" onClick={onBio}><Icon name="fingerprint" size={26} /></button> : <span />}
      <button class="key" onClick={() => onDigit('0')}>0</button>
      <button class="key clear" aria-label="Delete" onClick={onBack}><Icon name="backspace" size={22} /></button>
    </div>
  )
}

export function LockScreen() {
  const s = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fails, setFails] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const bio = s.lock.biometric && s.lock.biometricAvailable
  const asked = useRef(false)
  const first = s.user?.name.trim().split(' ')[0]
  const total = s.lock.pinLength

  useEffect(() => {
    if (bio && !asked.current) { asked.current = true; call('lock.biometric', { unlock: true }).catch(() => {}) }
    call<number>('lock.cooldown').then(setCooldown).catch(() => {})
  }, [])
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => { const n = Math.max(0, c - 1000); if (!n) setError(null); return n }), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const verify = async (p: string) => {
    const r = await call<{ ok: boolean; cooldown: number }>('lock.verify', { pin: p })
    if (!r.ok) { setError('Wrong PIN'); setFails(f => f + 1); setCooldown(r.cooldown) }
    setPin('')
  }
  const digit = (d: string) => {
    if (cooldown > 0 || pin.length >= total) return
    const p = pin + d
    setPin(p); setError(null)
    if (p.length === total) setTimeout(() => verify(p), 120)
  }

  return (
    <div class="lock">
      <div style={{ flex: 1 }} />
      <Logo size={84} popIn />
      <h1 class="h-lg center" style={{ marginTop: 18 }}>{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>
      <p class="muted" style={{ margin: '4px 0 24px' }}>Enter your PIN to open Carrot Note</p>
      <PinDots count={pin.length} total={total} error={!!error} shakeKey={fails} />
      <p class="bad semibold center" style={{ minHeight: 22, margin: '14px 0 0' }}>
        {cooldown > 0 ? `Too many attempts. Try again in ${Math.ceil(cooldown / 1000)}s` : error ?? ''}
      </p>
      <div style={{ flex: 1 }} />
      <PinPad onDigit={digit} onBack={() => setPin(p => p.slice(0, -1))} onBio={bio ? () => call('lock.biometric', { unlock: true }) : undefined} />
    </div>
  )
}

/** Two steps: choose a PIN, then type it again. */
export function PinSetup({ close }: { close: () => void }) {
  const [first, setFirst] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fails, setFails] = useState(0)
  const next = async () => {
    if (first == null) { setFirst(pin); setPin(''); return }
    if (first === pin) {
      if (await attempt(() => call('lock.setPin', { pin }))) { toast('PIN set'); close() }
    } else {
      setError("PINs don't match. Try again."); setFails(f => f + 1); setFirst(null); setPin('')
    }
  }
  return (
    <>
      <h3>{first == null ? 'Choose a PIN' : 'Confirm your PIN'}</h3>
      <p class="muted small" style={{ margin: 0 }}>4 to 8 digits</p>
      <div class="col" style={{ alignItems: 'center' }}>
        <PinDots count={pin.length} total={Math.max(4, pin.length)} error={!!error} shakeKey={fails} />
        <p class="bad small semibold" style={{ minHeight: 18, margin: 0 }}>{error ?? ''}</p>
        <div style={{ transform: 'scale(.86)', margin: '-14px 0' }}>
          <PinPad onDigit={d => { if (pin.length < 8) { setPin(pin + d); setError(null) } }} onBack={() => setPin(pin.slice(0, -1))} />
        </div>
      </div>
      <div class="actions">
        <Btn kind="ghost" onClick={close}>Cancel</Btn>
        <Btn disabled={pin.length < 4} onClick={next}>{first == null ? 'Next' : 'Set PIN'}</Btn>
      </div>
    </>
  )
}
