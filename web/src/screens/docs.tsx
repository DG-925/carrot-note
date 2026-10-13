// Contracts & files: signed contracts, ID copies, agreements and warranties, kept as photos of their
// pages and linked to a client, project or supplier. An end date adds a reminder to the calendar.

import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { CustomerPicker, ProjectPicker, viewPhoto } from '../editors'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { byId, getState, remove, save, useApp } from '../store'
import { newId, type DocFile } from '../types'
import { Btn, Card, Chips, DateField, Empty, Field, FieldLabel, Form, Hint, PageHeader, Round, SearchBar, attempt, cx, matches, openForm } from '../ui'
import { SupplierPicker } from './suppliers'

export const docKinds: { value: string; label: string; icon: string }[] = [
  { value: 'contract', label: 'Contract', icon: 'pen' },
  { value: 'agreement', label: 'Agreement', icon: 'checkSquare' },
  { value: 'id', label: 'ID copy', icon: 'user' },
  { value: 'warranty', label: 'Warranty', icon: 'checkCircle' },
  { value: 'other', label: 'Other', icon: 'note' },
]
const kindOf = (k: string) => docKinds.find(x => x.value === k) ?? docKinds[docKinds.length - 1]
const daysLeft = (d: DocFile) => (d.endDate == null ? null : d.endDate - F.today())

const photoCache = new Map<string, string>()
function usePhotos(ids: string[]) {
  const [srcs, setSrcs] = useState<Record<string, string>>(() => Object.fromEntries(ids.filter(i => photoCache.has(i)).map(i => [i, photoCache.get(i)!])))
  useEffect(() => {
    let live = true
    for (const id of ids) {
      if (photoCache.has(id)) continue
      call<{ data?: string } | null>('receipt.get', { id }).then(r => {
        if (!r?.data || !live) return
        photoCache.set(id, r.data)
        setSrcs(prev => ({ ...prev, [id]: r.data! }))
      }).catch(() => {})
    }
    return () => { live = false }
  }, [ids.join(',')])
  return srcs
}

