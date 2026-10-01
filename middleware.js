import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";

export const config = {
  // Run on everything except Next internals/static assets. Login page and
  // its API are handled inside the middleware body (allow-listed), not
  // excluded here, so they still go through this same file.
  // "icons" here used to mean an /icons folder that never existed -- the
  // real files (apple-touch-icon.png, icon-192.png, icon-512.png) sit at
  // the public root and were falling through to the auth check below,
  // so a home-screen icon refetch after the session cookie expires would
  // 302 to /login instead of returning the image. Listed explicitly now.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|icon-192.png|icon-512.png|manifest.json|sw.js).*)",
  ],
};

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // /api/cron/remind checks its own bearer secret (GitHub Actions has no session cookie).
  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/cron/remind") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
