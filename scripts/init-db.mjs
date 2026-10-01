// One-time (and safe-to-rerun) setup: creates tables if they don't exist,
// and seeds your existing learning tracks so day one isn't a blank page.
//
// Run with: npm run db:init
// (reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from .env.local)

import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const schema = `
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL UNIQUE,
  log TEXT DEFAULT '',
  learned TEXT DEFAULT '',
  reflection TEXT DEFAULT '',
  mood INTEGER,
  energy INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  defer_until TEXT,
  completed_date TEXT
);

CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id),
  log_date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, log_date)
);

CREATE TABLE IF NOT EXISTS learning_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learning_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learning_item_id INTEGER REFERENCES learning_items(id),
  log_date TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- learning/log's "give me this one day" query filters on log_date alone --
-- see app/api/learning/log/route.js -- without this it's a full table scan.
CREATE INDEX IF NOT EXISTS idx_learning_log_date ON learning_log(log_date);

-- /api/learning fetches every track's logs in one query filtered by
-- learning_item_id IN (...) -- SQLite doesn't auto-index FK columns.
CREATE INDEX IF NOT EXISTS idx_learning_log_item ON learning_log(learning_item_id);

-- Reminders: a title at a local time, repeating on the days column (comma
-- list of 0=Sun..6=Sat, empty = every day) or once on the date column. tz is
-- the IANA zone the phone was in when saved, so the server cron can work out
-- local time. last_fired_date stops the cron re-sending the same day.
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  time TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '',
  date TEXT,
  tz TEXT NOT NULL DEFAULT 'UTC',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fired_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reminder_logs (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  PRIMARY KEY (reminder_id, log_date)
);

-- One row per digest push sent (morning/evening) per local day.
CREATE TABLE IF NOT EXISTS digest_log (
  kind TEXT NOT NULL,
  log_date TEXT NOT NULL,
  PRIMARY KEY (kind, log_date)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);

-- Failed PIN attempts, for basic login rate limiting (see api/login).
-- Only failures are logged -- a successful login doesn't need throttling.
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, created_at);
`;

// CREATE TABLE IF NOT EXISTS only helps on a fresh database -- an existing
// todos table from before defer_until existed needs the column added by
// hand. Safe to rerun: it only ALTERs when the column is actually missing.
async function ensureColumn(table, column, ddl) {
  const { rows } = await db.execute(`PRAGMA table_info(${table})`);
  if (rows.some((r) => r.name === column)) return;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`Added ${table}.${column}.`);
}

async function main() {
  // Strip `-- ...` line comments before splitting on ";" -- a semicolon
  // inside a comment (e.g. "see api/login") used to get mistaken for a
  // statement boundary here, silently corrupting the next CREATE statement.
  const withoutComments = schema.replace(/--[^\n]*/g, "");
  for (const stmt of withoutComments.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
  console.log("Tables ready.");

  await ensureColumn("todos", "defer_until", "defer_until TEXT");
  await ensureColumn("todos", "completed_date", "completed_date TEXT");

  // One-time backfill for todos completed before completed_date existed:
  // best-effort using the date portion of the completed_at timestamp
  // (stored in UTC). This can be off by a day right around midnight for
  // anyone not on UTC, but it's the only record we have for these older
  // rows -- new completions always get an explicit local completed_date
  // from the client instead, which doesn't have that ambiguity. Safe to
  // rerun: it only touches rows still missing completed_date.
  const backfill = await db.execute(`
    UPDATE todos
    SET completed_date = date(completed_at)
    WHERE done = 1 AND completed_date IS NULL AND completed_at IS NOT NULL
  `);
  if (backfill.rowsAffected > 0) {
    console.log(`Backfilled completed_date for ${backfill.rowsAffected} previously-completed todo(s).`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
