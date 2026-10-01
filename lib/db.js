import { createClient } from "@libsql/client";

let client;

// One shared connection, reused across API routes (serverless-friendly:
// @libsql/client is fine to instantiate per invocation, but reusing across
// warm lambda invocations saves a bit of latency).
export function getDb() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) {
      throw new Error(
        "TURSO_DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
      );
    }
    client = createClient({ url, authToken });
  }
  return client;
}

export function todayStr(d = new Date()) {
  // Local calendar date as YYYY-MM-DD (not UTC) — journaling "today" should
  // follow the user's clock, not the server's.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
