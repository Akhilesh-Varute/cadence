"use client";

import Pending from "../../components/Pending";
import { TaskRow, Section } from "../../components/Rows";
import { useStore, newId } from "../../lib/store";

export default function TasksPage() {
  const { state, ui, setUi, put } = useStore();
  if (!state) return <Pending title="Tasks" />;

  const f = ui.tf;
  const items = state.tasks.filter((t) => f === "all" || t.list === f);
  const open = items
    .filter((t) => !t.done)
    .sort((a, b) => b.priority - a.priority || ((a.due || "9") < (b.due || "9") ? -1 : 1));
  const done = items.filter((t) => t.done);

  function quickAdd(e) {
    const v = e.currentTarget.value.trim();
    if (e.key !== "Enter" || !v) return;
    const list = state.lists.some((l) => l.id === f) ? f : state.lists[0]?.id || "personal";
    put("task", { id: newId(), title: v, notes: "", list, priority: 0, due: "", done: false, steps: [] });
    e.currentTarget.value = "";
  }

  return (
    <>
      <header className="head">
        <h1 className="big">Tasks</h1>
        <p className="sub">{open.length} open</p>
      </header>
      <div className="quick">
        <input type="text" placeholder="Add a task and press return" aria-label="Quick add task" enterKeyHint="done" onKeyDown={quickAdd} />
      </div>
      <div className="chips scroll">
        <button className={`chip${f === "all" ? " on" : ""}`} onClick={() => setUi({ tf: "all" })}>All</button>
        {state.lists.map((l) => (
          <button key={l.id} className={`chip${f === l.id ? " on" : ""}`} onClick={() => setUi({ tf: l.id })}>
            <i className="dot" style={{ "--c": l.color }} />{l.name}
          </button>
        ))}
      </div>
      {open.map((t) => <TaskRow key={t.id} t={t} />)}
      {done.length > 0 && (
        <>
          <Section title="Done" count={done.length} />
          {done.map((t) => <TaskRow key={t.id} t={t} />)}
        </>
      )}
      {!items.length && (
        <div className="empty">
          <b>No tasks yet.</b>
          Type above to add one, or use the plus button for steps, priority and a due date.
        </div>
      )}
    </>
  );
}
