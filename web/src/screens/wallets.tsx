// Wallets: how much money is in each place (cash, bank, InstaPay, USDT…). A wallet's balance is its
// opening amount plus the income and minus the expenses that landed in it, plus transfers. A
// transaction lands in the wallet chosen on it, or else in the wallet that holds its payment method.

import { useState } from 'preact/hooks'
import * as F from '../format'
import { editTxn } from '../editors'
import { Icon, methodIcon } from '../icons'
import { pop as popNav, push } from '../nav'
import { getState, remove, save, useApp } from '../store'
import { Categories, newId, type Transfer, type Txn, type Wallet } from '../types'
import {
  Btn, CurrencyField, DateField, Empty, Eyebrow, Field, FieldLabel, Form, Hero, Hint, PageHeader, Round, SelectField, attempt, cx, openForm, toast,
} from '../ui'
import { TxnRow } from '../rows'

export const walletKinds: { value: string; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: 'cash' },
  { value: 'bank', label: 'Bank', icon: 'bank' },
  { value: 'mobile', label: 'Mobile wallet', icon: 'phone' },
  { value: 'crypto', label: 'Crypto', icon: 'crypto' },
  { value: 'paypal', label: 'PayPal', icon: 'paypal' },
  { value: 'other', label: 'Other', icon: 'wallet' },
]
const kindOf = (k: string) => walletKinds.find(x => x.value === k) ?? walletKinds[walletKinds.length - 1]

/** The wallet a transaction belongs to, or undefined. */
export function walletOf(t: Txn, wallets: Wallet[]): Wallet | undefined {
  if (t.walletId) { const w = wallets.find(x => x.id === t.walletId); if (w) return w }
  return wallets.find(w => !w.archived && w.currency === t.currency && w.methods.includes(t.method))
}

export function walletBalance(w: Wallet, txns: Txn[], transfers: Transfer[], wallets: Wallet[]) {
  let b = w.opening
  for (const t of txns) if (walletOf(t, wallets)?.id === w.id) b += t.kind === 'income' ? t.amount : -t.amount
  for (const x of transfers) {
    if (x.from === w.id) b -= x.amount
    if (x.to === w.id) b += x.toAmount
  }
  return Math.round(b * 100) / 100
}

// ---------------------------------------------------------------- list

