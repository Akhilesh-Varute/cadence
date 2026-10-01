// Run with: npm test   (Node's built-in test runner, no dependencies)
import test from "node:test";
import assert from "node:assert/strict";
import { occ, describe, advance, rollForward, firstFuture, iso } from "./recurrence.js";

const rem = (o) => ({
  start: "2026-01-05T09:00", // a Monday
  repeat: { type: "none", interval: 1, days: [] },
  end: { type: "never" },
  fired: {},
  done: false,
  ...o,
});
const d = (s) => new Date(s);
const list = (r, from, n) => occ(r, d(from), n).map(iso);

test("weekly: only the chosen weekdays, in order", () => {
  const r = rem({ repeat: { type: "weekly", interval: 1, days: [1, 3, 5] } }); // Mon Wed Fri
  assert.deepEqual(list(r, "2026-01-05T00:00", 5), [
    "2026-01-05T09:00",
    "2026-01-07T09:00",
    "2026-01-09T09:00",
    "2026-01-12T09:00",
    "2026-01-14T09:00",
  ]);
});

test("weekly: every 2 weeks skips the off week", () => {
  const r = rem({ repeat: { type: "weekly", interval: 2, days: [1] } });
  assert.deepEqual(list(r, "2026-01-05T00:00", 3), ["2026-01-05T09:00", "2026-01-19T09:00", "2026-02-02T09:00"]);
});

test("weekly: weekday set starting mid-week ignores days before the start", () => {
  const r = rem({ start: "2026-01-07T09:00", repeat: { type: "weekly", interval: 1, days: [1, 3] } }); // starts Wed
  assert.deepEqual(list(r, "2026-01-01T00:00", 3), ["2026-01-07T09:00", "2026-01-12T09:00", "2026-01-14T09:00"]);
});

test("monthly: 31st clamps to the last day of short months, then returns to 31", () => {
  const r = rem({ start: "2026-01-31T10:00", repeat: { type: "monthly", interval: 1, days: [] } });
  assert.deepEqual(list(r, "2026-01-01T00:00", 4), [
    "2026-01-31T10:00",
    "2026-02-28T10:00",
    "2026-03-31T10:00",
    "2026-04-30T10:00",
  ]);
});

test("yearly: 29 Feb clamps to 28 Feb in non-leap years", () => {
  const r = rem({ start: "2024-02-29T08:00", repeat: { type: "yearly", interval: 1, days: [] } });
  assert.deepEqual(list(r, "2024-01-01T00:00", 3), ["2024-02-29T08:00", "2025-02-28T08:00", "2026-02-28T08:00"]);
});

test("end after N times: stops after exactly N, counted from the first", () => {
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] }, end: { type: "count", count: 3 } });
  assert.deepEqual(list(r, "2026-01-01T00:00", 10), ["2026-01-05T09:00", "2026-01-06T09:00", "2026-01-07T09:00"]);
});

test("end after N times: occurrences before `from` still count toward N", () => {
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] }, end: { type: "count", count: 3 } });
  assert.deepEqual(list(r, "2026-01-07T00:00", 10), ["2026-01-07T09:00"]);
});

test("end on a date: inclusive of that day", () => {
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] }, end: { type: "date", date: "2026-01-07" } });
  assert.deepEqual(list(r, "2026-01-01T00:00", 10), ["2026-01-05T09:00", "2026-01-06T09:00", "2026-01-07T09:00"]);
});

test("one-off: a single occurrence", () => {
  assert.deepEqual(list(rem({}), "2026-01-01T00:00", 5), ["2026-01-05T09:00"]);
  assert.deepEqual(list(rem({}), "2026-01-06T00:00", 5), []);
});

test("describe: readable summaries", () => {
  assert.equal(describe(rem({})), "Does not repeat");
  assert.equal(describe(rem({ repeat: { type: "daily", interval: 1, days: [] } })), "Every day");
  assert.equal(describe(rem({ repeat: { type: "weekly", interval: 1, days: [1, 2, 3, 4, 5] } })), "Every weekday");
  assert.equal(describe(rem({ repeat: { type: "weekly", interval: 2, days: [0, 3] } })), "Every 2 weeks on Sun, Wed");
  assert.equal(
    describe(rem({ repeat: { type: "monthly", interval: 1, days: [] }, end: { type: "count", count: 6 } })),
    "Every month, 6 times"
  );
});

test("completing an overdue repeating reminder jumps to the next occurrence after now", () => {
  // Daily 09:00, cursor three days stale, completed at 14:00 on the 8th.
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] }, cursor: "2026-01-05T09:00", fired: { x: 1 } });
  advance(r, d("2026-01-08T14:00"));
  assert.equal(r.cursor, "2026-01-09T09:00"); // not the 6th: missed days are skipped
  assert.deepEqual(r.fired, {}); // fresh occurrence, alerts can fire again
  assert.equal(r.done, false);
});

test("completing a repeating reminder early moves past the due time, not just past now", () => {
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] }, cursor: "2026-01-10T09:00" });
  advance(r, d("2026-01-08T14:00")); // completed two days before it was due
  assert.equal(r.cursor, "2026-01-11T09:00");
});

test("completing the last occurrence marks it done", () => {
  const r = rem({
    repeat: { type: "daily", interval: 1, days: [] },
    end: { type: "count", count: 2 },
    cursor: "2026-01-06T09:00",
  });
  advance(r, d("2026-01-06T09:30"));
  assert.equal(r.done, true);
});

test("rollForward: an ignored daily reminder moves to today's occurrence", () => {
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] }, cursor: "2026-01-05T09:00", fired: { a: 1 } });
  assert.equal(rollForward(r, d("2026-01-08T09:00")), true);
  assert.equal(r.cursor, "2026-01-08T09:00");
  assert.deepEqual(r.fired, {});
});

test("rollForward: leaves a still-current occurrence and one-off reminders alone", () => {
  const daily = rem({ repeat: { type: "daily", interval: 1, days: [] }, cursor: "2026-01-08T09:00" });
  assert.equal(rollForward(daily, d("2026-01-08T18:00")), false); // overdue today, next is tomorrow
  assert.equal(daily.cursor, "2026-01-08T09:00");
  const once = rem({ cursor: "2026-01-05T09:00" });
  assert.equal(rollForward(once, d("2026-02-01T00:00")), false);
});

test("firstFuture: picks the next occurrence from now", () => {
  const r = rem({ repeat: { type: "daily", interval: 1, days: [] } });
  assert.equal(firstFuture(r, d("2026-01-08T10:00")), "2026-01-09T09:00");
});
