// A stand-in for WebBridge.kt when the UI runs in a normal browser (design previews and tests).
// Keeps data in localStorage and starts with example content.

const DAY = 86_400_000
const today = () => Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / DAY)
const id = () => Math.random().toString(36).slice(2, 10)

function sample() {
  const t = today()
  const now = Date.now()
  const projects = [
    { id: 'p1', name: 'Bakery POS app', customerId: 'c1', clientName: 'Nour Bakery', price: 18000, currency: 'EGP', status: 'active', startDate: t - 40, deadline: t + 12, description: 'Point of sale app with offline mode and Arabic receipts.', info: [{ label: 'Staging', value: 'pos-staging.example.com' }], billing: 'fixed', hourlyRate: 0, repo: 'github.com/example/bakery-pos', createdAt: now - 40 * DAY },
    { id: 'p2', name: 'Portfolio site', customerId: null, clientName: 'Lina Hassan', price: 10000, currency: 'EGP', status: 'active', startDate: t - 10, deadline: t + 21, description: '', info: [], billing: 'fixed', hourlyRate: 0, repo: '', createdAt: now - 10 * DAY },
    { id: 'p3', name: 'Gym booking API', customerId: null, clientName: 'FitZone', price: 0, currency: 'EGP', status: 'on_hold', startDate: t - 60, deadline: t + 34, description: '', info: [], billing: 'hourly', hourlyRate: 450, repo: '', createdAt: now - 60 * DAY },
  ]
  const txn = (kind: string, amount: number, cat: string, method: string, d: number, note = '', projectId: string | null = null) =>
    ({ id: id(), kind, amount, currency: 'EGP', category: cat, method, date: t - d, note, projectId, customerId: null, createdAt: now - d * DAY })
  return {
    project: projects,
    task: [
      { id: id(), title: 'Send invoice to Nour Bakery', notes: '', projectId: 'p1', dueDate: t, dueTime: 18 * 60, reminder: true, done: false, priority: 2, createdAt: now },
      { id: id(), title: 'Fix login crash on Android 10', notes: '', projectId: 'p3', dueDate: t - 1, dueTime: null, reminder: false, done: false, priority: 1, createdAt: now },
      { id: id(), title: 'Reply to Lina about the hero photo', notes: '', projectId: 'p2', dueDate: t, dueTime: null, reminder: false, done: false, priority: 1, createdAt: now },
    ],
    note: [
      { id: id(), title: 'Bakery POS · questions', body: '', checklist: [{ id: id(), text: 'Offline mode?', done: true }, { id: id(), text: 'Receipt printer model', done: false }, { id: id(), text: 'Arabic receipts', done: false }], projectId: 'p1', date: null, pinned: true, color: 2, createdAt: now },
      { id: id(), title: 'Pricing', body: 'Hourly 450 EGP. Fixed quotes: add 20% for revisions.', checklist: [], projectId: null, date: null, pinned: false, color: 0, createdAt: now - DAY },
      { id: id(), title: 'Lina · feedback', body: 'Bigger hero photo. Swap the teal for olive. Keep the serif.', checklist: [], projectId: 'p2', date: null, pinned: false, color: 5, createdAt: now - 2 * DAY },
      { id: id(), title: 'Ideas', body: 'Dark mode for the gym app.\nOffer a care plan to Café Kanaka.', checklist: [], projectId: null, date: null, pinned: false, color: 3, createdAt: now - 3 * DAY },
    ],
    txn: [
      txn('income', 6000, 'Project payment', 'InstaPay', 0, 'Nour Bakery · milestone 2', 'p1'),
      txn('income', 6000, 'Project payment', 'Bank transfer', 12, 'Nour Bakery · milestone 1', 'p1'),
      txn('income', 4000, 'Project payment', 'Bank transfer', 3, 'Lina Hassan · deposit', 'p2'),
      txn('expense', 750, 'Subscriptions', 'Card', 0, 'Figma Professional'),
      txn('expense', 95, 'Transport', 'Cash', 1, 'Uber to Zamalek'),
      txn('expense', 6000, 'Rent', 'Bank transfer', 5, 'Office desk'),
      txn('expense', 420, 'Food', 'Cash', 2, 'Lunch with Karim'),
      txn('expense', 1250, 'Food', 'Card', 4),
      txn('expense', 2100, 'Equipment', 'Card', 6, 'USB-C hub'),
    ].filter(x => x.date >= today() - new Date().getDate() + 1),
    goal: [{ id: id(), name: 'New laptop', target: 60000, currency: 'EGP', deadline: t + 90, note: '', deposits: [{ id: id(), amount: 24000, date: t - 20, note: '' }], createdAt: now }],
    customer: [{ id: 'c1', name: 'Nour Bakery', phone: '+20 100 123 4567', email: 'hello@nourbakery.example', company: 'Nour Bakery', notes: '', createdAt: now }],
    debt: [{ id: id(), direction: 'owed_to_me', person: 'Karim Adel', customerId: null, amount: 1500, currency: 'EGP', dueDate: t + 3, note: '', payments: [{ id: id(), amount: 500, date: t - 2, note: '' }], createdAt: now }],
    event: [{ id: id(), title: 'Call with Karim', date: t, time: 16 * 60 + 30, note: 'Gym booking API', reminder: true, projectId: 'p3', customerId: null, createdAt: now }],
    time: [
      { id: id(), projectId: 'p1', start: now - (84 * 60 + 37) * 1000, end: null, note: '', createdAt: now },
      { id: id(), projectId: 'p3', start: now - 5 * 3600_000, end: now - 3 * 3600_000, note: 'Booking limits', createdAt: now },
    ],
    budget: [{ id: id(), category: '', limit: 15000, currency: 'EGP', createdAt: now }, { id: id(), category: 'Food', limit: 1500, currency: 'EGP', createdAt: now }],
  } as Record<string, any[]>
}

