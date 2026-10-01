// Server-side data layer for the Cadence-style app: schema + migration from the
// old todos/reminders tables, row <-> object mapping, and the sync ops the
// client sends. Turso is the source of truth; the client keeps a local copy.
import { getDb } from "./db";
import { firstFuture, iso } from "./recurrence";

export const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "#3346FF",
  density: "comfortable",
  weekStart: 1,
  defaultAlert: 0,
  tz: "",
};

const DEFAULT_LISTS = [
  ["personal", "Personal", "#3346FF"],
  ["work", "Work", "#E0407B"],
  ["home", "Home", "#E58A00"],
  ["health", "Health", "#1FAA82"],
];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS reminder_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    list_id TEXT NOT NULL DEFAULT 'personal',
    priority INTEGER NOT NULL DEFAULT 0,
    start TEXT NOT NULL,
    cursor TEXT NOT NULL,
    repeat_type TEXT NOT NULL DEFAULT 'none',
    repeat_interval INTEGER NOT NULL DEFAULT 1,
    repeat_days TEXT NOT NULL DEFAULT '',
    end_type TEXT NOT NULL DEFAULT 'never',
    end_date TEXT NOT NULL DEFAULT '',
    end_count INTEGER NOT NULL DEFAULT 10,
    alerts TEXT NOT NULL DEFAULT '[0]',
    fired TEXT NOT NULL DEFAULT '{}',
    done INTEGER NOT NULL DEFAULT 0,
    tz TEXT NOT NULL DEFAULT 'UTC',
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS task_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    list_id TEXT NOT NULL DEFAULT 'personal',
    priority INTEGER NOT NULL DEFAULT 0,
    due TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    steps TEXT NOT NULL DEFAULT '[]',
    completed_date TEXT,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS digest_log (
    kind TEXT NOT NULL, log_date TEXT NOT NULL, PRIMARY KEY (kind, log_date)
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL
  )`,
];

const json = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export const toReminder = (r) => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  list: r.list_id,
  priority: Number(r.priority),
  start: r.start,
  cursor: r.cursor,
  repeat: {
    type: r.repeat_type,
    interval: Number(r.repeat_interval),
    days: r.repeat_days ? r.repeat_days.split(",").map(Number) : [],
  },
  end: { type: r.end_type, date: r.end_date, count: Number(r.end_count) },
  alerts: json(r.alerts, [0]),
  fired: json(r.fired, {}),
  done: !!r.done,
  tz: r.tz,
  updated_at: Number(r.updated_at),
});

export const toTask = (r) => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  list: r.list_id,
  priority: Number(r.priority),
  due: r.due,
  done: !!r.done,
  steps: json(r.steps, []),
  completed_date: r.completed_date || "",
  updated_at: Number(r.updated_at),
});

let ready;
export function ensureSchema() {
  ready ??= (async () => {
    const db = getDb();
    await db.batch(SCHEMA);
    const done = await db.execute("SELECT 1 FROM app_settings WHERE key = 'migrated_v2'");
    if (done.rows.length) return;

    const lists = await db.execute("SELECT COUNT(*) c FROM lists");
    if (!Number(lists.rows[0].c)) {
      await db.batch(
        DEFAULT_LISTS.map(([id, name, color], i) => ({
          sql: "INSERT INTO lists (id, name, color, sort) VALUES (?, ?, ?, ?)",
          args: [id, name, color, i],
        }))
      );
    }

    const has = async (t) =>
      (await db.execute({ sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", args: [t] })).rows.length > 0;

    // Old todos -> tasks. defer_until becomes the due date.
    if (await has("todos")) {
      await db.execute(`
        INSERT OR IGNORE INTO task_items (id, title, list_id, due, done, completed_date, updated_at)
        SELECT 't' || id, text, 'personal', COALESCE(defer_until, ''), done, completed_date, 0 FROM todos
      `);
    }

    // Old reminders -> reminder_items. A disabled or already-fired one-off is
    // kept as done so it lands under "Completed" instead of vanishing.
    if (await has("reminders")) {
      const { rows } = await db.execute("SELECT * FROM reminders");
      const stmts = rows.map((r) => {
        const days = r.days ? r.days.split(",").map(Number) : [];
        const oneOff = !!r.date;
        const startDate = r.date || String(r.created_at || "").slice(0, 10) || iso(new Date()).slice(0, 10);
        const obj = {
          start: `${startDate}T${r.time}`,
          repeat: { type: oneOff ? "none" : days.length ? "weekly" : "daily", interval: 1, days },
          end: { type: "never" },
        };
        const done = !r.enabled || (oneOff && r.last_fired_date === r.date);
        return {
          sql: `INSERT OR IGNORE INTO reminder_items
            (id, title, list_id, start, cursor, repeat_type, repeat_interval, repeat_days, done, tz, updated_at)
            VALUES (?, ?, 'personal', ?, ?, ?, 1, ?, ?, ?, 0)`,
          args: [`r${r.id}`, r.title, obj.start, firstFuture(obj), obj.repeat.type, days.join(","), done ? 1 : 0, r.tz || "UTC"],
        };
      });
      if (stmts.length) await db.batch(stmts);
    }

    await db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('migrated_v2', '1')");
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

export async function getSettings() {
  const { rows } = await getDb().execute("SELECT value FROM app_settings WHERE key = 'settings'");
  return { ...DEFAULT_SETTINGS, ...(rows[0] ? json(rows[0].value, {}) : {}) };
}

export async function loadState() {
  await ensureSchema();
  const db = getDb();
  const [lists, reminders, tasks, settings] = await Promise.all([
    db.execute("SELECT id, name, color FROM lists ORDER BY sort, rowid"),
    db.execute("SELECT * FROM reminder_items"),
    db.execute("SELECT * FROM task_items"),
    getSettings(),
  ]);
  return {
    lists: lists.rows.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    reminders: reminders.rows.map(toReminder),
    tasks: tasks.rows.map(toTask),
    settings,
  };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v) => (typeof v === "string" ? v : "");
const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"];
const ENDS = ["never", "date", "count"];

async function putReminder(db, r) {
  if (!r?.id || !str(r.title).trim() || !r.start || !r.cursor) throw new Error("invalid reminder");
  const existing = (await db.execute({ sql: "SELECT cursor, fired, updated_at FROM reminder_items WHERE id = ?", args: [r.id] })).rows[0];
  const at = num(r.updated_at);
  if (existing && Number(existing.updated_at) > at) return; // a newer write already landed
  // Keep alerts the scheduler already sent for this same occurrence.
  const fired = { ...(existing && existing.cursor === r.cursor ? json(existing.fired, {}) : {}), ...(r.fired || {}) };
  const rep = r.repeat || {};
  const end = r.end || {};
  await db.execute({
    sql: `INSERT OR REPLACE INTO reminder_items
      (id, title, notes, list_id, priority, start, cursor, repeat_type, repeat_interval, repeat_days,
       end_type, end_date, end_count, alerts, fired, done, tz, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r.id, str(r.title).trim(), str(r.notes), str(r.list) || "personal", Math.min(3, Math.max(0, num(r.priority))),
      r.start, r.cursor,
      REPEATS.includes(rep.type) ? rep.type : "none", Math.min(52, Math.max(1, num(rep.interval, 1))),
      (rep.days || []).map(Number).filter((d) => d >= 0 && d <= 6).join(","),
      ENDS.includes(end.type) ? end.type : "never", str(end.date), Math.max(1, num(end.count, 10)),
      JSON.stringify((r.alerts || []).map(Number)), JSON.stringify(fired), r.done ? 1 : 0, str(r.tz) || "UTC", at,
    ],
  });
}

