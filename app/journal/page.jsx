"use client";

import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import { fetchJson } from "../../lib/fetchJson";
import { getCache, setCache } from "../../lib/pageCache";

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return toDateStr(d);
}

function formatHeading(dateStr, today) {
  if (dateStr === today) return "Today";
  const yesterday = shiftDate(today, -1);
  if (dateStr === yesterday) return "Yesterday";
  const tomorrow = shiftDate(today, 1);
  if (dateStr === tomorrow) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

const STATIC_CACHE_KEY = "today-static";
function dayCacheKey(dateStr) {
  return `today-day:${dateStr}`;
}

export default function TodayPage() {
  const today = todayStr();
  const [viewDate, setViewDate] = useState(today);
  const isToday = viewDate === today;

  const cachedStatic = getCache(STATIC_CACHE_KEY);
  const cachedDay = getCache(dayCacheKey(today));

  const [entry, setEntry] = useState(
    cachedDay?.entry || { log: "", reflection: "", mood: null, energy: null }
  );
  const [saved, setSaved] = useState(true);
  const [todos, setTodos] = useState(cachedStatic?.todos || []);
  const [deferredTodos, setDeferredTodos] = useState(cachedStatic?.deferred || []);
  const [bringingBackId, setBringingBackId] = useState(null);
  const [newTodo, setNewTodo] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  const [items, setItems] = useState(cachedStatic?.items || []);
  const [learnNote, setLearnNote] = useState("");
  const [learnItemId, setLearnItemId] = useState("");
  const [addingLearn, setAddingLearn] = useState(false);
  const [dayLogs, setDayLogs] = useState(cachedDay?.dayLogs || []);
  const [dayCompletedTodos, setDayCompletedTodos] = useState(cachedDay?.completedTodos || []);
  const [loading, setLoading] = useState(!(cachedStatic && cachedDay));
  const [switching, setSwitching] = useState(false);
  const [staticError, setStaticError] = useState(null);
  const [staticReloadTick, setStaticReloadTick] = useState(0);
  const [dayError, setDayError] = useState(null);
  const [dayReloadTick, setDayReloadTick] = useState(0);
  // One shared banner for any mutation failure (add/toggle/delete/defer a
  // todo, log a learning entry, save the journal) rather than a separate
  // error UI per action -- these are all "something didn't save, try
  // again" in practice.
  const [actionError, setActionError] = useState(null);

  // Todos and learning tracks aren't tied to viewDate at all — they used to
  // get refetched on every prev/next tap for no reason. Load them once, on
  // mount, separately from the per-day data below.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStaticError(null);
      try {
        const [todosRes, itemsRes] = await Promise.all([
          fetchJson(`/api/todos?today=${today}`),
          fetchJson("/api/learning"),
        ]);
        if (cancelled) return;
        const nextTodos = todosRes.todos || [];
        const nextDeferred = todosRes.deferred || [];
        // Only "active" tracks belong in the quick-capture dropdown --
        // paused ones are exactly the tracks you said you're not currently
        // working on, so they shouldn't keep showing up here every time.
        const nextItems = (itemsRes.items || []).filter((i) => i.status === "active");
        setTodos(nextTodos);
        setDeferredTodos(nextDeferred);
        setItems(nextItems);
        setCache(STATIC_CACHE_KEY, { todos: nextTodos, deferred: nextDeferred, items: nextItems });
      } catch (err) {
        if (!cancelled) setStaticError(err.message || "Couldn't load todos and learning tracks.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staticReloadTick]);

  // Only the journal entry and that day's learning log actually depend on
  // viewDate, so this is what prev/next re-fetches — two small, indexed,
  // date-filtered queries instead of the previous four (two of which pulled
  // unrelated or oversized data).
  useEffect(() => {
    let cancelled = false;

    // If we already have this day cached (e.g. hopping back to a date we
    // just looked at), show it immediately instead of a spinner, and still
    // refetch in the background to pick up anything that changed elsewhere.
    const cachedForThisDay = getCache(dayCacheKey(viewDate));
    if (cachedForThisDay) {
      setEntry(cachedForThisDay.entry);
      setDayLogs(cachedForThisDay.dayLogs);
      setDayCompletedTodos(cachedForThisDay.completedTodos || []);
      setLoading(false);
    } else if (!loading) {
      setSwitching(true);
    }

    (async () => {
      setDayError(null);
      try {
        // Todos aren't tied to a date except for the day they were
        // completed on -- past days only ever need that read-only list,
        // never the live editable one (that only makes sense for today).
        const fetches = [
          fetchJson(`/api/journal?date=${viewDate}`),
          fetchJson(`/api/learning/log?date=${viewDate}`),
        ];
        if (viewDate !== today) fetches.push(fetchJson(`/api/todos?date=${viewDate}`));
        const [journalRes, logsRes, completedRes] = await Promise.all(fetches);
        if (cancelled) return;
        const nextEntry = journalRes.entry
          ? {
              log: journalRes.entry.log || "",
              reflection: journalRes.entry.reflection || "",
              mood: journalRes.entry.mood,
              energy: journalRes.entry.energy,
            }
          : { log: "", reflection: "", mood: null, energy: null };
        const nextDayLogs = logsRes.logs || [];
        const nextCompletedTodos = completedRes ? completedRes.completed || [] : [];
        setEntry(nextEntry);
        setDayLogs(nextDayLogs);
        setDayCompletedTodos(nextCompletedTodos);
        setCache(dayCacheKey(viewDate), {
          entry: nextEntry,
          dayLogs: nextDayLogs,
          completedTodos: nextCompletedTodos,
        });
      } catch (err) {
        if (!cancelled) setDayError(err.message || "Couldn't load this day.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSwitching(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate, dayReloadTick]);

  async function refreshTodos() {
    const res = await fetchJson(`/api/todos?today=${today}`);
    const nextTodos = res.todos || [];
    const nextDeferred = res.deferred || [];
    setTodos(nextTodos);
    setDeferredTodos(nextDeferred);
    setCache(STATIC_CACHE_KEY, { todos: nextTodos, deferred: nextDeferred, items });
  }

  async function refreshDayLogs() {
    const res = await fetchJson(`/api/learning/log?date=${viewDate}`);
    const nextDayLogs = res.logs || [];
    setDayLogs(nextDayLogs);
    setCache(dayCacheKey(viewDate), { entry, dayLogs: nextDayLogs });
  }

  async function saveEntry(next) {
    const merged = { ...entry, ...next };
    setEntry(merged);
    setSaved(false);
    try {
      await fetchJson("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: viewDate, ...merged }),
      });
      setActionError(null);
      setCache(dayCacheKey(viewDate), { entry: merged, dayLogs });
    } catch (err) {
      // Leave `saved` false -- the "Saving…" indicator staying up is itself
      // the signal something's wrong, on top of the banner.
      setActionError(err.message || "Couldn't save your journal entry.");
      return;
    }
    setSaved(true);
  }

  async function addTodo(e) {
    e.preventDefault();
    if (!newTodo.trim() || addingTodo) return;
    setAddingTodo(true);
    try {
      await fetchJson("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newTodo }),
      });
      setNewTodo("");
      await refreshTodos();
      setActionError(null);
    } catch (err) {
      setActionError(err.message || "Couldn't add that todo.");
    } finally {
      setAddingTodo(false);
    }
  }

  async function toggleTodo(id, done) {
    const nextTodos = todos.map((x) => (x.id === id ? { ...x, done: done ? 1 : 0 } : x));
    setTodos(nextTodos);
    try {
      await fetchJson("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // completed_date is today's date -- this list only shows on the
        // Today page, so "done" always means "done today". Sending it
        // explicitly is what lets a past day still show what got finished
        // on it, instead of the checked-off item just piling up here.
        body: JSON.stringify({ id, done, completed_date: done ? today : null }),
      });
      setActionError(null);
      setCache(STATIC_CACHE_KEY, { todos: nextTodos, deferred: deferredTodos, items });
    } catch (err) {
      setActionError(err.message || "Couldn't update that todo.");
      await refreshTodos().catch(() => {}); // undo the optimistic flip with server truth
    }
  }

  async function deleteTodo(id) {
    const prev = todos;
    const nextTodos = todos.filter((x) => x.id !== id);
    setTodos(nextTodos);
    try {
      await fetchJson(`/api/todos?id=${id}`, { method: "DELETE" });
      setActionError(null);
      setCache(STATIC_CACHE_KEY, { todos: nextTodos, deferred: deferredTodos, items });
    } catch (err) {
      setActionError(err.message || "Couldn't remove that todo.");
      setTodos(prev);
    }
  }

  async function deferTodoToTomorrow(id) {
    // Optimistically drop it from today's list into the "Later" list -- it
    // also comes back on its own once that date rolls around (see the
    // `today` filter on GET /api/todos), this just makes it visible and
    // reversible in the meantime instead of appearing to vanish.
    const prevTodos = todos;
    const prevDeferred = deferredTodos;
    const moved = todos.find((x) => x.id === id);
    const tomorrow = shiftDate(today, 1);
    const nextTodos = todos.filter((x) => x.id !== id);
    const nextDeferred = moved ? [...deferredTodos, { ...moved, defer_until: tomorrow }] : deferredTodos;
    setTodos(nextTodos);
    setDeferredTodos(nextDeferred);
    try {
      await fetchJson("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, defer_until: tomorrow }),
      });
      setActionError(null);
      setCache(STATIC_CACHE_KEY, { todos: nextTodos, deferred: nextDeferred, items });
    } catch (err) {
      setActionError(err.message || "Couldn't move that todo to tomorrow.");
      setTodos(prevTodos);
      setDeferredTodos(prevDeferred);
    }
  }

  async function bringTodoToToday(id) {
    const prevDeferred = deferredTodos;
    setDeferredTodos((d) => d.filter((x) => x.id !== id));
    setBringingBackId(id);
    try {
      await fetchJson("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, defer_until: null }),
      });
      setActionError(null);
      await refreshTodos(); // pulls it back into today's list with correct ordering
    } catch (err) {
      setActionError(err.message || "Couldn't bring that todo back to today.");
      setDeferredTodos(prevDeferred);
    } finally {
      setBringingBackId(null);
    }
  }

  async function addLearning(e) {
    e.preventDefault();
    if (!learnNote.trim() || addingLearn) return;
    setAddingLearn(true);
    try {
      await fetchJson("/api/learning/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learning_item_id: learnItemId || null,
          date: viewDate,
          note: learnNote,
        }),
      });
      setLearnNote("");
      await refreshDayLogs();
      setActionError(null);
    } catch (err) {
      setActionError(err.message || "Couldn't log that.");
    } finally {
      setAddingLearn(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-ink-faint dark:text-dink-faint">
        <Spinner className="w-6 h-6 text-accent dark:text-daccent" />
        <span className="text-sm">Loading today…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="pt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-mono uppercase tracking-[0.08em] text-accent dark:text-daccent font-semibold flex items-center gap-2">
            {new Date(viewDate + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {switching && <Spinner className="w-3 h-3" />}
          </div>
          <h1 className="text-2xl font-display font-medium mt-1">
            {isToday
              ? new Date().getHours() < 12
                ? "Morning."
                : new Date().getHours() < 18
                ? "Afternoon."
                : "Evening."
              : formatHeading(viewDate, today) + "."}
          </h1>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <button
            aria-label="Previous day"
            onClick={() => setViewDate((d) => shiftDate(d, -1))}
            className="w-11 h-11 rounded-full border border-line dark:border-dline bg-card dark:bg-dcard shadow-card flex items-center justify-center text-ink-soft dark:text-dink-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            aria-label="Next day"
            onClick={() => setViewDate((d) => (d < today ? shiftDate(d, 1) : d))}
            disabled={isToday}
            className="w-11 h-11 rounded-full border border-line dark:border-dline bg-card dark:bg-dcard shadow-card flex items-center justify-center text-ink-soft dark:text-dink-soft disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </header>

      {dayError && (
        <ErrorBanner message={dayError} onRetry={() => setDayReloadTick((t) => t + 1)} />
      )}
      {staticError && (
        <ErrorBanner message={staticError} onRetry={() => setStaticReloadTick((t) => t + 1)} />
      )}
      {actionError && (
        <ErrorBanner message={actionError} onRetry={() => setActionError(null)} retryLabel="Dismiss" />
      )}

      {!isToday && (
        <button
          onClick={() => setViewDate(today)}
          className="text-sm font-semibold text-accent dark:text-daccent flex items-center gap-1.5 -mt-2 py-1"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Jump back to today
        </button>
      )}

      {/* Check-in */}
      <section className="bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">
          Check-in
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink-soft dark:text-dink-soft w-14 flex-none">Mood</span>
          <div className="flex flex-1 justify-between gap-1">
            {MOODS.map((emoji, i) => (
              <button
                key={i}
                onClick={() => saveEntry({ mood: i + 1 })}
                className={`flex-1 max-w-[48px] aspect-square rounded-[14px] text-xl flex items-center justify-center border transition ${
                  entry.mood === i + 1
                    ? "bg-accent-soft dark:bg-daccent-soft border-accent dark:border-daccent -translate-y-0.5"
                    : "bg-paper dark:bg-dpaper border-transparent"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink-soft dark:text-dink-soft w-14 flex-none">Energy</span>
          <div className="flex flex-1 justify-between gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => saveEntry({ energy: n })}
                className={`flex-1 max-w-[48px] h-10 rounded-sm2 text-sm font-mono border ${
                  entry.energy === n
                    ? "bg-ink text-paper dark:bg-dink dark:text-dpaper border-ink dark:border-dink"
                    : "bg-paper dark:bg-dpaper text-ink-soft dark:text-dink-soft border-line dark:border-dline"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Todos — a single running list, not tied to a date, except that any
          todo can be moved to tomorrow (defer_until) so it drops out of
          today's view and reappears once that day arrives. */}
      {isToday && (
        <section className="bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">
            Today
          </h2>
          <form onSubmit={addTodo} className="flex gap-2">
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add a todo…"
              disabled={addingTodo}
              className="flex-1 min-w-0 border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-3.5 py-3 text-base focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:focus:ring-daccent/20 disabled:opacity-60"
            />
            <button
              disabled={addingTodo || !newTodo.trim()}
              className="bg-ink dark:bg-dink text-paper dark:text-dpaper rounded-sm2 px-5 font-semibold text-base disabled:opacity-50 flex items-center gap-1.5 min-w-[72px] justify-center"
            >
              {addingTodo ? <Spinner className="w-3.5 h-3.5" /> : "Add"}
            </button>
          </form>
          <ul>
            {todos.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 py-3 border-b border-line-soft dark:border-dline-soft last:border-none group"
              >
                <button
                  onClick={() => toggleTodo(t.id, !t.done)}
                  className={`w-7 h-7 flex-none rounded-[9px] border flex items-center justify-center transition ${
                    t.done
                      ? "bg-good dark:bg-dgood border-good dark:border-dgood text-accent-ink"
                      : "bg-paper dark:bg-dpaper border-line dark:border-dline"
                  }`}
                >
                  {!!t.done && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <span className={`flex-1 min-w-0 text-base ${t.done ? "line-through text-ink-faint dark:text-dink-faint" : ""}`}>
                  {t.text}
                </span>
                {!t.done && (
                  <button
                    onClick={() => deferTodoToTomorrow(t.id)}
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
                  onClick={() => deleteTodo(t.id)}
                  aria-label="Remove todo"
                  className="flex-none w-8 h-8 rounded-full bg-warn-soft dark:bg-dwarn-soft text-warn dark:text-dwarn flex items-center justify-center"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.8 12.1A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.9L6 7" />
                  </svg>
                </button>
              </li>
            ))}
            {todos.length === 0 && <p className="text-ink-faint dark:text-dink-faint text-base py-1">Nothing yet.</p>}
          </ul>

          {deferredTodos.length > 0 && (
            <div className="pt-2 border-t border-line-soft dark:border-dline-soft space-y-2">
              <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">
                Later
              </h3>
              <ul className="space-y-2">
                {deferredTodos.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-base text-ink-soft dark:text-dink-soft truncate">
                      {t.text}
                    </span>
                    <span className="flex-none text-[0.65rem] font-mono text-ink-faint dark:text-dink-faint whitespace-nowrap">
                      {formatHeading(t.defer_until, today)}
                    </span>
                    <button
                      onClick={() => bringTodoToToday(t.id)}
                      disabled={bringingBackId === t.id}
                      title="Bring back to today"
                      className="flex-none text-xs font-semibold bg-accent-soft dark:bg-daccent-soft text-accent dark:text-daccent rounded-full px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {bringingBackId === t.id ? <Spinner className="w-3 h-3" /> : "bring to today"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* On a past day, todos aren't editable here -- just show what got
          finished that day, using completed_date recorded at the time. */}
      {!isToday && (
        <section className="bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">
            Completed that day
          </h2>
          {dayCompletedTodos.length > 0 ? (
            <ul className="space-y-2">
              {dayCompletedTodos.map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-base text-ink-faint dark:text-dink-faint">
                  <span className="w-6 h-6 flex-none rounded-[9px] bg-good dark:bg-dgood text-accent-ink flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="line-through">{t.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-faint dark:text-dink-faint text-base">Nothing completed this day.</p>
          )}
        </section>
      )}

      {/* Learned that day */}
      <section className="bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">
          {isToday ? "Learned today" : "Learned that day"}
        </h2>
        <form onSubmit={addLearning} className="flex gap-2">
          <select
            value={learnItemId}
            onChange={(e) => setLearnItemId(e.target.value)}
            disabled={addingLearn}
            className="border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-2 py-3 text-base max-w-[112px] disabled:opacity-60"
          >
            <option value="">General</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </select>
          <input
            value={learnNote}
            onChange={(e) => setLearnNote(e.target.value)}
            placeholder="One thing you learned…"
            disabled={addingLearn}
            className="flex-1 min-w-0 border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-3.5 py-3 text-base focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:focus:ring-daccent/20 disabled:opacity-60"
          />
          <button
            disabled={addingLearn || !learnNote.trim()}
            className="bg-ink dark:bg-dink text-paper dark:text-dpaper rounded-sm2 px-5 font-semibold text-base disabled:opacity-50 flex items-center gap-1.5 min-w-[64px] justify-center"
          >
            {addingLearn ? <Spinner className="w-3.5 h-3.5" /> : "Log"}
          </button>
        </form>
        {dayLogs.length > 0 && (
          <div>
            {dayLogs.map((l) => (
              <div key={l.id} className="flex gap-2 text-base py-2.5 border-b border-line-soft dark:border-dline-soft last:border-none">
                {l.item_title && (
                  <span className="flex-none font-mono text-[0.63rem] text-accent-strong dark:text-daccent-strong bg-accent-soft dark:bg-daccent-soft px-2 py-0.5 rounded-full h-fit">
                    {l.item_title}
                  </span>
                )}
                <span className="text-ink-soft dark:text-dink-soft">{l.note}</span>
              </div>
            ))}
          </div>
        )}
        {dayLogs.length === 0 && (
          <p className="text-ink-faint dark:text-dink-faint text-base">Nothing logged this day.</p>
        )}
      </section>

      {/* Journal */}
      <section className="bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint">
            Journal
          </h2>
          <span className="text-[0.65rem] font-mono text-ink-faint dark:text-dink-faint flex items-center gap-1.5">
            {saved ? (
              <span className="w-1.5 h-1.5 rounded-full bg-good dark:bg-dgood" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-accent dark:bg-daccent animate-pulse" />
            )}
            {saved ? "Saved" : "Saving…"}
          </span>
        </div>

        <div>
          <p className="text-[0.72rem] text-ink-faint dark:text-dink-faint mb-1.5">
            Anything that happened, any stray thought — don't organize, just write.
          </p>
          <textarea
            value={entry.log}
            onChange={(e) => setEntry((s) => ({ ...s, log: e.target.value }))}
            onBlur={() => saveEntry({})}
            rows={4}
            className="w-full border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-3.5 py-3 text-base leading-relaxed focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:focus:ring-daccent/20"
          />
        </div>

        <div>
          <p className="text-[0.72rem] text-ink-faint dark:text-dink-faint mb-1.5">
            A few honest lines: how that day actually went.
          </p>
          <textarea
            value={entry.reflection}
            onChange={(e) => setEntry((s) => ({ ...s, reflection: e.target.value }))}
            onBlur={() => saveEntry({})}
            rows={3}
            className="w-full border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-3.5 py-3 text-base leading-relaxed focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:focus:ring-daccent/20"
          />
        </div>
      </section>
    </div>
  );
}
