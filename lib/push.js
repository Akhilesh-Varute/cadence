import webpush from "web-push";
import { getDb } from "./db";

let ready = false;
function init() {
  if (ready) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error("VAPID keys not set. See .env.example.");
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  ready = true;
}

// Sends to every subscribed device; drops subscriptions the push service says are gone.
export async function sendToAll(payload) {
  init();
  const db = getDb();
  const { rows } = await db.execute("SELECT * FROM push_subscriptions");
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, body);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [r.endpoint] });
        } else {
          console.error("push failed", err.statusCode, err.body);
        }
      }
    })
  );
  return sent;
}
