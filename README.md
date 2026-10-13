# 🥕 Carrot Note

A personal assistant app for freelancers on Android: projects, money, time, notes, calendar, customers and debts in one place, synced to your account and shareable with your team.

## Features

- **Navigation**: a ☰ sidebar (Dashboard, Money, Projects, Notes, Calendar, Time tracker, Customers, Debts, Invitations, Savings goals, Search, Profile, Settings) and a bottom bar with a quick-add **+** for anything.
- **Projects**: client, status (drop-down), fixed price or hourly rate, start date, deadline, GitHub repo link, info fields. Each project has tasks, notes, tracked time, payments, costs, profit and events, plus a **PDF invoice** you can share.
- **Teams**: invite people to a project by @username. Members see and add tasks, notes and events. Your money stays private. The owner can remove members; members can leave.
- **Time tracker**: start/stop a timer per project (with a live notification and a Stop button), add time manually, and see daily and weekly totals.
- **Money**: daily expenses and income with category icons and payment methods (Cash, Card, Bank transfer, USDT, Crypto, PayPal, InstaPay, Wallet…). Monthly balance, daily spending chart, breakdown by category, method and source, **monthly budgets**, history search and CSV export.
- **Notes**: personal or project notes, checklists, colours, pinning and sharing.
- **Savings goals**, **debts**, **customers** (import from contacts; call, WhatsApp or email in one tap) and a **calendar** with everything on it.
- **Profile**: photo (from the gallery or from GitHub), name, @username, bio, a linked GitHub account and stats, plus sharing.
- **Account**: sign up with a username and a password typed twice; sign in with username or email. Data works offline and syncs to Cloudflare D1.
- **Security**: PIN lock, fingerprint or face unlock, auto-lock delay, and an option to hide the app in recent apps or block screenshots.
- **Auto-update**: checks GitHub Releases, sends a notification, and offers *Update now* or *Later*.

### New in 1.13: 10 home-screen widgets

Long-press your home screen → Widgets → Carrot Note:

1. **Today** (resizable): this month's money, tasks due today or late that you tick off right there (repeating tasks get their next one), the timer, quick Expense / Income / Task, and rentals to renew or your next event.
2. **Money** (2×2): this month's money, in and out, progress towards your income target, Expense / Income buttons.
3. **Quick add** (4×1): Expense, Income, Task, Note and Timer in one strip.
4. **Timer** (2×2): one-tap start and stop, a live clock on orange while it runs, and the hours tracked today.
5. **Agenda** (4×3): today's and tomorrow's events and tasks in time order.
6. **Renew soon** (4×2): rentals in order of when they run out, with the days left.
7. **Savings goal** (2×2): the goal closest to its deadline, with its progress bar.
8. **Targets** (4×2): this month's targets with progress bars.
9. **Owed to you** (2×2): unpaid invoices and debts, who owes the most, and what you owe.
10. **Pinned note** (2×2): your pinned note or checklist.

All of them follow the phone's dark mode, hide amounts when "Hide amounts" is on, use the app's language, and open the right page when tapped.

### New in 1.12.1

- **Everything syncs between phone and PC**: an app that was older than the data (for example a phone on 1.11 when a price list was saved on the PC) used to skip those records for good. Now they are kept, and after this update each app downloads everything once more, so anything missing shows up.
- **Main currency syncs too**: changing it in Settings changes it on your other devices.

### New in 1.12

