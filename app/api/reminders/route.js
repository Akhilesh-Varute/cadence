import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(b) {
  const days = Array.isArray(b.days)
    ? [...new Set(b.days.map(Number))].filter((d) => d >= 0 && d <= 6).sort().join(",")
    : "";
  return {
    title: String(b.title || "").trim(),
    time: b.time,
    days,
    date: b.date && DATE_RE.test(b.date) ? b.date : null,
    tz: b.tz || "UTC",
  };
}

// ?today=YYYY-MM-DD also returns which reminders were ticked off that day.
export async function GET(req) {
  const today = req.nextUrl.searchParams.get("today");
  const db = getDb();
  const { rows } = await db.execute("SELECT * FROM reminders ORDER BY time ASC, id ASC");
  let doneIds = [];
  if (today) {
    const r = await db.execute({ sql: "SELECT reminder_id FROM reminder_logs WHERE log_date = ?", args: [today] });
    doneIds = r.rows.map((x) => Number(x.reminder_id));
  }
  return NextResponse.json({ reminders: rows, doneIds });
}

export async function POST(req) {
  const r = clean(await req.json());
  if (!r.title || !TIME_RE.test(r.time || "")) {
    return NextResponse.json({ error: "title and HH:MM time required" }, { status: 400 });
  }
  await getDb().execute({
    sql: "INSERT INTO reminders (title, time, days, date, tz) VALUES (?, ?, ?, ?, ?)",
    args: [r.title, r.time, r.days, r.date, r.tz],
  });
  return NextResponse.json({ ok: true });
}

// {id, done, date} toggles that day's tick. {id, enabled} flips the switch.
// Otherwise {id, title, time, days, date, tz} rewrites the reminder (and
// clears last_fired_date so a changed time can fire again today).
export async function PATCH(req) {
  const b = await req.json();
  const db = getDb();
  if (b.done !== undefined) {
    if (!DATE_RE.test(b.date || "")) return NextResponse.json({ error: "date required" }, { status: 400 });
    await db.execute(
      b.done
        ? { sql: "INSERT OR IGNORE INTO reminder_logs (reminder_id, log_date) VALUES (?, ?)", args: [b.id, b.date] }
        : { sql: "DELETE FROM reminder_logs WHERE reminder_id = ? AND log_date = ?", args: [b.id, b.date] }
    );
  } else if (b.enabled !== undefined) {
    await db.execute({ sql: "UPDATE reminders SET enabled = ? WHERE id = ?", args: [b.enabled ? 1 : 0, b.id] });
  } else {
    const r = clean(b);
    if (!r.title || !TIME_RE.test(r.time || "")) {
      return NextResponse.json({ error: "title and HH:MM time required" }, { status: 400 });
    }
    await db.execute({
      sql: "UPDATE reminders SET title = ?, time = ?, days = ?, date = ?, tz = ?, last_fired_date = NULL WHERE id = ?",
      args: [r.title, r.time, r.days, r.date, r.tz, b.id],
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const id = req.nextUrl.searchParams.get("id");
  const db = getDb();
  await db.execute({ sql: "DELETE FROM reminder_logs WHERE reminder_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM reminders WHERE id = ?", args: [id] });
  return NextResponse.json({ ok: true });
}
