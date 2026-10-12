// Password vault for client logins (VPS panels, hosting, registrars…).

import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import { Icon } from '../icons'
import { pop as popNav } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { newId, rentalKind, type Secret } from '../types'
import { Btn, Chips, Empty, Field, FieldLabel, Form, Hint, PageHeader, Round, SearchBar, SelectField, SheetTitle, attempt, confirm, matches, openForm, openSheet, toast } from '../ui'
import { createVault, decryptText, encryptText, exportKey, generatePassword, importKey, openVault, verifyKey, type VaultFields } from '../vault'

/** The key while the vault is open; cleared when leaving the vault or locking the app. */
let vaultKey: CryptoKey | null = null
export const lockVault = () => { vaultKey = null }

const kinds = [
  { value: 'login', label: 'Login', icon: 'user' },
  { value: 'server', label: 'Server', icon: 'server' },
  { value: 'hosting', label: 'Hosting', icon: 'cloud' },
  { value: 'domain', label: 'Domain', icon: 'globe' },
  { value: 'card', label: 'Card', icon: 'card' },
  { value: 'note', label: 'Secure note', icon: 'note' },
]
const kindOf = (k: string) => kinds.find(x => x.value === k) ?? kinds[0]

export function VaultScreen() {
  const s = useApp()
  const meta = s.data.vault.find(v => v.id === 'vault')
  const [open, setOpen] = useState(!!vaultKey)
  useEffect(() => () => { vaultKey = null }, [])
  useEffect(() => { if (s.locked) { vaultKey = null; setOpen(false) } }, [s.locked])
  if (!globalThis.crypto?.subtle) {
    return <div class="scroll"><PageHeader title="Vault" onBack={popNav} />
      <Empty icon="lock" title="Not available" text="This phone's web view can't encrypt data, so the vault can't be used. Update Android System WebView and try again." /></div>
  }
  return (
    <div class="scroll">
      <PageHeader title="Vault" onBack={popNav}>
        {open && <Round icon="lock" label="Lock vault" onClick={() => { vaultKey = null; setOpen(false) }} />}
      </PageHeader>
      <div class="content no-tabbar">
        {!meta ? <SetupVault onDone={() => setOpen(true)} /> : !open ? <UnlockVault meta={meta} onOpen={() => setOpen(true)} /> : <VaultList />}
      </div>
    </div>
  )
}

function SetupVault({ onDone }: { onDone: () => void }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = p1.length >= 8 && p1 === p2
  return (
    <>
      <div class="tile t-lilac pop" style={{ '--i': 1, gap: 8 } as any}>
        <div class="row"><Icon name="lock" size={20} /><b class="h-sm grow">Keep client logins safe</b></div>
        <div class="small">Save VPS panels, hosting and registrar logins here. Everything is encrypted on your phone with your vault password before it syncs, so nobody else can read it, not even the server.</div>
      </div>
      <Field label="Vault password (8+ characters)" type="password" value={p1} onInput={setP1} icon="lock" />
      <Field label="Type it again" type="password" value={p2} onInput={setP2} icon="lock"
        hint={p2 && p1 !== p2 ? "Passwords don't match" : undefined} hintTone="bad" />
      <Hint>⚠ Don't forget it: there's no way to recover the vault without this password. You can unlock with your fingerprint after the first time.</Hint>
      <Btn block busy={busy} disabled={!ok} icon="lock" onClick={async () => {
        setBusy(true)
        await attempt(async () => {
          const { key, meta } = await createVault(p1)
          await save('vault', { id: 'vault', ...meta, createdAt: Date.now() })
          vaultKey = key
          await offerFingerprint(key)
          onDone()
        })
        setBusy(false)
      }}>Create vault</Btn>
    </>
  )
}

async function offerFingerprint(key: CryptoKey) {
  const s = getState()
  if (!s.lock.biometricAvailable) return
  if (await call<boolean>('vault.hasKey').catch(() => false)) return
  if (await confirm('Unlock with fingerprint?', 'Next time, open the vault with your fingerprint instead of typing the password. The key stays on this phone only.', 'Yes', false)) {
    await call('vault.saveKey', { key: await exportKey(key) }).catch(() => {})
  }
}

