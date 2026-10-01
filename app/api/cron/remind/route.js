import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { ensureSchema, getSettings, toReminder } from "../../../../lib/data";
import { sendToAll } from "../../../../lib/push";
import { wallClock, rollForward, parse, dateOnly, fmtTime } from "../../../../lib/recurrence";

export const dynamic = "force-dynamic";

// A late cron run still fires an alert, but only within this many minutes of
// it being due -- no 9am reminder arriving at 9pm.
const GRACE_MIN = 120;

// Daily digests: local times come from Settings ("HH:MM", or "" for off).
function digestSchedule(settings) {
  return [
    { kind: "morning", time: settings.digestMorning },
    { kind: "evening", time: settings.digestEvening },
  ]
    .filter((d) => /^\d\d:\d\d$/.test(d.time || ""))
    .map((d) => ({ kind: d.kind, at: Number(d.time.slice(0, 2)) * 60 + Number(d.time.slice(3)) }));
}

function alertBody(m, cursor) {
  const time = fmtTime(parse(cursor));
  if (m === 0) return time;
  return m >= 1440 ? `Tomorrow, ${time}` : `In ${m} min, ${time}`;
}

// Per reminder: roll a repeating one forward if its next occurrence has
// arrived, then send each alert whose moment has come and hasn't been sent for
// this occurrence. `fired` records sent alerts so nothing repeats.
async function sendReminderAlerts(db, fallbackTz) {
  const { rows } = await db.execute("SELECT * FROM reminder_items WHERE done = 0");
  let sent = 0;
  for (const row of rows) {
    const r = toReminder(row);
    const now = wallClock(r.tz || fallbackTz);
    let changed = rollForward(r, now);
    for (const m of r.alerts) {
      const key = `${r.cursor}|${m}`;
      if (r.fired[key]) continue;
      const due = new Date(parse(r.cursor).getTime() - m * 60000);
      if (due > now) continue;
      r.fired[key] = 1;
      changed = true;
      if (now - due > GRACE_MIN * 60000) continue; // too stale to be useful
      await sendToAll({ title: r.title, body: alertBody(m, r.cursor), tag: `reminder-${r.id}-${m}` });
      sent++;
    }
    if (changed) {
      // updated_at is left alone on purpose: this is scheduler bookkeeping, not a user edit.
      await db.execute({
        sql: "UPDATE reminder_items SET cursor = ?, fired = ? WHERE id = ?",
        args: [r.cursor, JSON.stringify(r.fired), r.id],
      });
    }
  }
  return sent;
}

// One push per kind per local day: the digest_log insert is the lock, so
// overlapping cron calls can't double-send.
async function sendDigests(db, tz, schedule) {
  const wall = wallClock(tz);
  const today = dateOnly(wall);
  const minutes = wall.getHours() * 60 + wall.getMinutes();
  let sent = 0;
  for (const d of schedule) {
    const late = minutes - d.at;
    if (late < 0 || late > GRACE_MIN) continue;
    const claim = await db.execute({
      sql: "INSERT OR IGNORE INTO digest_log (kind, log_date) VALUES (?, ?)",
      args: [d.kind, today],
    });
    if (!claim.rowsAffected) continue;

    // Same rule as the Today screen: tasks due today or earlier, reminders due today or overdue.
    const tasks = (
      await db.execute({
        sql: "SELECT title FROM task_items WHERE done = 0 AND due != '' AND due <= ? ORDER BY due, title",
        args: [today],
      })
    ).rows.map((r) => r.title);
    const reminders = (
      await db.execute({
        sql: "SELECT title FROM reminder_items WHERE done = 0 AND substr(cursor, 1, 10) <= ?",
        args: [today],
      })
    ).rows.map((r) => r.title);
    const names = [...tasks, ...reminders];
    const n = names.length;
    const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;

    let payload;
    if (d.kind === "morning") {
      if (!n) continue;
      payload = { title: `Today: ${plural(n, "thing")}`, body: names.slice(0, 3).join(", ") };
    } else if (n) {
      payload = { title: `${plural(n, "thing")} still open`, body: names.slice(0, 3).join(", ") };
    } else {
      const done = await db.execute({ sql: "SELECT COUNT(*) c FROM task_items WHERE completed_date = ?", args: [today] });
      if (!Number(done.rows[0].c)) continue;
      payload = { title: "All done today", body: "Nothing left open." };
    }
    await sendToAll({ ...payload, tag: `digest-${d.kind}` });
    sent++;
  }
  return sent;
}

// Called every minute by cron-job.org.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const db = getDb();
  // Zone used when a reminder has none, and for the digests: what the phone last reported.
  const settings = await getSettings();
  const tz = settings.tz || "Asia/Kolkata";
  const fired = await sendReminderAlerts(db, tz);
  const digests = await sendDigests(db, tz, digestSchedule(settings));
  return NextResponse.json({ ok: true, fired, digests });
}
