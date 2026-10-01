"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useEditor } from "./Editor";

const TABS = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/reminders", label: "Reminders", icon: "rem" },
  null, // the add button
  { href: "/tasks", label: "Tasks", icon: "task" },
  { href: "/settings", label: "Settings", icon: "set" },
];

export default function Shell({ children }) {
  const path = usePathname();
  const { open } = useEditor();
  return (
    <div className="app">
      <main>{children}</main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) =>
          t ? (
            <Link key={t.href} href={t.href} className={`tab${path === t.href ? " on" : ""}`} aria-current={path === t.href ? "page" : undefined}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </Link>
          ) : (
            <button key="add" className="add" aria-label="New reminder or task" onClick={() => open(path === "/tasks" ? "task" : "reminder")}>
              <Icon name="plus" />
            </button>
          )
        )}
      </nav>
    </div>
  );
}
