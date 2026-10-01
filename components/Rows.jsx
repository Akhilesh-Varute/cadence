"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import Icon from "./Icon";
import { useStore } from "../lib/store";
import { useEditor } from "./Editor";
import { useToast } from "./Toast";
import { reducedMotion } from "../lib/motion";
import { parse, fmtTime, fmtDay, fmtWhen, describe } from "../lib/recurrence";

export function Section({ title, count, over }) {
  return (
    <div className={`sec${over ? " over" : ""}`}>
      <span>{title}</span>
      {count != null && <small>{count}</small>}
    </div>
  );
}

const listOf = (lists, id) => lists.find((l) => l.id === id) || lists[0] || { name: "", color: "#3346FF" };
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// The check pops, then the change lands 330ms later so the pop is seen.
function usePop(onCommit, wasDone) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const click = () => {
    if (wasDone) return onCommit();
    setOn(true);
    if (ref.current && !reducedMotion()) gsap.fromTo(ref.current, { scale: 0.6 }, { scale: 1, duration: 0.45, ease: "back.out(3.5)" });
    setTimeout(() => {
      onCommit();
      setOn(false);
    }, reducedMotion() ? 0 : 330);
  };
  return { ref, on, click };
}

export function ReminderRow({ r, noLate }) {
  const { state, now, completeReminder, reopenReminder } = useStore();
  const { open } = useEditor();
  const toast = useToast();
  const d = parse(r.cursor);
  const l = listOf(state.lists, r.list);
  const late = !r.done && d < now && !noLate;

  const pop = usePop(() => {
    if (r.done) return reopenReminder(r);
    const { after, undo } = completeReminder(r);
    if (after.done) toast(r.repeat.type === "none" ? `Done: ${r.title}` : "Done. That was the last one.", undo);
    else toast(<>Done. Next <b>{fmtWhen(parse(after.cursor))}</b></>, undo);
  }, r.done);

  return (
    <div className={`row${late ? " late" : ""}${r.done ? " isdone" : ""}`} style={{ "--c": l.color }}>
      <button ref={pop.ref} className={`check${r.done || pop.on ? " on" : ""}`} onClick={pop.click} aria-label={`Complete ${r.title}`}>
        <Icon name="tick" />
      </button>
      <div className="main" role="button" tabIndex={0} onClick={() => open("reminder", r.id)} onKeyDown={(e) => e.key === "Enter" && open("reminder", r.id)}>
        <div className="t">{r.title}</div>
        <div className="m">
          <span><i className="dot" />{l.name}</span>
          {r.repeat.type !== "none" && <span><Icon name="repeat" size={13} />{describe(r, now)}</span>}
          {r.priority > 0 && <span className="pr">{"!".repeat(r.priority)}</span>}
        </div>
      </div>
      <div className="when" onClick={() => open("reminder", r.id)}>
        <b>{fmtTime(d)}</b>
        <i>{fmtDay(d, now)}</i>
      </div>
    </div>
  );
}

export function TaskRow({ t }) {
  const { state, now, toggleTask } = useStore();
  const { open } = useEditor();
  const l = listOf(state.lists, t.list);
  const due = t.due ? new Date(`${t.due}T00:00`) : null;
  const late = due && !t.done && due < startOfDay(now);
  const steps = t.steps || [];
  const stepsDone = steps.filter((s) => s.d).length;
  const pop = usePop(() => toggleTask(t), t.done);

  return (
    <div className={`row${late ? " late" : ""}${t.done ? " isdone" : ""}`} style={{ "--c": l.color }}>
      <button ref={pop.ref} className={`check sq${t.done || pop.on ? " on" : ""}`} onClick={pop.click} aria-label={`Complete ${t.title}`}>
        <Icon name="tick" />
      </button>
      <div className="main" role="button" tabIndex={0} onClick={() => open("task", t.id)} onKeyDown={(e) => e.key === "Enter" && open("task", t.id)}>
        <div className="t">{t.title}</div>
        <div className="m">
          <span><i className="dot" />{l.name}</span>
          {steps.length > 0 && <span>{stepsDone} of {steps.length} steps</span>}
          {t.priority > 0 && <span className="pr">{"!".repeat(t.priority)}</span>}
        </div>
      </div>
      {due && (
        <div className="when" onClick={() => open("task", t.id)}>
          <i>{late ? "Was due " : "Due "}{fmtDay(due, now)}</i>
        </div>
      )}
    </div>
  );
}
