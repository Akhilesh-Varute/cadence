"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import Pending from "../components/Pending";
import { ReminderRow, TaskRow, Section } from "../components/Rows";
import { useStore } from "../lib/store";
import { reducedMotion } from "../lib/motion";
import { parse, fmtTime, dayDiff, DOWL } from "../lib/recurrence";

const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
let railPlayed = false; // the load-in plays once per app session

const pct = (d) => ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;
const TICKS = [[0, "12a"], [6, "6a"], [12, "12p"], [18, "6p"], [24, "12a"]];

export default function TodayPage() {
  const { state, now } = useStore();
  const rail = useRef(null);

  useLayoutEffect(() => {
    if (!state || railPlayed || !rail.current) return;
    railPlayed = true;
    if (reducedMotion()) return;
    const q = (s) => rail.current.querySelectorAll(s);
    gsap.from(q(".pip"), { scale: 0, duration: 0.5, stagger: 0.06, ease: "back.out(2.4)", delay: 0.15 });
    gsap.from(q(".elapsed"), { width: 0, duration: 0.9, ease: "power2.out" });
    gsap.from(q(".now, .nowlbl"), { opacity: 0, duration: 0.4, delay: 0.8 });
  }, [!!state]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <Pending title="Today" />;

  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const active = state.reminders.filter((r) => !r.done).sort((a, b) => parse(a.cursor) - parse(b.cursor));
  const over = active.filter((r) => parse(r.cursor) < now);
  const overIds = new Set(over.map((r) => r.id));
  const today = active.filter((r) => !overIds.has(r.id) && parse(r.cursor) < end);
  const soon = active.filter((r) => {
    const n = dayDiff(parse(r.cursor), now);
    return n >= 1 && n <= 3;
  });
  const tasksDue = state.tasks.filter((t) => !t.done && t.due && new Date(`${t.due}T00:00`) < end);
  const left = over.length + today.length + tasksDue.length;
  const todayAll = state.reminders.filter((r) => parse(r.cursor).toDateString() === now.toDateString());
  const lc = (id) => (state.lists.find((l) => l.id === id) || state.lists[0] || { color: "#3346FF" }).color;

  return (
    <>
      <header className="head">
        <h1 className="big">{DOWL[now.getDay()]}</h1>
        <p className="sub">{now.getDate()} {MONL[now.getMonth()]}{left ? `, ${left} to do` : ", all clear"}</p>
      </header>

      <div className="rail" ref={rail}>
        <div className="track" />
        <div className="elapsed" style={{ width: `${pct(now)}%` }} />
        {TICKS.map(([h, label]) => (
          <span key={h} className="tick" style={{ left: `${(h / 24) * 100}%` }}>{label}</span>
        ))}
        {todayAll.map((r) => (
          <i key={r.id} className={`pip${r.done ? " done" : ""}`} title={r.title} style={{ left: `${pct(parse(r.cursor))}%`, "--c": lc(r.list) }} />
        ))}
        <i className="now" style={{ left: `${pct(now)}%` }} />
        <span className="nowlbl" style={{ left: `${Math.min(88, Math.max(12, pct(now)))}%` }}>{fmtTime(now)}</span>
      </div>

      {over.length > 0 && (
        <>
          <Section title="Overdue" count={over.length} over />
          {over.map((r) => <ReminderRow key={r.id} r={r} />)}
        </>
      )}
      {(today.length > 0 || tasksDue.length > 0) && (
        <>
          <Section title="Later today" count={today.length + tasksDue.length} />
          {today.map((r) => <ReminderRow key={r.id} r={r} />)}
          {tasksDue.map((t) => <TaskRow key={t.id} t={t} />)}
        </>
      )}
      {soon.length > 0 && (
        <>
          <Section title="Next three days" count={soon.length} />
          {soon.map((r) => <ReminderRow key={r.id} r={r} />)}
        </>
      )}
      {!over.length && !today.length && !tasksDue.length && !soon.length && (
        <div className="empty">
          <b>Nothing due.</b>
          Tap the plus button to add a reminder or a task.
        </div>
      )}
    </>
  );
}
