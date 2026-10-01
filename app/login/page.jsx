"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e) {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push(params.get("next") || "/");
        router.refresh();
        return; // navigating away, so the form stays disabled
      }
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Too many attempts. Try again later.");
      } else {
        setError("That PIN is wrong. Try again.");
      }
      setPin("");
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const press = (c) => {
    if (busy) return;
    setError("");
    setPin((p) => (p + c).slice(0, 24));
  };

  return (
    <form className="login" onSubmit={submit}>
      <h1 className="big">Sharpen</h1>
      <p className="sub">Enter your PIN to open your reminders.</p>
      <input
        className="pin"
        autoFocus
        type="password"
        inputMode="text"
        placeholder="PIN"
        aria-label="PIN"
        value={pin}
        disabled={busy}
        onChange={(e) => {
          setError("");
          setPin(e.target.value);
        }}
      />
      <p className="err" role="alert">{error}</p>
      <div className="keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" disabled={busy} onClick={() => press(String(n))}>{n}</button>
        ))}
        <span />
        <button type="button" disabled={busy} onClick={() => press("0")}>0</button>
        <button type="button" className="quiet" disabled={busy} aria-label="Delete last digit" onClick={() => !busy && setPin((p) => p.slice(0, -1))}>
          &#9003;
        </button>
      </div>
      <button className="go" type="submit" disabled={!pin || busy}>{busy ? "Checking" : "Unlock"}</button>
    </form>
  );
}
