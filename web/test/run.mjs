import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Bundles the modules under test, then runs the cases. Run with: npm test
const dir = mkdtempSync(join(tmpdir(), 'carrot-test-'))
await build({ entryPoints: ['src/smart.ts', 'src/barcode.ts'], outdir: dir, format: 'esm', bundle: true, outExtension: { '.js': '.mjs' }, logLevel: 'error' })
const { parseSmart } = await import(join(dir, 'smart.mjs'))
const { code128 } = await import(join(dir, 'barcode.mjs'))
const today = 20740 // a Wednesday (epoch day 20740 = 2026-10-14)
const ctx = { today, currency: 'EGP', customers: [{ id: 'c1', name: 'Nour Bakery' }, { id: 'c2', name: 'Karim Adel' }, { id: 'c3', name: 'Lina Hassan' }], projects: [{ id: 'p4', name: 'CarrotPOS' }, { id: 'p1', name: 'Bakery POS app', customerId: 'c1' }] }
const cases = [
  ['spent 200 on lunch', { kind: 'expense', amount: 200, category: 'Food', title: 'lunch' }],
  ['paid 750 for figma', { kind: 'expense', amount: 750, category: 'Subscriptions', title: 'figma' }],
  ['uber 95', { kind: 'expense', amount: 95, category: 'Transport', title: 'uber' }],
  ['bought a mouse 450 cash', { kind: 'expense', amount: 450, category: 'Equipment', method: 'Cash', title: 'mouse' }],
  ['Karim paid 1500 for the POS', { kind: 'income', amount: 1500, customerId: 'c2', person: 'Karim' }],
  ['got 3000 from Nour Bakery via instapay', { kind: 'income', amount: 3000, customerId: 'c1', method: 'InstaPay', category: 'Project payment', title: 'Nour Bakery' }],
  ['1.5k from Lina for the logo', { kind: 'income', amount: 1500, customerId: 'c3' }],
  ['received $250 for CarrotPOS', { kind: 'income', amount: 250, currency: 'USD', projectId: 'p4' }],
  ['salary 18,000', { kind: 'income', amount: 18000, category: 'Salary' }],
  ['coffee 45 yesterday', { kind: 'expense', amount: 45, category: 'Food', date: today - 1 }],
  ['remind me to send the invoice tomorrow', { kind: 'task', date: today + 1, title: 'send the invoice' }],
  ['call Lina tomorrow at 5', { kind: 'event', date: today + 1, time: 17 * 60, customerId: 'c3' }],
  ['meeting with Nour Bakery on monday at 11am', { kind: 'event', date: today + 5, time: 11 * 60, customerId: 'c1' }],
  ['note: client wants dark mode', { kind: 'note', title: 'client wants dark mode' }],
  ['fix the login bug', { kind: 'task', title: 'fix the login bug' }],
  ['dinner 320 on friday', { kind: 'expense', amount: 320, date: today - 5 }],
  ['صرفت ٢٠٠ على الغدا', { kind: 'expense', amount: 200, category: 'Food', title: 'الغدا' }],
  ['كريم دفع ١٥٠٠ للكاشير', { kind: 'income', amount: 1500, person: 'كريم' }],
  ['استلمت ٥٠٠٠ من نور بالانستاباي', { kind: 'income', amount: 5000, method: 'InstaPay' }],
  ['تاكسي ٨٠ جنيه', { kind: 'expense', amount: 80, category: 'Transport', currency: 'EGP' }],
  ['اشتريت شاحن ٣٥٠ كاش', { kind: 'expense', amount: 350, category: 'Equipment', method: 'Cash', title: 'شاحن' }],
  ['فكرني اكلم كريم بكرة الساعة ٥', { kind: 'task', date: today + 1, time: 17 * 60 }],
  ['اجتماع مع نور يوم الخميس الساعه ١١ الصبح', { kind: 'event', date: today + 1, time: 11 * 60 }],
  ['دفعت ١٠٠ دولار سيرفر', { kind: 'expense', amount: 100, currency: 'USD', category: 'Hosting & domains' }],
  ['جالي الفين من العميل', { kind: 'income', amount: 2000 }],
  ['ملاحظة العميل عايز لون اغمق', { kind: 'note' }],
]
let pass = 0, fail = 0
for (const [text, want] of cases) {
  const got = parseSmart(text, ctx)
  const bad = Object.entries(want).filter(([k, v]) => got[k] !== v)
  if (bad.length) { fail++; console.log('FAIL', JSON.stringify(text), bad.map(([k, v]) => `${k}: want ${JSON.stringify(v)} got ${JSON.stringify(got[k])}`).join('; '), '| title:', JSON.stringify(got.title)) }
  else { pass++; console.log('pass', text, '→', got.kind, got.amount ?? '', got.category ?? '', '|', got.title) }
}


// Code 128: patterns produced by JsBarcode 3.11.6 for a letters code and a numbers code.
const strip = s => s.replace(/^0+|0+$/g, '')
const known = {
  'CN12345678': '1101001000010001000110101110001101001110011011001110010110010111001100100111011011100100110011101001110110111011101001100110110011001100011101011',
  '12345678': '1101001110010110011100100010110001110001011011000010100100011101101100011101011',
}
for (const [code, bars] of Object.entries(known)) {
  if (strip(code128(code)) === bars) { pass++; console.log('pass barcode', code) } else { fail++; console.log('FAIL barcode', code) }
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
