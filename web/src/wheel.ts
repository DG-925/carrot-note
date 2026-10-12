// Desktop: a mouse wheel only scrolls up and down, so rows that scroll sideways (chips, the task
// board) move left and right when the wheel turns over them, and can be dragged with the mouse.

const sideways = (el: Element | null): HTMLElement | null => {
  for (let e = el as HTMLElement | null; e && e !== document.body; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowX)) return e
  }
  return null
}

export function startWheelScroll() {
  addEventListener('wheel', e => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    const row = sideways(e.target as Element)
    if (!row) return
    const max = row.scrollWidth - row.clientWidth
    const rtl = getComputedStyle(row).direction === 'rtl'
    const at = rtl ? -row.scrollLeft : row.scrollLeft
    // At either end the page scrolls as usual.
    if ((e.deltaY > 0 && at >= max - 1) || (e.deltaY < 0 && at <= 0)) return
    e.preventDefault()
    row.scrollBy({ left: (rtl ? -1 : 1) * e.deltaY })
  }, { passive: false })

  let drag: { row: HTMLElement; x: number; left: number; moved: boolean } | null = null
  addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const row = sideways(e.target as Element)
    if (row && !(e.target as Element).closest('input, textarea, select')) drag = { row, x: e.clientX, left: row.scrollLeft, moved: false }
  })
  addEventListener('pointermove', e => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (Math.abs(dx) > 4) drag.moved = true
    if (drag.moved) drag.row.scrollLeft = drag.left - dx
  })
  addEventListener('pointerup', () => {
    // A drag shouldn't also pick the chip it ended on.
    if (drag?.moved) addEventListener('click', e => { e.stopPropagation(); e.preventDefault() }, { capture: true, once: true })
    drag = null
  })
}
