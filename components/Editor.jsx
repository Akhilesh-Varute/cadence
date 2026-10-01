"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import Icon from "./Icon";
import { useStore, newId } from "../lib/store";
import { useToast } from "./Toast";
import { reducedMotion } from "../lib/motion";
import { occ, describe, firstFuture, iso, parse, fmtDay, fmtTime, fmtWhen, DOWL, dateOnly } from "../lib/recurrence";

const Ctx = createContext({ open: () => {} });
export const useEditor = () => useContext(Ctx);

export const ALERTS = [
  { m: 0, l: "At time" },
  { m: 5, l: "5 min before" },
  { m: 15, l: "15 min before" },
  { m: 60, l: "1 hour before" },
  { m: 1440, l: "1 day before" },
];

const REPEATS = [["none", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]];
const UNITS = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

export function EditorProvider({ children }) {
  const [d, setD] = useState(null); // the draft, or null when closed
  const { state, ui } = useStore();

  const blank = useCallback(
    (kind, keep) => {
      const lists = state?.lists || [];
      const list = lists.some((l) => l.id === (kind === "reminder" ? ui.rf : ui.tf)) ? (kind === "reminder" ? ui.rf : ui.tf) : lists[0]?.id || "personal";
      const base = { _kind: kind, _new: true, id: newId(), title: keep?.title || "", notes: keep?.notes || "", list, priority: 0 };
      if (kind === "reminder") {
        const h = new Date();
        h.setHours(h.getHours() + 1, 0, 0, 0);
        return {
          ...base,
          start: iso(h),
          cursor: "",
          alerts: [state?.settings.defaultAlert ?? 0],
          done: false,
          repeat: { type: "none", interval: 1, days: [] },
          end: { type: "never", date: "", count: 10 },
          fired: {},
        };
      }
      return { ...base, due: "", done: false, steps: [] };
    },
    [state, ui.rf, ui.tf]
  );

  const open = useCallback(
    (kind, id) => {
      if (!state) return;
      const existing = id && (kind === "reminder" ? state.reminders : state.tasks).find((x) => x.id === id);
      setD(existing ? { ...JSON.parse(JSON.stringify(existing)), _kind: kind, _new: false } : blank(kind));
    },
    [state, blank]
  );

  return (
    <Ctx.Provider value={{ open, close: () => setD(null) }}>
      {children}
      {d && <Sheet key={d._new ? "new" : d.id} d={d} setD={setD} blank={blank} />}
    </Ctx.Provider>
  );
}

