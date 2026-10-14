// Code 128 barcodes for stock labels: any code a USB or phone scanner reads back as typed text.
// The result is the bar pattern as a string of modules ("1" black, "0" white), with quiet zones,
// which both the phone and the PC draw into the PDF.

// Bar/space widths of the 107 symbols (value 0–105 plus the stop symbol).
const PATTERNS = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 ' +
  '232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 ' +
  '313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 ' +
  '111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 ' +
  '114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'
).split(' ')

const START_B = 104
const START_C = 105
const STOP = 106

/** Turns a symbol's widths into modules: bar, space, bar, space… */
const modules = (widths: string) => [...widths].map((w, i) => (i % 2 ? '0' : '1').repeat(Number(w))).join('')

/** Codes the scanner can read: printable ASCII only. */
export const validCode = (text: string) => /^[\x20-\x7e]{1,40}$/.test(text)

/** The bar pattern for [text] (Code 128, set C for even-length numbers, set B otherwise). */
export function code128(text: string): string {
  if (!validCode(text)) throw new Error('Codes can use letters, numbers and symbols only')
  const numeric = /^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4
  const values = numeric
    ? [START_C, ...Array.from({ length: text.length / 2 }, (_, i) => Number(text.slice(i * 2, i * 2 + 2)))]
    : [START_B, ...[...text].map(c => c.charCodeAt(0) - 32)]
  const check = values.reduce((sum, v, i) => sum + v * Math.max(1, i), 0) % 103
  const quiet = '0'.repeat(10)
  return quiet + [...values, check].map(v => modules(PATTERNS[v])).join('') + modules(PATTERNS[STOP]) + quiet
}

/** A new code for an item that has none: "CN" and 8 digits. */
export const newCode = () => 'CN' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
