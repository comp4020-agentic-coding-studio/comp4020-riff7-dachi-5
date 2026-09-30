# Crit Rooms

Crit Rooms is a booking system for the handful of rooms this course actually holds crits in. Right now that coordination happens by word of mouth: a tutor books a room by asking around, and the only way a second pod finds out it's taken is by turning up to it. This models that one annoying slice end to end — rooms, bookings, and the times they cover — so a clash is something the app refuses, not something two pods discover in person.

## What the riff added

The prototype refused clashes but never answered the question people actually walk up with: *which room is free right now?* The riff (pod 5, dachi, crit 7) takes it from a booking ledger to a live room board:

- **Right now board** — an illustrated card per room saying "Free now" or "In use by Dachi until 12:30", with a strip of today's bookings (08:00–20:00) and a marker for the current time. It re-lights live over the existing SSE stream and ticks every 30 seconds, using the same pure functions (`src/lib/board.ts`) the server rendered it with.
- **One-tap booking** — each card's "Book" link pre-fills the form with that room's next free hour, reusing the form's existing refill-from-query mechanism, so it works with no JavaScript.
- **Find me a room** — pick 30 minutes to 2 hours and get the soonest slot that fits the whole session in any room, skipping gaps that are too short.
- **Door display** — `/kiosk/?room=N` is a full-screen FREE / IN USE panel for a tablet outside the room, green or red, updating live.
- **Add to calendar** — every booking has an `.ics` download.

## What good looks like here

The core promise: a booking a pod makes is still there after a reload, and the app never lets two pods hold the same room at overlapping times. Both are enforced by `spec/booking.test.ts`, which drives the deployed app over HTTP — posts a booking, reloads, checks it's there; posts a second one that overlaps the first in the same room, checks it's refused and never reaches the schedule. `spec/invariants.test.ts` (the starter's, unchanged) is the accessibility and structure floor underneath that: a nav landmark, one heading, a real title, no axe violations.

What I chose not to build, at least for this first pass:

- **No accounts.** A pod types its own name into the form; nothing stops it typing someone else's. The real annoyance this app targets is "did anyone else book this room," not "who is allowed to book it" — solving the second means a login system this slice doesn't need yet.
- **No editing or cancelling a booking.** Real room bookings do get cancelled; the schedule here is append-only. A pod that double-books itself has to live with it until this grows a cancel button.
- **No recurring bookings.** Every booking is a one-off time window. The course's own crit slots repeat weekly, but modelling recurrence correctly (what happens when one occurrence is cancelled, or a room changes) is a bigger problem than this slice takes on.
- **The room list is fixed and seeded**, not something anyone can add to through the app. Which rooms exist isn't the annoying part of the real system; who's in one right now is.

The rooms are named after real ANU teaching spaces the course has actually used, but the list itself, and everything about who's booked into them, is invented for this prototype.
