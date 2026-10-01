import { NextResponse } from "next/server";
import { getDb, ensureReminderTables } from "../../../../lib/db";
import { sendToAll } from "../../../../lib/push";

export const dynamic = "force-dynamic";

// A late cron run (GitHub Actions can lag) still fires, but only within this
// many minutes of the set time -- no 9am reminder arriving at 9pm.
const GRACE_MIN = 120;

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

// Called every few minutes by .github/workflows/remind.yml.
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
    await sendToAll({ title: r.title, body: `Reminder at ${r.time}`, tag: `reminder-${r.id}` });
    fired++;
  }
  return NextResponse.json({ ok: true, fired });
}
