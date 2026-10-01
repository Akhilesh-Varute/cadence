import { NextResponse } from "next/server";
import { checkPin, createSessionToken, SESSION_COOKIE } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { ensureSchema } from "../../../lib/data";

// A 6-digit numeric PIN is only ~1M combinations, and this endpoint has no
// other protection -- without throttling it's brute-forceable by anyone who
// finds the URL. Track failed attempts per IP in the DB (Vercel functions
// are stateless per-invocation, so in-memory counters wouldn't persist) and
// lock out an IP for a while after too many failures in a short window.
const MAX_ATTEMPTS = 5;
// Also doubles as the lockout duration: once the oldest failed attempt in
// the count ages past this window, the count drops and access returns.
const WINDOW_MINUTES = 15;

function clientIp(req) {
  // Vercel sets x-forwarded-for; take the first (client) hop.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req) {
  await ensureSchema(); // creates login_attempts if this database never had it
  const db = getDb();
  const ip = clientIp(req);

  const { rows: recent } = await db.execute({
    sql: `
      SELECT COUNT(*) as c FROM login_attempts
      WHERE ip = ? AND created_at >= datetime('now', ?)
    `,
    args: [ip, `-${WINDOW_MINUTES} minutes`],
  });
  if (recent[0].c >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` },
      { status: 429 }
    );
  }

  const { pin } = await req.json();
  if (!checkPin(pin)) {
    await db.execute({
      sql: "INSERT INTO login_attempts (ip) VALUES (?)",
      args: [ip],
    });
    return NextResponse.json({ error: "invalid pin" }, { status: 401 });
  }

  // Successful login -- clear this IP's recent failures so a legitimate
  // user who mistyped a few times isn't left half-locked-out.
  await db.execute({ sql: "DELETE FROM login_attempts WHERE ip = ?", args: [ip] });

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
