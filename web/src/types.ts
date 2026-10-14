// Mirrors the Kotlin models in data/Models.kt. Dates are epoch days, times are minutes of the day.

export interface InfoItem { label: string; value: string }

export interface Project {
  id: string; name: string; customerId?: string | null; clientName: string; price: number; currency: string
  status: string; startDate?: number | null; deadline?: number | null; description: string; info: InfoItem[]
  billing: string; hourlyRate: number; repo: string; createdAt: number
  /** "work" (done for a client) or "product" (something we built and rent out). */
  kind?: string
  /** People who share what the project earns, with their usual share in percent. */
  partners?: ProjectPartner[]
  /** Money the project earned and how much of it each partner made. */
  splits?: ProjectSplit[]
}

/** A partner is either a team member ([userId]) or just a name. */
export interface ProjectPartner { id: string; userId?: string | null; name: string; share: number }
export interface SplitShare { partnerId: string; amount: number; paid: boolean }
export interface ProjectSplit {
  id: string; date: number; title: string; amount: number; cost: number; currency: string
  rentalId?: string | null; shares: SplitShare[]; note: string
}

export interface TaskItem {
  id: string; title: string; notes: string; projectId?: string | null; dueDate?: number | null; dueTime?: number | null
  reminder: boolean; done: boolean; priority: number; createdAt: number
  /** "", "daily", "weekly" or "monthly". */
  repeat?: string
  /** In progress (middle column of the board). */
  doing?: boolean
  subtasks?: CheckItem[]
  /** User id of the team member it's assigned to. */
  assignee?: string | null
}

export interface CheckItem { id: string; text: string; done: boolean }

export interface Note {
  id: string; title: string; body: string; checklist: CheckItem[]; projectId?: string | null; date?: number | null
  pinned: boolean; color: number; createdAt: number
  /** Voice clips kept in this note ("audio" records). */
  audioIds?: string[]
}

export interface Txn {
  id: string; kind: string; amount: number; currency: string; category: string; method: string; date: number
  note: string; projectId?: string | null; customerId?: string | null; createdAt: number
  /** Id of the "receipt" record with a photo of the receipt. */
  receiptId?: string | null
  /** The wallet the money came into / went out of; without one, the wallet holding that method is used. */
  walletId?: string | null
  supplierId?: string | null
}

export interface GoalDeposit { id: string; amount: number; date: number; note: string }
export interface Goal {
  id: string; name: string; target: number; currency: string; deadline?: number | null; note: string
  deposits: GoalDeposit[]; createdAt: number
}

export interface Customer { id: string; name: string; phone: string; email: string; company: string; notes: string; createdAt: number }

export interface DebtPayment { id: string; amount: number; date: number; note: string }
export interface Debt {
  id: string; direction: string; person: string; customerId?: string | null; amount: number; currency: string
  dueDate?: number | null; note: string; payments: DebtPayment[]; createdAt: number
  supplierId?: string | null
}

export interface CalEvent {
  id: string; title: string; date: number; time?: number | null; note: string; reminder: boolean
  projectId?: string | null; customerId?: string | null; createdAt: number
  /** Ticked off once it happened. */
  done?: boolean
}

export interface TimeEntry { id: string; projectId?: string | null; start: number; end?: number | null; note: string; createdAt: number }

export interface Budget { id: string; category: string; limit: number; currency: string; createdAt: number }

export interface RentalRenewal { id: string; date: number; from?: number | null; to?: number | null; cost: number; price: number; note: string }
/** Something rented to a client (VPS, hosting, bot, domain…). [cost] is mine, [price] the client's, both per [period]. */
export interface Rental {
  id: string; kind: string; name: string; provider: string; customerId?: string | null; projectId?: string | null; clientName: string
  startDate?: number | null; expiryDate?: number | null; expiryTime?: number | null; period: string
  cost: number; costCurrency: string; price: number; priceCurrency: string
  reminder: boolean; remindDays: number; status: string; details: string; renewals: RentalRenewal[]; createdAt: number
  /** Check every 15 minutes that [monitorUrl] answers (http(s) address or host[:port]). */
  monitor?: boolean; monitorUrl?: string
}

export interface InvoiceItem { id: string; description: string; qty: number; price: number }
export interface InvoicePayment { id: string; amount: number; date: number; method: string; txnId?: string | null }
/** A numbered invoice. [total] is stored so reminders can tell when it is fully paid. */
export interface Invoice {
  id: string; number: string; customerId?: string | null; projectId?: string | null; clientName: string; clientDetails: string
  issueDate: number; dueDate?: number | null; currency: string; items: InvoiceItem[]
  discount: number; discountPercent: boolean; taxPercent: number; total: number
  status: string; payments: InvoicePayment[]; notes: string; createdAt: number
}

