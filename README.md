# Cadence

Todos and recurring reminders with push notifications — for you, not for
nRepository: `Akhilesh-Varute/cadence` (renamed from `sharpen`).
work. Single-purpose on purpose: it exists to build a daily habit.

## What's in here

Designed after `design/DESIGN.md` (reference prototype in `design/reference/`).

- **Today** (`/`) - a 24-hour day rail, overdue and upcoming reminders, tasks due today.
- **Reminders** (`/reminders`) - repeat daily, weekly (chosen days), monthly or yearly, every N,
  ending never / on a date / after N times. Several alerts each, priority, lists.
- **Tasks** (`/tasks`) - quick add, steps, due date, priority, lists.
- **Settings** (`/settings`) - theme, accent, spacing, week start, lists, default alert, push.
- Works offline: data is copied to IndexedDB and edits sync when you are back online.
- Push notifications: a per-minute call to `/api/cron/remind` (cron-job.org) sends due alerts,
  plus morning and evening digests.

Recurrence lives in `lib/recurrence.js`, shared by the app and the scheduler. Run its tests with
`npm test`.

Single user, PIN-gated, same URL from your PC browser and your iPhone
(Safari → Share → Add to Home Screen makes it feel like a real app).

## One-time setup

### 1. Turso (the database)

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup      # or: turso auth login
turso db create sharpen
turso db show sharpen --url          # -> TURSO_DATABASE_URL
turso db tokens create sharpen       # -> TURSO_AUTH_TOKEN
```

### 2. Local env file

```bash
cp .env.example .env.local
```

Fill in `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from above. For
`APP_SECRET`, run `openssl rand -hex 32` and paste the result. For
`APP_PIN`, pick something you'll actually remember but isn't `0000`.

### 3. Install and initialize

```bash
npm install
npm run db:init      # creates tables
npm run dev           # http://localhost:3000
```

### 4. Deploy so your phone can reach it

```bash
npm i -g vercel
vercel                 # first deploy, follow the prompts
```

Then in the Vercel project's dashboard → Settings → Environment Variables,
add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_SECRET`, `APP_PIN` (same
values as your `.env.local`), and redeploy (`vercel --prod`).

Open the resulting `https://sharpen-....vercel.app` URL on your iPhone,
enter your PIN, then Share → Add to Home Screen.

## Backups

`npm run db:backup` dumps every table to a timestamped JSON file under
`backups/`. Since Turso is SQLite under the hood, you're never locked in —
you can also run `turso db shell sharpen .dump > backup.sql` anytime for a
raw SQL dump that any SQLite tool can read.

This now runs automatically: `.github/workflows/backup.yml` runs
`npm run db:backup` nightly (00:00 IST) and commits the result to this repo
(force-added past `backups/` in `.gitignore`, since the point here is to
keep them). It needs two repo secrets, one-time setup — GitHub → this
repo → Settings → Secrets and variables → Actions → New repository secret:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

(same production values as in Vercel's env vars). You can also trigger a
backup on demand from the Actions tab ("Nightly backup" → Run workflow)
without waiting for the schedule.

## Known issues

- **Next.js is overdue for an upgrade.** `npm audit` turns up a long list of
  advisories against 14.2.35 (the latest 14.x release — there's no patched
  14.x to bump to), the significant one being an unauthenticated RCE in the
  Image Optimization API when AVIF is involved, fixed only in >=15.5.24.
  This app never uses `next/image`, so as a stopgap `next.config.mjs` sets
  `images.unoptimized: true`, which removes that endpoint's exposure
  without needing the upgrade right away. The PostCSS source-map advisory
  (path traversal at *build* time only — nothing here feeds it an untrusted
  map) stays genuinely low-risk. The real fix for all of it is upgrading to
  Next 15 or 16, which is a bigger, separate piece of work (breaking
  changes to review, not a drop-in bump).
- **The login PIN has no rate limiting.** It's a 6-digit numeric PIN with no
  lockout or throttling on `/api/login`, so it's brute-forceable by anyone
  who finds the URL. Fine while the URL isn't shared, but worth adding
  basic rate limiting before treating this as hardened.
