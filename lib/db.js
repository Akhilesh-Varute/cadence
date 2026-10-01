import { createClient } from "@libsql/client";

let client;

// One shared connection, reused across API routes (serverless-friendly:
// @libsql/client is fine to instantiate per invocation, but reusing across
// warm lambda invocations saves a bit of latency).
export function getDb() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) {
      throw new Error(
        "TURSO_DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
      );
    }
    client = createClient({ url, authToken });
  }
  return client;
}

export function todayStr(d = new Date()) {
  // Local calendar date as YYYY-MM-DD (not UTC) — journaling "today" should
  // follow the user's clock, not the server's.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Reminder tables, created on first use so a deploy doesn't need a separate
// `npm run db:init` against production. Keep in sync with scripts/init-db.mjs.
let ensured;
export function ensureReminderTables() {
  ensured ??= getDb()
    .batch([
      `CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        time TEXT NOT NULL,
        days TEXT NOT NULL DEFAULT '',
        date TEXT,
        tz TEXT NOT NULL DEFAULT 'UTC',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_fired_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS reminder_logs (
        reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
        log_date TEXT NOT NULL,
        PRIMARY KEY (reminder_id, log_date)
      )`,
      `CREATE TABLE IF NOT EXISTS digest_log (
        kind TEXT NOT NULL,
        log_date TEXT NOT NULL,
        PRIMARY KEY (kind, log_date)
      )`,
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL
      )`,
    ])
    .catch((e) => {
      ensured = undefined;
      throw e;
    });
  return ensured;
}
