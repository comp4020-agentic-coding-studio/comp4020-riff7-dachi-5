import { describe, expect, inject, it } from "vitest";
import {
  addMinutes,
  earliestRoom,
  roomStatus,
  statusText,
  suggestSlot,
  timelineBlocks,
} from "../src/lib/board";

const b = (roomId: number, startsAt: string, endsAt: string, pod = "Dachi") => ({
  roomId,
  pod,
  startsAt,
  endsAt,
});

describe("room board", () => {
  it("adds minutes across midnight and month ends", () => {
    expect(addMinutes("2026-09-30T23:30", 60)).toBe("2026-10-01T00:30");
  });

  it("says who holds a busy room and until when", () => {
    const status = roomStatus([b(1, "2026-09-30T10:00", "2026-09-30T12:00")], "2026-09-30T11:00");
    expect(status.state).toBe("busy");
    expect(statusText(status, "2026-09-30T11:00")).toBe("In use by Dachi until 12:00");
  });

  it("treats a booking's end as the moment the room frees up", () => {
    const status = roomStatus([b(1, "2026-09-30T10:00", "2026-09-30T12:00")], "2026-09-30T12:00");
    expect(status.state).toBe("free");
  });

  it("suggests the next quarter hour when a room is free", () => {
    expect(suggestSlot([], "2026-09-30T11:07")).toEqual({
      startsAt: "2026-09-30T11:15",
      endsAt: "2026-09-30T12:15",
    });
  });

  it("suggests starting when the current booking ends, shortened by the next", () => {
    const bookings = [
      b(1, "2026-09-30T10:00", "2026-09-30T11:30"),
      b(1, "2026-09-30T12:00", "2026-09-30T13:00"),
    ];
    expect(suggestSlot(bookings, "2026-09-30T11:00")).toEqual({
      startsAt: "2026-09-30T11:30",
      endsAt: "2026-09-30T12:00",
    });
  });

  it("finds the room free soonest for a full session", () => {
    const rooms = [{ id: 1 }, { id: 2 }];
    const bookings = [
      b(1, "2026-09-30T11:00", "2026-09-30T13:00"),
      b(2, "2026-09-30T11:00", "2026-09-30T12:00"),
    ];
    const match = earliestRoom(rooms, bookings, "2026-09-30T11:00", 90);
    expect(match).toMatchObject({ room: { id: 2 }, startsAt: "2026-09-30T12:00" });
  });

  it("skips a gap too short for the session asked for", () => {
    const bookings = [
      b(1, "2026-09-30T11:00", "2026-09-30T12:00"),
      b(1, "2026-09-30T12:30", "2026-09-30T14:00"),
    ];
    const match = earliestRoom([{ id: 1 }], bookings, "2026-09-30T11:00", 60);
    expect(match?.startsAt).toBe("2026-09-30T14:00");
  });

  it("clips timeline blocks to the 08:00–20:00 strip", () => {
    const [block] = timelineBlocks([b(1, "2026-09-30T07:00", "2026-09-30T14:00")], "2026-09-30");
    expect(block.left).toBe(0);
    expect(block.width).toBe(50);
  });
});

describe("room board, rendered", () => {
  const baseUrl = inject("baseUrl");

  it("shows a card with an image for every room", async () => {
    const html = await (await fetch(new URL("/", baseUrl))).text();
    expect(html.match(/class="card (free|busy)"/g)?.length).toBe(4);
    expect(html).toContain('src="/rooms/1.svg"');
  });

  it("serves a calendar file for a booking, and 404s an unknown one", async () => {
    const form = new URLSearchParams({
      roomId: "4",
      pod: "Calendar, pod; test",
      tutor: "",
      startsAt: "2031-03-03T10:00",
      endsAt: "2031-03-03T11:00",
    });
    await fetch(new URL("/api/bookings", baseUrl), {
      method: "POST",
      body: form,
      headers: { Origin: new URL(baseUrl).origin },
      redirect: "manual",
    });
    const html = await (await fetch(new URL("/", baseUrl))).text();
    const id = [...html.matchAll(/\/api\/calendar\/(\d+)/g)].map((m) => m[1]).at(-1);
    const res = await fetch(new URL(`/api/calendar/${id}`, baseUrl));
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20310303T100000");
    expect(ics).toContain("SUMMARY:Crit: Calendar\\, pod\\; test");
    expect((await fetch(new URL("/api/calendar/999999", baseUrl))).status).toBe(404);
  });

  it("answers 'find me a room' with a bookable slot", async () => {
    const html = await (await fetch(new URL("/?need=90", baseUrl))).text();
    expect(html).toMatch(/Soonest 90-minute slot/);
    expect(html).toMatch(/href="\/\?roomId=\d&amp;startsAt=/);
  });
});
