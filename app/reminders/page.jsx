"use client";

import Pending from "../../components/Pending";
import { ReminderRow, Section } from "../../components/Rows";
import { useStore } from "../../lib/store";
import { parse, dayDiff } from "../../lib/recurrence";

const SECTIONS = [["over", "Overdue", true], ["today", "Today"], ["tom", "Tomorrow"], ["week", "Next 7 days"], ["later", "Later"]];

export default function RemindersPage() {
  const { state, now, ui, setUi } = useStore();
  if (!state) return <Pending title="Reminders" />;

  const f = ui.rf;
  const items = state.reminders.filter((r) => f === "all" || (f === "repeat" ? r.repeat.type !== "none" : r.list === f));
  const active = items.filter((r) => !r.done).sort((a, b) => parse(a.cursor) - parse(b.cursor));
  const done = items.filter((r) => r.done);
  const groups = { over: [], today: [], tom: [], week: [], later: [] };
  active.forEach((r) => {
    const d = parse(r.cursor);
    const n = dayDiff(d, now);
    groups[d < now ? "over" : n === 0 ? "today" : n === 1 ? "tom" : n < 8 ? "week" : "later"].push(r);
  });

  return (
    <>
      <header className="head">
        <h1 className="big">Reminders</h1>
        <p className="sub">{active.length} scheduled</p>
      </header>
      <div className="chips scroll">
        {[["all", "All"], ["repeat", "Repeating"]].map(([v, l]) => (
          <button key={v} className={`chip${f === v ? " on" : ""}`} onClick={() => setUi({ rf: v })}>{l}</button>
        ))}
        {state.lists.map((l) => (
          <button key={l.id} className={`chip${f === l.id ? " on" : ""}`} onClick={() => setUi({ rf: l.id })}>
            <i className="dot" style={{ "--c": l.color }} />{l.name}
          </button>
        ))}
      </div>
      {SECTIONS.map(([k, label, over]) =>
        groups[k].length ? (
          <div key={k}>
            <Section title={label} count={groups[k].length} over={over} />
            {groups[k].map((r) => <ReminderRow key={r.id} r={r} />)}
          </div>
        ) : null
      )}
      {done.length > 0 && (
        <>
          <Section title="Completed" count={done.length} />
          {done.map((r) => <ReminderRow key={r.id} r={r} noLate />)}
        </>
      )}
      {!items.length && (
        <div className="empty">
          <b>No reminders here yet.</b>
          Tap the plus button to set one with a time, days and repeat.
        </div>
      )}
    </>
  );
}
