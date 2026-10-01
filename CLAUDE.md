# Cadence: instructions for Claude Code

You are working on Cadence (formerly Sharpen), following the Cadence design in `design/`.

## Sources of truth, in order
1. `design/reference/cadence.html`: working reference. Open it, read its CSS and JS. Match it, do not reinterpret it.
2. `design/reference/screenshots/`: visual targets (390px wide, light and dark).
3. `design/tokens.css`: tokens to import, not copy by eye.
4. `design/DESIGN.md`: written spec.

## Non-negotiables
- Keep every feature the current Sharpen app has. Redesign each one in this visual language. Never drop a feature without asking.
- No generic defaults: no cream and terracotta palette, no black with neon accent, no identical rounded cards with the same soft shadow, no ALL-CAPS or letter-spaced eyebrow labels, no middle-dot meta strings, no scattered fade-up animations.
- Rows with hairlines, not cards. Reminders have round checkboxes, tasks have squarish ones. Times are right-aligned and tabular.
- Marigold means "now" or "late" only.
- Motion only in response to user actions, plus the one-time day-rail load-in. Use GSAP. Respect prefers-reduced-motion.
- Sentence case, plain active copy.

## iPhone PWA requirements
- `viewport-fit=cover`, safe-area insets on top and bottom, standalone manifest, theme colour, apple touch icon.
- Test at 390px wide. Nothing scrolls sideways.
- Service worker with offline cache. Local data in IndexedDB.
- Push notifications: Web Push with VAPID, subscription saved to the backend, a per-minute scheduler on the backend. Works only from the Home Screen icon on iOS 16.4+.
- Share one recurrence module (from `occ()` and `describe()` in the reference) between the app and the scheduler. Add unit tests for: weekly day-sets, month-end clamping, "after N times", "until date", completing an overdue repeating reminder.

## How to work
1. Audit this codebase. Write `MIGRATION_PLAN.md`: current stack, every existing feature, how each maps to the new design, anything missing from the design, and a proposed build order. Stop and ask me to approve it.
2. After approval, build in small steps, committing after each: tokens and base styles, tab bar and shell, Today with the day rail, Reminders, Tasks, editor sheet, Settings, then notifications and sync.
3. After each screen, render it at 390px in light and dark, compare against `design/reference/screenshots/`, and fix differences before moving on.
4. The app is named Cadence (renamed from Sharpen on 2026-10-01). Internal identifiers (cookie, database, URL, storage keys) keep the old "sharpen" name on purpose.
5. Ask before adding dependencies beyond GSAP, a build tool, and test tooling.

## Definition of done
Every screen matches the reference in both themes, all pre-existing features still work, recurrence tests pass, the app installs to an iPhone Home Screen, and a test push arrives while the app is closed.