export function WalletsScreen() {
  const s = useApp()
  const { wallet: all, txn, transfer } = s.data
  const wallets = all.filter(w => !w.archived)
  const balances = new Map(all.map(w => [w.id, walletBalance(w, txn, transfer, all)]))
  const total = F.sumBy(wallets, w => w.currency, w => balances.get(w.id)!)
  const loose = txn.filter(t => !walletOf(t, all)).length
  return (
    <>
      <div class="scroll">
        <PageHeader title="Wallets" onBack={popNav}><Round icon="plus" label="New wallet" onClick={() => editWallet()} /></PageHeader>
        <div class="content no-tabbar">
          {wallets.length > 0 && <Hero i={1}>
            <Eyebrow>All your money</Eyebrow>
            <div class="h-display num amt">{F.totals(total, s.settings.currency)}</div>
            <div class="row" style={{ marginTop: 14 }}>
              <button class="hero-btn" onClick={() => moveMoney()}><Icon name="convert" size={13} />Move money</button>
              <button class="hero-btn" onClick={() => editWallet()}><Icon name="plus" size={13} />Wallet</button>
            </div>
          </Hero>}
          {!wallets.length && <Empty icon="wallet" title="No wallets yet" text="Add the places your money sits: cash, your bank, InstaPay, a USDT wallet… Each one shows what's in it, from the income and expenses you already record.">
            <Btn icon="plus" onClick={() => editWallet()}>Add a wallet</Btn>
          </Empty>}
          {wallets.map((w, i) => {
            const b = balances.get(w.id)!
            return (
              <div key={w.id} class="card press pop" style={{ '--i': i + 2 } as any} onClick={() => push({ name: 'wallet', id: w.id })}>
                <div class="row">
                  <span class="badge-ico t-mint"><Icon name={kindOf(w.kind).icon} size={17} /></span>
                  <div class="grow" style={{ minWidth: 0 }}>
                    <div class="h-sm ellipsis">{w.name}</div>
                    <div class="tiny muted ellipsis">{w.methods.length ? w.methods.join(' · ') : kindOf(w.kind).label}</div>
                  </div>
                  <div class={cx('num h-sm amt', b < 0 && 'bad')} style={{ fontWeight: 800 }}>{F.money(b, w.currency)}</div>
                </div>
              </div>
            )
          })}
          {wallets.length > 0 && loose > 0 && <Hint>{F.plural(loose, 'transaction')} aren't in any wallet. Add their payment method to a wallet, or pick a wallet when you add money.</Hint>}
          {all.some(w => w.archived) && <Hint>Hidden wallets: {all.filter(w => w.archived).map(w => w.name).join(', ')}</Hint>}
        </div>
      </div>
      {wallets.length > 1 && <button class="add-fab low" onClick={() => moveMoney()}><Icon name="convert" size={15} />Move money</button>}
    </>
  )
}

// ---------------------------------------------------------------- detail

export function WalletDetail({ id }: { id: string }) {
  const s = useApp()
  const w = s.data.wallet.find(x => x.id === id)
  if (!w) return <div class="scroll"><PageHeader title="Wallet" onBack={popNav} /><Empty icon="wallet" title="This wallet is gone" text="It was deleted."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  const all = s.data.wallet
  const b = walletBalance(w, s.data.txn, s.data.transfer, all)
  const txns = s.data.txn.filter(t => walletOf(t, all)?.id === w.id)
  const transfers = s.data.transfer.filter(x => x.from === w.id || x.to === w.id)
  const mStart = F.monthStart(F.today())
  const inMonth = txns.filter(t => t.date >= mStart && t.kind === 'income').reduce((a, t) => a + t.amount, 0)
  const outMonth = txns.filter(t => t.date >= mStart && t.kind === 'expense').reduce((a, t) => a + t.amount, 0)
  type Line = { date: number; key: string; node: any }
  const lines: Line[] = [
    ...txns.map(t => ({ date: t.date, key: t.id, node: <TxnRow key={t.id} t={t} extra={F.dateShort(t.date)} /> })),
    ...transfers.map(x => {
      const out = x.from === w.id
      const other = all.find(o => o.id === (out ? x.to : x.from))
      return {
        date: x.date, key: x.id, node: (
          <div key={x.id} class="item" onClick={() => moveMoney(x)}>
            <div class="badge-ico t-sky"><Icon name="convert" size={15} /></div>
            <div class="main"><div class="t">{out ? `To ${other?.name ?? 'a wallet'}` : `From ${other?.name ?? 'a wallet'}`}</div><div class="s">{F.dateShort(x.date)}{x.note ? ' · ' + x.note : ''}</div></div>
            <div class={cx('num bold amt', !out && 'good')}>{out ? '−' : '+'}{F.money(out ? x.amount : x.toAmount, w.currency)}</div>
          </div>
        ),
      }
    }),
  ].sort((a, b2) => b2.date - a.date)
  return (
    <div class="scroll">
      <PageHeader title={w.name} onBack={popNav}><Round icon="edit" label="Edit" onClick={() => editWallet(w)} /></PageHeader>
      <div class="content no-tabbar">
        <Hero i={1}>
          <Eyebrow>{kindOf(w.kind).label} · balance</Eyebrow>
          <div class="h-display num amt">{F.money(b, w.currency)}</div>
          <div class="row" style={{ marginTop: 12 }}>
            <div class="grow"><div class="eyebrow">In this month</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(inMonth, w.currency)}</div></div>
            <div class="grow"><div class="eyebrow">Out this month</div><div class="num h-sm amt" style={{ fontWeight: 800 }}>{F.money(outMonth, w.currency)}</div></div>
          </div>
          <div class="row" style={{ marginTop: 14 }}>
            <button class="hero-btn" onClick={() => editTxn(undefined, { kind: 'income' })}><Icon name="income" size={13} />Money in</button>
            <button class="hero-btn" onClick={() => moveMoney(undefined, w.id)}><Icon name="convert" size={13} />Move</button>
          </div>
        </Hero>
        <div class="section-h"><h3>History</h3></div>
        {!lines.length ? <Hint>Income and expenses paid with {w.methods.join(', ') || 'this wallet'} show here.</Hint>
          : <div class="card flush">{lines.slice(0, 200).map(l => l.node)}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- forms

export function editWallet(item?: Wallet) {
  openForm(close => <WalletForm item={item} close={close} />)
}

function WalletForm({ item, close }: { item?: Wallet; close: () => void }) {
  const st = getState()
  const base: Wallet = item ?? { id: newId(), name: '', kind: 'cash', currency: st.settings.currency, opening: 0, methods: ['Cash'], createdAt: Date.now() }
  const [w, set] = useState(base)
  const [opening, setOpening] = useState(F.amountText(base.opening))
  const up = (x: Partial<Wallet>) => set({ ...w, ...x })
  const taken = new Map(st.data.wallet.filter(o => o.id !== w.id && !o.archived && o.currency === w.currency).flatMap(o => o.methods.map(m => [m, o.name] as const)))
  const toggle = (m: string) => up({ methods: w.methods.includes(m) ? w.methods.filter(x => x !== m) : [...w.methods, m] })
  const suggest: Record<string, string[]> = { cash: ['Cash'], bank: ['Bank transfer', 'Card'], mobile: ['InstaPay', 'Wallet'], crypto: ['USDT', 'Crypto'], paypal: ['PayPal'], other: [] }
  return (
    <Form title={item ? 'Edit wallet' : 'New wallet'} close={close} saveEnabled={!!w.name.trim()}
      onSave={async () => { await save('wallet', { ...w, name: w.name.trim(), opening: F.parseAmount(opening) ?? 0 }); close() }}
      onDelete={item ? () => { remove('wallet', item.id); close(); popNav() } : undefined}>
      <div class="chips wrap">
        {walletKinds.map(k => (
          <button key={k.value} class={cx('chip', w.kind === k.value && 'on')}
            onClick={() => up({ kind: k.value, name: w.name || (k.value === 'other' ? '' : k.label), methods: item ? w.methods : suggest[k.value].filter(m => !taken.has(m)) })}>
            <Icon name={k.icon} size={13} />{k.label}
          </button>
        ))}
      </div>
      <Field label="Name" value={w.name} placeholder="e.g. CIB account, Cash at home" onInput={v => up({ name: v })} autoFocus={!item} />
      <div class="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1.4 }}><Field label="Money in it before (opening balance)" value={opening} inputMode="decimal" onInput={setOpening} /></div>
        <div style={{ flex: 1 }}><CurrencyField value={w.currency} onChange={v => up({ currency: v })} /></div>
      </div>
      <FieldLabel>Payments that land here</FieldLabel>
      <div class="chips wrap">
        {Categories.methods.map(m => (
          <button key={m} class={cx('chip', w.methods.includes(m) && 'on')} onClick={() => toggle(m)} title={taken.get(m) ? `Also in ${taken.get(m)}` : undefined}>
            <Icon name={methodIcon(m)} size={13} />{m}
          </button>
        ))}
      </div>
      <Hint>Income and expenses in {w.currency} paid this way count in this wallet, unless you choose another wallet on them.{[...w.methods].some(m => taken.has(m)) ? ` ${[...w.methods].filter(m => taken.has(m)).join(', ')} is also in ${[...w.methods].filter(m => taken.has(m)).map(m => taken.get(m)).join(', ')}; the first wallet wins.` : ''}</Hint>
      {item && <Btn kind="ghost" onClick={async () => { await attempt(() => save('wallet', { ...w, archived: !w.archived })); close() }}>{w.archived ? 'Show this wallet again' : 'Hide this wallet'}</Btn>}
    </Form>
  )
}

export function moveMoney(item?: Transfer, from?: string) {
  openForm(close => <TransferForm item={item} from={from} close={close} />)
}

function TransferForm({ item, from, close }: { item?: Transfer; from?: string; close: () => void }) {
  const st = getState()
  const wallets = st.data.wallet.filter(w => !w.archived)
  const base: Transfer = item ?? { id: newId(), from: from ?? wallets[0]?.id ?? '', to: wallets.find(w => w.id !== (from ?? wallets[0]?.id))?.id ?? '', amount: 0, toAmount: 0, date: F.today(), note: '', createdAt: Date.now() }
  const [x, set] = useState(base)
  const [amount, setAmount] = useState(F.amountText(base.amount))
  const [toAmount, setToAmount] = useState(F.amountText(base.toAmount))
  const up = (p: Partial<Transfer>) => set({ ...x, ...p })
  const a = st.data.wallet.find(w => w.id === x.from), b = st.data.wallet.find(w => w.id === x.to)
  const same = a && b && a.currency === b.currency
  const v = F.parseAmount(amount) ?? 0
  const opts = wallets.map(w => ({ value: w.id, label: `${w.name} (${w.currency})` }))
  if (wallets.length < 2) return (
    <Form title="Move money" close={close} saveEnabled={false} onSave={() => {}}>
      <Hint>Add at least two wallets first.</Hint>
      <Btn icon="plus" onClick={() => { close(); setTimeout(() => editWallet(), 150) }}>New wallet</Btn>
    </Form>
  )
  return (
    <Form title={item ? 'Edit transfer' : 'Move money'} close={close} saveEnabled={v > 0 && !!a && !!b && a.id !== b.id}
      onSave={async () => {
        await save('transfer', { ...x, amount: v, toAmount: same ? v : F.parseAmount(toAmount) ?? 0, note: x.note.trim() })
        close()
        if (!item) toast(`Moved ${F.money(v, a!.currency)} to ${b!.name}`)
      }}
      onDelete={item ? () => { remove('transfer', item.id); close() } : undefined}>
      <SelectField label="From" value={x.from} options={opts} onChange={v2 => up({ from: v2 })} />
      <SelectField label="To" value={x.to} options={opts} onChange={v2 => up({ to: v2 })} />
      <Field label={`Amount${a ? ` (${a.currency})` : ''}`} value={amount} inputMode="decimal" onInput={setAmount} autoFocus={!item} />
      {a && b && !same && <Field label={`Arrives as (${b.currency})`} value={toAmount} inputMode="decimal" onInput={setToAmount} hint="The amount after exchange" />}
      <DateField label="Date" value={x.date} onChange={d => up({ date: d ?? F.today() })} clearable={false} />
      <Field label="Note (optional)" value={x.note} onInput={n => up({ note: n })} />
    </Form>
  )
}

/** Wallet choice for the transaction form. Empty means "by payment method". */
export function WalletPicker({ value, onChange, currency, method }: { value?: string | null; onChange: (v: string | null) => void; currency: string; method: string }) {
  const s = useApp()
  const wallets = s.data.wallet.filter(w => !w.archived)
  if (!wallets.length) return null
  const auto = wallets.find(w => w.currency === currency && w.methods.includes(method))
  return <SelectField label="Wallet" value={value ?? ''} onChange={v => onChange(v || null)}
    options={[{ value: '', label: auto ? `Automatic (${auto.name})` : 'Automatic (none for this method)' }, ...wallets.map(w => ({ value: w.id, label: `${w.name} (${w.currency})` }))]} />
}
