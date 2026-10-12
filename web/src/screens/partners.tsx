// Partners: when a project is done or rented out together, each payment it brings in is split and
// every partner sees how much they made, how much they already got and what is still owed to them.
// Partners and splits live inside the project record, so everyone in a shared project sees them.

import { useState } from 'preact/hooks'
import * as F from '../format'
import { Icon } from '../icons'
import { byId, getState, save } from '../store'
import { newId, rentalKind, type Project, type ProjectPartner, type ProjectSplit, type SpaceInfo, type SplitShare } from '../types'
import {
  Avatar, Btn, Card, CurrencyField, DateField, Field, FieldLabel, Form, Hint, Round, Seg, attempt, cx, openForm, toast,
} from '../ui'

// ---------------------------------------------------------------- maths

const spaceOf = (projectId: string) => getState().spaces.find(sp => sp.kind === 'project' && sp.projectId === projectId)

/** Saved partners plus every team member (and me) who isn't one yet. With nothing saved, shares are equal. */
export function partnersOf(p: Project, space?: SpaceInfo): ProjectPartner[] {
  const me = getState().user
  const list = (p.partners ?? []).map(x => ({ ...x }))
  const people = space?.members.length ? space.members : me ? [{ id: me.id, name: me.name, username: me.username }] : []
  for (const m of people) {
    if (!list.some(x => x.userId === m.id)) list.push({ id: m.id, userId: m.id, name: m.name || '@' + m.username, share: 0 })
  }
  if (!p.partners?.length && list.length) {
    const each = Math.floor((100 / list.length) * 100) / 100
    list.forEach((x, i) => { x.share = i === 0 ? Math.round((100 - each * (list.length - 1)) * 100) / 100 : each })
  }
  return list
}

/** [profit] divided by everyone's share; rounding left-overs go to the first partner. */
export function splitByShares(profit: number, partners: ProjectPartner[]): SplitShare[] {
  const total = partners.reduce((a, x) => a + Math.max(0, x.share), 0)
  if (!partners.length) return []
  const shares = partners.map(x => ({ partnerId: x.id, amount: total > 0 ? Math.round((profit * Math.max(0, x.share) / total) * 100) / 100 : 0, paid: false }))
  const diff = Math.round((profit - shares.reduce((a, x) => a + x.amount, 0)) * 100) / 100
  if (diff && total > 0) {
    const first = shares.find((_, i) => partners[i].share > 0) ?? shares[0]
    first.amount = Math.round((first.amount + diff) * 100) / 100
  }
  return shares
}

export const splitProfit = (s: ProjectSplit) => s.amount - s.cost

/** Per partner: what they made, what they were given, and what is still owed, by currency. */
export function partnerTotals(p: Project, partners: ProjectPartner[]) {
  return partners.map(x => {
    const earned: Record<string, number> = {}, paid: Record<string, number> = {}, owed: Record<string, number> = {}
    for (const s of p.splits ?? []) {
      for (const sh of s.shares) {
        if (sh.partnerId !== x.id || !sh.amount) continue
        earned[s.currency] = (earned[s.currency] ?? 0) + sh.amount
        const to = sh.paid ? paid : owed
        to[s.currency] = (to[s.currency] ?? 0) + sh.amount
      }
    }
    return { partner: x, earned, paid, owed }
  })
}

/** Changes the latest copy of the project, so edits synced from a partner in the meantime are kept. */
export async function updateProject(id: string, change: (p: Project) => Project) {
  const p = byId('project', id)
  if (p) await save('project', change(p))
}

/** Adds a split for a rental payment using everyone's usual share. Called when a rental is renewed. */
export async function addRentalSplit(projectId: string, split: Omit<ProjectSplit, 'shares' | 'id'>) {
  const p = byId('project', projectId)
  if (!p) return
  const partners = partnersOf(p, spaceOf(projectId))
  const entry: ProjectSplit = { ...split, id: newId(), shares: splitByShares(split.amount - split.cost, partners) }
  await updateProject(projectId, x => ({ ...x, partners: x.partners?.length ? x.partners : partners, splits: [entry, ...(x.splits ?? [])] }))
}

const nameOf = (partners: ProjectPartner[], id: string) => partners.find(x => x.id === id)?.name ?? 'Former partner'

// ---------------------------------------------------------------- panel

