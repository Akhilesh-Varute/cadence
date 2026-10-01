"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Spinner from "../components/Spinner";
import Skeleton from "../components/Skeleton";
import ErrorBanner from "../components/ErrorBanner";
import { fetchJson } from "../lib/fetchJson";
import { getCache, setCache } from "../lib/pageCache";
import { toDateStr, isDueOn, fmtTime, shiftDate } from "../lib/reminders";

const CARD = "bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3";
const H2 = "text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint";

function Check({ done, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={done ? "Mark not done" : "Mark done"}
      className={`w-7 h-7 flex-none rounded-[9px] border flex items-center justify-center transition ${
        done
          ? "bg-good dark:bg-dgood border-good dark:border-dgood text-accent-ink"
          : "bg-paper dark:bg-dpaper border-line dark:border-dline"
      }`}
    >
      {done && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

export default function TodayPage() {
  const today = toDateStr();
  const cached = getCache("today-home");
  const [reminders, setReminders] = useState(cached?.reminders || []);
  const [doneIds, setDoneIds] = useState(cached?.doneIds || []);
  const [todos, setTodos] = useState(cached?.todos || []);
  const [deferred, setDeferred] = useState(cached?.deferred || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);
  const [newTodo, setNewTodo] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setError(null);
    try {
      const [r, t] = await Promise.all([
        fetchJson(`/api/reminders?today=${today}`),
        fetchJson(`/api/todos?today=${today}`),
      ]);
      setReminders(r.reminders);
      setDoneIds(r.doneIds);
      setTodos(t.todos || []);
      setDeferred(t.deferred || []);
      setCache("today-home", { reminders: r.reminders, doneIds: r.doneIds, todos: t.todos || [], deferred: t.deferred || [] });
    } catch (err) {
      setError(err.message || "Couldn't load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(fn) {
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Something didn't save.");
    }
    await load();
  }

  const send = (url, method, body) =>
    fetchJson(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const due = reminders.filter((r) => isDueOn(r, today));

  function toggleReminder(r) {
    const done = !doneIds.includes(r.id);
    setDoneIds(done ? [...doneIds, r.id] : doneIds.filter((i) => i !== r.id));
    act(() => send("/api/reminders", "PATCH", { id: r.id, done, date: today }));
  }

  function toggleTodo(t) {
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: t.done ? 0 : 1 } : x)));
    act(() => send("/api/todos", "PATCH", { id: t.id, done: !t.done, completed_date: today }));
  }

  // defer_until hides a todo until that day; null brings it back today.
  function deferTodo(t, until) {
    act(() => send("/api/todos", "PATCH", { id: t.id, defer_until: until }));
  }

  async function addTodo(e) {
    e.preventDefault();
    if (!newTodo.trim() || adding) return;
    setAdding(true);
    await act(() => send("/api/todos", "POST", { text: newTodo }));
    setNewTodo("");
    setAdding(false);
  }

  if (loading) {
    return <Skeleton />;
  }

  const total = due.length + todos.length;
  const finished = due.filter((r) => doneIds.includes(r.id)).length + todos.filter((t) => t.done).length;

  return (
    <div className="space-y-4 stagger">
      <header>
        <h1 className="font-display text-4xl tracking-tight leading-none">
          {new Date().toLocaleDateString(undefined, { weekday: "long" })}
        </h1>
        <p className="text-sm text-ink-soft dark:text-dink-soft mt-1.5">
          {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" })}
          {total > 0 && (finished === total ? " · all done" : ` · ${finished} of ${total} done`)}
        </p>
        {total > 0 && (
          <div className="h-1 mt-3 rounded-full bg-line dark:bg-dline overflow-hidden">
            <div
              className="h-full bg-good dark:bg-dgood transition-[width] duration-500"
              style={{ width: `${(finished / total) * 100}%` }}
            />
          </div>
        )}
      </header>
      {error && <ErrorBanner message={error} onRetry={load} />}

      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className={H2}>Reminders</h2>
          <Link href="/reminders" className="text-xs font-semibold text-accent dark:text-daccent">
            Manage
          </Link>
        </div>
        <ul>
          {due.map((r) => {
            const done = doneIds.includes(r.id);
            return (
              <li key={r.id} className="flex items-center gap-3 py-3 border-b border-line-soft dark:border-dline-soft last:border-none">
                <Check done={done} onClick={() => toggleReminder(r)} />
                <span className={`flex-1 min-w-0 text-base ${done ? "line-through text-ink-faint dark:text-dink-faint" : ""}`}>
                  {r.title}
                </span>
                <span className="flex-none text-xs font-mono font-tabular text-ink-faint dark:text-dink-faint">{fmtTime(r.time)}</span>
              </li>
            );
          })}
          {due.length === 0 && (
            <p className="text-ink-faint dark:text-dink-faint text-base py-1">
              Nothing due today. <Link href="/reminders" className="underline">Add a reminder</Link>.
            </p>
          )}
        </ul>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Todos</h2>
        <form onSubmit={addTodo} className="flex gap-2">
          <input
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Add a todo…"
            disabled={adding}
            className="flex-1 min-w-0 border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-3.5 py-3 text-base focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:focus:ring-daccent/20 disabled:opacity-60"
          />
          <button
            disabled={adding || !newTodo.trim()}
            className="bg-ink dark:bg-dink text-paper dark:text-dpaper rounded-sm2 px-5 font-semibold text-base disabled:opacity-50 flex items-center justify-center min-w-[72px]"
          >
            {adding ? <Spinner className="w-3.5 h-3.5" /> : "Add"}
          </button>
        </form>
        <ul>
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3 border-b border-line-soft dark:border-dline-soft last:border-none">
              <Check done={!!t.done} onClick={() => toggleTodo(t)} />
              <span className={`flex-1 min-w-0 text-base ${t.done ? "line-through text-ink-faint dark:text-dink-faint" : ""}`}>
                {t.text}
              </span>
              {!t.done && (
                <button
                  onClick={() => deferTodo(t, shiftDate(today, 1))}
                  aria-label="Move to tomorrow"
                  title="Move to tomorrow"
                  className="flex-none w-8 h-8 rounded-full bg-accent-soft dark:bg-daccent-soft text-accent dark:text-daccent flex items-center justify-center"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => act(() => fetchJson(`/api/todos?id=${t.id}`, { method: "DELETE" }))}
                aria-label="Remove todo"
                className="flex-none w-8 h-8 rounded-full bg-warn-soft dark:bg-dwarn-soft text-warn dark:text-dwarn flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.8 12.1A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.9L6 7" />
                </svg>
              </button>
            </li>
          ))}
          {todos.length === 0 && <p className="text-ink-faint dark:text-dink-faint text-base py-1">Nothing on the list. Add what you want done today.</p>}
        </ul>
        {deferred.length > 0 && (
          <div className="pt-2 border-t border-line-soft dark:border-dline-soft space-y-2">
            <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">Later</h3>
            <ul className="space-y-2">
              {deferred.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-base text-ink-soft dark:text-dink-soft truncate">{t.text}</span>
                  <span className="flex-none text-[0.65rem] font-mono text-ink-faint dark:text-dink-faint">
                    {t.defer_until === shiftDate(today, 1) ? "tomorrow" : t.defer_until}
                  </span>
                  <button
                    onClick={() => deferTodo(t, null)}
                    className="flex-none text-xs font-semibold bg-accent-soft dark:bg-daccent-soft text-accent dark:text-daccent rounded-full px-3 py-1.5"
                  >
                    bring to today
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