const contacts = [
  'Adel Mostafa', 'Ahmed Samir', 'Amira Fathy', 'Bassem Youssef', 'Dina Kamal', 'Farida Nabil', 'Hana Ezz', 'Karim Adel', 'Lina Hassan',
  'Mariam Tarek', 'Mona Saleh', 'Nour Bakery', 'Omar Khaled', 'Rana Hosny', 'Salma Reda', 'Tamer Gaber', 'Youssef Ali', 'Zeina Maher',
].map((name, i) => ({
  id: String(i + 1), name, phones: [`+20 10${i % 10} ${String(1000000 + i * 7919).slice(0, 3)} ${String(1000 + i * 37).slice(0, 4)}`],
  emails: i % 3 === 0 ? [name.toLowerCase().replace(/\s+/g, '.') + '@example.com'] : [], company: i % 4 === 0 ? 'Studio ' + name.split(' ')[1] : '',
}))

function netGet(url: string): unknown {
  if (url.includes('AvailableCountries')) return [['EG', 'Egypt'], ['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France'], ['MA', 'Morocco'], ['JP', 'Japan'], ['BR', 'Brazil']].map(([countryCode, name]) => ({ countryCode, name }))
  const hol = /PublicHolidays\/(\d{4})\/([A-Z]{2})/.exec(url)
  if (hol) {
    const yr = hol[1], cc = hol[2]
    const list: Record<string, [string, string, string][]> = {
      EG: [['01-07', 'عيد الميلاد المجيد', 'Coptic Christmas'], ['01-25', 'عيد الثورة', 'Revolution Day'], ['04-25', 'عيد تحرير سيناء', 'Sinai Liberation Day'], ['05-01', 'عيد العمال', 'Labour Day'], ['06-30', 'ثورة 30 يونيو', 'June 30 Revolution'], ['07-23', 'عيد الثورة', 'Revolution Day'], ['10-06', 'عيد القوات المسلحة', 'Armed Forces Day']],
      US: [['01-01', "New Year's Day", "New Year's Day"], ['07-04', 'Independence Day', 'Independence Day'], ['11-11', 'Veterans Day', 'Veterans Day'], ['11-26', 'Thanksgiving Day', 'Thanksgiving Day'], ['12-25', 'Christmas Day', 'Christmas Day']],
    }
    return (list[cc] ?? [['01-01', 'New Year', "New Year's Day"], ['12-25', 'Christmas', 'Christmas Day']]).map(([d, localName, name]) => ({ date: `${yr}-${d}`, localName, name, countryCode: cc, global: true, types: ['Public'] }))
  }
  if (url.includes('open.er-api.com')) {
    const base = url.split('/').pop()!
    const usd: Record<string, number> = { USD: 1, EUR: 0.92, EGP: 48.6, GBP: 0.79, SAR: 3.75, AED: 3.67, KWD: 0.31, QAR: 3.64, TRY: 34.2, JPY: 151 }
    const k = usd[base] ?? 1
    return { result: 'success', base_code: base, time_last_update_unix: Math.floor(Date.now() / 1000) - 3600, rates: Object.fromEntries(Object.entries(usd).map(([c, v]) => [c, v / k])) }
  }
  if (url.includes('/users/') && url.includes('/repos')) {
    const owner = url.split('/users/')[1].split('/')[0]
    return [
      ['carrot-note', 'Notes, money and projects for freelancers', 'Kotlin', 12, 1],
      ['bakery-pos', 'Point of sale app with offline mode', 'TypeScript', 4, 3],
      ['portfolio', 'My personal website', 'HTML', 1, 9],
      ['gym-booking-api', 'Booking API for FitZone', 'Python', 0, 30],
    ].map(([name, description, language, stars, days]) => ({
      name, full_name: `${owner}/${name}`, html_url: `https://github.com/${owner}/${name}`, description, language, stargazers_count: stars, forks_count: 1,
      open_issues_count: 2, pushed_at: new Date(Date.now() - (days as number) * DAY).toISOString(), fork: false, owner: { login: owner },
    }))
  }
  const repo = /api\.github\.com\/repos\/([^/]+)\/([^/?]+)$/.exec(url)
  if (repo) {
    if (repo[2] === 'missing') throw new Error('Not found')
    return { name: repo[2], full_name: `${repo[1]}/${repo[2]}`, html_url: `https://github.com/${repo[1]}/${repo[2]}`, description: 'Point of sale app with offline mode and Arabic receipts', language: 'TypeScript', stargazers_count: 4, forks_count: 1, open_issues_count: 2, pushed_at: new Date(Date.now() - 3 * DAY).toISOString(), fork: false, owner: { login: repo[1] } }
  }
  if (url.includes('/contributors')) return [{ login: 'someone-else' }]
  throw new Error('Not found')
}

