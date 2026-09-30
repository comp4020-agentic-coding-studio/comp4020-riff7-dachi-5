import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, eq, gt, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { type Booking, bookings, type Room, rooms } from "./schema";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// SQLite ignores a schema's FOREIGN KEY unless a connection turns enforcement
// on for itself — without this, bookings.room_id's reference to rooms is
// declarative only. createBooking already checks room existence before
// insert, so this is a safety net for any future write path, not a live bug.
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// The rooms are a fixed, seeded list, not something the app lets anyone add —
// the annoying part of the real system is who's booked into one, not which
// rooms exist. Seed once, on a fresh database (a first boot, or a spec run's
// throwaway one); a populated table means a previous boot already did this.
const SEED_ROOMS = [
  "Hanna Neumann — Seminar Room",
  "CSIT — N101",
  "Marie Reay Teaching Centre — Room 3",
  "Birch Building — Crit Studio",
];

if (db.select().from(rooms).limit(1).all().length === 0) {
  db.insert(rooms)
    .values(SEED_ROOMS.map((name) => ({ name })))
    .run();
}

export type { Booking, Room };

export function listRooms(): Room[] {
  return db.select().from(rooms).all();
}

export type BookingWithRoom = Booking & { roomName: string };

export function listBookings(): BookingWithRoom[] {
  return db
    .select({
      id: bookings.id,
      roomId: bookings.roomId,
      pod: bookings.pod,
      tutor: bookings.tutor,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      createdAt: bookings.createdAt,
      roomName: rooms.name,
    })
    .from(bookings)
    .innerJoin(rooms, eq(bookings.roomId, rooms.id))
    .orderBy(bookings.startsAt)
    .all();
}

// Every timestamp in this app is a `datetime-local` string (`YYYY-MM-DDTHH:mm`,
// no timezone) — every booking is for a room on this campus, so there's
// exactly one timezone in play, and lexicographic string comparison is
// enough to order and overlap-check them with no date parsing anywhere in
// the query layer. `nowLocal` produces "now" in that same shape, in the
// campus's own timezone regardless of what timezone the server process
// itself runs in (Fly's machines run in UTC).
export { nowLocal } from "./board";

export function getBooking(id: number): BookingWithRoom | undefined {
  return listBookings().find((b) => b.id === id);
}

/** The existing booking a new one for the same room would collide with, if
 *  any — two half-open windows [startsAt, endsAt) overlap exactly when each
 *  starts before the other ends. */
export function findConflict(
  roomId: number,
  startsAt: string,
  endsAt: string,
): Booking | undefined {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.roomId, roomId),
        lt(bookings.startsAt, endsAt),
        gt(bookings.endsAt, startsAt),
      ),
    )
    .get();
}

export type NewBooking = {
  roomId: number;
  pod: string;
  tutor: string;
  startsAt: string;
  endsAt: string;
};

export type CreateBookingResult =
  | { ok: true; booking: BookingWithRoom }
  | {
      ok: false;
      reason: "unknown-room" | "bad-format" | "too-long" | "bad-range" | "conflict";
    };

// The one shape every timestamp in this app is allowed to take (see the
// schema's own comment on why lexicographic string comparison is enough).
// The form's `datetime-local` input can only ever produce this, but the API
// route it posts to takes anyone's HTTP request — reject anything else here
// before it can reach the ordering/overlap comparisons below, which trust
// the shape and would otherwise happily store (and forever keep, since
// there's no edit or delete) a booking nothing can sensibly display.
const TIME_SHAPE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

// The regex above only checks digit shape — "day 30" matches every month,
// but the picker itself can never produce a date that doesn't exist (Feb
// 30, Apr 31). Check the day actually fits the month, without reaching for
// `Date` parsing (which would drag a timezone into a file that's
// deliberately timezone-less, see above).
function isValidTimestamp(value: string): boolean {
  const match = TIME_SHAPE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

// Matches the form's own `maxlength="80"` on `pod`/`tutor` (see
// src/pages/index.astro). That attribute is a browser-side courtesy, not a
// guarantee — the same "recheck everything server-side" reasoning as
// TIME_SHAPE above applies here too, or a request that isn't the form could
// store an unbounded string forever, since there's no edit or delete.
const MAX_TEXT_LENGTH = 80;

export function createBooking(input: NewBooking): CreateBookingResult {
  const room = db.select().from(rooms).where(eq(rooms.id, input.roomId)).get();
  if (!room) return { ok: false, reason: "unknown-room" };
  if (!isValidTimestamp(input.startsAt) || !isValidTimestamp(input.endsAt)) {
    return { ok: false, reason: "bad-format" };
  }
  if (input.pod.length > MAX_TEXT_LENGTH || input.tutor.length > MAX_TEXT_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  if (!(input.startsAt < input.endsAt)) return { ok: false, reason: "bad-range" };
  if (findConflict(input.roomId, input.startsAt, input.endsAt)) {
    return { ok: false, reason: "conflict" };
  }

  const booking = db
    .insert(bookings)
    .values({
      roomId: input.roomId,
      pod: input.pod,
      tutor: input.tutor || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    })
    .returning()
    .get();

  return { ok: true, booking: { ...booking, roomName: room.name } };
}