async function putTask(db, t) {
  if (!t?.id || !str(t.title).trim()) throw new Error("invalid task");
  const existing = (await db.execute({ sql: "SELECT updated_at FROM task_items WHERE id = ?", args: [t.id] })).rows[0];
  const at = num(t.updated_at);
  if (existing && Number(existing.updated_at) > at) return;
  await db.execute({
    sql: `INSERT OR REPLACE INTO task_items
      (id, title, notes, list_id, priority, due, done, steps, completed_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      t.id, str(t.title).trim(), str(t.notes), str(t.list) || "personal", Math.min(3, Math.max(0, num(t.priority))),
      str(t.due), t.done ? 1 : 0, JSON.stringify(Array.isArray(t.steps) ? t.steps : []), str(t.completed_date) || null, at,
    ],
  });
}

// Apply a batch of client ops in order. Each op is independent: one bad op
// doesn't stop the rest, and its error is reported back.
export async function applyOps(ops) {
  await ensureSchema();
  const db = getDb();
  const errors = [];
  for (const [i, op] of ops.entries()) {
    try {
      if (op.op === "put" && op.kind === "reminder") await putReminder(db, op.item);
      else if (op.op === "put" && op.kind === "task") await putTask(db, op.item);
      else if (op.op === "put" && op.kind === "list") {
        const l = op.item;
        if (!l?.id) throw new Error("invalid list");
        await db.execute({
          sql: "INSERT INTO lists (id, name, color, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM lists)) ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color",
          args: [l.id, str(l.name) || "Untitled", str(l.color) || "#3346FF"],
        });
      } else if (op.op === "del" && (op.kind === "reminder" || op.kind === "task")) {
        await db.execute({ sql: `DELETE FROM ${op.kind}_items WHERE id = ?`, args: [op.id] });
      } else if (op.op === "settings") {
        const merged = { ...(await getSettings()), ...(op.value || {}) };
        await db.execute({ sql: "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('settings', ?)", args: [JSON.stringify(merged)] });
      } else {
        throw new Error("unknown op");
      }
    } catch (e) {
      errors.push({ index: i, error: e.message });
    }
  }
  return errors;
}
