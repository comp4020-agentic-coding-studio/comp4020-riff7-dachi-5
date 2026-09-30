// Pure, dependency-free room-board logic, shared by the server render and the
// browser script so a live SSE update recomputes status exactly as a reload would.
// Timestamps are the app's timezone-less `YYYY-MM-DDTHH:mm` strings (see db.ts).

export type BoardBooking = {
  roomId: number;
  pod: string;
  startsAt: string;
  endsAt: string;
};

export function nowLocal(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Canberra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  // Some engines render midnight as "24" with hour12:false.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

// Date.UTC is used purely as a calendar calculator — no timezone enters.
export function addMinutes(ts: string, minutes: number): string {
  const [y, mo, d, h, mi] = ts.split(/[-T:]/).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

export function roundUpToQuarter(ts: string): string {
  const minute = Number(ts.slice(14, 16));
  const rem = minute % 15;
  return rem === 0 ? ts : addMinutes(ts, 15 - rem);
}

export type RoomStatus =
  | { state: "free"; next?: BoardBooking }
  | { state: "busy"; current: BoardBooking; next?: BoardBooking };

export function roomStatus(roomBookings: BoardBooking[], now: string): RoomStatus {
  const sorted = [...roomBookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current = sorted.find((b) => b.startsAt <= now && now < b.endsAt);
  const next = sorted.find((b) => b.startsAt > now);
  return current ? { state: "busy", current, next } : { state: "free", next };
}

const hhmm = (ts: string) => ts.slice(11, 16);
const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);
const when = (ts: string, now: string) => (sameDay(ts, now) ? hhmm(ts) : ts.replace("T", " "));

export function statusText(status: RoomStatus, now: string): string {
  if (status.state === "busy") {
    return `In use by ${status.current.pod} until ${when(status.current.endsAt, now)}`;
  }
  return status.next
    ? `Free now · next booking ${when(status.next.startsAt, now)}`
    : "Free now · nothing else booked";
}

/** The next free slot of `minutes`, shortened if another booking cuts in,
 *  but never below `minGap` — a shorter gap is skipped entirely. */
export function suggestSlot(
  roomBookings: BoardBooking[],
  now: string,
  minutes = 60,
  minGap = 15,
): { startsAt: string; endsAt: string } {
  const sorted = [...roomBookings]
    .filter((b) => b.endsAt > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let start = roundUpToQuarter(now);
  for (const b of sorted) {
    if (b.startsAt <= start && start < b.endsAt) start = b.endsAt;
  }
  let end = addMinutes(start, minutes);
  const blocker = sorted.find((b) => b.startsAt >= start && b.startsAt < end);
  if (blocker) {
    if (addMinutes(start, minGap) > blocker.startsAt) {
      return suggestSlot(roomBookings, blocker.endsAt, minutes, minGap);
    }
    end = blocker.startsAt;
  }
  return { startsAt: start, endsAt: end };
}

/** The room that can host a full `minutes`-long session soonest. */
export function earliestRoom<R extends { id: number }>(
  rooms: R[],
  allBookings: BoardBooking[],
  now: string,
  minutes: number,
): { room: R; startsAt: string; endsAt: string } | undefined {
  return rooms
    .map((room) => ({
      room,
      ...suggestSlot(
        allBookings.filter((b) => b.roomId === room.id),
        now,
        minutes,
        minutes,
      ),
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.room.id - b.room.id)[0];
}

export const DAY_START = 8 * 60;
export const DAY_END = 20 * 60;

/** Today's bookings as percentage positions on an 08:00–20:00 strip. */
export function timelineBlocks(
  roomBookings: BoardBooking[],
  day: string,
): { left: number; width: number; label: string }[] {
  const minutesOf = (ts: string) => {
    if (ts.slice(0, 10) < day) return DAY_START;
    if (ts.slice(0, 10) > day) return DAY_END;
    return Number(ts.slice(11, 13)) * 60 + Number(ts.slice(14, 16));
  };
  const span = DAY_END - DAY_START;
  return roomBookings
    .map((b) => {
      const s = Math.max(DAY_START, minutesOf(b.startsAt));
      const e = Math.min(DAY_END, minutesOf(b.endsAt));
      return { s, e, b };
    })
    .filter(({ s, e }) => e > s)
    .map(({ s, e, b }) => ({
      left: ((s - DAY_START) / span) * 100,
      width: ((e - s) / span) * 100,
      label: `${b.pod} ${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`,
    }));
}

export function nowPosition(now: string): number | undefined {
  const m = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16));
  if (m < DAY_START || m > DAY_END) return undefined;
  return ((m - DAY_START) / (DAY_END - DAY_START)) * 100;
}
