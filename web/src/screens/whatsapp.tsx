// WhatsApp (PC app only): WhatsApp Web shown right here. The first time, scan the QR code with
// WhatsApp on your phone (Settings → Linked devices → Link a device); after that it stays logged in.

import { useEffect, useRef, useState } from 'preact/hooks'
import { call } from '../bridge'
import { Icon } from '../icons'
import { getNav, onNav, pop as popNav } from '../nav'
import { Btn, PageHeader, Round, toast } from '../ui'

export const hasWhatsApp = () => document.documentElement.classList.contains('desktop')

export function WhatsAppScreen() {
  const frame = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let last = ''
    const bounds = () => {
      const r = frame.current?.getBoundingClientRect()
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
    }
    // Sheets, menus and dialogs of the app must not end up under WhatsApp: step aside while one is open.
    const covered = () => getNav().overlays.length > 0 || getNav().drawer
    const place = () => {
      if (!alive) return
      const b = bounds()
      if (!b || covered() || b.w < 50 || b.h < 50) { last = ''; call('whatsapp.hide').catch(() => {}); return }
      const key = `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`
      if (key === last) return
      last = key
      call('whatsapp.show', b).then(() => setError(null)).catch(e => { last = ''; setError(String((e as Error)?.message ?? e)) })
    }
    // Wait for the page's slide-in to finish, then follow resizes.
    const timers = [120, 380, 700].map(ms => setTimeout(place, ms))
    const ro = new ResizeObserver(place)
    if (frame.current) ro.observe(frame.current)
    window.addEventListener('resize', place)
    const off = onNav(() => setTimeout(place, 30))
    return () => {
      alive = false
      timers.forEach(clearTimeout)
      ro.disconnect()
      window.removeEventListener('resize', place)
      off()
      call('whatsapp.hide').catch(() => {})
    }
  }, [])

  const bounds = () => {
    const r = frame.current!.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }
  return (
    <div class="wa-page">
      <PageHeader title="WhatsApp" onBack={popNav}>
        <Round icon="sync" label="Reload WhatsApp" onClick={() => call('whatsapp.reload', bounds()).catch(e => toast(String(e?.message ?? e)))} />
        <Round icon="open" label="Open in its own window" onClick={() => call('whatsapp.window').catch(e => toast(String(e?.message ?? e)))} />
      </PageHeader>
      <div class="wa-frame" ref={frame}>
        <div class="wa-help">
          <span class="wa-logo"><Icon name="whatsapp" size={30} /></span>
          <div class="h-md">{error ? "WhatsApp didn't open here" : 'Opening WhatsApp…'}</div>
          {error ? <p class="muted small">{error}</p> : <>
            <p class="muted">The first time, link it to your phone:</p>
            <ol class="wa-steps">
              <li>Open WhatsApp on your phone</li>
              <li>Tap Settings (or ⋮), then Linked devices, then Link a device</li>
              <li>Point your phone at the QR code here</li>
            </ol>
            <p class="muted small">After that it stays logged in. Your chats stay in WhatsApp; Carrot Note can't read them.</p>
          </>}
          {error && <Btn icon="open" onClick={() => call('whatsapp.window').catch(e => toast(String(e?.message ?? e)))}>Open WhatsApp in its own window</Btn>}
        </div>
      </div>
    </div>
  )
}
