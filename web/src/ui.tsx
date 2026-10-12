// Shared building blocks for every screen.

import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { call } from './bridge'
import * as F from './format'
import { Icon } from './icons'
import { closeOverlay, getNav, openOverlay, push, setDrawer } from './nav'
import { useApp } from './store'
import { Categories } from './types'

type Kids = { children?: ComponentChildren }
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** Delay index for the staggered pop-in. */
export const pop = (i: number) => ({ class: 'pop', style: { '--i': i } as any })

// ---------------------------------------------------------------- surfaces

export function Card({ children, onClick, class: c, i }: Kids & { onClick?: () => void; class?: string; i?: number }) {
  return (
    <div class={cx('card in-card', onClick && 'press', i != null && 'pop', c)} style={i != null ? ({ '--i': i } as any) : undefined} onClick={onClick}>
      {children}
    </div>
  )
}

export type TileColor = 'orange' | 'mint' | 'butter' | 'lilac' | 'sky' | 'rose'
export function Tile({ color, children, onClick, class: c, i, style }: Kids & { color: TileColor; onClick?: () => void; class?: string; i?: number; style?: any }) {
  return (
    <div class={cx('tile in-card', `t-${color}`, onClick && 'press', i != null && 'pop', c)} style={{ ...(i != null ? { '--i': i } : {}), ...style }} onClick={onClick}>
      {children}
    </div>
  )
}

export function Hero({ children, onClick, i }: Kids & { onClick?: () => void; i?: number }) {
  return (
    <div class={cx('hero', onClick && 'press', i != null && 'pop')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={onClick}>
      {children}
    </div>
  )
}

export const Eyebrow = ({ children }: Kids) => <div class="eyebrow">{children}</div>

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div class="section-h">
      <h3>{title}</h3>
      {action && <button class="link" onClick={onAction}>{action}</button>}
    </div>
  )
}

// ---------------------------------------------------------------- buttons

export function Btn(p: Kids & { onClick?: () => void; kind?: string; icon?: string; disabled?: boolean; block?: boolean; sm?: boolean; class?: string; busy?: boolean }) {
  return (
    <button class={cx('btn', p.kind, p.block && 'block', p.sm && 'sm', p.class)} disabled={p.disabled || p.busy} onClick={e => { e.stopPropagation(); p.onClick?.() }}>
      {p.busy ? <span class="spinner" /> : p.icon && <Icon name={p.icon} size={p.sm ? 13 : 15} />}
      {p.children}
    </button>
  )
}

