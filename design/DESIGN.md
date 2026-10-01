# Cadence: design specification

Reference implementation: `design/reference/cadence.html` (open it in a browser at 390px wide).
Tokens: `design/tokens.css`. When this document and the reference disagree, the reference wins.

## Concept
A transit timetable for your day. Hairline-divided rows, right-aligned tabular times, one memorable element (the day rail). Not a stack of cards.

## Palette
| Name | Light | Dark | Use |
|---|---|---|---|
| Chalk paper | #EDF0F7 | #0A0F24 | Page background |
| Surface | #FFFFFF | #141C3B | Sheets, raised controls |
| Surface 2 | #E2E7F2 | #1D2750 | Inputs, segmented track |
| Navy ink | #0F1A3D | #EBEEFF | Text, selected chips |
| Ultramarine (accent) | #3346FF | same | Default accent, user-changeable |
| Marigold | #FFC233 | same | "Now" marker, overdue (dark mode text) only |
| Mint | #1FAA82 | same | Done, Health list |

Accent choices offered in Settings: #3346FF, #E58A00, #D6249F, #0E8A6A, #2B2F3A.
Never use marigold decoratively. It always means "now" or "late".

## Typography
- Bricolage Grotesque (display): large titles, section titles, times, sheet title, editor title field.
- Instrument Sans (body): everything else.
- Sentence case everywhere. No ALL-CAPS labels, no letter-spaced eyebrows above headings.
- Times use tabular numerals.

## Layout
- Mobile-first, `max-width: 480px`, centered on larger screens.
- Large title at top of each tab (46px), one-line muted subtitle below.
- Content is rows separated by 1px hairlines, edge to edge with 20px side padding. No card containers.
- Bottom tab bar: Today, Reminders, [Add], Tasks, Settings. Add is a 56px rounded-square accent button raised 22px above the bar. Bar is translucent with backdrop blur and respects the home-indicator safe area.

## Signature element: the day rail
- Horizontal 24h track, 3px. Elapsed portion filled in ink. Ticks and labels at 12a, 6a, 12p, 6p, 12a.
- Each of today's reminders is a 13px dot in its list colour; completed ones are hollow and faded.
- "Now" is a 4px marigold bar with a small marigold time label above it.
- Plays once on first load: dots pop in staggered, elapsed bar grows, now marker fades in.

## Rows
- Reminder row: round check (list colour), title, meta (list dot + name, repeat description, priority as "!" marks), right column with time (bold, tabular) and day (muted). Overdue turns the right column to the warn colour.
- Task row: squarish check, title, meta (list, "n of m steps", priority), optional "Due …" on the right.
- Completed rows: title struck through and muted.
- Tapping the check completes; tapping anywhere else opens the editor.

## Editor sheet (bottom sheet, 24px top radius, max 94dvh)
Order of fields for a reminder:
1. Segmented Reminder / Task switch (new items only)
2. Title (large, underline field) and notes
3. When: native date and time inputs (iOS wheel pickers)
4. Repeat: Never, Daily, Weekly, Monthly, Yearly
   - "Every N unit" stepper
   - Weekly: seven day circles (order follows the week-start setting)
   - Ends: Never, On a date, After a number of times
5. Alert chips (multi-select): At time, 5 min, 15 min, 1 hour, 1 day before
6. Priority: None, Low, Medium, High
7. List chips with colour dots
8. Live preview: left accent bar, repeat summary, next 4 occurrences
9. Delete (existing items only, destructive colour, with Undo toast)

Task fields: title, notes, due date (clearable), steps (add, check, remove), priority, list.

## Settings
Theme (System, Light, Dark), accent swatches, row spacing (Comfortable, Compact), week start, list names and colours, default alert, notification permission, install instructions, copy backup, reset.

## Motion
- Allowed: sheet slide and scrim, check pop, toast in and out, error shake on empty title, the one-time rail load-in. These all respond to the user or happen once.
- Not allowed: fade-up on every section, hover transitions on every row, looping decoration.
- Library: GSAP. Respect `prefers-reduced-motion` (no animation, instant state changes).

## Copy rules
- Active, plain verbs. The same action keeps the same name through the flow: "Save" then "Saved".
- Empty states say what to do: "Nothing due. Tap the plus button to add a reminder or a task."
- Errors say what is wrong and how to fix it, with no apology.

## Accessibility floor
Visible keyboard focus (2px accent outline), 44px minimum touch targets (the check has an enlarged hit area), colour is never the only signal (overdue also uses the "Was due" / day text), reduced motion respected, contrast checked in both themes.

## Recurrence rules (must match iOS Reminders behaviour)
- Types: none, daily, weekly (chosen weekdays), monthly, yearly, each with an interval N.
- Month and year rules clamp to the last day of short months (31 Jan, 28 Feb, 31 Mar).
- End: never, on a date (inclusive), or after N occurrences (counted from the first).
- Completing a repeating reminder moves it to the next occurrence after the later of "its due time" and "now", and offers Undo.
- Overdue one-off reminders stay visible in red until done.
- The engine (`occ()` and `describe()` in the reference) must be extracted into a shared module used by both the app and the server scheduler.

## Notifications (iPhone PWA)
- Works only after Add to Home Screen, iOS 16.4 or later.
- Needs a service worker, Web Push (VAPID), and a backend that stores reminders and subscriptions and runs a per-minute scheduler. The scheduler uses the same recurrence module.
- Each reminder can have several alerts (minutes before). Track fired alerts per occurrence so none repeat.
- Local copy in IndexedDB for offline use; the backend is the source of truth.