export function PartnersPanel({ p, space }: { p: Project; space?: SpaceInfo }) {
  const partners = partnersOf(p, space)
  const totals = partnerTotals(p, partners)
  const splits = [...(p.splits ?? [])].sort((a, b) => b.date - a.date)
  const earned = F.sumBy(splits, s => s.currency, s => s.amount)
  const profit = F.sumBy(splits, s => s.currency, s => splitProfit(s))
  const meId = getState().user?.id
  const settle = (partnerId: string) => attempt(() => updateProject(p.id, x => ({
    ...x, splits: (x.splits ?? []).map(s => ({ ...s, shares: s.shares.map(sh => sh.partnerId === partnerId ? { ...sh, paid: true } : sh) })),
  })))
  return (
    <>
      <Card class="wide">
        <div class="row"><h3 class="h-md grow">Partners</h3><Btn kind="soft-bg" sm icon="edit" onClick={() => editPartners(p)}>Shares</Btn></div>
        <div class="tiny muted" style={{ margin: '2px 0 8px' }}>
          {splits.length ? `Brought in ${F.totals(earned, p.currency)} · profit ${F.totals(profit, p.currency)}` : 'Add what the project earns and how much each of you made.'}
        </div>
        <div class="partner-grid">
          {totals.map(({ partner: x, earned, paid, owed }) => (
            <div key={x.id} class="partner">
              <div class="row">
                {x.userId ? <Avatar userId={x.userId} name={x.name} size={36} /> : <span class="partner-ico"><Icon name="user" size={16} /></span>}
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="semibold ellipsis">{x.name}{x.userId === meId ? ' (you)' : ''}</div>
                  <div class="tiny muted">{x.share}% share</div>
                </div>
              </div>
              <div class="totals-list" style={{ marginTop: 8 }}>
                <div><span>Made</span><b class="num amt">{F.totals(earned, p.currency)}</b></div>
                <div><span>Got</span><b class="num amt good">{F.totals(paid, p.currency)}</b></div>
                <div class="strong"><span>Still owed</span><b class="num amt">{F.totals(owed, p.currency)}</b></div>
              </div>
              {Object.values(owed).some(v => v > 0) && <Btn kind="soft" sm icon="check" onClick={() => settle(x.id)}>Mark as paid</Btn>}
            </div>
          ))}
        </div>
      </Card>
      <div class="section-h"><h3>Earnings</h3><button class="link" onClick={() => editSplit(p)}>+ Add</button></div>
      {!splits.length && <Hint>Each time the project brings in money (a client payment, a month of rent…), add it here and split it.{space ? ' Everyone in the team sees this.' : ''}</Hint>}
      {splits.map(s => <SplitCard key={s.id} p={p} s={s} partners={partners} />)}
    </>
  )
}

