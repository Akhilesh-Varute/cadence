"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Pending from "../../components/Pending";
import { useStore } from "../../lib/store";
import { useToast } from "../../components/Toast";
import { ALERTS } from "../../components/Editor";

const ACCENTS = ["#3346FF", "#E58A00", "#D6249F", "#0E8A6A", "#2B2F3A"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const urlB64 = (s) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function Seg({ value, options, onPick, min = 210 }) {
  return (
    <div className="seg" style={{ minWidth: min }}>
      {options.map(([v, label]) => (
        <button key={String(v)} className={value === v ? "on" : ""} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

// "checking" | "unsupported" | "off" | "on" | "denied"
function usePush() {
  const [status, setStatus] = useState("checking");
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      setStatus((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  // Subscribes this device (asking permission if needed) and sends a test push.
  async function enable() {
    if ((await Notification.requestPermission()) !== "granted") {
      setStatus("denied");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const res = await fetch("/api/push");
    const { publicKey } = await res.json();
    if (!publicKey) throw new Error("The server has no push keys set.");
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) }));
    const saved = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
    if (!saved.ok) throw new Error("The server didn't accept this device. Try again.");
    setStatus("on");
  }
  return { status, enable };
}

const PUSH_NOTE = {
  checking: "Checking this device.",
  on: "On for this device. A test notification was sent.",
  off: "Off. Turn it on to get alerts when the app is closed.",
  denied: "Blocked. Allow notifications for Sharpen in your browser or phone settings, then reload.",
  unsupported: "Not available here. On iPhone, add Sharpen to your Home Screen first, then open it from there.",
};

export default function SettingsPage() {
  const { state, setSettings, put, resetLocal } = useStore();
  const toast = useToast();
  const router = useRouter();
  const push = usePush();
  const [busy, setBusy] = useState(false);
  if (!state) return <Pending title="Settings" />;
  const s = state.settings;

  async function turnOn() {
    setBusy(true);
    try {
      await push.enable();
    } catch (e) {
      toast(e.message || "Couldn't turn on notifications. Try again.");
    }
    setBusy(false);
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    await resetLocal();
    router.push("/login");
    router.refresh();
  }

  async function copyBackup() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ lists: state.lists, reminders: state.reminders, tasks: state.tasks, settings: s }, null, 2));
      toast("Backup copied");
    } catch {
      toast("Couldn't copy. Allow clipboard access and try again.");
    }
  }

  return (
    <>
      <header className="head">
        <h1 className="big">Settings</h1>
        <p className="sub">Make it yours.</p>
      </header>
      <div className="set">
        <div className="sec">Appearance</div>
        <div className="line">
          <span>Theme</span>
          <Seg value={s.theme} options={["system", "light", "dark"].map((t) => [t, cap(t)])} onPick={(v) => setSettings({ theme: v })} />
        </div>
        <div className="line">
          <span>Accent</span>
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button key={c} className={`sw${s.accent === c ? " on" : ""}`} style={{ "--c": c }} aria-label={`Accent ${c}`} aria-pressed={s.accent === c} onClick={() => setSettings({ accent: c })} />
            ))}
          </div>
        </div>
        <div className="line">
          <span>Row spacing</span>
          <Seg value={s.density} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} onPick={(v) => setSettings({ density: v })} />
        </div>
        <div className="line">
          <span>Week starts on</span>
          <Seg value={s.weekStart} options={[[1, "Monday"], [0, "Sunday"]]} onPick={(v) => setSettings({ weekStart: v })} />
        </div>

        <div className="sec">Lists</div>
        {state.lists.map((l) => (
          <div className="line" key={l.id}>
            <input type="color" defaultValue={l.color} aria-label={`Colour for ${l.name}`} onBlur={(e) => e.target.value !== l.color && put("list", { ...l, color: e.target.value })} />
            <input
              className="nm"
              type="text"
              defaultValue={l.name}
              aria-label="List name"
              onBlur={(e) => {
                const name = e.target.value.trim() || l.name;
                e.target.value = name;
                if (name !== l.name) put("list", { ...l, name });
              }}
            />
          </div>
        ))}

        <div className="sec">Alerts</div>
        <div className="line"><span>Default alert for new reminders</span></div>
        <div className="chips" style={{ padding: "10px 0 4px" }}>
          {ALERTS.map((a) => (
            <button key={a.m} className={`chip${s.defaultAlert === a.m ? " on acc" : ""}`} aria-pressed={s.defaultAlert === a.m} onClick={() => setSettings({ defaultAlert: a.m })}>{a.l}</button>
          ))}
        </div>
        <div className="line">
          <div className="grow">
            <span>Notifications</span>
            <p className="note" style={{ margin: "3px 0 0" }}>{PUSH_NOTE[push.status]}</p>
          </div>
          {(push.status === "off" || push.status === "on") && (
            <button className="btn" disabled={busy} onClick={turnOn}>{push.status === "on" ? "Send test" : "Turn on"}</button>
          )}
        </div>

        <div className="sec">Put it on your iPhone</div>
        <p className="note" style={{ marginTop: 0 }}>
          Open this page in Safari, tap Share, then Add to Home Screen. Notifications only work from the Home Screen icon, on iOS 16.4 or later.
        </p>

        <div className="sec">Your data</div>
        <div className="chips" style={{ paddingBottom: 6 }}>
          <button className="btn alt" onClick={copyBackup}>Copy backup</button>
          <button className="btn alt" onClick={() => resetLocal().then(() => toast("Reloaded from the server"))}>Clear this device&apos;s copy</button>
          <button className="btn alt" onClick={logout}>Log out</button>
        </div>
        <p className="note">Your data lives on the server and is copied to this device so the app works offline.</p>
      </div>
    </>
  );
}
