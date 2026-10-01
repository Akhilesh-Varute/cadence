"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Spinner from "./Spinner";

const links = [
  {
    href: "/",
    label: "Today",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3v4M16 3v4M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      </svg>
    ),
  },
  {
    href: "/reminders",
    label: "Reminders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  if (pathname === "/login") return null;

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-10 bg-paper/95 dark:bg-dpaper/95 backdrop-blur border-t border-line dark:border-dline"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-2xl mx-auto px-1 flex items-stretch justify-between h-[68px]">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold transition ${
                active ? "text-ink dark:text-dink" : "text-ink-faint dark:text-dink-faint"
              }`}
            >
              <span className={`w-6 h-6 ${active ? "text-accent dark:text-daccent" : ""}`}>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
        <button
          onClick={logout}
          disabled={loggingOut}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold text-ink-faint dark:text-dink-faint disabled:opacity-60"
        >
          {loggingOut ? (
            <Spinner className="w-6 h-6" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          )}
          Log out
        </button>
      </div>
    </nav>
  );
}