- **Quotes**: send a price offer as a PDF or on WhatsApp. When the client says yes, one tap turns it into a project and a draft invoice. See what's waiting and your win rate.
- **Wallets**: Cash, bank, InstaPay, PayPal… each with its own balance. Payments land in a wallet by their payment method (or pick one), and "Move money" records transfers between them, even across currencies.
- **Suppliers**: who you buy from, what you paid them, what you still owe them and the stock they sold you. Pick a supplier on expenses, debts and stock purchases.
- **Price list**: save what you sell and its usual price, then add it to invoices and quotes in one tap.
- **Insights**: profit over 3, 6 or 12 months, money in and out each month, best clients, most profitable projects, rental income, fastest-selling stock, quote win rate and how long clients take to pay.
- **Contracts & files**: photos of contracts, ID copies, agreements and warranties linked to a client, project or supplier, with a reminder before they end.
- **Team activity**: shared projects show who added, changed, finished or paid what, and teammates' changes arrive as a notification.
- **Monthly targets**: goals like "earn 20,000 EGP", "sell 10 laptops" or "4 new clients", with progress rings on Home.
- **Smart WhatsApp messages**: ready-made messages (in English and Arabic) for payment reminders, renewals, expired services, invoices, quotes and thank-yous, filled in with the name, amount and date. Edit them in Account → Message templates.
- Needs the updated API so quotes and activity are shared in team projects (it deploys by itself from GitHub).

### New in 1.11

