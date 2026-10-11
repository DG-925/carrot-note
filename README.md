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

## Design

Carrot Note 1.3 uses the **Bento Pop** look: a warm light background (with a matching dark theme), bright tiles in carrot orange, mint, butter and lilac, and a dark floating tab bar.

- **Fonts**: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) for headings and numbers, [Onest](https://fonts.google.com/specimen/Onest) for text. Both are bundled in `app/src/main/res/font` under the SIL Open Font License (see `licenses/`).
- **Motion**: cards pop in one after another when a screen opens, buttons spring when pressed, numbers count up, charts and progress rings draw themselves, the tab highlight slides between tabs, and the **+** turns into **×** while the add sheet is open.
- **Building blocks** live in `ui/theme/Theme.kt` (colors, type, shapes), `ui/components/Motion.kt` (press, pop-in and count-up animations) and `ui/components/Components.kt` / `Widgets.kt` (cards, tiles, chips, inputs, charts).

## Project layout

| Path | What |
|---|---|
| `app/` | Android app (Kotlin, Jetpack Compose, Material 3) |
| `server/` | Cloudflare Worker API with a D1 database (`schema.sql`, `src/index.ts`) |
| `.github/workflows/release.yml` | Builds a signed APK and publishes a GitHub Release when you push a tag |

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

## Building locally

Requires JDK 17 and the Android SDK (platform 36).

```bash
./gradlew assembleDebug      # debug build
./gradlew assembleRelease    # signed build (needs keystore.properties, which is never committed)
```
