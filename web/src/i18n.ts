// Interface language. In Arabic the page is laid out right to left and the English text on
// screen is swapped for Arabic as it appears (exact phrases first, then patterns for text with
// numbers or names in it). User content rarely matches a phrase, so it's left alone.

import ar from './i18n-ar'

export type Lang = 'en' | 'ar'

export function currentLang(): Lang {
  try {
    const p = JSON.parse(localStorage.getItem('carrot.prefs') ?? '{}')
    if (p.lang === 'ar' || p.lang === 'en') return p.lang
  } catch { /* storage blocked */ }
  return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

/** Locale for dates and times: Arabic month names with Western digits, or the phone's own. */
export const dateLocale = () => (currentLang() === 'ar' ? 'ar-EG-u-nu-latn' : undefined)

const words: Record<string, [string, string]> = {
  note: ['ملاحظة', 'ملاحظات'], task: ['مهمة', 'مهام'], event: ['موعد', 'مواعيد'], day: ['يوم', 'أيام'], goal: ['هدف', 'أهداف'],
  member: ['عضو', 'أعضاء'], result: ['نتيجة', 'نتائج'], round: ['جولة', 'جولات'], birthday: ['عيد ميلاد', 'أعياد ميلاد'],
  'active rental': ['إيجار نشط', 'إيجارات نشطة'], 'focus round': ['جولة تركيز', 'جولات تركيز'], item: ['عنصر', 'عناصر'], step: ['خطوة', 'خطوات'],
}
const count = (n: number, w: string) => {
  const forms = words[w]
  if (!forms) return null
  return `${n} ${n === 1 || n > 10 ? forms[0] : forms[1]}`
}
const periods: Record<string, string> = { month: 'شهر', year: 'سنة', week: 'أسبوع', '3 months': '٣ أشهر', '6 months': '٦ أشهر', 'one time': 'مرة واحدة' }

/** Translation of one phrase, or null. */
function phrase(t: string): string | null {
  const exact = ar[t]
  if (exact) return exact
  for (const [re, f] of patterns) {
    const m = re.exec(t)
    if (m) { const r = f(m); if (r != null) return r }
  }
  return null
}
const tr = (t: string) => phrase(t) ?? t

const patterns: [RegExp, (m: RegExpExecArray) => string | null][] = [
  [/^(Good morning|Good afternoon|Good evening), (.+)$/, m => `${tr(m[1])}، ${m[2]}`],
  [/^(\d+) (notes?|tasks?|events?|days?|goals?|members?|results?|rounds?|birthdays?|active rentals?|focus rounds?|items?|steps?)$/, m => count(+m[1], m[2].replace(/s$/, ''))],
  [/^(\d+) active$/, m => `${m[1]} نشط`],
  [/^(\d+) saved$/, m => `${m[1]} محفوظ`],
  [/^(\d+) open$/, m => `${m[1]} مفتوح`],
  [/^(\d+) to renew$/, m => `${m[1]} للتجديد`],
  [/^(\d+) unpaid$/, m => `${m[1]} غير مدفوعة`],
  [/^(\d+) total$/, m => `${m[1]} إجمالًا`],
  [/^(\d+) today$/, m => `${m[1]} اليوم`],
  [/^(\d+) waiting$/, m => `${m[1]} بانتظارك`],
  [/^(\d+) need attention$/, m => `${m[1]} تحتاج انتباهك`],
  [/^(\d+) personal$/, m => `${m[1]} شخصية`],
  [/^(\d+) selected$/, m => `${m[1]} مختارة`],
  [/^(\d{4}) so far$/, m => `${m[1]} حتى الآن`],
  [/^([\d.]+) h today$/, m => `${m[1]} س اليوم`],
  [/^([\d.]+) h$/, m => `${m[1]} س`],
  [/^(\d+) days left$/, m => `باقي ${m[1]} يوم`],
  [/^(\d+) days overdue$/, m => `متأخر ${m[1]} يوم`],
  [/^(\d+) of (\d+) done$/, m => `${m[1]} من ${m[2]} تم`],
  [/^(\d+)\/(\d+) steps$/, m => `${m[1]}/${m[2]} خطوات`],
  [/^(\d+)\/(\d+) done$/, m => `${m[1]}/${m[2]} تم`],
  [/^(\d+) of (\d+) goals reached$/, m => `تحقق ${m[1]} من ${m[2]} أهداف`],
  [/^↓ (.+) in$/, m => `↓ ${m[1]} دخل`],
  [/^↑ (.+) out$/, m => `↑ ${m[1]} خرج`],
  [/^Paid ([\d,.]+ [A-Z]{3,4})$/, m => `مدفوع ${m[1]}`],
  [/^of ([\d,.]+ [A-Z]{3,4})$/, m => `من ${m[1]}`],
  [/^([\d,.]+ [A-Z]{3,4}) to go$/, m => `باقي ${m[1]}`],
  [/^Due (today|tomorrow|yesterday|\w{3}, \w{3} \d{1,2}, \d{4}|\w{3} \d{1,2}|[^A-Za-z]*[\u0600-\u06FF][^A-Za-z]*)$/, m => `مستحقة ${tr(m[1].charAt(0).toUpperCase() + m[1].slice(1))}`],
  [/^Overdue · was due (.+)$/, m => `متأخرة · كانت مستحقة ${m[1]}`],
  [/^Next one: (.+)$/, m => `التالية: ${tr(m[1])}`],
  [/^Renewed until (.+)$/, m => `تم التجديد حتى ${m[1]}`],
  [/^Renew until (.+)$/, m => `جدّد حتى ${m[1]}`],
  [/^Renew (.+)$/, m => `تجديد ${m[1]}`],
  [/^Until (.+)$/, m => `حتى ${m[1]}`],
  [/^Renewed (.+)$/, m => `جُدد ${m[1]}`],
  [/^Since (.+)$/, m => `منذ ${m[1]}`],
  [/^Now expires (.+)$/, m => `ينتهي حاليًا ${m[1]}`],
  [/^(\d+)% of this period used$/, m => `استُخدم ${m[1]}٪ من هذه الفترة`],
  [/^Tracking · (.+)$/, m => `يسجّل · ${tr(m[1])}`],
  [/^Focus · round (\d+)$/, m => `تركيز · الجولة ${m[1]}`],
  [/^Add to (.+)$/, m => `أضف إلى ${tr(m[1])}`],
  [/^Profit \/ (.+)$/, m => `الربح / ${periods[m[1]] ?? m[1]}`],
  [/^It costs me \/ (.+)$/, m => `يكلفني / ${periods[m[1]] ?? m[1]}`],
  [/^Client pays me \/ (.+)$/, m => `يدفع لي العميل / ${periods[m[1]] ?? m[1]}`],
  [/^It costs me$/, () => 'يكلفني'],
  [/^Client pays me$/, () => 'يدفع لي العميل'],
  [/^Money per (.+)$/, m => `الأموال لكل ${periods[m[1]] ?? m[1]}`],
  [/^Money \(one time\)$/, () => 'الأموال (مرة واحدة)'],
  [/^Profit in (\d{4})$/, m => `الربح في ${m[1]}`],
  [/^Profit: (.+)$/, m => `الربح: ${m[1].replace(/ per (month|year|week|3 months|6 months)/, (_, p) => ` لكل ${periods[p]}`).replace(/a month\)/, 'شهريًا)')}`],
  [/^Updated (.+)$/, m => `حُدّث ${m[1]}`],
  [/^Last push (.+)$/, m => `آخر تحديث ${m[1]}`],
  [/^≈ (.+) in total at today's rates$/, m => `≈ ${m[1]} إجمالًا بأسعار اليوم`],
  [/^You spent (.+) so far this week\.$/, m => `صرفت ${m[1]} حتى الآن هذا الأسبوع.`],
  [/^You spent (\d+)% less than this time last week\. Nice!$/, m => `صرفت أقل بـ ${m[1]}٪ من الأسبوع الماضي. رائع!`],
  [/^You spent (\d+)% more than this time last week\.$/, m => `صرفت أكثر بـ ${m[1]}٪ من الأسبوع الماضي.`],
  [/^Answered in (\d+) ms · (.+)$/, m => `ردّ خلال ${m[1]} مللي ثانية · ${m[2].replace('just now', 'الآن').replace(/(\d+) min ago/, 'منذ $1 د').replace(/(\d+) h ago/, 'منذ $1 س')}`],
  [/^(Up|Down) since (.+)$/, m => `${m[1] === 'Up' ? 'يعمل' : 'متوقف'} منذ ${m[2]}`],
  [/^Then (.+), …$/, m => `ثم ${m[1]}، …`],
  [/^(.+) deleted$/, m => (ar[m[1]] ? `تم حذف ${ar[m[1]]}` : null)],
  [/^(\d+) days$/, m => `${m[1]} يوم`],
  [/^(.+) over the limit$/, m => `${m[1]} فوق الحد`],
  [/^(.+) left this month$/, m => `باقي ${m[1]} هذا الشهر`],
  [/^(.+) – now$/, m => `${m[1]} – الآن`],
  [/^Discount \((.+)\)$/, m => `الخصم (${m[1]})`],
  [/^Amount \((.+)\)$/, m => `المبلغ (${m[1]})`],
  [/^Started (.+)$/, m => `بدأ ${m[1]}`],
  [/^next (.+)$/, m => `التالي ${m[1]}`],
  [/^(\d+) forks$/, m => `${m[1]} تفرعات`],
  [/^(\d+) open issues$/, m => `${m[1]} مشكلات مفتوحة`],
  [/^(\d+) repositories$/, m => `${m[1]} مستودعات`],
  [/^(\d+) followers$/, m => `${m[1]} متابعون`],
  [/^Customers (\d+)$/, m => `العملاء ${m[1]}`],
  [/^Phone (\d+)$/, m => `الهاتف ${m[1]}`],
  [/^(.+) invited you$/, m => `${m[1]} دعاك`],
  [/^In ([A-Z]{3,4})$/, m => `بـ ${m[1]}`],
  [/^(Every week|Every month|Every 3 months|Every year)$/, m => ar[m[1]] ?? null],
  [/^(\d+) days? before, and on the day$/, m => `قبلها بـ ${m[1]} ${+m[1] === 1 ? 'يوم' : 'أيام'} وفي يومها`],
  [/^(.+), so far$/, m => `${m[1]} حتى الآن`],
  [/^tasks?, (\d+) late$/, m => `مهام، ${m[1]} متأخرة`],
  [/^tasks?$/, () => 'مهام'],
  [/^\+ (\d+) events?$/, m => `+ ${m[1]} مواعيد`],
  [/^(\d+) need attention$/, m => `${m[1]} تحتاج انتباهك`],
  [/^That's (.+) profit a year\.$/, m => `أي ${m[1]} ربح في السنة.`],
  [/^That's (.+) profit a month, (.+) a year\.$/, m => `أي ${m[1]} ربح في الشهر و${m[2]} في السنة.`],
  [/^So far: client paid (.+), you paid (.+)\.$/, m => `حتى الآن: دفع العميل ${m[1]} ودفعت أنت ${m[2]}.`],
  [/^(\d+) min ago$/, m => `منذ ${m[1]} دقيقة`],
  [/^Updated (.+)\. ?(.*)$/, m => `حُدّث ${m[1]}. ${m[2] ? tr(m[2]) : ''}`.trim()],
  [/^Renewed (.+)$/, m => `جُدد ${m[1]}`],
  [/^Expires in$/, () => 'ينتهي خلال'],
  [/^(\d+) days? before$/, m => `قبلها بـ ${m[1]} ${+m[1] === 1 ? 'يوم' : 'أيام'}`],
  [/^Expired (today|\d+ days? ago)$/, m => (m[1] === 'today' ? 'انتهى اليوم' : `انتهى منذ ${m[1].replace(/ days? ago/, '')} يوم`)],
  [/^Sign in to (.+)$/, m => `سجّل الدخول إلى ${m[1]}`],
  [/^Version (.+)$/, m => `الإصدار ${m[1]}`],
  [/^Last synced (.+)$/, m => `آخر مزامنة ${m[1]}`],
  [/^Public holiday in (.+)$/, m => `عطلة رسمية في ${m[1]}`],
  [/^(.+)'s birthday$/, m => `عيد ميلاد ${m[1]}`],
  [/^Turns (\d+)$/, m => `يتم ${m[1]} سنة`],
  [/^Deadline: (.+)$/, m => `الموعد النهائي: ${m[1]}`],
  [/^(.+) expires$/, m => `${m[1]} ينتهي`],
  [/^\+(\d+) more$/, m => `+${m[1]} أخرى`],
  [/^Carrot Note (\d[\d.]*) · made for freelancers 🥕$/, m => `كاروت نوت ${m[1]} · صُنع للمستقلين 🥕`],
  [/^Public repositories of @(.+)$/, m => `المستودعات العامة لـ @${m[1]}`],
  [/^([\d,.]+ [A-Z]{3,4}) left$/, m => `باقي ${m[1]}`],
]

/** Translates [s] keeping its surrounding spaces; parts joined by " · " are translated one by one. */
export function translate(s: string): string | null {
  const t = s.trim()
  if (!t || !/[A-Za-z]/.test(t)) return null
  if (t.startsWith('· ')) { const r = translate(t.slice(2)); return r == null ? null : s.replace(t, '· ' + r.trim()) }
  if (t.endsWith(' ·')) { const r = translate(t.slice(0, -2)); return r == null ? null : s.replace(t, r.trim() + ' ·') }
  let out = phrase(t)
  if (out == null && /\s·\s/.test(t)) {
    const parts = t.split(/\s+·\s+/).map(p => p.trim())
    const done = parts.map(p => phrase(p) ?? p)
    if (done.some((x, i) => x !== parts[i])) out = done.join(' · ')
  }
  return out == null ? null : s.replace(t, out)
}

const ATTRS = ['placeholder', 'aria-label', 'title']

// Text the app wrote (English) and what we wrote over it, per text node. A sentence like
// `Paid {amount}` arrives as several text nodes, so siblings are translated together.
const original = new WeakMap<Text, string>()
const written = new WeakMap<Text, string>()

function source(t: Text): string {
  if (written.get(t) !== t.data) original.set(t, t.data) // the app changed it since we last wrote
  return original.get(t) ?? t.data
}
function write(t: Text, v: string) {
  written.set(t, v)
  if (t.data !== v) t.data = v
}

/** Translates the text directly inside [el]: all its text pieces together, or one by one. */
function translateText(el: Element) {
  if (el.closest('textarea, script, style, [data-notr]')) return
  const texts: Text[] = []
  let onlyText = true
  el.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text); else if (n.nodeType === Node.ELEMENT_NODE) onlyText = false })
  if (!texts.length) return
  const src = texts.map(source)
  if (onlyText && texts.length > 1) {
    const whole = translate(src.join(''))
    if (whole != null) { write(texts[0], whole); for (let i = 1; i < texts.length; i++) write(texts[i], ''); return }
  }
  texts.forEach((t, i) => write(t, translate(src[i]) ?? src[i]))
}

function translateAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (v) { const out = translate(v); if (out != null && out !== v) el.setAttribute(a, out) }
  }
}

function translateTree(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) { if (node.parentElement) translateText(node.parentElement); return }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const root = node as Element
  if (root.closest('[data-notr]')) return
  translateAttrs(root)
  translateText(root)
  root.querySelectorAll('*').forEach(el => {
    if (el.closest('[data-notr]')) return
    translateAttrs(el)
    translateText(el)
  })
}

/** Switches the page to Arabic, right to left, and keeps translating whatever appears. */
export function startArabic(root: HTMLElement) {
  document.documentElement.lang = 'ar'
  document.documentElement.dir = 'rtl'
  translateTree(root)
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') { const p = m.target.parentElement; if (p) translateText(p) }
      else if (m.type === 'attributes') translateAttrs(m.target as Element)
      else { m.addedNodes.forEach(translateTree); if (m.target.nodeType === Node.ELEMENT_NODE) translateText(m.target as Element) }
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  // Toasts, the drawer and overlays render inside the same root.
}
