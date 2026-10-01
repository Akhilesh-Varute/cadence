import { NextResponse } from "next/server";
import { getDb, ensureReminderTables } from "../../../../lib/db";
import { sendToAll } from "../../../../lib/push";
import { isDueOn } from "../../../../lib/reminders";

export const dynamic = "force-dynamic";

// A late cron run (GitHub Actions can lag) still fires, but only within this
// many minutes of the set time -- no 9am reminder arriving at 9pm.
const GRACE_MIN = 120;

// Daily digests, local time. Change here to move them.
const DIGESTS = [
  { kind: "morning", at: 8 * 60 },
  { kind: "evening", at: 20 * 60 },
];

function localNow(tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(new Date());
  } catch {
    return localNow("UTC");
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

// One push per kind per local day: the digest_log insert is the lock, so
// overlapping cron calls can't double-send.
async function sendDigests(db, tz) {
  const now = localNow(tz);
  let sent = 0;
  for (const d of DIGESTS) {
    const late = now.minutes - d.at;
    if (late < 0 || late > GRACE_MIN) continue;
    const claim = await db.execute({
      sql: "INSERT OR IGNORE INTO digest_log (kind, log_date) VALUES (?, ?)",
      args: [d.kind, now.date],
    });
    if (!claim.rowsAffected) continue;

    const todos = (
      await db.execute({
        sql: "SELECT text FROM todos WHERE done = 0 AND (defer_until IS NULL OR defer_until <= ?) ORDER BY created_at DESC",
        args: [now.date],
      })
    ).rows.map((r) => r.text);
    const rems = (await db.execute("SELECT * FROM reminders WHERE enabled = 1")).rows.filter((r) => isDueOn(r, now.date));
    let doneRems = 0;
    if (d.kind === "evening" && rems.length) {
      const logs = await db.execute({ sql: "SELECT reminder_id FROM reminder_logs WHERE log_date = ?", args: [now.date] });
      const ids = new Set(logs.rows.map((x) => Number(x.reminder_id)));
      doneRems = rems.filter((r) => ids.has(Number(r.id))).length;
    }
    const openRems = rems.length - doneRems;
    const n = todos.length + openRems;
    const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;

    let payload;
    if (d.kind === "morning") {
      if (!n) continue;
      payload = {
        title: `Today: ${plural(n, "thing")}`,
        body: [...todos.slice(0, 3), ...(openRems ? [plural(openRems, "reminder")] : [])].join(" · "),
      };
    } else {
      if (!n) {
        const done = await db.execute({ sql: "SELECT COUNT(*) c FROM todos WHERE completed_date = ?", args: [now.date] });
        if (!Number(done.rows[0].c) && !rems.length) continue;
        payload = { title: "All done today", body: "Nothing left open. Nice." };
      } else {
        payload = { title: `${plural(n, "thing")} still open`, body: todos.slice(0, 3).join(" · ") || plural(openRems, "reminder") };
      }
    }
    await sendToAll({ ...payload, tag: `digest-${d.kind}` });
    sent++;
  }
  return sent;
}

// Called every few minutes by an external every-minute cron (cron-job.org).
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureReminderTables();
  const db = getDb();
  const { rows } = await db.execute("SELECT * FROM reminders WHERE enabled = 1");
  let fired = 0;
  for (const r of rows) {
    const now = localNow(r.tz);
    if (r.last_fired_date === now.date) continue;
    if (r.date ? r.date !== now.date : r.days && !r.days.split(",").includes(String(now.dow))) continue;
    const [h, m] = r.time.split(":").map(Number);
    const late = now.minutes - (h * 60 + m);
    if (late < 0 || late > GRACE_MIN) continue;
    // Skip the ping if it's already ticked off today.
    const done = await db.execute({
      sql: "SELECT 1 FROM reminder_logs WHERE reminder_id = ? AND log_date = ?",
      args: [r.id, now.date],
    });
    await db.execute({ sql: "UPDATE reminders SET last_fired_date = ? WHERE id = ?", args: [now.date, r.id] });
    if (done.rows.length) continue;
    await sendToAll({ title: r.title, body: `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`, tag: `reminder-${r.id}` });
    fired++;
  }
  // Digests follow the zone of the most recently saved reminder (same zone
  // the reminders themselves use), Asia/Kolkata if there are none yet.
  const tzRow = await db.execute("SELECT tz FROM reminders ORDER BY id DESC LIMIT 1");
  const digests = await sendDigests(db, tzRow.rows[0]?.tz || "Asia/Kolkata");
  return NextResponse.json({ ok: true, fired, digests });
}
