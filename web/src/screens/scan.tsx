// Barcodes for stock: scan with the phone camera (or a USB scanner on the PC, which types the code
// and presses Enter) to find, sell or buy an item, and print price labels with barcodes.

import { useEffect, useRef, useState } from 'preact/hooks'
import { call } from '../bridge'
import { code128, newCode, validCode } from '../barcode'
import * as F from '../format'
import { Icon } from '../icons'
import { push } from '../nav'
import { getState, save } from '../store'
import type { StockItem } from '../types'
import { Btn, Hint, SheetTitle, attempt, cx, openSheet, toast } from '../ui'
import { editItem, moveItem, stockOf } from './stock'

const isDesktop = () => document.documentElement.classList.contains('desktop')

/** Finds the item with this code (its serial / code field). */
export const itemByCode = (code: string) => {
  const c = code.trim().toLowerCase()
  return getState().data.item.find(i => !i.archived && i.sku.trim().toLowerCase() === c)
}

/** Reads a code: the camera on the phone; on the PC (or if the camera can't) a box a USB scanner types into. */
export async function readCode(prompt = 'Point the camera at the barcode'): Promise<string | null> {
  if (!isDesktop()) {
    try {
      const code = await call<string | null>('barcode.scan', { prompt })
      return code?.trim() || null
    } catch { /* no camera: type it */ }
  }
  return new Promise(resolve => {
    let done = false
    const finish = (v: string | null) => { if (!done) { done = true; resolve(v) } }
    openSheet(close => <CodeSheet done={finish} close={close} />)
  })
}

function CodeSheet({ done, close: shut }: { done: (v: string | null) => void; close: () => void }) {
  const [code, setCode] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  // Closing the sheet any other way means "no code".
  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); return () => done(null) }, [])
  const close = (v: string | null) => { done(v); shut() }
  return (
    <>
      <SheetTitle title="Scan a code" sub={isDesktop() ? 'Scan with a USB barcode scanner, or type the code.' : 'Type the code from the label.'} />
      <div class="body">
        <div class="field with-icon"><Icon name="barcode" size={18} />
          <input ref={ref} value={code} placeholder="Code" autoComplete="off" onInput={e => setCode((e.target as HTMLInputElement).value)}
            onKeyDown={e => { if (e.key === 'Enter' && code.trim()) close(code.trim()) }} /></div>
        <Btn block disabled={!code.trim()} onClick={() => close(code.trim())}>Find</Btn>
      </div>
    </>
  )
}

/** Scan → the item and what to do with it, or make a new item with that code. */
export async function scanStock() {
  const code = await readCode('Scan an item to sell, buy or open it')
  if (code) showScanned(code)
}

export function showScanned(code: string) {
  const it = itemByCode(code)
  openSheet(close => it ? <FoundSheet it={it} close={close} /> : (
    <>
      <SheetTitle title="No item with this code" sub={code} />
      <div class="body">
        <Hint>Add it to your stock with this code, so scanning it finds it next time.</Hint>
        <Btn block icon="plus" onClick={() => { close(); setTimeout(() => editItem(undefined, { sku: code }), 150) }}>New item with this code</Btn>
      </div>
    </>
  ))
}

function FoundSheet({ it, close }: { it: StockItem; close: () => void }) {
  const st = stockOf(it)
  const go = (f: () => void) => { close(); setTimeout(f, 150) }
  return (
    <>
      <SheetTitle title={it.name} sub={`${it.sku} · ${st.qty} in stock · ${F.money(it.sellPrice, it.currency)}`} />
      <div class="body">
        <div class="grid2">
          <Btn icon="tag" disabled={st.qty <= 0} onClick={() => go(() => moveItem(it, 'sell'))}>Sell</Btn>
          <Btn kind="soft-bg" icon="plus" onClick={() => go(() => moveItem(it, 'buy'))}>Buy more</Btn>
        </div>
        <Btn block kind="ghost" icon="open" onClick={() => go(() => push({ name: 'item', id: it.id }))}>Open item</Btn>
      </div>
    </>
  )
}

/** On the PC: a USB scanner types fast and ends with Enter; catch that while no box has the focus. */
export function useUsbScanner(onCode: (code: string) => void) {
  useEffect(() => {
    let buf = ''
    let last = 0
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const now = performance.now()
      if (now - last > 60) buf = ''
      last = now
      if (e.key === 'Enter') { if (buf.length >= 4) { e.preventDefault(); onCode(buf) } buf = ''; return }
      if (e.key.length === 1) buf += e.key
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

// ---------------------------------------------------------------- labels

export function printLabels() {
  openSheet(close => <LabelsSheet close={close} />)
}

function LabelsSheet({ close }: { close: () => void }) {
  const items = getState().data.item.filter(i => !i.archived).sort((a, b) => a.name.localeCompare(b.name))
  const [copies, setCopies] = useState<Record<string, number>>(() => Object.fromEntries(items.map(i => [i.id, Math.min(30, Math.max(0, stockOf(i).qty))])))
  const total = Object.values(copies).reduce((a, b) => a + b, 0)
  const set = (id: string, n: number) => setCopies({ ...copies, [id]: Math.max(0, Math.min(99, n)) })
  const make = async () => {
    await attempt(async () => {
      const labels: { name: string; price: string; code: string; bars: string }[] = []
      for (const it0 of items) {
        const n = copies[it0.id] ?? 0
        if (!n) continue
        let it = it0
        // Items without a usable code get one, saved so scanning finds them.
        if (!validCode(it.sku.trim())) { it = { ...it, sku: newCode() }; await save('item', it) }
        const bars = code128(it.sku.trim())
        for (let k = 0; k < n; k++) labels.push({ name: it.name, price: F.money(it.sellPrice, it.currency), code: it.sku.trim(), bars })
      }
      const u = getState().user
      await call('pdf.share', {
        doc: {
          file: 'price-labels', title: 'PRICE LABELS', subtitle: `${labels.length} labels · ${F.date(F.today())}`,
          headerRight: [u?.name || (u ? '@' + u.username : '')].filter(Boolean), footer: 'Made with Carrot Note',
          blocks: [{ type: 'labels', labels }],
        },
      })
    })
    close()
  }
  return (
    <>
      <SheetTitle title="Price labels" sub="Name, price and barcode. Print them and stick them on your items." />
      <div class="body">
        {!items.length && <Hint>Add stock items first.</Hint>}
        <div class="card flush in-card">
          {items.map(it => (
            <div key={it.id} class="item">
              <div class="main"><div class="t">{it.name}</div><div class="s">{it.sku || 'A code is made for it'} · {F.money(it.sellPrice, it.currency)}</div></div>
              <div class="stepper">
                <button aria-label="Fewer" onClick={() => set(it.id, (copies[it.id] ?? 0) - 1)}><Icon name="minus" size={14} /></button>
                <b class={cx('num', !copies[it.id] && 'muted')}>{copies[it.id] ?? 0}</b>
                <button aria-label="More" onClick={() => set(it.id, (copies[it.id] ?? 0) + 1)}><Icon name="plus" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <Btn block icon="barcode" disabled={!total} onClick={make}>{total ? `Make ${total} labels` : 'Pick how many'}</Btn>
        <Hint>One label for each piece in stock to start with. Change the numbers if you like.</Hint>
      </div>
    </>
  )
}

/** Mark that a code was scanned into a form field. */
export async function scanInto(set: (code: string) => void) {
  const code = await readCode('Scan the code on the item')
  if (code) { set(code); toast('Code added') }
}
