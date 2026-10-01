# Sharpen → Cadence design: migration plan

Status: **draft, awaiting approval. No app code has been changed.**

## 1. Current stack

| Area | Today |
|---|---|
| Framework | Next.js 14 (App Router, JS/JSX, no TypeScript), React 18 |
| Styling | Tailwind 3 with a custom earthy palette (`tailwind.config.js`), `globals.css`, Google Fonts (Fraunces, Public Sans, IBM Plex Mono) |
| Data | Turso / libSQL via `@libsql/client` (`file:./local.db` in dev) |
| Auth | Single PIN → signed session cookie (`lib/auth.js`, `middleware.js`, `/login`) |
| Push | `web-push` (VAPID), `public/sw.js` (push + click only, no caching), subscriptions in `push_subscriptions` |
| Scheduler | cron-job.org calls `GET /api/cron/remind` every minute with a bearer `CRON_SECRET` |
| Hosting | Vercel (`sharpen.akhileshvarute.me`), auto-deploy from `main`; nightly backup via GitHub Actions |
| Tests | None |
| Client state | In-memory page cache only. No IndexedDB, no offline support |

## 2. Existing features and how each maps

| Existing feature | Where | Maps to in Cadence | Notes |
|---|---|---|---|
| Reminders: title, time, every day / certain weekdays / once | `/reminders`, `/api/reminders`, `reminders` table | **Reminders tab + editor sheet** | Design is a superset: adds monthly, yearly, "every N", end rules, multiple alerts, priority, list, notes |
| Per-day tick-off of a reminder | `reminder_logs` | **Check on reminder row** | Design instead *advances the reminder to its next occurrence* (iOS Reminders behaviour) with Undo. Replaces the per-day log |
| Enable/disable switch per reminder | Reminders page | **Missing from design** | See open question 3 |
| Push notification at reminder time, deduped per day | `/api/cron/remind`, `last_fired_date` | **Notifications** | Rewritten: fire per occurrence and per alert (`fired` map), using the shared recurrence module |
| Todos: add, tick, delete | `/` Today page, `/api/todos` | **Tasks tab** | Quick-add field matches the existing add-and-press-return flow |
| "Move to tomorrow" and "Later" list | Today page, `todos.defer_until` | **Missing from design** | Closest fit is clearing or changing a task's due date. See open question 4 |
| Completed todos kept per day (`completed_date`) | todos | **Done section on Tasks** | Keep `completed_date` for history and digests |
| Morning and evening digest pushes (8 AM, 8 PM) | cron route | **Not in design** | See open question 2 |
| Today view: todos and due reminders with progress bar | `/` | **Today tab with day rail** | Progress bar replaced by the rail and "n to do" subtitle |
| Enable notifications button | Reminders page | **Settings → Notifications** | Real Web Push, not the prototype's in-page `Notification` call |
| Light/dark by system | Tailwind `dark:` media | **Settings → Theme** (System / Light / Dark) | Moves to `data-theme` + tokens |
| PIN login and Log out | `/login`, NavBar button | **Login restyled; Log out in Settings** | Tab bar has no room for it |
| Journal, Habits, Learning (hidden, still routable) | `/journal`, `/habits`, `/learning`, their APIs | **Not in design** | See open question 1 |
| Timezone-aware server scheduling | `reminders.tz` | Kept | Occurrence times stored as local wall-clock plus `tz` |

## 3. Design features that are new (no Sharpen equivalent)

- Day rail (24h track, pips, "now" marker, one-time load-in animation)
- Lists with colours (Personal, Work, Home, Health), editable names and colours, filter chips
- Priority (none / low / medium / high)
- Notes on reminders and tasks
- Task steps (checklist) and "n of m steps"
- Recurrence: monthly, yearly, "every N", weekday picker, ends on a date or after N times, month-end clamping
- Multiple alerts per reminder (at time, 5 min, 15 min, 1 hour, 1 day) and a default alert setting
- Overdue handling (red/marigold, "Was due …")
- Undo toasts, delete with Undo
- Editor bottom sheet with live "coming up" preview
- Settings: accent colour, row density, week start, copy backup, reset
- Service worker with offline cache, IndexedDB local copy

## 4. Gaps and conflicts to resolve

1. **Data model changes** (Turso migration, additive):
   - `reminders`: add `notes`, `list_id`, `priority`, `repeat_type`, `repeat_interval`, `repeat_days`, `end_type`, `end_date`, `end_count`, `alerts` (JSON), `cursor` (next occurrence, local ISO), `fired` (JSON), `done`, `updated_at`. Existing rows convert: `days=''` → daily, `days='1,3'` → weekly, `date` set → one-off.
   - `tasks` (from `todos`): add `notes`, `list_id`, `priority`, `due`, `steps` (JSON), `updated_at`. `defer_until` → `due`.
   - New `lists` table, new `settings` row (accent, density, week start, default alert).
   - `reminder_logs` and `digest_log`: kept only if digests survive. `reminder_logs` becomes read-only history.