export function Round({ icon, onClick, label, sm, onBg, badge, class: c, style }: { icon: string; onClick?: () => void; label?: string; sm?: boolean; onBg?: boolean; badge?: number; class?: string; style?: any }) {
  return (
    <button class={cx('round', sm && 'sm', onBg && 'on-bg', c)} style={style} aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }}>
      <Icon name={icon} size={sm ? 15 : 17} />
      {!!badge && <span class="badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}

export function Chips<T extends string>({ options, value, onChange, label, icon, wrap }: {
  options: T[]; value: T; onChange: (v: T) => void; label?: (v: T) => string; icon?: (v: T) => string; wrap?: boolean
}) {
  return (
    <div class={cx('chips', wrap && 'wrap')}>
      {options.map(o => (
        <button key={o} class={cx('chip', o === value && 'on')} onClick={() => onChange(o)}>
          {icon && <Icon name={icon(o)} size={13} />}
          {label ? label(o) : o}
        </button>
      ))}
    </div>
  )
}

/** Segmented control; the dark knob springs to the selected option. */
export function Seg({ options, value, onChange, i }: { options: { label: string; icon?: string }[]; value: number; onChange: (i: number) => void; i?: number }) {
  return (
    <div class={cx('seg', i != null && 'pop')} style={i != null ? ({ '--i': i } as any) : undefined}>
      <span class="knob" style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${value * 100}%)` }} />
      {options.map((o, idx) => (
        <button key={o.label} class={idx === value ? 'on' : ''} onClick={() => onChange(idx)}>
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatusChip({ status }: { status: string }) {
  const icon = status === 'done' ? 'checkCircle' : status === 'active' ? 'play' : status === 'cancelled' ? 'close' : 'clock'
  return <span class={`status st-${status}`}><Icon name={icon} size={10} stroke={2.6} />{({ active: 'Active', on_hold: 'On hold', done: 'Done', cancelled: 'Cancelled' } as any)[status] ?? status}</span>
}

// ---------------------------------------------------------------- progress

/** Grows from zero on first show, then follows [value]. */
function useGrow(value: number) {
  const [v, setV] = useState(0)
  useEffect(() => { const t = requestAnimationFrame(() => setV(value)); return () => cancelAnimationFrame(t) }, [value])
  return v
}

export function Bar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const v = useGrow(Math.max(0, Math.min(1, value)))
  return <div class="bar" style={{ height }}><i style={{ width: `${v * 100}%`, background: color }} /></div>
}

export function Ring({ value, size = 44, stroke = 4.5, color = 'var(--accent)', track, children }: Kids & { value: number; size?: number; stroke?: number; color?: string; track?: string }) {
  const v = useGrow(Math.max(0, Math.min(1, value)))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div class="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle class="tr" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} style={track ? { stroke: track } : undefined} />
        <circle class="fg" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} stroke={color}
          stroke-dasharray={c} stroke-dashoffset={c * (1 - v)} style={{ opacity: v > 0 ? 1 : 0 }} />
      </svg>
      {children && <span class="lbl">{children}</span>}
    </div>
  )
}

/** Smooth line through [values] that draws itself. */
export function Spark({ values, height = 44, color = '#fff' }: { values: number[]; height?: number; color?: string }) {
  if (values.length < 2) return null
  const w = 300, pad = 4
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [pad + (i * (w - pad * 2)) / (values.length - 1), height - pad - ((v - min) / span) * (height - pad * 2)])
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cxp = (x0 + x1) / 2
    d += ` C${cxp},${y0} ${cxp},${y1} ${x1},${y1}`
  }
  const last = pts[pts.length - 1]
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, overflow: 'visible' }}>
      <path d={d} pathLength={1} fill="none" stroke={color} stroke-width={3} stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={4} fill={color} style={{ animation: 'fadeIn .3s 1.4s both' }} />
    </svg>
  )
}

/** Animated number that counts up when it first appears. */
export function useCountUp(value: number, ms = 1100) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 4)
      const v = a + (b - a) * e
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return shown
}

export function CountMoney({ totals, currency, sign, class: c }: { totals: Record<string, number>; currency: string; sign?: boolean; class?: string }) {
  const entries = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.0001)
  const single = entries.length <= 1
  const [cur, val] = single ? (entries[0] ?? [currency, 0]) : [currency, 0]
  const v = useCountUp(single ? val : 0)
  if (!single) return <div class={c}>{F.totals(totals, currency)}</div>
  const shown = Number.isInteger(val) ? Math.round(v) : v
  return <div class={cx('num', c)}>{(sign && val > 0 ? '+' : '') + F.money(shown, cur)}</div>
}

export function CountInt({ value, class: c }: { value: number; class?: string }) {
  const v = useCountUp(value, 800)
  return <div class={c}>{Math.round(v)}</div>
}

/** Ticks every second while [active]. */
export function useNow(active = true) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

// ---------------------------------------------------------------- avatar

const avatarCache = new Map<string, string | null>()

export function Avatar({ userId, rev = 0, name, size = 42, class: c }: { userId?: string | null; rev?: number; name: string; size?: number; class?: string }) {
  const key = userId && rev > 0 ? `${userId}:${rev}` : ''
  const [src, setSrc] = useState<string | null>(key ? avatarCache.get(key) ?? null : null)
  useEffect(() => {
    if (!key) { setSrc(null); return }
    if (avatarCache.has(key)) { setSrc(avatarCache.get(key)!); return }
    let live = true
    call<string | null>('avatar', { userId, rev }).then(v => { avatarCache.set(key, v); if (live) setSrc(v) }).catch(() => {})
    return () => { live = false }
  }, [key])
  return (
    <div class={cx('avatar', c)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {src ? <img src={src} alt="" /> : F.initials(name)}
    </div>
  )
}

export function AvatarStack({ people, size = 26, max = 3 }: { people: { id: string; avatarRev: number; name: string; username: string }[]; size?: number; max?: number }) {
  return (
    <div class="stack">
      {people.slice(0, max).map(p => <Avatar key={p.id} userId={p.id} rev={p.avatarRev} name={p.name || p.username} size={size} class="ring-card" />)}
      {people.length > max && <div class="avatar ring-card" style={{ width: size, height: size, fontSize: 10, background: 'var(--track)', color: 'var(--fg)' }}>+{people.length - max}</div>}
    </div>
  )
}

/** The Carrot Note mark: an orange fingerprint on white (same drawing as the launcher icon). */
export function Logo({ size = 56, popIn }: { size?: number; popIn?: boolean }) {
  return (
    <div class={cx('logo', popIn && 'logo-pop')} style={{ width: size, height: size }}>
      <svg viewBox="-3.5 -3.6 31 31" width={size} height={size} aria-hidden="true">
        <g fill="none" stroke="#FF6B1F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12,11.2 V14.6 Q12,18.2 10.7,21" />
          <path d="M9.6,16.6 V11.4 A2.4,2.4 0 0 1 14.4,11.4 V13.4" />
          <path d="M14.4,16.2 Q14.3,18.9 13.3,21.4" />
          <path d="M7.2,14.2 V11.4 A4.8,4.8 0 0 1 16.8,11.4 V15.4 Q16.8,17.8 16,19.8" />
          <path d="M7.2,17.2 Q7.3,18.7 7.9,20" />
          <path d="M4.8,16 V11.4 A7.2,7.2 0 0 1 17.6,6.8" />
          <path d="M18.9,9 Q19.2,10.1 19.2,11.4 V13.2" />
          <path d="M19.2,16 V17" />
          <path d="M2.6,13 V11.4 A9.6,9.6 0 0 1 6.2,3.9" />
          <path d="M8.6,2.5 A9.6,9.6 0 0 1 21.4,9.8" />
        </g>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- states

export function Empty({ icon, title, text, children }: Kids & { icon: string; title: string; text: string }) {
  return (
    <div class="empty pop" style={{ '--i': 2 } as any}>
      <div class="blob"><Icon name={icon} size={32} /></div>
      <h3 class="h-md">{title}</h3>
      <p>{text}</p>
      {children && <div class="row" style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}

export const Hint = ({ children }: Kids) => <p class="muted" style={{ margin: '6px 4px', fontSize: 14 }}>{children}</p>

// ---------------------------------------------------------------- inputs

type FieldProps = {
  label: string; value: string; onInput: (v: string) => void; type?: string; placeholder?: string; hint?: string
  hintTone?: 'good' | 'bad'; multiline?: boolean; inputMode?: string; prefix?: string; trail?: ComponentChildren
  autoFocus?: boolean; icon?: string; maxLength?: number
}
export function Field(p: FieldProps) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => { if (p.autoFocus) setTimeout(() => ref.current?.focus(), 350) }, [])
  const input = p.multiline
    ? <textarea ref={ref} value={p.value} placeholder={p.placeholder} maxLength={p.maxLength} onInput={e => p.onInput((e.target as HTMLTextAreaElement).value)} rows={3} />
    : <input ref={ref} value={p.value} type={p.type ?? 'text'} placeholder={p.placeholder} inputMode={p.inputMode as any} maxLength={p.maxLength}
        autoComplete="off" autoCapitalize={p.type === 'email' || p.prefix ? 'off' : 'sentences'}
        onInput={e => p.onInput((e.target as HTMLInputElement).value)} />
  const body = (
    <>
      <label>{p.label}</label>
      <div class="row" style={{ gap: 2 }}>{p.prefix && <span class="muted">{p.prefix}</span>}{input}</div>
      {p.hint && <div class={cx('hint', p.hintTone)}>{p.hint}</div>}
    </>
  )
  return (
    <div class={cx('field', p.icon && 'with-icon')} onClick={() => ref.current?.focus()}>
      {p.icon ? <><Icon name={p.icon} size={17} /><div class="inner">{body}</div></> : body}
      {p.trail && <div class="trail">{p.trail}</div>}
    </div>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="field">
      <label>{label}</label>
      <select value={value} onChange={e => onChange((e.target as HTMLSelectElement).value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div class="trail" style={{ color: 'var(--muted)' }}><Icon name="down" size={14} /></div>
    </div>
  )
}

export function DateField({ label, value, onChange, clearable = true }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; clearable?: boolean }) {
  return (
    <div class="field with-icon">
      <Icon name="calendar" size={17} />
      <div class="inner">
        <label>{label}</label>
        <input type="date" value={value != null ? F.isoDate(value) : ''} onChange={e => {
          const v = (e.target as HTMLInputElement).value
          onChange(v ? F.fromIso(v) : clearable ? null : F.today())
        }} />
      </div>
      {clearable && value != null && <Round icon="close" sm onBg onClick={() => onChange(null)} label="Clear" />}
    </div>
  )
}

export function TimeField({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <div class="field with-icon">
      <Icon name="clock" size={17} />
      <div class="inner">
        <label>{label}</label>
        <input type="time" value={value != null ? F.timeInput(value) : ''} onChange={e => {
          const v = (e.target as HTMLInputElement).value
          onChange(v ? F.fromTimeInput(v) : null)
        }} />
      </div>
      {value != null && <Round icon="close" sm onBg onClick={() => onChange(null)} label="Clear" />}
    </div>
  )
}

export function CurrencyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = Categories.currencies.includes(value) || !value ? Categories.currencies : [value, ...Categories.currencies]
  return <SelectField label="Currency" value={value} options={opts.map(c => ({ value: c, label: c }))} onChange={onChange} />
}

/** Big centered amount entry with a currency picker under it. Takes sums too: 120+35*2. */
export function AmountBox({ value, onInput, currency, onCurrency, color }: { value: string; onInput: (v: string) => void; currency: string; onCurrency: (c: string) => void; color: string }) {
  const sum = F.isExpression(value) ? F.parseAmount(value) : null
  return (
    <div class="amount-box in-card pop">
      <div class="eyebrow muted">Amount</div>
      <input value={value} inputMode="decimal" placeholder="0" style={{ color, fontSize: value.length > 9 ? 30 : undefined }}
        onInput={e => {
          const v = (e.target as HTMLInputElement).value
          if (/^[0-9.,+\-*/×÷() ]*$/.test(v) && v.length <= 40) onInput(v)
          else (e.target as HTMLInputElement).value = value
        }} />
      {F.isExpression(value) && <div class="calc-result">{sum != null ? <>= <b>{F.amount(sum)}</b></> : 'Keep typing…'}</div>}
      <div class="calc-keys">
        {['+', '−', '×', '÷'].map(k => (
          <button key={k} type="button" onClick={() => onInput(value + (k === '−' ? '-' : k === '×' ? '*' : k === '÷' ? '/' : k))}>{k}</button>
        ))}
        {sum != null && <button type="button" class="eq" onClick={() => onInput(F.amountText(sum))}>=</button>}
      </div>
      <div class="cur"><CurrencyField value={currency} onChange={onCurrency} /></div>
    </div>
  )
}

/** Search box with a clear button. */
export function SearchBar({ value, onInput, placeholder, i, autoFocus, inputRef }: { value: string; onInput: (v: string) => void; placeholder: string; i?: number; autoFocus?: boolean; inputRef?: any }) {
  const own = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? own
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 350) }, [])
  return (
    <div class={cx('search', i != null && 'pop')} style={i != null ? ({ '--i': i } as any) : undefined}>
      <Icon name="search" size={17} />
      <input ref={ref} placeholder={placeholder} value={value} onInput={e => onInput((e.target as HTMLInputElement).value)} />
      {value && <button class="muted" aria-label="Clear" onClick={() => { onInput(''); ref.current?.focus() }}><Icon name="close" size={14} /></button>}
    </div>
  )
}

/** Case-insensitive "does any of these contain the query" check used by every list search. */
export const matches = (q: string, ...fields: (string | number | null | undefined)[]) => {
  const t = q.trim().toLowerCase()
  return !t || fields.some(f => f != null && String(f).toLowerCase().includes(t))
}

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button class={cx('switch', on && 'on')} disabled={disabled} role="switch" aria-checked={on} onClick={e => { e.stopPropagation(); onChange(!on) }} />
}

export function SwitchRow({ title, sub, on, onChange, disabled }: { title: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div class="switch-row" onClick={() => !disabled && onChange(!on)}>
      <div class="main"><div class="t">{title}</div>{sub && <div class="s">{sub}</div>}</div>
      <Switch on={on} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export function MoreOptions({ startOpen, children }: Kids & { startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen)
  return (
    <>
      <button class={cx('more-btn', open && 'open')} onClick={() => setOpen(!open)}>
        {open ? 'Fewer options' : 'More options'} <Icon name="down" size={12} />
      </button>
      {open && <div class="reveal">{children}</div>}
    </>
  )
}

export const FieldLabel = ({ children }: Kids) => <div class="field-label">{children}</div>

// ---------------------------------------------------------------- headers

/** Header of the four main tabs: menu, small line over a big title, invitations and profile. */
export function MainHeader({ title, sub, big, children }: Kids & { title: string; sub?: string; big?: boolean }) {
  const s = useApp()
  const u = s.user
  return (
    <div class="topbar">
      <Round icon="menu" label="Menu" class="menu-btn" onClick={() => setDrawer(true)} />
      <div class="titles pop">
        {sub && <div class="sub ellipsis">{sub}</div>}
        <div class={cx('title', big && 'big')}>{title}</div>
      </div>
      {children}
      <Round icon="search" label="Search" onClick={() => push({ name: 'search' })} />
      {s.invites > 0 && <Round icon="bell" label="Invitations" badge={s.invites} onClick={() => push({ name: 'invites' })} />}
      <button class="press" onClick={() => push({ name: 'profile' })} aria-label="Profile">
        <Avatar userId={u?.id} rev={u?.avatarRev ?? 0} name={u?.name || u?.username || '?'} size={42} />
      </button>
    </div>
  )
}

/** Header of pushed screens: round back button and a big title. */
export function PageHeader({ title, children, onBack }: Kids & { title: string; onBack: () => void }) {
  return (
    <div class="topbar">
      <Round icon="back" label="Back" onClick={onBack} />
      <div class="titles pop"><div class="title ellipsis">{title}</div></div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- overlays

export function openSheet(render: (close: () => void) => ComponentChildren) {
  return openOverlay('sheet', render)
}
export function openForm(render: (close: () => void) => ComponentChildren) {
  return openOverlay('page', render)
}
export function openDialog(render: (close: () => void) => ComponentChildren) {
  return openOverlay('dialog', render)
}

export function SheetTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: '0 4px' }}>
      <h2 class="h-lg">{title}</h2>
      {sub && <p class="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{sub}</p>}
    </div>
  )
}

/** Full-screen form: close, title, optional delete, Save. */
export function Form({ title, close, onSave, saveEnabled = true, onDelete, actions, children, saveLabel = 'Save' }: Kids & {
  title: string; close: () => void; onSave: () => void | Promise<void>; saveEnabled?: boolean; onDelete?: () => void; actions?: ComponentChildren; saveLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div class="form-head">
        <Round icon="close" label="Close" onClick={close} />
        <div class="title">{title}</div>
        {actions}
        {onDelete && <Round icon="trash" label="Delete" style={{ color: 'var(--bad)' }} onClick={async () => { if (await confirm('Delete?', "This can't be undone.", 'Delete')) onDelete() }} />}
        <Btn disabled={!saveEnabled} busy={busy} onClick={async () => {
          setBusy(true)
          try { await onSave() } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
        }}>{saveLabel}</Btn>
      </div>
      <div class="form-body">{children}</div>
    </>
  )
}

export function confirm(title: string, text: string, ok = 'OK', danger = true): Promise<boolean> {
  return new Promise(resolve => {
    let done = false
    const finish = (v: boolean, close: () => void) => { if (!done) { done = true; resolve(v) }; close() }
    openDialog(close => (
      <>
        <h3>{title}</h3>
        <p class="muted" style={{ margin: 0 }}>{text}</p>
        <div class="actions">
          <Btn kind="ghost" onClick={() => finish(false, close)}>Cancel</Btn>
          <Btn kind={danger ? 'danger' : undefined} onClick={() => finish(true, close)}>{ok}</Btn>
        </div>
      </>
    ))
  })
}

// ---------------------------------------------------------------- toast

type ToastAction = { label: string; run: () => void }
type ToastMsg = { text: string; action?: ToastAction }
let toastSet: ((t: ToastMsg | null) => void) | null = null
export function toast(text: string, action?: ToastAction) {
  toastSet?.({ text, action })
}
export function ToastHost() {
  const [t, setT] = useState<ToastMsg | null>(null)
  const [key, setKey] = useState(0)
  useLayoutEffect(() => {
    toastSet = v => { setT(v); setKey(k => k + 1) }
    return () => { toastSet = null }
  }, [])
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => setT(null), t.action ? 4500 : 2400)
    return () => clearTimeout(id)
  }, [key])
  if (!t) return null
  return (
    <div key={key} class={cx('toast', t.action && 'with-action')}>
      <span>{t.text}</span>
      {t.action && <button onClick={() => { t.action!.run(); setT(null) }}>{t.action.label}</button>}
    </div>
  )
}

/** Runs an async native action and shows its error as a toast. */
export async function attempt<T>(f: () => Promise<T>): Promise<T | undefined> {
  try { return await f() } catch (e) { toast((e as Error).message); return undefined }
}

export const isTopOverlay = (key: number) => {
  const o = getNav().overlays.filter(x => !x.closing)
  return o.length > 0 && o[o.length - 1].key === key
}
export { closeOverlay }
export type { JSX }
