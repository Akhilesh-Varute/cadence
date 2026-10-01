// Recurrence engine, shared by the app and the server scheduler.
// Ported from occ() / describe() in design/reference/cadence.html.
//
// Times are "wall-clock" strings, "YYYY-MM-DDTHH:MM", with no zone. Date
// objects built from them use the host's local fields, so this runs the same
// in a phone browser (its own zone) and on the server (see wallClock below).
//
// A reminder, as this module sees it:
//   { start, cursor, repeat:{type,interval,days}, end:{type,date,count}, fired, done }

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n) => String(n).padStart(2, "0");

export const iso = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const parse = (s) => new Date(s);
export const dateOnly = (d) => iso(d).slice(0, 10);

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const dayDiff = (d, now = new Date()) => Math.round((startOfDay(d) - startOfDay(now)) / 864e5);

export function fmtTime(d) {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h >= 12 ? "PM" : "AM"}`;
}

export function fmtDay(d, now = new Date()) {
  const n = dayDiff(d, now);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return DOWL[d.getDay()];
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

export const fmtWhen = (d, now) => `${fmtDay(d, now)}, ${fmtTime(d)}`;

// Wall-clock "now" in an IANA zone, as a Date whose *local* fields read that
// zone's clock. Lets the server compare against wall-clock cursors.
export function wallClock(tz, at = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return wallClock("UTC", at);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

// The next `n` occurrences at or after `from`.
export function occ(r, from, n) {
  const out = [];
  const base = parse(r.start);
  const rep = r.repeat;
  const end = r.end || { type: "never" };
  let idx = 0;
  let guard = 0;
  const endDate = end.type === "date" && end.date ? new Date(`${end.date}T23:59:59`) : null;

  // false = stop generating
  function push(d) {
    if (endDate && d > endDate) return false;
    if (end.type === "count" && idx >= end.count) return false;
    idx++;
    if (d >= from) out.push(new Date(d));
    return out.length < n;
  }

  if (rep.type === "none") {
    push(base);
    return out;
  }
  const iv = Math.max(1, rep.interval || 1);

  if (rep.type === "daily") {
    for (let i = 0; guard++ < 6000; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i * iv);
      if (!push(d)) break;
    }
  } else if (rep.type === "weekly") {
    const days = (rep.days && rep.days.length ? rep.days.slice() : [base.getDay()]).sort((a, b) => a - b);
    const weekStart = new Date(base);
    weekStart.setDate(base.getDate() - base.getDay());
    outer: for (let w = 0; guard++ < 3000; w++) {
      for (const day of days) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + w * iv * 7 + day);
        d.setHours(base.getHours(), base.getMinutes(), 0, 0);
        if (d < base) continue;
        if (!push(d)) break outer;
      }
    }
  } else {
    // monthly / yearly: clamp to the last day of short months (31 Jan -> 28 Feb)
    const step = rep.type === "monthly" ? iv : iv * 12;
    for (let j = 0; guard++ < 2000; j++) {
      const d = new Date(base.getFullYear(), base.getMonth() + j * step, 1, base.getHours(), base.getMinutes());
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(base.getDate(), dim));
      if (!push(d)) break;
    }
  }
  return out;
}

export function describe(r, now) {
  const p = r.repeat;
  const iv = p.interval || 1;
  if (p.type === "none") return "Does not repeat";
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[p.type];
  let s = iv === 1 ? `Every ${unit}` : `Every ${iv} ${unit}s`;
  if (p.type === "weekly" && p.days && p.days.length) {
    const sorted = p.days.slice().sort((a, b) => a - b);
    if (iv === 1 && sorted.join("") === "12345") s = "Every weekday";
    else s += ` on ${sorted.map((d) => DOW[d]).join(", ")}`;
  }
  const e = r.end || {};
  if (e.type === "date" && e.date) s += `, until ${fmtDay(new Date(`${e.date}T00:00`), now)}`;
  if (e.type === "count") s += `, ${e.count} times`;
  return s;
}

// First occurrence from `now` on (or `start` if none are left).
export function firstFuture(r, now = new Date()) {
  const o = occ(r, now, 1)[0];
  return o ? iso(o) : r.start;
}

// Completing a repeating reminder: move to the next occurrence after the later
// of its due time and now. No occurrence left -> done. Mutates and returns r.
export function advance(r, now = new Date()) {
  const from = new Date(Math.max(parse(r.cursor).getTime() + 1000, now.getTime()));
  const next = occ(r, from, 1)[0];
  if (next) {
    r.cursor = iso(next);
    r.fired = {};
  } else {
    r.done = true;
  }
  return r;
}

// Scheduler housekeeping: a repeating reminder you ignored rolls forward once
// its next occurrence arrives, so a daily reminder keeps pinging every day.
// One-off reminders never move. Returns true if the cursor changed.
export function rollForward(r, now = new Date()) {
  if (r.done || r.repeat.type === "none") return false;
  let moved = false;
  for (let i = 0; i < 1000; i++) {
    const next = occ(r, new Date(parse(r.cursor).getTime() + 1000), 1)[0];
    if (!next || next > now) break;
    r.cursor = iso(next);
    r.fired = {};
    moved = true;
  }
  return moved;
}