2. **Tables are created on first use today** (`ensureReminderTables`). I'd move to a proper numbered migration step, because several columns are being altered, and keep it running automatically in production, since I can't reach the production DB from here.
3. **Sync model.** The design says IndexedDB locally with the backend as source of truth, but doesn't say how conflicts are handled. Proposal: every row gets `updated_at`, the client writes locally first then pushes, last write wins per row, pull on app open and on visibility change.
4. **Shared recurrence module.** Extract `occ()` and `describe()` from the reference into `lib/recurrence.js` (plain ESM, no DOM), used by the client and `/api/cron/remind`. Today's `isDueOn` in `lib/reminders.js` goes away.
5. **Scheduler rewrite.** Per occurrence and per alert, using `cursor` and `fired`, and advancing the cursor server-side when the occurrence passes unticked so a repeating reminder never gets stuck.
6. **iOS Safari** must work from the Home Screen icon. I'll keep `viewport-fit=cover`, safe-area insets, the manifest and apple-touch-icon.
7. **Brand mismatch in the reference.** The prototype says "Cadence" in `<title>`, manifest and the notification-status text. All of these become "Sharpen".
8. **The prototype's in-page alert `tick()`** (timer and `new Notification`) is dropped. Real alerts come from Web Push only.
9. **Design pack is not in the repo yet.** `design/` and `CLAUDE.md` are not in `V:\sharpen`. I need `design/reference/cadence.html`, `tokens.css`, `DESIGN.md` and the screenshots on disk before I build. I've seen the text of the first four. The only screenshots I have are 390px-wide **dark** renders of Today, Reminders, Tasks, Settings and the new-reminder sheet. Light-mode renders and the weekly editor and task editor captures are missing.

## 5. Dependencies

- **GSAP** (allowed by your rules).
- **Tests:** Node's built-in `node:test` runner. No new dependency.
- Fonts: Bricolage Grotesque and Instrument Sans via the existing Google Fonts import, or `next/font` to self-host for offline. Self-hosting is better for the PWA offline cache. Confirm.
- No new build tool. Next.js stays.
- Tailwind: kept for the hidden legacy pages only if they are kept (question 1). New screens use `tokens.css` and plain CSS, as the reference does.

## 6. Proposed build order

Each step is its own commit. After each screen: render at 390px in light and dark, compare against the screenshots, fix, then continue.

1. `lib/recurrence.js` + `node:test` tests (weekly day-sets, month-end clamping, after N times, until date, completing an overdue repeating reminder)
2. Tokens, base styles, fonts, theme handling (`data-theme`, accent, density)
3. Shell and tab bar (Today, Reminders, Add, Tasks, Settings), safe areas, manifest and icon check
4. DB migration and API: reminders, tasks, lists, settings (additive, with data conversion)
5. Today with the day rail (and the one-time GSAP load-in)
6. Reminders tab (filters, sections, rows, overdue)
7. Tasks tab (quick add, filters, steps, done section)
8. Editor sheet (reminder and task, repeat, ends, alerts, priority, list, live preview, delete with Undo)
9. Settings (theme, accent, density, week start, lists, default alert, notifications, install steps, backup, log out)
10. Login page restyle
11. Service worker (offline cache) and IndexedDB local store with sync
12. Push: rewrite `/api/cron/remind` on the shared recurrence module, per-alert firing, subscription handling, test push to a closed app on iPhone

## 7. Open questions (need your answer before I start)

1. **Journal, Habits, Learning.** The design has no place for them and they're already hidden from the nav. Keep their pages and APIs untouched and unlinked (my default), restyle them later, or remove them?
2. **Morning and evening digest pushes.** The design doesn't mention them. Keep (my default, since they were added for your habit goal), or drop?
3. **Per-reminder on/off switch.** The design has none (you delete or stop repeating instead). Drop it (my default), or keep a switch in the editor?
4. **"Move to tomorrow" and "Later".** Not in the design. Drop and rely on the task's due date (my default), or add a "Tomorrow" quick action to the task editor?
5. **Tasks vs reminders time rule.** Tasks have only a due date, no time, in the design. Confirm that's fine, since your current todos have none either.
6. **Fonts.** Self-host with `next/font` so they work offline (my default), or keep the Google Fonts import?
7. **Light-mode screenshots.** Do you want me to work from the dark ones plus the reference HTML, or will you add light renders first?

## 8. Definition of done

Every screen matches the reference in both themes, all kept features work, recurrence tests pass, the app installs to an iPhone Home Screen, and a test push arrives while the app is closed.