function Sheet({ d, setD, blank }) {
  const { state, now, put, del } = useStore();
  const toast = useToast();
  const sheet = useRef(null);
  const scrim = useRef(null);
  const title = useRef(null);
  const [closing, setClosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmBox = useRef(null);
  const isR = d._kind === "reminder";
  const patch = (p) => setD((x) => ({ ...x, ...p }));

  useLayoutEffect(() => {
    if (reducedMotion()) return;
    gsap.fromTo(scrim.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    gsap.fromTo(sheet.current, { yPercent: 100 }, { yPercent: 0, duration: 0.42, ease: "power3.out" });
  }, []);

  useEffect(() => {
    if (d._new) {
      const t = setTimeout(() => title.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    if (reducedMotion()) return setD(null);
    gsap.to(scrim.current, { opacity: 0, duration: 0.3 });
    gsap.to(sheet.current, { yPercent: 100, duration: 0.3, ease: "power2.in", onComplete: () => setD(null) });
  }, [closing, setD]);

  // Escape closes the confirmation first, then the sheet.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && (confirming ? setConfirming(false) : close());
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, confirming]);

  useEffect(() => {
    if (confirming && confirmBox.current && !reducedMotion()) {
      gsap.fromTo(confirmBox.current, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power2.out" });
    }
  }, [confirming]);

  function save() {
    if (!d.title.trim()) {
      if (!reducedMotion()) gsap.fromTo(title.current, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1,.3)" });
      toast("Add a title first");
      title.current?.focus();
      return;
    }
    const { _kind, _new, ...item } = d;
    item.title = item.title.trim();
    if (isR) {
      if (item.repeat.type === "weekly" && !item.repeat.days.length) item.repeat.days = [parse(item.start).getDay()];
      item.done = false;
      item.fired = {};
      item.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!occ(item, new Date(0), 1).length) return toast("Check the repeat settings");
      item.cursor = firstFuture(item);
      toast(<>Saved. Next <b>{fmtWhen(parse(item.cursor))}</b></>);
    } else {
      toast("Task saved");
    }
    put(_kind, item);
    close();
  }

  function remove() {
    const { _kind, _new, ...item } = d;
    del(_kind, item.id);
    toast("Deleted", () => put(_kind, item));
    close();
  }

  const lists = state.lists;
  const order = state.settings.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const setRepeat = (p) => patch({ repeat: { ...d.repeat, ...p } });
  const setEnd = (p) => patch({ end: { ...d.end, ...p } });
  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const preview = isR ? occ(d, now, 4) : [];
  const showDate = isR && (["none", "monthly", "yearly"].includes(d.repeat.type) || d.repeat.interval > 1);

  return (
    <>
      <div id="scrim" ref={scrim} onClick={close} />
      <section id="sheet" ref={sheet} role="dialog" aria-modal="true" aria-label="Editor">
        <div className="sh-top">
          <button className="quiet" onClick={close}>Cancel</button>
          <h2>{d._new ? "New " : "Edit "}{isR ? "reminder" : "task"}</h2>
          <button onClick={save}>Save</button>
        </div>
        <div className="sh-body">
          {d._new && (
            <div className="seg" style={{ marginBottom: 14 }}>
              <button className={isR ? "on" : ""} onClick={() => setD(blank("reminder", d))}>Reminder</button>
              <button className={!isR ? "on" : ""} onClick={() => setD(blank("task", d))}>Task</button>
            </div>
          )}
          <input
            ref={title}
            className="f-title"
            type="text"
            placeholder={isR ? "What should I remind you of?" : "What needs doing?"}
            value={d.title}
            onChange={(e) => patch({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            autoComplete="off"
            enterKeyHint="done"
          />
          <textarea className="f-notes" placeholder="Notes" rows={2} value={d.notes} onChange={(e) => patch({ notes: e.target.value })} />

          {isR ? (
            <>
              {/* A plain daily or weekly reminder just starts today, so only its time is asked.
                  The date matters for one-offs, monthly and yearly, and for "every N" with N above 1. */}
              <label className="h">{d.repeat.type === "none" ? "When" : showDate ? "Starts" : "Time"}</label>
              <div className={showDate ? "pair" : undefined}>
                {showDate && (
                  <input className="inp" type="date" aria-label="Date" value={d.start.slice(0, 10)} onChange={(e) => e.target.value && patch({ start: `${e.target.value}T${d.start.slice(11, 16)}` })} />
                )}
                <input className="inp" type="time" aria-label="Time" value={d.start.slice(11, 16)} onChange={(e) => e.target.value && patch({ start: `${d.start.slice(0, 10)}T${e.target.value}` })} />
              </div>

              <label className="h">Repeat</label>
              <div className="seg">
                {REPEATS.map(([v, l]) => (
                  <button
                    key={v}
                    className={d.repeat.type === v ? "on" : ""}
                    onClick={() => setRepeat({ type: v, days: v === "weekly" && !d.repeat.days.length ? [parse(d.start).getDay()] : d.repeat.days })}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {d.repeat.type !== "none" && (
                <>
                  <div className="step" style={{ marginTop: 10 }}>
                    <span>Every <b>{d.repeat.interval}</b> {UNITS[d.repeat.type]}{d.repeat.interval > 1 ? "s" : ""}</span>
                    <div>
                      <button aria-label="Fewer" onClick={() => setRepeat({ interval: Math.max(1, d.repeat.interval - 1) })}>&minus;</button>
                      <button aria-label="More" onClick={() => setRepeat({ interval: Math.min(52, d.repeat.interval + 1) })}>+</button>
                    </div>
                  </div>
                  {d.repeat.type === "weekly" && (
                    <div className="days" style={{ marginTop: 12 }}>
                      {order.map((n) => (
                        <button
                          key={n}
                          className={d.repeat.days.includes(n) ? "on" : ""}
                          aria-label={DOWL[n]}
                          aria-pressed={d.repeat.days.includes(n)}
                          onClick={() => d.repeat.days.includes(n) && d.repeat.days.length === 1 ? null : setRepeat({ days: toggleIn(d.repeat.days, n) })}
                        >
                          {DOWL[n][0]}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="h">Ends</label>
                  <div className="chips">
                    {[["never", "Never"], ["date", "On a date"], ["count", "After a number of times"]].map(([v, l]) => (
                      <button
                        key={v}
                        className={`chip${d.end.type === v ? " on acc" : ""}`}
                        onClick={() => {
                          const p = { type: v };
                          if (v === "date" && !d.end.date) {
                            const x = parse(d.start);
                            x.setMonth(x.getMonth() + 3);
                            p.date = dateOnly(x);
                          }
                          setEnd(p);
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {d.end.type === "date" && (
                    <input className="inp" style={{ marginTop: 10 }} type="date" value={d.end.date} onChange={(e) => setEnd({ date: e.target.value })} />
                  )}
                  {d.end.type === "count" && (
                    <div className="step" style={{ marginTop: 10 }}>
                      <span><b>{d.end.count}</b> times in total</span>
                      <div>
                        <button aria-label="Fewer" onClick={() => setEnd({ count: Math.max(1, d.end.count - 1) })}>&minus;</button>
                        <button aria-label="More" onClick={() => setEnd({ count: Math.min(999, d.end.count + 1) })}>+</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <label className="h">Alert</label>
              <div className="chips">
                {ALERTS.map((a) => (
                  <button key={a.m} className={`chip${d.alerts.includes(a.m) ? " on acc" : ""}`} aria-pressed={d.alerts.includes(a.m)} onClick={() => patch({ alerts: toggleIn(d.alerts, a.m) })}>
                    {a.l}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="h">Due date</label>
              <div className="pair">
                <input className="inp" type="date" value={d.due} onChange={(e) => patch({ due: e.target.value })} />
                {d.due ? <button className="chip" style={{ justifyContent: "center" }} onClick={() => patch({ due: "" })}>Clear date</button> : <span />}
              </div>

              <label className="h">Steps</label>
              <div>
                {d.steps.map((s, i) => (
                  <div className="steps-row" key={i}>
                    <button
                      className={`check sq${s.d ? " on" : ""}`}
                      style={{ "--c": (lists.find((l) => l.id === d.list) || lists[0]).color, width: 22, height: 22 }}
                      aria-label="Step done"
                      onClick={() => patch({ steps: d.steps.map((x, j) => (j === i ? { ...x, d: !x.d } : x)) })}
                    >
                      <Icon name="tick" />
                    </button>
                    <input type="text" value={s.t} onChange={(e) => patch({ steps: d.steps.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)) })} />
                    <button className="x" aria-label="Remove step" onClick={() => patch({ steps: d.steps.filter((_, j) => j !== i) })}>&times;</button>
                  </div>
                ))}
                <div className="steps-row">
                  <input
                    type="text"
                    placeholder="Add a step"
                    enterKeyHint="done"
                    onKeyDown={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (e.key === "Enter" && v) {
                        patch({ steps: [...d.steps, { t: v, d: false }] });
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <label className="h">Priority</label>
          <div className="chips">
            {["None", "Low", "Medium", "High"].map((p, i) => (
              <button key={p} className={`chip${d.priority === i ? " on acc" : ""}`} onClick={() => patch({ priority: i })}>{p}</button>
            ))}
          </div>

          <label className="h">List</label>
          <div className="chips">
            {lists.map((l) => (
              <button key={l.id} className={`chip${d.list === l.id ? " on" : ""}`} onClick={() => patch({ list: l.id })}>
                <i className="dot" style={{ "--c": l.color }} />{l.name}
              </button>
            ))}
          </div>

          {isR && (
            <div className="preview">
              {preview.length ? (
                <>
                  <p>{describe(d, now)}. Coming up:</p>
                  <ol>
                    {preview.map((p) => (
                      <li key={p.getTime()}>{fmtDay(p, now)} <small>{fmtTime(p)}</small></li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>Nothing left to schedule. Check the date and end settings.</p>
              )}
            </div>
          )}

          {!d._new && <button className="danger" onClick={() => setConfirming(true)}>Delete {isR ? "reminder" : "task"}</button>}
        </div>
      </section>
      {confirming && (
        <div className="confirm-wrap" onClick={() => setConfirming(false)}>
          <div className="confirm" ref={confirmBox} role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-text" onClick={(e) => e.stopPropagation()}>
            <h3 id="cf-title">Delete this {isR ? "reminder" : "task"}?</h3>
            <p id="cf-text">&ldquo;{d.title}&rdquo; will be removed. You can undo it for a few seconds afterwards.</p>
            <div className="cf-actions">
              <button className="btn alt" autoFocus onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn dng" onClick={remove}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