/** Money that comes in or goes out on a schedule; copies are added to Money when due. */
export interface Recurring {
  id: string; kind: string; amount: number; currency: string; category: string; method: string; note: string
  projectId?: string | null; customerId?: string | null; period: string; nextDate: number; active: boolean; createdAt: number
}

/** A vault entry: [title] is readable, everything else is encrypted on the phone before syncing. */
export interface Secret { id: string; title: string; kind: string; rentalId?: string | null; customerId?: string | null; iv: string; data: string; createdAt: number }
export interface VaultMeta { id: string; salt: string; iv: string; check: string; createdAt: number }

/** One change to an item's stock: bought, sold, or counted again ([qty] is the change, + or −). */
export interface StockMove {
  id: string; kind: string; qty: number; price: number; date: number
  /** Who it was bought from or sold to. */
  person: string; customerId?: string | null; note: string
  /** For sales: the average cost of one unit when it was sold, so profit stays right later. */
  unitCost?: number
  txnId?: string | null; debtId?: string | null; createdAt: number
  supplierId?: string | null
}
/** Something physical bought to sell again (a PC, a phone, parts…). */
export interface StockItem {
  id: string; name: string; sku: string; category: string; condition: string; currency: string
  sellPrice: number; lowStock: number; notes: string; photoId?: string | null; archived?: boolean
  moves: StockMove[]; createdAt: number
}

/** A price offer. Accepting it can turn it into a project and an invoice. */
export interface Quote {
  id: string; number: string; title: string; customerId?: string | null; clientName: string; projectId?: string | null
  issueDate: number; validUntil?: number | null; currency: string; items: InvoiceItem[]
  discount: number; discountPercent: boolean; taxPercent: number; total: number
  /** draft, sent, accepted or declined */
  status: string; notes: string; invoiceId?: string | null; createdAt: number
}

/** Where money sits: cash, a bank account, InstaPay, a USDT wallet… */
export interface Wallet {
  id: string; name: string; kind: string; currency: string; opening: number
  /** Payment methods that land here when a transaction has no wallet chosen. */
  methods: string[]; archived?: boolean; createdAt: number
}
/** Money moved from one wallet to another ([toAmount] differs when the currencies differ). */
export interface Transfer { id: string; from: string; to: string; amount: number; toAmount: number; date: number; note: string; createdAt: number }

export interface Supplier { id: string; name: string; phone: string; email: string; company: string; notes: string; createdAt: number }

/** A service or product with its usual price, to reuse in invoices, quotes and renters. */
export interface PriceItem { id: string; name: string; kind: string; price: number; currency: string; unit: string; period: string; notes: string; createdAt: number }

/** A contract, ID copy or agreement, with photos of its pages and an optional end date. */
export interface DocFile {
  id: string; title: string; kind: string; customerId?: string | null; projectId?: string | null; supplierId?: string | null
  startDate?: number | null; endDate?: number | null; remindDays: number; photoIds: string[]; note: string
  eventId?: string | null; createdAt: number
}

/** Something a teammate did in a shared project. */
export interface Activity {
  id: string; projectId: string; userId: string; name: string; action: string; type: string; title: string; at: number
}

/** A goal for each month: income, profit, sales or new clients. */
export interface Target { id: string; metric: string; amount: number; currency: string; createdAt: number }

/** A WhatsApp message with {placeholders}. */
export interface MsgTemplate { id: string; kind: string; title: string; text: string; createdAt: number }

export interface SpaceMember { id: string; username: string; name: string; avatarRev: number; role: string }
export interface SpaceInfo {
  id: string; kind: string; projectId?: string | null; ownerId: string; role: string
  members: SpaceMember[]; pending: SpaceMember[]
}

export interface UserInfo { id: string; email: string; name: string; username: string; bio: string; github: string; avatarRev: number }
export interface PublicUser { id: string; username: string; name: string; avatarRev: number }
export interface Invite { id: string; spaceId: string; projectName: string; createdAt: number; from: PublicUser }

export interface PhoneContact { id: string; name: string; phones: string[]; emails: string[]; company: string }

export interface GithubProfile {
  login: string; name: string; bio: string; avatarUrl: string; publicRepos: number; followers: number; htmlUrl: string
}

export interface Tables {
  project: Project[]; task: TaskItem[]; note: Note[]; txn: Txn[]; goal: Goal[]; customer: Customer[]
  debt: Debt[]; event: CalEvent[]; time: TimeEntry[]; budget: Budget[]; rental: Rental[]
  invoice: Invoice[]; recurring: Recurring[]; secret: Secret[]; vault: VaultMeta[]; item: StockItem[]
  quote: Quote[]; wallet: Wallet[]; transfer: Transfer[]; supplier: Supplier[]; price: PriceItem[]; doc: DocFile[]
  activity: Activity[]; target: Target[]; msgtpl: MsgTemplate[]; setting: SyncedSetting[]
  reply: ClientReply[]; audio: AudioClip[]
}
export type TableName = keyof Tables

