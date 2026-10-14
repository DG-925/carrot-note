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
  renter: ['مستأجر', 'مستأجرين'], 'active renter': ['مستأجر نشط', 'مستأجرين نشطين'],
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
  [/^(\d+) (notes?|tasks?|events?|days?|goals?|members?|results?|rounds?|birthdays?|active rentals?|focus rounds?|items?|steps?|renters?|active renters?)$/, m => count(+m[1], m[2].replace(/s$/, ''))],
  [/^(\d+) active$/, m => `${m[1]} نشط`],
  [/^Product · (.+)$/, m => `منتج · ${tr(m[1])}`],
  [/^(\d+) in stock$/, m => `${m[1]} في المخزون`],
  [/^Members can see and add tasks, notes, events, rentals and partner earnings in “(.+)”\. The rest of your money stays private\.$/, m => `يمكن للأعضاء رؤية وإضافة المهام والملاحظات والمواعيد والإيجارات وأرباح الشركاء في «${m[1]}». باقي أموالك تبقى خاصة.`],
  [/^(\d+) in stock now$/, m => `${m[1]} في المخزون الآن`],
  [/^(\d+) left$/, m => `باقي ${m[1]}`],
  [/^(\d+) or fewer$/, m => `${m[1]} أو أقل`],
  [/^Sold (\d+) this month · profit (.+)$/, m => `بيع ${m[1]} هذا الشهر · ربح ${m[2]}`],
  [/^Sold (\d+) today · profit (.+)$/, m => `بيع ${m[1]} اليوم · ربح ${m[2]}`],
  [/^Sold (\d+) · profit (.+)$/, m => `تم بيع ${m[1]} · ربح ${m[2]}`],
  [/^Added (\d+) to stock$/, m => `أُضيف ${m[1]} إلى المخزون`],
  [/^Sold (\d+) to (.+)$/, m => `بيع ${m[1]} إلى ${m[2]}`],
  [/^Sold (\d+)$/, m => `بيع ${m[1]}`],
  [/^Bought (\d+) from (.+)$/, m => `شراء ${m[1]} من ${m[2]}`],
  [/^Bought (\d+)$/, m => `شراء ${m[1]}`],
  [/^Count ([+−]\d+)(?: · (.+))?$/, m => `العدد ${m[1]}${m[2] ? ' · ' + tr(m[2]) : ''}`],
  [/^Sell (.+)$/, m => `بيع ${m[1]}`],
  [/^Buy (.+)$/, m => `شراء ${m[1]}`],
  [/^Total (.+) · profit (.+)$/, m => `الإجمالي ${m[1]} · ربح ${m[2]}`],
  [/^Total (-?[\d,.]+ [A-Z]{3,4})$/, m => `الإجمالي ${m[1]}`],
  [/^Price each \((.+)\)$/, m => `سعر القطعة (${m[1]})`],
  [/^Cost each \((.+)\)$/, m => `تكلفة القطعة (${m[1]})`],
  [/^Only (\d+) in stock\. Buy more first, or fix the count\.$/, m => `يوجد ${m[1]} فقط في المخزون. اشترِ المزيد أولًا أو صحّح العدد.`],
  [/^The app thinks there are (\d+)\. How many do you really have\?$/, m => `التطبيق يظن أن لديك ${m[1]}. كم لديك فعلًا؟`],
  [/^You paid (.+?)(?:, and could sell them for (.+))?\.$/, m => `دفعت ${m[1]}${m[2] ? `، ويمكنك بيعها بـ ${m[2]}` : ''}.`],
  [/^Delete \(and its money entry\)$/, () => 'حذف (مع قيده في الأموال)'],
  [/^(\d+) in stock · (.+)$/, m => `${m[1]} في المخزون · ${m[2]}`],
  [/^(\d+) renters? to renew soon$/, m => `${m[1]} للتجديد قريبًا`],
  [/^([\d.]+)% share$/, m => `حصة ${m[1]}٪`],
  [/^(-?[\d,.]+ [A-Z]{3,4}(?: · -?[\d,.]+ [A-Z]{3,4})*) \/ month$/, m => `${m[1]} / شهر`],
  [/^(-?[\d,.]+ [A-Z]{3,4}(?: · -?[\d,.]+ [A-Z]{3,4})*)\/mo$/, m => `${m[1]}/شهر`],
  [/^profit (-?[\d,.]+ [A-Z]{3,4}.*)$/, m => `ربح ${m[1]}`],
  [/^(.+) · cost (.+)$/, m => `${m[1]} · تكلفة ${m[2]}`],
  [/^Brought in (.+) · profit (.+)$/, m => `دخل ${m[1]} · ربح ${m[2]}`],
  [/^Who made what · profit (.+)$/, m => `مَن ربح كم · الربح ${m[1]}`],
  [/^(.+) of the profit isn't given to anyone yet\.$/, m => `${m[1]} من الربح لم يُعطَ لأحد بعد.`],
  [/^That's (.+) more than the profit\.$/, m => `هذا أكثر من الربح بـ ${m[1]}.`],
  [/^Total ([\d.]+)%$/, m => `الإجمالي ${m[1]}٪`],
  [/^Total ([\d.]+)% \(it works out of whatever the total is, 100% is easiest to read\)$/, m => `الإجمالي ${m[1]}٪ (يُحسب من أي إجمالي، و١٠٠٪ أسهل للقراءة)`],
  [/^(.+)\. You can change the amounts later in (.+) › Partners\.$/, m => `${m[1]}. يمكنك تعديل المبالغ لاحقًا في ${m[2]} › الشركاء.`],
  [/^Add everyone who rents (.+): what they pay, when it started and when it runs out\. You get a reminder before each one expires\.$/, m => `أضف كل من يستأجر ${m[1]}: كم يدفع، ومتى بدأ ومتى ينتهي. ستصلك تذكرة قبل انتهاء كل واحد.`],
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
  // 1.12: quotes, wallets, files, insights, targets, activity.
  [/^valid until (.+)$/i, m => `صالح حتى ${m[1]}`],
  // 1.14: client answers, chat, labels.
  [/^(.+) accepted the offer$/, m => `${tr(m[1])} قبل العرض`],
  [/^(.+) declined the offer$/, m => `${tr(m[1])} رفض العرض`],
  [/^(.+) says they paid(?: (-?[\d,.]+ [A-Z]{3,4}))?$/, m => `${tr(m[1])} يقول إنه دفع${m[2] ? ' ' + m[2] : ''}`],
  [/^(\d+) people$/, m => `${m[1]} أشخاص`],
  [/^@mention someone to notify them$/, () => 'اذكر شخصًا بـ @ لتنبيهه'],
  [/^Make (\d+) labels?$/, m => `إنشاء ${m[1]} ملصق`],
  [/^(\d+) unread$/, m => `${m[1]} غير مقروءة`],
  [/^Message everyone in (.+) · voice messages and @mentions$/, m => `راسل كل من في ${m[1]} · رسائل صوتية وإشارات @`],
  [/^(Sent|Drafted|Accepted|Declined) (\d[^·]*|[^A-Za-z·]*[\u0600-\u06FF][^A-Za-z·]*)$/, m => `${({ Sent: 'أُرسل', Drafted: 'مسودة', Accepted: 'قُبل', Declined: 'رُفض' } as Record<string, string>)[m[1]]} ${m[2]}`],
  [/^From quote (.+)$/, m => `من العرض ${m[1]}`],
  [/^Tax \(([\d.]+)%\)$/, m => `الضريبة (${m[1]}٪)`],
  [/^Discount$/, () => 'الخصم'],
  [/^Date (.+)$/, m => `التاريخ ${m[1]}`],
  [/^Currency ([A-Z]{3,4})$/, m => `العملة ${m[1]}`],
  [/^To (.+)$/, m => (m[1] === 'a wallet' ? 'إلى محفظة' : `إلى ${m[1]}`)],
  [/^From (.+)$/, m => (m[1] === 'a wallet' ? 'من محفظة' : `من ${m[1]}`)],
  [/^Also in (.+)$/, m => `موجودة أيضًا في ${m[1]}`],
  [/^Moved (.+) to (.+)$/, m => `تم تحويل ${m[1]} إلى ${m[2]}`],
  [/^Arrives as \(([A-Z]{3,4})\)$/, m => `يصل بـ (${m[1]})`],
  [/^Automatic \((.+)\)$/, m => `تلقائي (${m[1]})`],
  [/^Done \((\d+) added\)$/, m => `تم (أُضيف ${m[1]})`],
  [/^Last (\d+) months$/, m => `آخر ${m[1]} أشهر`],
  [/^Profit$/, () => 'الربح'],
  [/^Profit · last (\d+) months$/, m => `الربح · آخر ${m[1]} أشهر`],
  [/^Page (\d+)$/, m => `صفحة ${m[1]}`],
  [/^(\d+) days? left$/, m => `باقي ${m[1]} ${+m[1] === 1 ? 'يوم' : 'أيام'}`],
  [/^ended$/, () => 'انتهى'],
  [/^Ends (.+)$/, m => `ينتهي ${m[1]}`],
  [/^(.+) · activity$/, m => `${m[1]} · النشاط`],
  [/^([\d.]+) h$/, m => `${m[1]} س`],
  [/^(\d+) (pieces?|clients?)$/, m => `${m[1]} ${m[2].startsWith('piece') ? 'قطعة' : 'عميل'}`],
  [/^(.+) of (.+)$/, m => (/\d/.test(m[1]) && /\d/.test(m[2]) ? `${tr(m[1])} من ${tr(m[2])}` : null)],
  [/^(.+) to go$/, m => `باقي ${tr(m[1])}`],
  [/^behind$/, () => 'متأخر'],
  [/^Each month \((.+)\)$/, m => `كل شهر (${m[1] === 'h' ? 'ساعات' : m[1] === 'pieces' ? 'قطع' : 'عملاء'})`],
  [/^Counts money in ([A-Z]{3,4}) recorded this month\.$/, m => `يحسب الأموال بـ ${m[1]} المسجلة هذا الشهر.`],
  [/^Day (\d+) of (\d+)\. Targets start again on the 1st of each month\.$/, m => `اليوم ${m[1]} من ${m[2]}. تبدأ الأهداف من جديد أول كل شهر.`],
  [/^WhatsApp (.+)$/, m => `واتساب ${m[1]}`],
  [/^(\d+) sold$/, m => `بيع ${m[1]}`],
  [/^Profit each (.+)$/, m => `ربح القطعة ${m[1]}`],
  [/^(\d+) of (\d+) · (\d+)%$/, m => `${m[1]} من ${m[2]} · ${m[3]}٪`],
  [/^owe (.+)$/, m => `عليك ${m[1]}`],
  [/^In ([A-Z]{3,4}) only\. Money in other currencies isn't counted here\.$/, m => `بـ ${m[1]} فقط. الأموال بالعملات الأخرى لا تُحسب هنا.`],
  [/^(added|changed|deleted|finished|recorded a payment on|split earnings in) (the project|task|note|event|renter|invoice|quote|file)(?: “(.+)”)?$/, m => {
    const v: Record<string, string> = { added: 'أضاف', changed: 'عدّل', deleted: 'حذف', finished: 'أنهى', 'recorded a payment on': 'سجّل دفعة على', 'split earnings in': 'قسّم الأرباح في' }
    const w: Record<string, string> = { 'the project': 'المشروع', task: 'مهمة', note: 'ملاحظة', event: 'موعد', renter: 'مستأجر', invoice: 'فاتورة', quote: 'عرض سعر', file: 'ملف' }
    return `${v[m[1]]} ${w[m[2]]}${m[3] ? ` «${m[3]}»` : ''}`
  }],
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
