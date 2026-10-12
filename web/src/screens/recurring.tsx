// Recurring income and expenses (subscriptions, rent, retainers…).

import { useState } from 'preact/hooks'
import * as F from '../format'
import { CustomerPicker, ProjectPicker } from '../editors'
import { categoryIcon, Icon, methodIcon } from '../icons'
import { pop as popNav } from '../nav'
import { monthlyAmount, nextOccurrence, recurringPeriod, recurringPeriods, runRecurring } from '../recurring'
import { remove, save, useApp } from '../store'
import { Categories, newId, type Recurring } from '../types'
import { AmountBox, Btn, Chips, DateField, Empty, Eyebrow, Field, FieldLabel, Form, Hero, Hint, MoreOptions, PageHeader, Seg, Switch, attempt, cx, openForm } from '../ui'

export function RecurringScreen() {
  const s = useApp()
  const cur = s.settings.currency
  const list = [...s.data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate - b.nextDate)
  const active = list.filter(r => r.active)
  const outMonthly = F.sumBy(active.filter(r => r.kind === 'expense'), r => r.currency, monthlyAmount)
  const inMonthly = F.sumBy(active.filter(r => r.kind === 'income'), r => r.currency, monthlyAmount)
  return (
    <>
      <div class="scroll">
        <PageHeader title="Recurring" onBack={popNav} />
        <div class="content no-tabbar">
          <Hero i={1}>
            <Eyebrow>Every month, on average</Eyebrow>
            <div class="row" style={{ marginTop: 6 }}>
              <div class="grow"><div class="eyebrow">↓ Comes in</div><div class="num h-md amt" style={{ fontWeight: 800 }}>{F.totals(inMonthly, cur)}</div></div>
              <div class="grow"><div class="eyebrow">↑ Goes out</div><div class="num h-md amt" style={{ fontWeight: 800 }}>{F.totals(outMonthly, cur)}</div></div>
            </div>
            <div class="small" style={{ marginTop: 10, opacity: .88 }}>Each one is added to Money by itself on its date.</div>
          </Hero>
          {!list.length && <Empty icon="repeat" title="Nothing recurring yet" text="Add subscriptions, rent, internet or a client's monthly retainer once, and they'll be added to Money on their dates.">
            <Btn icon="plus" onClick={() => editRecurring()}>Add one</Btn>
          </Empty>}
          {list.length > 0 && <div class="card flush pop" style={{ '--i': 2 } as any}>
            {list.map(r => (
              <div key={r.id} class={cx('item', !r.active && 'task-done')} onClick={() => editRecurring(r)}>
                <div class="badge-ico" style={{ background: r.kind === 'income' ? 'var(--mint)' : 'var(--accent-soft)', color: r.kind === 'income' ? 'var(--on-mint)' : 'var(--accent-deep)' }}>
                  <Icon name={categoryIcon(r.category)} size={16} />
                </div>
                <div class="main">
                  <div class="t">{r.note || r.category}</div>
                  <div class="s">{recurringPeriod(r.period).label}{r.active ? ` · next ${F.relativeDay(r.nextDate).toLowerCase()}` : ' · paused'}</div>
                </div>
                <div class="num bold amt" style={{ color: r.kind === 'income' ? 'var(--good)' : undefined }}>{(r.kind === 'income' ? '+' : '−') + F.money(r.amount, r.currency)}</div>
                <Switch on={r.active} onChange={v => attempt(() => save('recurring', { ...r, active: v }))} />
              </div>
            ))}
          </div>}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editRecurring()}><Icon name="plus" size={15} />Recurring</button>
    </>
  )
}

export function editRecurring(item?: Recurring, defaults: Partial<Recurring> = {}) {
  openForm(close => <RecurringForm item={item} defaults={defaults} close={close} />)
}

function RecurringForm({ item, defaults, close }: { item?: Recurring; defaults: Partial<Recurring>; close: () => void }) {
  const s = useApp()
  const base: Recurring = item ?? {
    id: newId(), kind: 'expense', amount: 0, currency: s.settings.currency, category: 'Subscriptions', method: 'Card', note: '',
    projectId: null, customerId: null, period: 'monthly', nextDate: F.today(), active: true, createdAt: Date.now(), ...defaults,
  }
  const [r, set] = useState(base)
  const [amount, setAmount] = useState(F.amountText(base.amount))
  const up = (p: Partial<Recurring>) => set({ ...r, ...p })
  const income = r.kind === 'income'
  const value = F.parseAmount(amount)
  const cats = income ? Categories.income : Categories.expense
  return (
    <Form title={item ? 'Edit recurring' : 'New recurring'} close={close} saveEnabled={value != null && value > 0}
      onSave={async () => { await save('recurring', { ...r, amount: value ?? 0, note: r.note.trim() }); close(); setTimeout(runRecurring, 300) }}
      onDelete={item ? () => { remove('recurring', item.id); close() } : undefined}>
      <Seg options={[{ label: 'Expense', icon: 'expense' }, { label: 'Income', icon: 'income' }]} value={income ? 1 : 0}
        onChange={i => up({ kind: i ? 'income' : 'expense', category: i ? 'Freelance' : 'Subscriptions' })} />
      <AmountBox value={amount} onInput={setAmount} currency={r.currency} onCurrency={c => up({ currency: c })} color={income ? 'var(--good)' : 'var(--fg)'} />
      <Field label={income ? 'What is it? (e.g. Monthly retainer)' : 'What is it? (e.g. Figma, Internet)'} value={r.note} onInput={v => up({ note: v })} autoFocus={!item} />
      <FieldLabel>How often</FieldLabel>
      <Chips wrap options={recurringPeriods.map(p => p.value)} value={r.period} onChange={v => up({ period: v })} label={v => recurringPeriod(v).label} />
      <DateField label="Next date" value={r.nextDate} onChange={v => up({ nextDate: v ?? F.today() })} clearable={false} />
      <Hint>Then {F.dateShort(nextOccurrence(r.nextDate, r.period))}, {F.dateShort(nextOccurrence(nextOccurrence(r.nextDate, r.period), r.period))}, …</Hint>
      <FieldLabel>Category</FieldLabel>
      <Chips options={cats.includes(r.category) ? cats : [...cats, r.category]} value={r.category} onChange={v => up({ category: v })} icon={categoryIcon} />
      <MoreOptions startOpen={!!base.projectId || !!base.customerId}>
        <FieldLabel>{income ? 'Received via' : 'Paid with'}</FieldLabel>
        <Chips options={Categories.methods} value={r.method} onChange={v => up({ method: v })} icon={methodIcon} />
        <ProjectPicker value={r.projectId} onChange={v => up({ projectId: v })} />
        <CustomerPicker value={r.customerId} onChange={v => up({ customerId: v })} />
      </MoreOptions>
    </Form>
  )
}