export interface NativeState {
  signedIn: boolean
  locked: boolean
  user: UserInfo | null
  version: string
  systemDark: boolean
  invites: number
  settings: { currency: string; theme: number; autoUpdate: boolean }
  lock: { pinEnabled: boolean; pinLength: number; biometric: boolean; biometricAvailable: boolean; delay: number; secureScreen: boolean }
  /** [apiVersion] 3+ means the server shares rentals and invoices of shared projects. */
  sync: { syncing: boolean; lastSync: number; error: string | null; apiVersion?: number }
  release: { version: string; notes: string; size: number } | null
  download: { state: 'idle' | 'downloading' | 'failed' | 'ready'; progress?: number; message?: string; canInstall?: boolean }
}

export const Status = { ACTIVE: 'active', ON_HOLD: 'on_hold', DONE: 'done', CANCELLED: 'cancelled' } as const
export const statusLabel = (s: string) =>
  ({ active: 'Active', on_hold: 'On hold', done: 'Done', cancelled: 'Cancelled' } as Record<string, string>)[s] ?? s

export const Categories = {
  expense: ['Food', 'Transport', 'Bills', 'Rent', 'Shopping', 'Subscriptions', 'Hosting & domains', 'Stock purchase', 'Equipment', 'Internet & Phone', 'Health', 'Entertainment', 'Education', 'Family', 'Other'],
  income: ['Project payment', 'Rentals', 'Sales', 'Salary', 'Freelance', 'Bonus', 'Refund', 'Gift', 'Other'],
  methods: ['Cash', 'Card', 'Bank transfer', 'USDT', 'Crypto', 'PayPal', 'InstaPay', 'Wallet', 'Other'],
  currencies: ['USD', 'EGP', 'EUR', 'USDT', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'TRY'],
}

export const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

export const goalSaved = (g: Goal) => g.deposits.reduce((s, d) => s + d.amount, 0)
export const goalProgress = (g: Goal) => (g.target <= 0 ? 0 : Math.min(1, Math.max(0, goalSaved(g) / g.target)))
export const debtPaid = (d: Debt) => d.payments.reduce((s, p) => s + p.amount, 0)
export const debtRemaining = (d: Debt) => Math.max(0, d.amount - debtPaid(d))
export const debtSettled = (d: Debt) => d.amount > 0 && debtRemaining(d) <= 0.0001
export const isRunning = (t: TimeEntry) => t.end == null
export const duration = (t: TimeEntry, now = Date.now()) => Math.max(0, (t.end ?? now) - t.start)

// ---- rentals

export const rentalKinds: { value: string; label: string; icon: string }[] = [
  { value: 'vps', label: 'VPS', icon: 'server' },
  { value: 'hosting', label: 'Hosting', icon: 'cloud' },
  { value: 'bot', label: 'Bot', icon: 'bot' },
  { value: 'domain', label: 'Domain', icon: 'globe' },
  { value: 'app', label: 'App / software', icon: 'laptop' },
  { value: 'other', label: 'Other', icon: 'box' },
]
export const rentalKind = (k: string) => rentalKinds.find(x => x.value === k) ?? rentalKinds[rentalKinds.length - 1]
export const rentalPeriods: { value: string; label: string; short: string; months: number }[] = [
  { value: 'monthly', label: 'Monthly', short: 'month', months: 1 },
  { value: 'quarterly', label: 'Every 3 months', short: '3 months', months: 3 },
  { value: 'half', label: 'Every 6 months', short: '6 months', months: 6 },
  { value: 'yearly', label: 'Yearly', short: 'year', months: 12 },
  { value: 'once', label: 'One time', short: 'one time', months: 0 },
]
export const rentalPeriod = (p: string) => rentalPeriods.find(x => x.value === p) ?? rentalPeriods[0]

/** A setting shared by all of the user's devices, like the main currency (id "currency"). */
export interface SyncedSetting { id: string; value: string }

/** A client's answer through a client link: accepted or declined a quote, or says they paid an invoice. */
export interface ClientReply {
  id: string; kind: 'accept' | 'decline' | 'paid'; targetType: 'invoice' | 'quote' | 'project'; targetId: string
  number: string; clientName: string; currency: string; name: string; note: string; amount: number | null; method: string
  at: number; handled: boolean; createdAt: number
}

/** A voice clip saved in a note (a data URL). */
export interface AudioClip { id: string; data: string; dur: number; createdAt: number }

/** Chats are kept on the device only; these come from the native side. */
export interface ChatPerson { id: string; name: string; username: string; avatarRev: number }
export interface ChatMsg {
  id: string; convo: string; from: ChatPerson; text: string; voice: boolean; dur: number
  mentions: string[]; at: number; mine: boolean; status: 'sending' | 'sent' | 'failed'
}
export interface ChatConvo { id: string; title: string; last: string; lastAt: number; unread: number; mentioned: number; people: ChatPerson[] }