export function installMock() {
  const store = (k: string, v?: unknown) => {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem('carrot.mock.' + k) ?? 'null')
      localStorage.setItem('carrot.mock.' + k, JSON.stringify(v))
    } catch { /* storage blocked */ }
    return null
  }
  const params = new URLSearchParams(location.search)
  let data: Record<string, any[]> = store('data') ?? sample()
  let signedIn = params.has('auth') ? false : store('signedIn') ?? true
  let theme = Number(params.get('theme') ?? store('theme') ?? 1)
  let locked = params.has('lock')
  let github: string = params.has('nogh') ? '' : 'adham-dev'
  const emit = (name: string, payload: unknown) => setTimeout(() => window.__native.emit(name, payload), 0)
  const state = () => ({
    signedIn, locked, version: '1.5.1', systemDark: matchMedia('(prefers-color-scheme: dark)').matches, invites: 1,
    user: { id: 'u1', email: 'you@example.com', name: 'Adham Kassem', username: 'adham', bio: 'Freelance Android and web developer.', github, avatarRev: 0 },
    settings: { currency: 'EGP', theme, autoUpdate: true },
    lock: { pinEnabled: true, pinLength: 4, biometric: false, biometricAvailable: false, delay: 30, secureScreen: false },
    sync: { syncing: false, lastSync: Date.now() - 120_000, error: null },
    release: null, download: { state: 'idle' },
  })
  const push = () => {
    emit('state', state())
    for (const [type, items] of Object.entries(data)) emit('table', { type, items })
    emit('spaces', [])
    store('data', data)
  }
  const handlers: Record<string, (a: any) => unknown> = {
    'data.save': a => { const l = data[a.type] ?? []; const i = l.findIndex((x: any) => x.id === a.item.id); data[a.type] = i >= 0 ? l.map((x: any, j: number) => (j === i ? a.item : x)) : [...l, a.item]; push(); return true },
    'data.delete': a => { data[a.type] = (data[a.type] ?? []).filter((x: any) => x.id !== a.id); push(); return true },
    'auth.login': () => { signedIn = true; store('signedIn', true); push(); return true },
    'auth.register': () => { signedIn = true; store('signedIn', true); push(); return true },
    'auth.usernameAvailable': a => ({ available: a.username !== 'taken', reason: null }),
    'auth.hasUnsynced': () => false,
    'auth.signOut': () => { signedIn = false; store('signedIn', false); push(); return true },
    'settings.set': a => { if (a.theme != null) { theme = a.theme; store('theme', theme) } push(); return true },
    'lock.verify': a => { const ok = a.pin === '1234'; if (ok) { locked = false; push() } return { ok, cooldown: 0 } },
    'lock.cooldown': () => 0,
    'lock.now': () => { locked = true; push(); return true },
    'timer.start': a => { data.time = [...data.time, { id: id(), projectId: a.projectId ?? null, start: Date.now(), end: null, note: a.note ?? '', createdAt: Date.now() }]; push(); return true },
    'timer.stop': () => { data.time = data.time.map(t => (t.end == null ? { ...t, end: Date.now() } : t)); push(); return true },
    'contacts.all': () => contacts,
    'team.search': () => [{ id: 'u2', username: 'lina', name: 'Lina Hassan', avatarRev: 0 }],
    'invites.list': () => [{ id: 'i1', spaceId: 'p_p9', projectName: 'Café Kanaka menu', createdAt: Date.now(), from: { id: 'u3', username: 'karim', name: 'Karim Adel', avatarRev: 0 } }],
    'notifications.granted': () => true,
    'avatar': () => null,
    'github.profile': () => null,
    'update.check': () => null,
    'sync.now': () => true,
    'profile.update': a => { if (a.github != null) github = a.github; push(); return true },
    'net.get': a => netGet(a.url),
    'contacts.birthdays': () => [{ name: 'Lina Hassan', month: new Date().getMonth() + 1, day: Math.min(28, new Date().getDate() + 2), year: 1996 }, { name: 'Karim Adel', month: 3, day: 14, year: null }],
    'backup.export': () => true,
  }
  return {
    call(callId: string, method: string, args: string) {
      const h = handlers[method]
      setTimeout(() => {
        try { window.__native.reply(callId, true, h ? h(JSON.parse(args)) ?? true : true) } catch (e) { window.__native.reply(callId, false, String(e)) }
      }, method.startsWith('auth.') ? 400 : 30)
    },
    ready() { push() },
  }
}
