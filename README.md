# 🥕 Carrot Note

A personal assistant app for freelancers on Android: projects, money, tasks, notes, calendar, customers, and debts in one place, synced to your account.

## Features

- **Projects**: client, total price, currency, status, start date and deadline. Each project has its own tasks, notes, payments, costs, profit, info fields (links, specs, accounts) and events.
- **Money**: daily expenses and income with category and payment method (Cash, Card, Bank transfer, USDT, Crypto, PayPal, InstaPay, Wallet…). Multi-currency, monthly summary, reports by category and method, average daily spending, CSV export.
- **Savings goals**: target, deadline, deposits and withdrawals, progress.
- **Calendar**: month view with tasks, events, notes, money, project deadlines and debt due dates. Add items directly to any day.
- **Tasks and reminders**: due date and time, priority, notifications.
- **Customers**: import from phone contacts. Call, WhatsApp or email in one tap. Shows each customer's projects, payments and debts.
- **Debts**: "they owe me" or "I owe", partial payments, due dates. Can record each payment in Money too.
- **Security**: PIN lock, fingerprint or face unlock, auto-lock delay, and an option to hide the app in recent apps or block screenshots.
- **Account and sync**: email and password login. Data works offline and syncs to Cloudflare D1, separately for each user.
- **Auto-update**: checks GitHub Releases, sends a notification, and offers *Update now* or *Later*.

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
npx wrangler d1 execute DB --remote --file=schema.sql   # create tables (first time)
npx wrangler deploy                                     # deploy the API
```

Set the deployed Worker URL in `gradle.properties` (`carrot.apiUrl`).

## Building locally

Requires JDK 17 and the Android SDK (platform 36).

```bash
./gradlew assembleDebug      # debug build
./gradlew assembleRelease    # signed build (needs keystore.properties, which is never committed)
```
