import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// A fixed, seeded set of rooms this course actually uses for crits. Not
// user-editable: the annoying part of the real system isn't "which rooms
// exist," it's "who's in one right now" — see bookings below.
export const rooms = sqliteTable("rooms", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
});

// One booking is one pod, in one room, for one time window. The whole point
// of this table over a shared spreadsheet: `starts_at`/`ends_at` let the app
// itself refuse a second booking that overlaps an existing one in the same
// room (see findConflict in db.ts), instead of two pods finding out in
// person. Times are stored as `datetime-local` strings (`YYYY-MM-DDTHH:mm`,
// no timezone) — every user is on the same campus, so lexicographic string
// comparison is enough to order and to detect overlap, no date parsing
// needed anywhere in the query layer.
export const bookings = sqliteTable("bookings", {
  id: int().primaryKey({ autoIncrement: true }),
  roomId: int("room_id")
    .notNull()
    .references(() => rooms.id),
  pod: text().notNull(),
  tutor: text(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  // A random secret handed only to the browser that made the booking (in an
  // httpOnly cookie, see src/lib/mine.ts) — the only way to cancel without
  // accounts. Null for bookings made before cancelling existed.
  cancelToken: text("cancel_token"),
});

export type Room = typeof rooms.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
