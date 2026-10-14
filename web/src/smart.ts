// "Say it" quick add: turns a sentence like "spent 200 on lunch", "Karim paid 1500 for the POS",
// "صرفت ٢٠٠ على الغدا" or "call Lina tomorrow at 5" into an expense, income, task, event or note.
// Plain rules, no internet needed; the result is shown before it's saved, so it can be fixed.

export type SmartKind = 'expense' | 'income' | 'task' | 'event' | 'note'

export interface Parsed {
  kind: SmartKind
  amount: number | null
  currency: string
  title: string
  category: string | null
  method: string | null
  date: number
  time: number | null
  customerId: string | null
  projectId: string | null
  person: string | null
}

export interface SmartContext {
  today: number
  currency: string
  customers: { id: string; name: string }[]
  projects: { id: string; name: string; clientName?: string; customerId?: string | null }[]
}

const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٫': '.', '٬': ',',
}

/** Western digits, single spaces, Arabic letters in one spelling (أ/إ/آ → ا, ة → ه, ى → ي). */
function norm(s: string): string {
  return s
    .replace(/[٠-٩۰-۹٫٬]/g, c => DIGITS[c])
    .replace(/[ً-ْـ]/g, '') // tashkeel and tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

const words = (list: string) => list.split('|').map(norm).sort((a, b) => b.length - a.length)
/** A regex matching any of [list] as whole words (Arabic letters count as word letters too). */
// Arabic words often carry a prefix: الغدا, بالكاش, للكاشير, والقهوه.
const anyOf = (list: string, flags = 'i') => new RegExp(`(^|[^\\p{L}\\p{N}])((?:ال|بال|لل|وال|فال|و|ب|ل)?(?:${words(list).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))(?=$|[^\\p{L}\\p{N}])`, flags + 'u')

const CURRENCIES: [string, RegExp][] = [
  ['EGP', anyOf('egp|le|l.e|pound|pounds|جنيه|جنيهات|جنية|ج|ج.م|بالجنيه')],
  ['USD', anyOf('usd|dollar|dollars|bucks|دولار|دولارات')],
  ['EUR', anyOf('eur|euro|euros|يورو')],
  ['SAR', anyOf('sar|riyal|riyals|ريال')],
  ['AED', anyOf('aed|dirham|dirhams|درهم')],
  ['USDT', anyOf('usdt|tether')],
  ['GBP', anyOf('gbp|sterling|استرليني')],
]

const METHODS: [string, RegExp][] = [
  ['InstaPay', anyOf('instapay|insta pay|انستاباي|انستا باي')],
  ['Wallet', anyOf('vodafone cash|vf cash|wallet|فودافون كاش|محفظه|اورانج كاش|اتصالات كاش')],
  ['Bank transfer', anyOf('bank transfer|bank|transfer|تحويل بنكي|البنك|بنك')],
  ['Card', anyOf('card|visa|mastercard|credit card|فيزا|الفيزا|كارت|بالكارت')],
  ['Cash', anyOf('cash|كاش|نقدي|نقدا|كاش في ايدي')],
  ['PayPal', anyOf('paypal|باي بال')],
  ['USDT', anyOf('usdt|binance|بينانس')],
]

const EXPENSE_CATS: [string, RegExp][] = [
  ['Food', anyOf('lunch|dinner|breakfast|food|coffee|cafe|restaurant|groceries|snack|pizza|burger|meal|اكل|غدا|غداء|عشا|عشاء|فطار|فطور|قهوه|كافيه|مطعم|بقاله|سوبرماركت|سوبر ماركت|كشري|فول')],
  ['Transport', anyOf('uber|careem|taxi|bus|metro|fuel|gas|petrol|parking|indrive|didi|تاكسي|اوبر|كريم|مواصلات|بنزين|ميكروباص|مترو|جراج|سواق')],
  ['Hosting & domains', anyOf('hosting|server|vps|domain|hetzner|contabo|namecheap|cloudflare|دومين|سيرفر|استضافه')],
  ['Subscriptions', anyOf('subscription|netflix|spotify|figma|chatgpt|adobe|youtube premium|icloud|اشتراك')],
  ['Internet & Phone', anyOf('internet|wifi|recharge|phone credit|mobile credit|نت|انترنت|رصيد|كارت شحن|باقه')],
  ['Bills', anyOf('electricity|water bill|gas bill|bill|bills|كهربا|كهرباء|فاتوره المياه|فاتوره')],
  ['Rent', anyOf('rent|office rent|ايجار|الايجار')],
  ['Equipment', anyOf('laptop|mouse|keyboard|hub|monitor|cable|charger|headphones|printer|لابتوب|ماوس|كيبورد|شاحن|سماعه|طابعه')],
  ['Stock purchase', anyOf('stock|inventory|for resale|بضاعه|مخزون')],
  ['Shopping', anyOf('clothes|shoes|shopping|shirt|هدوم|لبس|جزمه|قميص')],
  ['Health', anyOf('doctor|pharmacy|medicine|clinic|دكتور|صيدليه|دوا|علاج|عياده')],
  ['Entertainment', anyOf('movie|cinema|game|games|playstation|سينما|فيلم|لعبه|بلايستيشن')],
  ['Education', anyOf('course|book|books|udemy|كورس|كتاب|كتب')],
  ['Family', anyOf('family|kids|mom|dad|عيله|العيال|ماما|بابا|اخويا|اختي')],
]
const INCOME_CATS: [string, RegExp][] = [
  ['Salary', anyOf('salary|paycheck|مرتب|راتب|المرتب|الراتب')],
  ['Sales', anyOf('sold|sale|sales|بعت|بيعت|بيع')],
  ['Rentals', anyOf('rent|rental|renter|ايجار|اشتراك')],
  ['Refund', anyOf('refund|refunded|استرجاع|رجعلي')],
  ['Gift', anyOf('gift|هديه|عيديه')],
  ['Bonus', anyOf('bonus|بونص|مكافاه')],
]

const INCOME_CUES = anyOf('received|receive|got|get|earned|income|deposit|paid me|sent me|transferred me|استلمت|قبضت|جالي|جاتلي|دخلي|دخل|اتدفعلي|حولي|حولي فلوس|بعتلي|ادالي|اداني|ادتني')
const EXPENSE_CUES = anyOf('spent|spend|paid|pay|bought|buy|cost|expense|صرفت|دفعت|اشتريت|شريت|مصروف|دفعنا')
const TASK_CUES = anyOf('task|todo|to do|remind me to|remind me|reminder|don\'t forget to|مهمه|فكرني|افتكر|متنساش|لازم')
const NOTE_CUES = anyOf('note|write down|ملاحظه|نوت|اكتب')
const EVENT_CUES = anyOf('meeting|event|appointment|call with|interview|موعد|ميعاد|اجتماع|مقابله|مكالمه مع|ميتنج')
/** "<someone> paid 500": someone else paying me. */
const THEY_PAID = /^(.{2,40}?)\s+(paid|sent|transferred|دفع|دفعت لي|حول|بعت|ادي)(?=\s|$)/iu

const DAY_WORDS: [number, RegExp][] = [
  [2, anyOf('day after tomorrow|بعد بكره|بعد بكرا')],
  [1, anyOf('tomorrow|tmrw|بكره|بكرا|بكرة')], // not غدا: it clashes with الغدا (lunch)
  [-1, anyOf('yesterday|امبارح|امس|البارح')],
  [0, anyOf('today|tonight|now|النهارده|النهارده|اليوم|دلوقتي')],
]
const WEEKDAYS: [number, RegExp][] = [
  [0, anyOf('sunday|sun|الحد|الاحد|يوم الحد')],
  [1, anyOf('monday|mon|الاتنين|الاثنين|يوم الاتنين')],
  [2, anyOf('tuesday|tue|tues|التلات|الثلاثاء|التلاته')],
  [3, anyOf('wednesday|wed|الاربع|الاربعاء|الاربعا')],
  [4, anyOf('thursday|thu|thurs|الخميس')],
  [5, anyOf('friday|fri|الجمعه|الجمعه')],
  [6, anyOf('saturday|sat|السبت')],
]
const NEXT_WEEK = anyOf('next week|الاسبوع الجاي|الاسبوع اللي جاي')


export function parseSmart(input: string, ctx: SmartContext): Parsed {
  let text = norm(input)
  const lower = text.toLowerCase()
  const out: Parsed = {
    kind: 'expense', amount: null, currency: ctx.currency, title: '', category: null, method: null,
    date: ctx.today, time: null, customerId: null, projectId: null, person: null,
  }
  const cut = (re: RegExp) => { text = text.replace(re, '$1 ').replace(/\s+/g, ' ').trim() }

  // Time: "at 5", "5:30pm", "الساعه 5 العصر".
  const timeRe = /(?:^|\s)(?:at|@|الساعه|ساعه|علي الساعه|على الساعه)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|الصبح|صباحا|بالليل|مساء|مساءا|العصر|الضهر|الظهر)?(?=\s|$)|(?:^|\s)(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?=\s|$)/iu
  const tm = timeRe.exec(text)
  if (tm) {
    let h = Number(tm[1] ?? tm[4])
    const m = Number(tm[2] ?? tm[5] ?? 0)
    const ap = (tm[3] ?? tm[6] ?? '').toLowerCase()
    const pm = /^(pm|p\.m\.|م|بالليل|مساء|مساءا|العصر)$/.test(ap) || (ap === 'الضهر' || ap === 'الظهر') && h < 12
    const am = /^(am|a\.m\.|ص|الصبح|صباحا)$/.test(ap)
    if (pm && h < 12) h += 12
    else if (!am && !pm && h >= 1 && h <= 7) h += 12 // "at 5" usually means the afternoon
    if (am && h === 12) h = 0
    if (h < 24 && m < 60) out.time = h * 60 + m
    text = (text.slice(0, tm.index) + ' ' + text.slice(tm.index + tm[0].length)).replace(/\s+/g, ' ').trim()
  }

  // Date: today / tomorrow / yesterday / a weekday / next week.
  let dateSaid = false
  for (const [d, re] of DAY_WORDS) if (re.test(text)) { out.date = ctx.today + d; dateSaid = true; cut(re); break }
  if (!dateSaid && NEXT_WEEK.test(text)) { out.date = ctx.today + 7; dateSaid = true; cut(NEXT_WEEK) }
  let weekday: number | null = null
  if (!dateSaid) for (const [w, re] of WEEKDAYS) if (re.test(text)) { weekday = w; cut(re); break }

  // Currency signs stuck to the number ("$250").
  if (/\$/.test(text)) { out.currency = 'USD'; text = text.replace(/\$/g, ' ').replace(/\s+/g, ' ').trim() }
  if (/€/.test(text)) { out.currency = 'EUR'; text = text.replace(/€/g, ' ').replace(/\s+/g, ' ').trim() }

  // Amount: "1,500", "1.5k", "2 الف", "ألفين".
  const amountRe = /(?:^|\s)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|ك|thousand|الف|الاف|آلاف)?(?=\s|$|[^\d\p{L}])/iu
  const am = amountRe.exec(text)
  if (am) {
    let v = Number(am[1].replace(/,/g, ''))
    if (am[2]) v *= 1000
    if (v > 0) out.amount = Math.round(v * 100) / 100
    text = (text.slice(0, am.index) + ' ' + text.slice(am.index + am[0].length)).replace(/\s+/g, ' ').trim()
  } else {
    const wordAmounts: [RegExp, number][] = [[anyOf('الفين'), 2000], [anyOf('الف|thousand'), 1000], [anyOf('ميتين'), 200], [anyOf('ميه|مية|hundred'), 100]]
    for (const [re, v] of wordAmounts) if (re.test(text)) { out.amount = v; cut(re); break }
  }
  for (const [cur, re] of CURRENCIES) if (re.test(text)) { out.currency = cur; cut(re); break }
  for (const [m, re] of METHODS) if (re.test(text)) { out.method = m; cut(re); break }

  // Who / which project.
  const hay = ' ' + text.toLowerCase() + ' '
  const has = (name: string) => {
    const n = norm(name).toLowerCase()
    return n.length >= 3 && hay.includes(' ' + n + ' ') || n.length >= 3 && hay.includes(' ' + n)
  }
  const project = [...ctx.projects].sort((a, b) => b.name.length - a.name.length).find(p => has(p.name))
  const customer = [...ctx.customers].sort((a, b) => b.name.length - a.name.length).find(c => has(c.name))
    ?? ctx.customers.find(c => { const first = norm(c.name).split(' ')[0]; return first.length >= 4 && has(first) })
  if (project) { out.projectId = project.id; if (project.customerId) out.customerId = project.customerId }
  if (customer) out.customerId = customer.id

  // What kind of entry.
  const they = THEY_PAID.exec(text)
  const theyName = they && !/^(i|we|ana|انا|احنا|اتا)$/i.test(they[1].trim()) && !EXPENSE_CUES.test(they[1]) && !INCOME_CUES.test(they[1]) ? they[1].trim() : null
  if (TASK_CUES.test(lower) && !out.amount) out.kind = 'task'
  else if (NOTE_CUES.test(lower) && !out.amount) out.kind = 'note'
  else if (EVENT_CUES.test(lower) && !out.amount) out.kind = 'event'
  else if (out.amount != null) {
    const fromSomeone = /(^|\s)(from|من)\s/iu.test(text) && !EXPENSE_CUES.test(text)
    if (INCOME_CUES.test(text) || theyName || fromSomeone || INCOME_CATS.slice(0, 1).some(([, re]) => re.test(text))) out.kind = 'income'
    else out.kind = 'expense'
  } else out.kind = out.time != null ? 'event' : 'task'
  if (theyName && out.kind === 'income') out.person = theyName

  // A weekday: the last one for money, the next one for plans.
  if (weekday != null) {
    const dow = (ctx.today + 4) % 7 // epoch day 0 was a Thursday
    const diff = (weekday - dow + 7) % 7
    out.date = out.kind === 'expense' || out.kind === 'income' ? ctx.today - ((7 - diff) % 7) : ctx.today + (diff || 7)
  }

  if (out.kind === 'expense') out.category = EXPENSE_CATS.find(([, re]) => re.test(text))?.[0] ?? 'Other'
  if (out.kind === 'income') out.category = out.projectId || out.customerId ? 'Project payment' : INCOME_CATS.find(([, re]) => re.test(text))?.[0] ?? 'Freelance'

  // The title: what's left once the cue words are gone.
  for (const re of [TASK_CUES, NOTE_CUES, out.kind === 'income' ? INCOME_CUES : EXPENSE_CUES]) {
    if (out.kind === 'event') break
    for (let i = 0; i < 3 && re.test(text); i++) cut(re)
  }
  if (theyName && out.kind === 'income') text = text.replace(new RegExp(`(^|\\s)(paid|sent|transferred|دفع|دفعت لي|حول|بعت|ادي)(?=\\s|$)`, 'iu'), ' ').replace(/\s+/g, ' ').trim()
  let title = text.replace(/^[\s,.:;!-]+|[\s,.:;!-]+$/g, '')
  for (let i = 0; i < 4; i++) {
    const before = title
    title = title.replace(new RegExp(`^(${words('for|on|to|from|at|the|a|an|of|with|in|by|via|and|في|على|علي|عشان|علشان|من|مع|و|ب|ل')
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(\\s+|$)`, 'iu'), '')
    title = title.replace(new RegExp(`(\\s+|^)(${words('for|on|to|from|at|the|a|an|of|with|in|by|via|and|في|على|علي|عشان|من|مع|و|يوم')
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'iu'), '')
    title = title.trim()
    if (title === before) break
  }
  out.title = title
  return out
}
