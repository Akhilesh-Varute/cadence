import { NextResponse } from "next/server";
import { applyOps } from "../../../lib/data";

// Body: { ops: [{ op: "put"|"del"|"settings", kind, item|id|value }] }
export async function POST(req) {
  const { ops } = await req.json();
  if (!Array.isArray(ops) || ops.length > 200) {
    return NextResponse.json({ error: "ops must be an array of at most 200" }, { status: 400 });
  }
  const errors = await applyOps(ops);
  return NextResponse.json({ ok: !errors.length, errors });
}
