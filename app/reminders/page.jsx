"use client";

import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorBanner from "../../components/ErrorBanner";
import { fetchJson } from "../../lib/fetchJson";
import { DAY_LABELS, toDateStr, repeatLabel, fmtTime } from "../../lib/reminders";

const CARD = "bg-card dark:bg-dcard border border-line-soft dark:border-dline-soft rounded-lg2 shadow-card p-4 space-y-3";
const H2 = "text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint dark:text-dink-faint";
const INPUT =
  "border border-line dark:border-dline bg-paper dark:bg-dpaper rounded-sm2 px-3.5 py-3 text-base focus:outline-none focus:ring-[3px] focus:ring-accent/20 dark:focus:ring-daccent/20";
const BLANK = { id: null, title: "", time: "09:00", mode: "daily", days: [1, 2, 3, 4, 5], date: toDateStr() };

const urlB64 = (s) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition ${
        on
          ? "bg-accent dark:bg-daccent text-accent-ink dark:text-dbg border-transparent"
          : "bg-paper dark:bg-dpaper border-line dark:border-dline text-ink-soft dark:text-dink-soft"
      }`}
    >
      {children}
    </button>
  );
}

export default function RemindersPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null); // null = closed
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState("checking"); // checking | unsupported | off | on | denied

  async function load() {
    try {
      setList((await fetchJson("/api/reminders")).reminders);
    } catch (err) {
      setError(err.message || "Couldn't load reminders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setNotif("unsupported");
      }
      if (Notification.permission === "denied") return setNotif("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      setNotif((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setNotif("unsupported"));
  }, []);

  async function enableNotifications() {
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setNotif("denied");
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await fetchJson("/api/push");
      if (!publicKey) throw new Error("Server has no VAPID keys set.");
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) }));
      await fetchJson("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setNotif("on");
    } catch (err) {
      setError(err.message || "Couldn't enable notifications.");
    }
  }

  const send = (method, body) =>
    fetchJson("/api/reminders", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function save(e) {
    e.preventDefault();
    if (saving || !form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        id: form.id,
        title: form.title,
        time: form.time,
        days: form.mode === "days" ? form.days : [],
        date: form.mode === "once" ? form.date : null,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      await send(form.id ? "PATCH" : "POST", body);
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(fn) {
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Something didn't save.");
    }
    await load();
  }

  function edit(r) {
    const days = r.days ? r.days.split(",").map(Number) : [];
    setForm({
      id: r.id,
      title: r.title,
      time: r.time,
      mode: r.date ? "once" : days.length ? "days" : "daily",
      days: days.length ? days : [1, 2, 3, 4, 5],
      date: r.date || toDateStr(),
    });
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleDay = (d) =>
    set({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Reminders</h1>
      {error && <ErrorBanner message={error} />}

      {notif !== "on" && notif !== "checking" && (
        <section className={CARD}>
          <h2 className={H2}>Notifications</h2>
          {notif === "off" && (
            <>
              <p className="text-base">Turn on notifications so reminders reach you when the app is closed.</p>
              <button onClick={enableNotifications} className="bg-ink dark:bg-dink text-paper dark:text-dpaper rounded-sm2 px-5 py-3 font-semibold">
                Enable notifications
              </button>
            </>
          )}
          {notif === "denied" && (
            <p className="text-base">Notifications are blocked. Allow them for Sharpen in your browser or phone settings, then reload.</p>
          )}
          {notif === "unsupported" && (
            <p className="text-base">
              This browser can&apos;t do push. On iPhone, open the site in Safari, tap Share → Add to Home Screen, then open
              Sharpen from the Home Screen icon.
            </p>
          )}
        </section>
      )}

      {form ? (
        <form onSubmit={save} className={CARD}>
          <h2 className={H2}>{form.id ? "Edit reminder" : "New reminder"}</h2>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="What should I remind you about?"
            className={`${INPUT} w-full`}
          />
          <input type="time" required value={form.time} onChange={(e) => set({ time: e.target.value })} className={`${INPUT} w-full`} />
          <div className="flex flex-wrap gap-2">
            <Chip on={form.mode === "daily"} onClick={() => set({ mode: "daily" })}>Every day</Chip>
            <Chip on={form.mode === "days"} onClick={() => set({ mode: "days" })}>Certain days</Chip>
            <Chip on={form.mode === "once"} onClick={() => set({ mode: "once" })}>Once</Chip>
          </div>
          {form.mode === "days" && (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <Chip key={d} on={form.days.includes(d)} onClick={() => toggleDay(d)}>
                  {DAY_LABELS[d]}
                </Chip>
              ))}
            </div>
          )}
          {form.mode === "once" && (
            <input type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} className={`${INPUT} w-full`} />
          )}
          <div className="flex gap-2">
            <button
              disabled={saving || !form.title.trim() || (form.mode === "days" && !form.days.length)}
              className="flex-1 bg-ink dark:bg-dink text-paper dark:text-dpaper rounded-sm2 py-3 font-semibold disabled:opacity-50 flex items-center justify-center"
            >
              {saving ? <Spinner className="w-4 h-4" /> : "Save"}
            </button>
            <button type="button" onClick={() => setForm(null)} className="px-5 rounded-sm2 border border-line dark:border-dline font-semibold">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setForm({ ...BLANK, date: toDateStr() })} className="w-full bg-ink dark:bg-dink text-paper dark:text-dpaper rounded-sm2 py-3.5 font-semibold">
          + New reminder
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="w-6 h-6" />
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className={`${CARD} !space-y-0 flex items-center gap-3 ${r.enabled ? "" : "opacity-50"}`}>
              <button onClick={() => edit(r)} className="flex-1 min-w-0 text-left">
                <div className="font-display text-2xl leading-none">{fmtTime(r.time)}</div>
                <div className="text-base truncate mt-1">{r.title}</div>
                <div className="text-xs text-ink-faint dark:text-dink-faint">{repeatLabel(r)}</div>
              </button>
              <button
                role="switch"
                aria-checked={!!r.enabled}
                aria-label="Enabled"
                onClick={() => mutate(() => send("PATCH", { id: r.id, enabled: !r.enabled }))}
                className={`flex-none w-12 h-7 rounded-full p-0.5 transition ${r.enabled ? "bg-good dark:bg-dgood" : "bg-line dark:bg-dline"}`}
              >
                <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${r.enabled ? "translate-x-5" : ""}`} />
              </button>
              <button
                onClick={() => confirm(`Delete "${r.title}"?`) && mutate(() => fetchJson(`/api/reminders?id=${r.id}`, { method: "DELETE" }))}
                aria-label="Delete reminder"
                className="flex-none w-8 h-8 rounded-full bg-warn-soft dark:bg-dwarn-soft text-warn dark:text-dwarn flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.8 12.1A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.9L6 7" />
                </svg>
              </button>
            </li>
          ))}
          {list.length === 0 && <p className="text-ink-faint dark:text-dink-faint text-base">No reminders yet.</p>}
        </ul>
      )}
    </div>
  );
}
