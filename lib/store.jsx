"use client";

// Client data store. The server (Turso) is the source of truth; this keeps a
// full copy in IndexedDB so the app opens instantly and works offline. Edits
// apply locally first, then go out through a persisted outbox (/api/sync).
// On every pull the outbox is replayed over the server state, so a pending
// edit is never lost to a refresh.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { advance, dateOnly } from "./recurrence";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

/* ---------- IndexedDB (one key/value store, no library) ---------- */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sharpen", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function kv(mode, fn) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const store = db.transaction("kv", mode).objectStore("kv");
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // private mode etc.: the app still works, just without a local copy
  }
}
const kvGet = (k) => kv("readonly", (s) => s.get(k));
const kvSet = (k, v) => kv("readwrite", (s) => s.put(v, k));

/* ---------- state ---------- */
export const EMPTY = {
  lists: [],
  reminders: [],
  tasks: [],
  settings: { theme: "system", accent: "#3346FF", density: "comfortable", weekStart: 1, defaultAlert: 0, tz: "" },
};

const bucket = { reminder: "reminders", task: "tasks", list: "lists" };

function applyOp(state, op) {
  if (op.op === "settings") return { ...state, settings: { ...state.settings, ...op.value } };
  const key = bucket[op.kind];
  const arr = state[key];
  if (op.op === "del") return { ...state, [key]: arr.filter((x) => x.id !== op.id) };
  const i = arr.findIndex((x) => x.id === op.item.id);
  return { ...state, [key]: i > -1 ? arr.map((x, j) => (j === i ? op.item : x)) : [op.item, ...arr] };
}
const replay = (state, ops) => ops.reduce(applyOp, state);

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const newId = uid;

export function StoreProvider({ enabled, children }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [syncError, setSyncError] = useState(false); // last sync attempt failed
  const [pending, setPending] = useState(0); // edits waiting to be sent
  const [now, setNow] = useState(() => new Date());
  const [ui, setUi] = useState({ rf: "all", tf: "all" });
  const stateRef = useRef(null);
  const outbox = useRef([]);
  const busy = useRef(false);
  const lastPull = useRef(0);

  const commit = useCallback((next) => {
    stateRef.current = next;
    setState(next);
    kvSet("state", next);
  }, []);

  const setBox = (arr) => {
    outbox.current = arr;
    setPending(arr.length);
    kvSet("outbox", arr);
  };

  // Send queued ops, then pull the server's state and replay what is still pending.
  const sync = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (outbox.current.length) {
        const batch = outbox.current.slice(0, 200);
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: batch }),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error(`sync failed (${res.status})`);
        setBox(outbox.current.slice(batch.length)); // server rejects bad ops individually; don't retry them forever
      }
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const server = await res.json();
      commit(replay(server, outbox.current));
      setError(null);
      setSyncError(false);
      lastPull.current = Date.now();
      if (outbox.current.length) setTimeout(sync, 0); // more than one batch queued
    } catch (e) {
      setSyncError(true);
      if (!stateRef.current) setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      busy.current = false;
    }
  }, [commit]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const [local, box] = await Promise.all([kvGet("state"), kvGet("outbox")]);
      setBox(Array.isArray(box) ? box : []);
      if (local && alive) commit(local);
      sync();
    })();
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastPull.current > 3000) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", sync);
    const clock = setInterval(() => setNow(new Date()), 30000);
    const retry = setInterval(() => outbox.current.length && sync(), 20000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", sync);
      clearInterval(clock);
      clearInterval(retry);
    };
  }, [enabled, commit, sync]);

  // Theme, accent and density: apply now, and cache for the pre-paint script in layout.jsx.
  const settings = state?.settings;
  useEffect(() => {
    if (!settings) return;
    const r = document.documentElement;
    if (settings.theme === "system") r.removeAttribute("data-theme");
    else r.setAttribute("data-theme", settings.theme);
    r.style.setProperty("--accent-base", settings.accent);
    r.setAttribute("data-density", settings.density);
    try {
      localStorage.setItem("sharpen:ui", JSON.stringify({ theme: settings.theme, accent: settings.accent, density: settings.density }));
    } catch {}
  }, [settings]);

  const mutate = useCallback(
    (op) => {
      if (!stateRef.current) return;
      commit(applyOp(stateRef.current, op));
      setBox([...outbox.current, op]);
      sync();
    },
    [commit, sync]
  );

  // Tell the server which zone this phone is in (digests and zone-less reminders use it).
  useEffect(() => {
    if (!settings) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && settings.tz !== tz) mutate({ op: "settings", value: { tz } });
  }, [settings?.tz, !!settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo(() => {
    const put = (kind, item) => mutate({ op: "put", kind, item: { ...item, updated_at: Date.now() } });
    return {
      put,
      del: (kind, id) => mutate({ op: "del", kind, id }),
      setSettings: (value) => mutate({ op: "settings", value }),

      // Tick a task. Done tasks remember the day for the evening summary.
      toggleTask(t) {
        const done = !t.done;
        put("task", { ...t, done, completed_date: done ? dateOnly(new Date()) : "" });
      },

      // Complete a reminder. One-off -> done. Repeating -> jump to the next
      // occurrence. Returns the result and an undo function for the toast.
      completeReminder(r) {
        const after = r.repeat.type === "none" ? { ...r, done: true } : advance({ ...r, fired: { ...r.fired } }, new Date());
        put("reminder", after);
        return { after, undo: () => put("reminder", r) };
      },
      reopenReminder(r) {
        put("reminder", { ...r, done: false });
      },

      // Wipe this device's copy and reload from the server.
      async resetLocal() {
        setBox([]);
        await kvSet("state", null);
        stateRef.current = null;
        setState(null);
        sync();
      },
    };
  }, [mutate, sync]);

  const value = useMemo(
    () => ({ state, error, syncError, pending, now, ui, setUi: (p) => setUi((u) => ({ ...u, ...p })), retry: sync, ...api }),
    [state, error, syncError, pending, now, ui, api, sync]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

