import { NextResponse } from "next/server";
import { getDb, ensureReminderTables } from "../../../lib/db";
import { sendToAll } from "../../../lib/push";

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}

// Body: a PushSubscription JSON. Saves it and fires a test notification so
// you know it works the moment you enable it.
export async function POST(req) {
  const sub = await req.json();
  const { endpoint, keys } = sub || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  await ensureReminderTables();
  await getDb().execute({
    sql: "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)",
    args: [endpoint, keys.p256dh, keys.auth],
  });
  await sendToAll({ title: "Sharpen", body: "Notifications are on", tag: "welcome" });
  return NextResponse.json({ ok: true });
}
