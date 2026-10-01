import { NextResponse } from "next/server";
import { loadState } from "../../../lib/data";

export const dynamic = "force-dynamic";

// Everything the client needs, in one round trip.
export async function GET() {
  return NextResponse.json(await loadState());
}