- **Android 5.1 and up**: the app now installs on Android 5.1.1 (API 22) and newer. Old phones need an up-to-date "Android System WebView" from the Play Store (the app says so if it's too old), and the app carries the newer security certificates those phones are missing.
- **Live updates**: the PC app now checks for teammates' changes and new invitations every 15 seconds (the phone too), so there's no need to restart to see them.
- **Shared projects**: invoices linked to a shared project are shared too, like rentals. The app tells you when your server still needs the update.
- **PC home**: a real dashboard on wide windows (money and work on the left, today and renewals on the right), and big screens are scaled up automatically. Settings → Interface size, or Ctrl + / Ctrl −.

### New in 1.10.1

- **Rentals in shared projects are shared**: a rental linked to a shared project (and its costs, price and renewals) shows for everyone in the team, and anyone can renew or edit it. Rentals not linked to a shared project stay private. Needs the updated API (see "Backend": run the "Deploy API" workflow or `npx wrangler deploy`); rentals added before then move in on the next sync.

### New in 1.10: Stock

- **Stock** (in the menu, and "Sale" / "Stock item" under New): for selling physical things like PCs, phones or parts. Each item has a photo, condition (new, used, refurbished), category, serial number and selling price.
- **Buy and sell**: buying adds pieces at the price you paid (the app keeps the average cost); selling takes them out and shows the profit of that sale. Sales and purchases can go straight into Money ("Sales" income, "Stock purchase" expense), and a customer who pays later is added to Debts.
- **See where you stand**: stock value at cost, what it could sell for, pieces in stock, profit this month, items running low or sold out (with your own warning level), and "Fix the count" for broken, lost or recounted pieces.
- **Dropdowns**: every dropdown (currency, status, customer, project…) now opens a list in the app's own style, which you can also use with the keyboard on PC.

### New in 1.9.1

- Windows: rows of choices (categories, payment methods, filters) show every option instead of scrolling sideways, and anything that still scrolls sideways moves with the mouse wheel or by dragging.

### New in 1.9: products you rent out, and partners

- **Product projects**: when you create a project, choose "Client work" or "Product we rent". A product (like a POS system) gets a **Renters** tab: who rents it, what they pay, when it started and when it runs out, with the same countdowns, reminders and Renew button as other rentals. The project shows renters, monthly income, costs and profit.
- **Partners**: every project has a **Partners** tab. Set each partner's usual share (team members are added automatically; people without the app can be added by name). Add each payment the project brings in and split it by shares or with custom amounts. Each partner sees how much they made, how much they've received, and what's still owed to them. When you renew a renter, the profit can be split automatically.
- Partners and earnings are saved in the project itself, so everyone in a shared project sees the same numbers. Renters stay private to you, like other rentals.
- **Big screens**: on the Windows app, cards now pack together with no gaps, the page uses the whole window at any size (1080p, 1440p, 4K), and the chart on the orange card no longer stretches.

### New in 1.8: Carrot Note for Windows

A desktop app built with **Tauri + TypeScript**. Download `carrot-note-vX.Y.Z-windows-setup.exe` (or the `.msi`) from the [latest release](https://github.com/DG-925/carrot-note/releases/latest), install it, and sign in with the same account: everything syncs with the phone app.
- **Same interface:** the same TypeScript UI as the phone, in a window.
- **Local storage and sync:** your data is kept on the PC (IndexedDB) and synced with the same server.
- **Reminders and monitoring:** reminders, "still working?" and rental uptime checks arrive as Windows notifications while the app is open.
- **PDFs:** invoices and reports open the print dialog, where *Microsoft Print to PDF* saves a PDF.
- **Files:** CSV and backup export and restore use normal Save/Open dialogs.
- **Not on the PC:** phone contacts, contact birthdays, fingerprint unlock and the home-screen widget.

Developing it: `cd desktop && npm install && npm run dev` (needs Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)). `npm run build` makes the Windows installer.

### New in 1.7

- **Invoices**: numbered invoices with line items, discount and tax, Draft/Sent/Part paid/Paid/Overdue, partial payments (also added to Money), a PDF to share, a WhatsApp reminder, and a notification on the due date.
- **Rentals**: look up a domain's real expiry date and registrar (RDAP, free), and uptime checks every 15 minutes for a site (https://…) or server (host:port) with a notification when it goes down or comes back.
- **Home-screen widget**: what's due today, a timer start/stop button, and rentals to renew.
- **Recurring income and expenses** that add themselves to Money on their dates (or tick *Repeats* when adding a transaction).
- **Receipt photos** on transactions (camera or gallery).
- **Yearly report** by month, client, category, hours and invoices, with a PDF for your accountant.
- **Totals in one currency**: mixed-currency totals also show "≈ … in total" at live rates.
- **Task board** per project (To do / Doing / Done) with steps (subtasks) and assigning tasks to team members.
- **Timer safety net**: a "Still working?" notification after 4 hours, with Stop and Keep going.
- **Share into Carrot Note** from any app: save shared text or links as a note, task, expense or income.
- **Password vault** for client logins, encrypted on the phone (AES-GCM, PBKDF2) before syncing, with fingerprint unlock and a password generator.
- **Restore from backup** in Settings.
- **Arabic** with right-to-left layout (Settings or the menu).

### New in 1.6.1

- **Mark events as done**: tick an event off in any list (Home, Calendar, a project or a customer), or use the *Done* switch when editing it. Done events are crossed out, sorted to the bottom, left out of the counts, and send no reminder.

### New in 1.6: Rentals

Track the VPS, hosting, bots and domains you rent to clients:
- **Details**: what it is, the client, the provider or registrar, and the project.
- **Dates**: when it started and when it expires or renews.
- **Money**: billing every month, 3 or 6 months, yearly or one time, with what it costs you and what the client pays you (each in its own currency).
- **Countdown**: each rental shows a live countdown to expiry and how much of the paid period is used.
- **Totals**: your monthly profit from all rentals.
- **Reminders**: a notification some days before a rental expires (you choose how many) and another on the day.
- **Renewing**: one tap renews a rental, logs what you paid and what the client paid in Money, and keeps a renewal history.
- **Asking to pay**: send the client a payment request on WhatsApp.
- **Everywhere**: expiries show on Home (*Renew soon*), in the calendar, in search, and on the customer and project pages. Rentals are private, even in shared projects.

### New in 1.5

- **New logo** (1.5.1): an orange fingerprint on white.
- **Search everywhere**: a search button in every main header, plus search bars on Money, Projects, Notes, Calendar, Time, Debts and Savings.
- **New menu**: profile card with quick stats, search, quick-add buttons, colourful section tiles with live counts, theme switch and *Hide amounts*.
- **GitHub repos from your account**: a project's repository is picked from your linked GitHub account. Pasted links are checked, and only repos you own or contribute to are accepted. The project page shows stars, language, issues and the last push.
- **Public holidays around the world** in the calendar from [Nager.Date](https://date.nager.at), a free API. Pick any countries; the list is kept for offline use.
- **10 more features**:
  1. Repeating tasks: daily, weekly or monthly.
  2. Undo after deleting anything.
  3. A calculator in amount fields (`120+35*2`).
  4. *Hide amounts* privacy mode.
  5. A weekly insights card on Home.
  6. A focus (Pomodoro) timer.
  7. Payment reminders on WhatsApp for debts and unpaid projects.
  8. A live currency converter ([open.er-api.com](https://open.er-api.com)).
  9. Contacts' birthdays in the calendar.
  10. Long-press launcher shortcuts: New expense, New task, Start timer, Search.
  
  Also new: a full JSON backup export in Settings.

## Design

Since 1.4 the whole interface is a **TypeScript + CSS** web app (`web/`) shown inside the Android app in a WebView. Kotlin keeps doing everything the phone needs: the offline database and sync, notifications and reminders, PIN and fingerprint lock, the work timer, invoices, contacts, sharing and updates. The two talk through a small bridge (`app/src/main/java/com/carrotnote/app/web/WebBridge.kt` ↔ `web/src/bridge.ts`).

- **Look**: Bento Pop. Warm light background (with a dark theme), bright tiles in carrot orange, mint, butter and lilac, and a dark floating tab bar.
- **Fonts**: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) for headings and numbers, [Onest](https://fonts.google.com/specimen/Onest) for text, both bundled under the SIL Open Font License (see `licenses/`).
- **Motion**: cards pop in one after another, buttons spring when pressed, numbers count up, charts and rings draw themselves, the tab highlight slides, sheets bounce up and the **+** turns into **×**.
- **Customers** lists every contact on your phone (after you allow contacts access), with call, WhatsApp and email buttons and one tap to save someone as a customer.

### Working on the UI

```bash
cd web
npm install
npm run dev        # builds into app/src/main/assets/web with source maps
npm run typecheck
```

Open `app/src/main/assets/web/index.html` in a desktop browser to try the UI with example data (a mock replaces the Android bridge). Add `?theme=2` for dark mode, `?lock=1` for the lock screen (PIN `1234`) or `?auth=1` for the sign-in screen. The release workflow rebuilds the bundle before building the APK; commit the built files too so a plain Gradle build works.

## Project layout

| Path | What |
|---|---|
| `app/` | Android shell (Kotlin): WebView host, data, sync, notifications, lock |
| `web/` | The UI: TypeScript (Preact) + CSS, bundled into `app/src/main/assets/web` (and `desktop/dist` with `npm run build:desktop`) |
| `web/src/desktop/` | The desktop side of the bridge in TypeScript: offline store, sync, sign-in, notifications, files |
| `desktop/` | Windows app (Tauri 2); `src-tauri/` is the small Rust host |
| `server/` | Cloudflare Worker API with a D1 database (`schema.sql`, `src/index.ts`) |
| `.github/workflows/release.yml` | Builds the signed APK and the Windows installer and publishes a GitHub Release |
| `.github/workflows/desktop.yml` | Test build of the Windows app on every change to `desktop/` or `web/` |

## Releasing an update

1. Commit your changes.
2. Tag and push:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. GitHub Actions builds `carrot-note-v1.0.1.apk` and publishes the release. Installed apps get notified within about 12 hours, or right away when the app is opened.

The version code is derived from the version name (`1.2.3` → `10203`), so every new tag must be a higher version.

## Backend

```bash
cd server
npx wrangler d1 execute DB --remote --file=schema.sql   # new database: create tables
npx wrangler d1 execute DB --remote --file=migrations/0002_profiles_and_sharing.sql   # upgrade a v1 database
npx wrangler deploy                                     # deploy the API
```

The API is live at `https://carrot-note-api.carrot-note-api.workers.dev` (set in `gradle.properties` as `carrot.apiUrl`).

**Deploying from GitHub:** add the repository secret `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile → API Tokens, with Workers Scripts: Edit, D1: Edit and Account Settings: Read). The account id is already in `server/wrangler.toml`. The "Deploy API" workflow then deploys `server/` whenever it changes, or on demand from the Actions tab.

## Building locally

Requires JDK 17 and the Android SDK (platform 36).

```bash
./gradlew assembleDebug      # debug build
./gradlew assembleRelease    # signed build (needs keystore.properties, which is never committed)
```
