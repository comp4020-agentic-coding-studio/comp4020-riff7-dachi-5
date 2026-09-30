import {
  addMinutes,
  type BoardBooking,
  conflictIn,
  freeUntil,
  roundUpToQuarter,
  suggestSlot,
} from "./board";
import { minutesBetween } from "./format";
import { detailsFor, type Facility, FACILITY_LABEL, type SpaceDetails } from "./spaces";

export const DURATIONS = [30, 60, 90, 120, 180];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export type Search = {
  date: string;
  time: string;
  duration: number;
  people: number;
  building: string;
  facilities: Facility[];
  start: string;
  end: string;
  /** The requested start had already passed, so the window moved to now. */
  movedFromPast: boolean;
  /** Search came from explicit controls rather than defaults. */
  explicit: boolean;
};

/** Reads the search window from the URL. A booking selection
 *  (`roomId`/`startsAt`/`endsAt`, the app's long-standing prefill link)
 *  also defines the window, so old links land on a coherent page. */
export function parseSearch(params: URLSearchParams, now: string): Search {
  const selStart = params.get("startsAt") ?? "";
  const selEnd = params.get("endsAt") ?? "";
  const hasSelection = STAMP.test(selStart) && STAMP.test(selEnd) && selStart < selEnd;

  let date = params.get("date") ?? "";
  let time = params.get("time") ?? "";
  let duration = Number(params.get("duration"));
  if (hasSelection && !DAY.test(date)) {
    date = selStart.slice(0, 10);
    time = selStart.slice(11, 16);
    duration = minutesBetween(selStart, selEnd);
  }
  const today = now.slice(0, 10);
  if (!DAY.test(date)) date = today;
  const soonest = roundUpToQuarter(now);
  if (!TIME.test(time)) time = date === today ? soonest.slice(11, 16) : "09:00";
  if (!(duration > 0 && duration <= 12 * 60)) duration = 60;

  let start = `${date}T${time}`;
  let movedFromPast = false;
  if (start < now.slice(0, 16) && !hasSelection) {
    movedFromPast = start.slice(0, 10) < today || minutesBetween(start, now) > 14;
    start = soonest;
    date = start.slice(0, 10);
    time = start.slice(11, 16);
  }

  const people = Math.max(0, Math.min(200, Number(params.get("people")) || 0));
  const facilities = params
    .getAll("facility")
    .filter((f): f is Facility => f in FACILITY_LABEL);

  return {
    date,
    time,
    duration,
    people,
    building: params.get("building") ?? "",
    facilities,
    start,
    end: addMinutes(start, duration),
    movedFromPast,
    explicit: params.has("date") || params.has("time") || params.has("duration"),
  };
}

export type RoomResult<R> = {
  room: R;
  details: SpaceDetails;
  bookings: BoardBooking[];
  available: boolean;
  conflict?: BoardBooking;
  /** Free from the window's start until this time (undefined = rest of day). */
  freeUntil?: string;
  /** The soonest full-length slot in this room at or after the window. */
  next: { startsAt: string; endsAt: string };
  fits: boolean;
  missing: string[];
};

export function rankRooms<R extends { id: number; name: string }>(
  rooms: R[],
  all: BoardBooking[],
  search: Search,
): RoomResult<R>[] {
  return rooms
    .map((room) => {
      const details = detailsFor(room);
      const bookings = all.filter((b) => b.roomId === room.id);
      const conflict = conflictIn(bookings, search.start, search.end);
      const missing: string[] = [];
      if (search.people && details.capacity < search.people) {
        missing.push(`seats ${details.capacity}`);
      }
      if (search.building && details.building !== search.building) {
        missing.push(`in ${details.building}`);
      }
      for (const f of search.facilities) {
        if (!details.facilities.includes(f)) missing.push(`no ${FACILITY_LABEL[f].toLowerCase()}`);
      }
      return {
        room,
        details,
        bookings,
        available: !conflict,
        conflict,
        freeUntil: conflict ? undefined : freeUntil(bookings, search.start),
        next: suggestSlot(bookings, search.start, search.duration, search.duration),
        fits: missing.length === 0,
        missing,
      };
    })
    .sort(
      (a, b) =>
        Number(b.fits) - Number(a.fits) ||
        Number(b.available) - Number(a.available) ||
        a.next.startsAt.localeCompare(b.next.startsAt) ||
        a.details.capacity - b.details.capacity,
    );
}

/** Keeps the search params and swaps in new ones — for links that tweak one control. */
export function searchHref(search: Search, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const base: Record<string, string | undefined> = {
    date: search.date,
    time: search.time,
    duration: String(search.duration),
    people: search.people ? String(search.people) : undefined,
    building: search.building || undefined,
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) if (v) params.set(k, v);
  if (!("facility" in overrides)) for (const f of search.facilities) params.append("facility", f);
  return `/?${params}`;
}

/** Selects a room for a slot, keeping the rest of the search (people,
 *  filters) and moving the search window onto the slot itself. */
export function bookHref(
  search: Search | undefined,
  roomId: number,
  slot: { startsAt: string; endsAt: string },
): string {
  const params = new URLSearchParams(
    search
      ? searchHref(search, {
          date: slot.startsAt.slice(0, 10),
          time: slot.startsAt.slice(11, 16),
          duration: String(minutesBetween(slot.startsAt, slot.endsAt)),
        }).slice(2)
      : "",
  );
  params.set("roomId", String(roomId));
  params.set("startsAt", slot.startsAt);
  params.set("endsAt", slot.endsAt);
  return `/?${params}#book`;
}