function UnlockVault({ meta, onOpen }: { meta: { salt: string; iv: string; check: string }; onOpen: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const fingerprint = async () => {
    const raw = await call<string | null>('vault.loadKey').catch(() => null)
    if (!raw) return
    const key = await importKey(raw)
    if (await verifyKey(key, meta)) { vaultKey = key; onOpen() } else { call('vault.clearKey'); setHasKey(false) }
  }
  useEffect(() => {
    call<boolean>('vault.hasKey').then(v => { setHasKey(v); if (v) fingerprint() }).catch(() => {})
  }, [])
  const unlock = async () => {
    setBusy(true); setError('')
    const key = await openVault(pw, meta).catch(() => null)
    setBusy(false)
    if (!key) { setError('Wrong password'); return }
    vaultKey = key
    await offerFingerprint(key)
    onOpen()
  }
  return (
    <>
      <div class="empty pop" style={{ '--i': 1 } as any}><div class="blob"><Icon name="lock" size={32} /></div><h3 class="h-md">Vault is locked</h3><p>Enter your vault password to see your saved logins.</p></div>
      <Field label="Vault password" type="password" value={pw} onInput={v => { setPw(v); setError('') }} icon="lock" hint={error || undefined} hintTone="bad" autoFocus />
      <Btn block busy={busy} disabled={!pw} onClick={unlock}>Unlock</Btn>
      {hasKey && <Btn block kind="soft-bg" icon="fingerprint" onClick={fingerprint}>Use fingerprint</Btn>}
      <button class="link" style={{ alignSelf: 'center', marginTop: 12 }} onClick={resetVault}>Forgot the password?</button>
    </>
  )
}

async function resetVault() {
  if (!(await confirm('Reset the vault?', 'Without the password the saved logins can\'t be read. Resetting deletes them all and lets you start a new vault.', 'Delete everything'))) return
  const s = getState()
  for (const x of s.data.secret) await remove('secret', x.id)
  await remove('vault', 'vault')
  call('vault.clearKey').catch(() => {})
  toast('Vault reset')
}

function VaultList() {
  const s = useApp()
  const [q, setQ] = useState('')
  const list = s.data.secret.filter(x => matches(q, x.title, kindOf(x.kind).label, byId('rental', x.rentalId)?.name, byId('customer', x.customerId)?.name))
    .sort((a, b) => a.title.localeCompare(b.title))
  return (
    <>
      <SearchBar i={1} value={q} onInput={setQ} placeholder="Search your vault" />
      {!s.data.secret.length && <Empty icon="lock" title="Nothing saved yet" text="Add the logins for your clients' servers, panels and domains."><Btn icon="plus" onClick={() => editSecret()}>Add login</Btn></Empty>}
      {list.length > 0 && <div class="card flush pop" style={{ '--i': 2 } as any}>
        {list.map(x => {
          const rental = byId('rental', x.rentalId)
          return (
            <div key={x.id} class="item" onClick={() => viewSecret(x)}>
              <div class="badge-ico t-lilac"><Icon name={kindOf(x.kind).icon} size={16} /></div>
              <div class="main"><div class="t">{x.title}</div><div class="s">{[kindOf(x.kind).label, rental?.name, byId('customer', x.customerId)?.name].filter(Boolean).join(' · ')}</div></div>
              <Icon name="right" size={12} class="muted" />
            </div>
          )
        })}
      </div>}
      {s.data.secret.length > 0 && <Btn block icon="plus" onClick={() => editSecret()}>Add login</Btn>}
      <Hint>🔒 Encrypted on this phone before syncing. The vault locks when you leave this page.</Hint>
    </>
  )
}

async function readFields(x: Secret): Promise<VaultFields | null> {
  if (!vaultKey) return null
  try { return JSON.parse(await decryptText(vaultKey, x.iv, x.data)) } catch { return null }
}

export function viewSecret(x: Secret) {
  openSheet(close => <SecretView x={x} close={close} />)
}

function SecretView({ x, close }: { x: Secret; close: () => void }) {
  const [f, setF] = useState<VaultFields | null>(null)
  const [show, setShow] = useState(false)
  useEffect(() => { readFields(x).then(setF) }, [x.id])
  const copy = (text: string, what: string) => call('app.copy', { text, toast: `${what} copied` })
  const row = (label: string, value: string, secret = false) => value ? (
    <div class="vault-row">
      <div class="grow" style={{ minWidth: 0 }}><div class="tiny muted semibold">{label}</div><div class="num" style={{ overflowWrap: 'anywhere' }}>{secret && !show ? '•'.repeat(Math.min(14, value.length)) : value}</div></div>
      {secret && <Round icon={show ? 'eyeOff' : 'eye'} sm onBg label="Show" onClick={() => setShow(!show)} />}
      <Round icon="copy" sm onBg label="Copy" onClick={() => copy(value, label)} />
    </div>
  ) : null
  return (
    <>
      <SheetTitle title={x.title} sub={kindOf(x.kind).label} />
      <div class="body">
        {!f && <Hint>Can't read this entry. Lock and unlock the vault, then try again.</Hint>}
        {f && <div class="card in-card">
          {row('Username / email', f.username)}
          {row('Password', f.password, true)}
          {row('Address', f.url)}
          {f.notes && <div class="vault-row"><div class="grow"><div class="tiny muted semibold">Notes</div><div style={{ whiteSpace: 'pre-wrap' }}>{f.notes}</div></div></div>}
        </div>}
        {f?.url && <Btn kind="soft" icon="open" onClick={() => call('app.openUrl', { url: f.url })}>Open address</Btn>}
        <div class="grid2">
          <Btn kind="soft-bg" icon="edit" onClick={() => { close(); f && setTimeout(() => editSecret(x, f), 150) }}>Edit</Btn>
          <Btn kind="ghost" onClick={close}>Close</Btn>
        </div>
      </div>
    </>
  )
}

export function editSecret(item?: Secret, fields?: VaultFields, defaults: { rentalId?: string | null; customerId?: string | null; title?: string; kind?: string } = {}) {
  if (!vaultKey) { toast('Unlock the vault first'); return }
  openForm(close => <SecretForm item={item} fields={fields} defaults={defaults} close={close} />)
}

function SecretForm({ item, fields, defaults, close }: { item?: Secret; fields?: VaultFields; defaults: { rentalId?: string | null; customerId?: string | null; title?: string; kind?: string }; close: () => void }) {
  const s = useApp()
  const [title, setTitle] = useState(item?.title ?? defaults.title ?? '')
  const [kind, setKind] = useState(item?.kind ?? defaults.kind ?? 'login')
  const [rentalId, setRental] = useState(item?.rentalId ?? defaults.rentalId ?? '')
  const [customerId, setCustomer] = useState(item?.customerId ?? defaults.customerId ?? '')
  const [f, setF] = useState<VaultFields>(fields ?? { username: '', password: '', url: '', notes: '' })
  const [show, setShow] = useState(!item)
  const up = (p: Partial<VaultFields>) => setF({ ...f, ...p })
  return (
    <Form title={item ? 'Edit login' : 'New login'} close={close} saveEnabled={!!title.trim()}
      onSave={async () => {
        if (!vaultKey) throw new Error('The vault is locked')
        const sealed = await encryptText(vaultKey, JSON.stringify({ ...f, username: f.username.trim(), url: f.url.trim() }))
        await save('secret', { id: item?.id ?? newId(), title: title.trim(), kind, rentalId: rentalId || null, customerId: customerId || null, ...sealed, createdAt: item?.createdAt ?? Date.now() })
        close()
      }}
      onDelete={item ? () => { remove('secret', item.id); close() } : undefined}>
      <Field label="Name (e.g. Hetzner panel – Nour Bakery)" value={title} onInput={setTitle} autoFocus={!item} />
      <FieldLabel>Type</FieldLabel>
      <Chips wrap options={kinds.map(k => k.value)} value={kind} onChange={setKind} label={v => kindOf(v).label} icon={v => kindOf(v).icon} />
      <Field label="Username / email" value={f.username} icon="user" onInput={v => up({ username: v })} />
      <Field label="Password" type={show ? 'text' : 'password'} value={f.password} icon="lock" onInput={v => up({ password: v })}
        trail={<Round icon={show ? 'eyeOff' : 'eye'} sm onBg label="Show" onClick={() => setShow(!show)} />} />
      <Btn kind="soft" sm icon="sync" onClick={() => { up({ password: generatePassword() }); setShow(true) }}>Generate a strong password</Btn>
      <Field label="Address (panel URL, IP…)" value={f.url} icon="link" onInput={v => up({ url: v })} />
      <Field label="Notes (2FA backup codes, PIN…)" multiline value={f.notes} onInput={v => up({ notes: v })} />
      <SelectField label="For rental (optional)" value={rentalId} onChange={setRental}
        options={[{ value: '', label: 'None' }, ...s.data.rental.map(r => ({ value: r.id, label: `${rentalKind(r.kind).label} · ${r.name || r.clientName}` }))]} />
      <SelectField label="Customer (optional)" value={customerId} onChange={setCustomer}
        options={[{ value: '', label: 'None' }, ...s.data.customer.map(c => ({ value: c.id, label: c.name }))]} />
    </Form>
  )
}
