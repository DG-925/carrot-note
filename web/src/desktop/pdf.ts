// Desktop PDFs: the same document description the phone turns into a PDF is laid out as an A4
// page and sent to the system print dialog, where "Save as PDF" (or a printer) can be chosen.

interface Col { title: string; weight?: number; align?: string }
type Block =
  | { type: 'columns'; left?: { label: string; lines: string[] }; right?: { label: string; lines: string[] } }
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'table'; columns: Col[]; rows: string[][]; muted?: number[] }
  | { type: 'totals'; rows: [string, string, boolean?][] }

export interface PdfDoc { file?: string; title: string; subtitle?: string; headerRight?: string[]; footer?: string; blocks: Block[] }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])

function block(b: Block): string {
  switch (b.type) {
    case 'columns': {
      const col = (c?: { label: string; lines: string[] }) => !c ? '<div></div>' :
        `<div><div class="lbl">${esc(c.label)}</div>${c.lines.map((l, i) => `<div class="${i ? 'sub' : 'main'}">${esc(l)}</div>`).join('')}</div>`
      return `<div class="cols">${col(b.left)}${col(b.right)}</div>`
    }
    case 'heading': return `<h2>${esc(b.text)}</h2>`
    case 'text': return `<p>${esc(b.text).replace(/\n/g, '<br>')}</p>`
    case 'table': {
      const total = b.columns.reduce((a, c) => a + (c.weight ?? 1), 0) || 1
      const head = b.columns.map(c => `<th style="width:${((c.weight ?? 1) / total) * 100}%;text-align:${c.align === 'right' ? 'end' : 'start'}">${esc(c.title)}</th>`).join('')
      const rows = b.rows.map((r, ri) => `<tr class="${b.muted?.includes(ri) ? 'muted' : ''}">${r.map((v, i) =>
        `<td style="text-align:${b.columns[i]?.align === 'right' ? 'end' : 'start'}">${esc(v)}</td>`).join('')}</tr>`).join('')
      return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
    }
    case 'totals':
      return `<div class="totals">${b.rows.map(([l, v, strong]) => `<div class="${strong ? 'strong' : ''}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>`
  }
}

export function pdfHtml(doc: PdfDoc): string {
  const rtl = document.documentElement.dir === 'rtl'
  return `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(doc.file || doc.title)}</title><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 13px/1.45 "Segoe UI", system-ui, sans-serif; color: #1c1a18; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
header { background: #ff6b1f; color: #fff; padding: 34px 44px 26px; display: flex; justify-content: space-between; gap: 20px; }
header h1 { margin: 0; font-size: 30px; letter-spacing: .02em; }
header .sub { opacity: .92; margin-top: 4px; }
header .right { text-align: end; } header .right div:first-child { font-weight: 700; font-size: 15px; }
main { padding: 28px 44px 70px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 22px; }
.lbl { font-size: 10px; font-weight: 700; color: #78706a; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
.main { font-weight: 700; font-size: 14px; } .sub { color: #78706a; }
h2 { font-size: 15px; margin: 22px 0 8px; }
p { color: #5c554f; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
th { background: #faf4ee; font-size: 10px; color: #78706a; text-transform: uppercase; letter-spacing: .05em; padding: 8px; }
td { padding: 9px 8px; border-bottom: 1px solid #ece4dc; }
td:first-child { font-weight: 600; } tr.muted td { color: #78706a; font-weight: 400; }
.totals { margin-inline-start: auto; width: 46%; background: #faf5f0; border-radius: 10px; padding: 12px 16px; }
.totals div { display: flex; justify-content: space-between; padding: 4px 0; color: #78706a; }
.totals div b { color: #1c1a18; font-weight: 600; }
.totals .strong { color: #1c1a18; font-weight: 700; font-size: 15px; border-top: 1px dashed #e0d6cc; margin-top: 4px; padding-top: 8px; }
.totals .strong b { color: #ff6b1f; font-size: 17px; }
footer { position: fixed; bottom: 22px; left: 44px; right: 44px; color: #78706a; font-size: 10.5px; }
</style></head><body>
<header><div><h1>${esc(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ''}</div>
<div class="right">${(doc.headerRight ?? []).map(l => `<div>${esc(l)}</div>`).join('')}</div></header>
<main>${doc.blocks.map(block).join('')}</main>
${doc.footer ? `<footer>${esc(doc.footer)}</footer>` : ''}
</body></html>`
}

/** Opens the print dialog for [doc]; choose "Save as PDF" to get a file. */
export function printPdf(doc: PdfDoc) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  const w = frame.contentWindow!
  w.document.open()
  w.document.write(pdfHtml(doc))
  w.document.close()
  setTimeout(() => {
    w.focus()
    w.print()
    setTimeout(() => frame.remove(), 1000)
  }, 250)
}