function SplitCard({ p, s, partners }: { p: Project; s: ProjectSplit; partners: ProjectPartner[] }) {
  const rental = s.rentalId ? byId('rental', s.rentalId) : undefined
  return (
    <Card onClick={() => editSplit(p, s)}>
      <div class="row">
        <span class="partner-ico t-mint"><Icon name={rental ? rentalKind(rental.kind).icon : 'income'} size={16} /></span>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="semibold ellipsis">{s.title || 'Earnings'}</div>
          <div class="tiny muted">{F.dateShort(s.date)}{s.cost ? ` · cost ${F.money(s.cost, s.currency)}` : ''}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div class="num bold amt good">{F.money(s.amount, s.currency)}</div>
          <div class="tiny muted num amt">profit {F.money(splitProfit(s), s.currency)}</div>
        </div>
      </div>
      <div class="share-chips">
        {s.shares.filter(sh => sh.amount).map(sh => (
          <span key={sh.partnerId} class={cx('share-chip', sh.paid && 'paid')}>
            {sh.paid && <Icon name="check" size={11} stroke={2.6} />}{nameOf(partners, sh.partnerId)} · <b class="num amt">{F.money(sh.amount, s.currency)}</b>
          </span>
        ))}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- partner shares

export function editPartners(p: Project) {
  openForm(close => <PartnersForm p={p} close={close} />)
}

function PartnersForm({ p, close }: { p: Project; close: () => void }) {
  const [list, setList] = useState(() => partnersOf(p, spaceOf(p.id)).map(x => ({ ...x, text: String(x.share) })))
  const [name, setName] = useState('')
  const total = list.reduce((a, x) => a + (F.parseAmount(x.text) ?? 0), 0)
  const set = (i: number, text: string) => setList(list.map((x, j) => (j === i ? { ...x, text } : x)))
  const equal = () => {
    const each = Math.floor((100 / list.length) * 100) / 100
    setList(list.map((x, i) => ({ ...x, text: String(i === 0 ? Math.round((100 - each * (list.length - 1)) * 100) / 100 : each) })))
  }
  return (
    <Form title="Partner shares" close={close} onSave={async () => {
      const partners = list.map(({ text, ...x }) => ({ ...x, name: x.name.trim() || 'Partner', share: F.parseAmount(text) ?? 0 }))
      await updateProject(p.id, x => ({ ...x, partners }))
      close()
    }}>
      <Hint>Each partner's usual cut of the profit. New earnings are split this way, and you can still change any amount.</Hint>
      {list.map((x, i) => (
        <div key={x.id} class="row">
          {x.userId ? <Avatar userId={x.userId} name={x.name} size={36} /> : <span class="partner-ico"><Icon name="user" size={16} /></span>}
          <div class="grow">{x.userId
            ? <div class="semibold">{x.name}<div class="tiny muted">Team member</div></div>
            : <Field label="Name" value={x.name} onInput={v => setList(list.map((y, j) => (j === i ? { ...y, name: v } : y)))} />}</div>
          <div style={{ width: 110 }}><Field label="Share" value={x.text} inputMode="decimal" prefix="%" onInput={v => set(i, v)} /></div>
          {!x.userId && <Round icon="close" sm label="Remove" onClick={() => setList(list.filter((_, j) => j !== i))} />}
        </div>
      ))}
      <div class={cx('tiny bold', Math.abs(total - 100) < 0.01 ? 'good' : 'bad')} style={{ padding: '0 4px' }}>
        Total {Math.round(total * 100) / 100}%{Math.abs(total - 100) < 0.01 ? '' : ' (it works out of whatever the total is, 100% is easiest to read)'}
      </div>
      <div class="row wrap">
        <Btn kind="soft" sm icon="users" onClick={equal}>Split equally</Btn>
      </div>
      <FieldLabel>Add someone without the app</FieldLabel>
      <div class="row">
        <div class="grow"><Field label="Partner name" value={name} icon="userPlus" onInput={setName} /></div>
        <Btn sm icon="plus" disabled={!name.trim()} onClick={() => { setList([...list, { id: newId(), userId: null, name: name.trim(), share: 0, text: '0' }]); setName('') }}>Add</Btn>
      </div>
      <Hint>To add a partner who has Carrot Note, invite them to the project from Team.</Hint>
    </Form>
  )
}

// ---------------------------------------------------------------- one split

export function editSplit(p: Project, item?: ProjectSplit, defaults: Partial<ProjectSplit> = {}) {
  openForm(close => <SplitForm p={p} item={item} defaults={defaults} close={close} />)
}

function SplitForm({ p, item, defaults, close }: { p: Project; item?: ProjectSplit; defaults: Partial<ProjectSplit>; close: () => void }) {
  const partners = partnersOf(p, spaceOf(p.id))
  const rentals = getState().data.rental.filter(r => r.projectId === p.id)
  const base: ProjectSplit = item ?? {
    id: newId(), date: F.today(), title: '', amount: 0, cost: 0, currency: p.currency, rentalId: null, shares: [], note: '', ...defaults,
  }
  const [s, set] = useState(base)
  const [amount, setAmount] = useState(F.amountText(base.amount))
  const [cost, setCost] = useState(F.amountText(base.cost))
  const [mode, setMode] = useState(item ? 1 : 0)
  const [custom, setCustom] = useState<Record<string, string>>(() => Object.fromEntries(base.shares.map(x => [x.partnerId, F.amountText(x.amount)])))
  const [paid, setPaid] = useState<Record<string, boolean>>(() => Object.fromEntries(base.shares.map(x => [x.partnerId, x.paid])))
  const up = (x: Partial<ProjectSplit>) => set({ ...s, ...x })
  const a = F.parseAmount(amount) ?? 0, c = F.parseAmount(cost) ?? 0
  const profit = a - c
  // Old partners who were removed but still have money in this split stay listed.
  const people = [...partners, ...base.shares.filter(x => !partners.some(y => y.id === x.partnerId)).map(x => ({ id: x.partnerId, name: 'Former partner', share: 0, userId: null }))]
  const auto = splitByShares(profit, partners)
  const shares: SplitShare[] = people.map(x => ({
    partnerId: x.id,
    amount: mode === 0 ? auto.find(y => y.partnerId === x.id)?.amount ?? 0 : F.parseAmount(custom[x.id] ?? '') ?? 0,
    paid: !!paid[x.id],
  }))
  const given = shares.reduce((t, x) => t + x.amount, 0)
  const left = Math.round((profit - given) * 100) / 100
  const pickRental = (id: string) => {
    const r = rentals.find(x => x.id === id)
    if (!r) return up({ rentalId: null })
    up({ rentalId: r.id, title: s.title || `${r.clientName || r.name} · ${F.monthName(F.today())}`, currency: r.priceCurrency })
    if (!a && r.price) setAmount(F.amountText(r.price))
    if (!c && r.cost && r.costCurrency === r.priceCurrency) setCost(F.amountText(r.cost))
  }
  return (
    <Form title={item ? 'Edit earnings' : 'Split earnings'} close={close} saveEnabled={a > 0}
      onSave={async () => {
        const entry: ProjectSplit = { ...s, title: s.title.trim(), note: s.note.trim(), amount: a, cost: c, shares }
        await updateProject(p.id, x => ({
          ...x, partners: x.partners?.length ? x.partners : partners,
          splits: item ? (x.splits ?? []).map(y => (y.id === item.id ? entry : y)) : [entry, ...(x.splits ?? [])],
        }))
        close()
        if (!item) toast('Earnings split')
      }}
      onDelete={item ? async () => { await updateProject(p.id, x => ({ ...x, splits: (x.splits ?? []).filter(y => y.id !== item.id) })); close() } : undefined}>
      {rentals.length > 0 && <>
        <FieldLabel>From a renter (optional)</FieldLabel>
        <div class="chips wrap">
          {rentals.map(r => (
            <button key={r.id} class={cx('chip', s.rentalId === r.id && 'on')} onClick={() => pickRental(s.rentalId === r.id ? '' : r.id)}>
              <Icon name={rentalKind(r.kind).icon} size={13} />{r.clientName || r.name}
            </button>
          ))}
        </div>
      </>}
      <Field label="What was it?" value={s.title} placeholder="e.g. March rent from Nour Bakery" onInput={v => up({ title: v })} autoFocus={!item && !rentals.length} />
      <div class="money-pair">
        <div class="card in-card">
          <div class="tiny muted semibold">Money in</div>
          <input class="money-input num good" value={amount} inputMode="decimal" placeholder="0" onInput={e => setAmount((e.target as HTMLInputElement).value)} />
        </div>
        <div class="card in-card">
          <div class="tiny muted semibold">Costs (server, fees…)</div>
          <input class="money-input num" value={cost} inputMode="decimal" placeholder="0" onInput={e => setCost((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}><CurrencyField value={s.currency} onChange={v => up({ currency: v })} /></div>
        <div style={{ flex: 1.3 }}><DateField label="Date" value={s.date} onChange={v => up({ date: v ?? F.today() })} clearable={false} /></div>
      </div>

      <FieldLabel>Who made what · profit {F.money(profit, s.currency)}</FieldLabel>
      <Seg options={[{ label: 'By shares', icon: 'chart' }, { label: 'Custom amounts', icon: 'edit' }]} value={mode} onChange={i => {
        if (i === 1) setCustom(Object.fromEntries(shares.map(x => [x.partnerId, F.amountText(x.amount)])))
        setMode(i)
      }} />
      <div class="card flush in-card">
        {people.map(x => {
          const sh = shares.find(y => y.partnerId === x.id)!
          return (
            <div key={x.id} class="item">
              {x.userId ? <Avatar userId={x.userId} name={x.name} size={36} /> : <span class="partner-ico"><Icon name="user" size={16} /></span>}
              <div class="main"><div class="t">{x.name}</div><div class="s">{mode === 0 ? `${x.share}% share` : 'Custom amount'}</div></div>
              {mode === 0
                ? <b class="num amt">{F.money(sh.amount, s.currency)}</b>
                : <input class="share-input num" value={custom[x.id] ?? ''} inputMode="decimal" placeholder="0" onInput={e => setCustom({ ...custom, [x.id]: (e.target as HTMLInputElement).value })} />}
              <button class={cx('paid-btn', sh.paid && 'on')} onClick={() => setPaid({ ...paid, [x.id]: !sh.paid })}>
                <Icon name={sh.paid ? 'checkCircle' : 'clock'} size={13} />{sh.paid ? 'Got it' : 'Owed'}
              </button>
            </div>
          )
        })}
      </div>
      {mode === 1 && Math.abs(left) >= 0.01 && <div class="tiny bold bad" style={{ padding: '0 4px' }}>
        {left > 0 ? `${F.money(left, s.currency)} of the profit isn't given to anyone yet.` : `That's ${F.money(-left, s.currency)} more than the profit.`}
      </div>}
      <Hint>“Got it” means that partner already received their part. Tap it to switch.</Hint>
      <Field label="Note" multiline value={s.note} onInput={v => up({ note: v })} />
    </Form>
  )
}
