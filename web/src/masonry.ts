// Desktop: the cards in each `.content` grid pack like a wall of bricks. The grid has 8px rows and
// every child spans as many rows as it is tall, so a short card no longer leaves a gap under it.

const ROW = 8
const GAP = 18

export function startMasonry(root: HTMLElement) {
  const ro = new ResizeObserver(entries => { for (const e of entries) fit(e.target as HTMLElement) })
  const fit = (el: HTMLElement) => {
    const span = `span ${Math.max(1, Math.ceil((el.offsetHeight + GAP) / ROW))}`
    if (el.style.gridRowEnd !== span) el.style.gridRowEnd = span
  }
  const watch = (el: Element) => {
    if (el.parentElement?.classList.contains('content')) ro.observe(el)
    el.querySelectorAll('.content > *').forEach(c => ro.observe(c))
  }
  const forget = (el: Element) => {
    ro.unobserve(el)
    el.querySelectorAll('.content > *').forEach(c => ro.unobserve(c))
  }
  new MutationObserver(list => {
    for (const m of list) {
      m.addedNodes.forEach(n => n instanceof Element && watch(n))
      m.removedNodes.forEach(n => n instanceof Element && forget(n))
    }
  }).observe(root, { childList: true, subtree: true })
  watch(root)
}