function linkLine(d: DocFile) {
  return [byId('customer', d.customerId)?.name, byId('project', d.projectId)?.name, byId('supplier', d.supplierId)?.name].filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------- list

let savedKind = 'all'

export function DocsScreen() {
  const s = useApp()
  const [query, setQuery] = useState('')
  const [kind, setKindState] = useState(savedKind)
  const setKind = (k: string) => { savedKind = k; setKindState(k) }
  const all = s.data.doc
  const ending = all.filter(d => { const n = daysLeft(d); return n != null && n >= 0 && n <= 30 }).sort((a, b) => a.endDate! - b.endDate!)
  const shown = all.filter(d => (kind === 'all' || d.kind === kind) && matches(query, d.title, d.note, linkLine(d)))
    .sort((a, b) => b.createdAt - a.createdAt)
  return (
    <>
      <div class="scroll">
        <PageHeader title="Contracts & files" onBack={popNav}><Round icon="plus" label="New file" onClick={() => editDoc()} /></PageHeader>
        <div class="content no-tabbar">
          {ending.length > 0 && <Card i={1}>
            <div class="row" style={{ marginBottom: 6 }}><Icon name="warning" size={16} class="warn" /><h3 class="h-sm grow">Ending soon</h3></div>
            {ending.map(d => (
              <div key={d.id} class="row press" style={{ padding: '6px 0' }} onClick={() => push({ name: 'doc', id: d.id })}>
                <span class="grow semibold ellipsis">{d.title}</span><b class="warn">{daysLeft(d) === 0 ? 'Today' : F.plural(daysLeft(d)!, 'day')}</b>
              </div>
            ))}
          </Card>}
          {all.length > 0 && <SearchBar i={2} value={query} onInput={setQuery} placeholder="Search title, client, project…" />}
          {all.length > 0 && <div class="pop" style={{ '--i': 2 } as any}>
            <Chips options={['all', ...docKinds.map(k => k.value)]} value={kind} onChange={setKind}
              label={v => (v === 'all' ? 'All' : kindOf(v).label)} icon={v => (v === 'all' ? 'list' : kindOf(v).icon)} />
          </div>}
          {!all.length && <Empty icon="pen" title="No files yet" text="Keep signed contracts, ID copies and agreements here: take a photo of each page and link it to the client or project. Get a reminder before a contract ends.">
            <Btn icon="camera" onClick={() => editDoc()}>Add a file</Btn>
          </Empty>}
          {shown.map((d, i) => <DocCard key={d.id} d={d} i={Math.min(i, 8) + 3} />)}
        </div>
      </div>
      <button class="add-fab low" onClick={() => editDoc()}><Icon name="plus" size={15} />File</button>
    </>
  )
}

export function DocCard({ d, i }: { d: DocFile; i?: number }) {
  const srcs = usePhotos(d.photoIds.slice(0, 1))
  const first = srcs[d.photoIds[0]]
  const n = daysLeft(d)
  return (
    <div class={'card press row' + (i != null ? ' pop' : '')} style={i != null ? ({ '--i': i } as any) : undefined} onClick={() => push({ name: 'doc', id: d.id })}>
      {first ? <img class="stock-thumb" src={first} alt="" style={{ width: 52, height: 52 }} /> : <span class="stock-thumb t-lilac" style={{ width: 52, height: 52 }}><Icon name={kindOf(d.kind).icon} size={20} /></span>}
      <div class="grow" style={{ minWidth: 0 }}>
        <div class="h-sm ellipsis">{d.title}</div>
        <div class="small muted ellipsis">{[kindOf(d.kind).label, linkLine(d)].filter(Boolean).join(' · ')}</div>
      </div>
      {n != null && <div style={{ textAlign: 'end' }}>
        <div class="tiny muted semibold">{n < 0 ? 'Ended' : 'Ends in'}</div>
        <b class={cx('num', n < 0 ? 'bad' : n <= 30 ? 'warn' : 'good')}>{n < 0 ? F.dateShort(d.endDate!) : F.plural(n, 'day')}</b>
      </div>}
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function DocDetail({ id }: { id: string }) {
  const s = useApp()
  const d = s.data.doc.find(x => x.id === id)
  const srcs = usePhotos(d?.photoIds ?? [])
  if (!d) return <div class="scroll"><PageHeader title="File" onBack={popNav} /><Empty icon="pen" title="This file is gone" text="It was deleted."><Btn onClick={popNav}>Go back</Btn></Empty></div>
  const customer = byId('customer', d.customerId), project = byId('project', d.projectId), supplier = byId('supplier', d.supplierId)
  const n = daysLeft(d)
  return (
    <div class="scroll">
      <PageHeader title={d.title} onBack={popNav}><Round icon="edit" label="Edit" onClick={() => editDoc(d)} /></PageHeader>
      <div class="content no-tabbar">
        <Card i={1} class="wide">
          <div class="info-rows">
            <div><span>Type</span><b>{kindOf(d.kind).label}</b></div>
            {customer && <div onClick={() => push({ name: 'customer', id: customer.id })}><span>Client</span><b>{customer.name}</b><Icon name="right" size={12} class="muted" /></div>}
            {project && <div onClick={() => push({ name: 'project', id: project.id })}><span>Project</span><b>{project.name}</b><Icon name="right" size={12} class="muted" /></div>}
            {supplier && <div onClick={() => push({ name: 'supplier', id: supplier.id })}><span>Supplier</span><b>{supplier.name}</b><Icon name="right" size={12} class="muted" /></div>}
            {d.startDate != null && <div><span>Starts</span><b>{F.date(d.startDate)}</b></div>}
            {d.endDate != null && <div><span>Ends</span><b class={n != null && n < 0 ? 'bad' : ''}>{F.date(d.endDate)}{n != null ? ` · ${n < 0 ? 'ended' : F.plural(n, 'day') + ' left'}` : ''}</b></div>}
          </div>
        </Card>
        {d.note && <div class="card wide" style={{ whiteSpace: 'pre-wrap' }}>{d.note}</div>}
        <div class="section-h"><h3>Pages</h3><button class="link" onClick={() => addPage(d)}>+ Add</button></div>
        {!d.photoIds.length && <Hint>No pages yet. Take a photo of each page.</Hint>}
        <div class="doc-pages">
          {d.photoIds.map((pid, i) => srcs[pid]
            ? <img key={pid} src={srcs[pid]} alt={`Page ${i + 1}`} onClick={() => viewPhoto(srcs[pid])} />
            : <div key={pid} class="doc-page-loading"><span class="spinner" /></div>)}
        </div>
      </div>
    </div>
  )
}

async function addPage(d: DocFile) {
  const r = await attempt(() => call<string | null>('receipt.capture', { source: 'camera' }))
  if (!r) return
  const pid = newId()
  photoCache.set(pid, r)
  await attempt(async () => {
    await save('receipt' as any, { id: pid, docId: d.id, data: r, createdAt: Date.now() } as any)
    const latest = byId('doc', d.id) ?? d
    await save('doc', { ...latest, photoIds: [...latest.photoIds, pid] })
  })
}

// ---------------------------------------------------------------- form

export function editDoc(item?: DocFile, defaults: Partial<DocFile> = {}) {
  openForm(close => <DocForm item={item} defaults={defaults} close={close} />)
}

function DocForm({ item, defaults, close }: { item?: DocFile; defaults: Partial<DocFile>; close: () => void }) {
  const base: DocFile = item ?? {
    id: newId(), title: '', kind: 'contract', customerId: null, projectId: null, supplierId: null, startDate: F.today(), endDate: null, remindDays: 14,
    photoIds: [], note: '', eventId: null, createdAt: Date.now(), ...defaults,
  }
  const [d, set] = useState(base)
  const [added, setAdded] = useState<{ id: string; data: string }[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const up = (p: Partial<DocFile>) => set({ ...d, ...p })
  const old = usePhotos(base.photoIds)
  const add = async (source: string) => {
    const r = await attempt(() => call<string | null>('receipt.capture', { source }))
    if (r) setAdded(prev => [...prev, { id: newId(), data: r }])
  }
  const pages = [...base.photoIds.filter(x => !removed.includes(x)).map(id => ({ id, data: old[id] })), ...added]
  return (
    <Form title={item ? 'Edit file' : 'New file'} close={close} saveEnabled={!!d.title.trim()}
      onSave={async () => {
        for (const p of added) {
          photoCache.set(p.id, p.data)
          await save('receipt' as any, { id: p.id, docId: d.id, data: p.data, createdAt: Date.now() } as any)
        }
        for (const id of removed) remove('receipt' as any, id)
        // A reminder in the calendar before it ends.
        let eventId = d.eventId ?? null
        const st = getState()
        if (d.endDate != null) {
          eventId = eventId ?? newId()
          const existing = st.data.event.find(e => e.id === eventId)
          await save('event', {
            ...(existing ?? { createdAt: Date.now(), done: false }), id: eventId, title: `${d.title.trim()} ends ${F.dateShort(d.endDate)}`,
            date: Math.max(F.today(), d.endDate - d.remindDays), time: null, note: `${kindOf(d.kind).label} ends on ${F.date(d.endDate)}.`, reminder: true,
            projectId: d.projectId ?? null, customerId: d.customerId ?? null,
          } as any)
        } else if (eventId) {
          if (st.data.event.some(e => e.id === eventId)) remove('event', eventId)
          eventId = null
        }
        await save('doc', { ...d, title: d.title.trim(), note: d.note.trim(), photoIds: pages.map(p => p.id), eventId })
        close()
        if (!item) push({ name: 'doc', id: d.id })
      }}
      onDelete={item ? () => {
        remove('doc', item.id)
        if (item.eventId && byId('event', item.eventId)) remove('event', item.eventId)
        close(); popNav()
      } : undefined}>
      <Chips wrap options={docKinds.map(k => k.value)} value={d.kind} onChange={v => up({ kind: v })} label={v => kindOf(v).label} icon={v => kindOf(v).icon} />
      <Field label="Title" value={d.title} placeholder="e.g. CarrotPOS contract · Cafe Roma" onInput={v => up({ title: v })} autoFocus={!item} />
      <FieldLabel>Pages</FieldLabel>
      <div class="doc-pages small">
        {pages.map((p, i) => (
          <div key={p.id} class="doc-page-edit">
            {p.data ? <img src={p.data} alt={`Page ${i + 1}`} /> : <div class="doc-page-loading"><span class="spinner" /></div>}
            <Round icon="close" sm label="Remove page" onClick={() => {
              if (added.some(a => a.id === p.id)) setAdded(added.filter(a => a.id !== p.id))
              else setRemoved([...removed, p.id])
            }} />
          </div>
        ))}
      </div>
      <div class="row">
        <Btn kind="soft" sm icon="camera" onClick={() => add('camera')}>Take photo</Btn>
        <Btn kind="soft" sm icon="image" onClick={() => add('gallery')}>From gallery</Btn>
      </div>
      <CustomerPicker value={d.customerId} onChange={v => up({ customerId: v })} none="No client" />
      <ProjectPicker value={d.projectId} onChange={v => up({ projectId: v })} none="No project" />
      <SupplierPicker value={d.supplierId} onChange={v => up({ supplierId: v })} />
      <DateField label="Starts (optional)" value={d.startDate} onChange={v => up({ startDate: v })} />
      <DateField label="Ends (optional)" value={d.endDate} onChange={v => up({ endDate: v })} />
      {d.endDate != null && <>
        <FieldLabel>Remind me before it ends</FieldLabel>
        <Chips options={['3', '7', '14', '30', '60']} value={String(d.remindDays)} onChange={v => up({ remindDays: Number(v) })} label={v => `${v} days before`} />
      </>}
      <Field label="Notes" multiline value={d.note} onInput={v => up({ note: v })} />
    </Form>
  )
}
