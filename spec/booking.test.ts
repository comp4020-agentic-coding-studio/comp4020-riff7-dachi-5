import { describe, expect, inject, it } from "vitest";

// This week's own contract: a booking survives a reload, a new one reaches
// other tabs over the SSE stream (the same two platform claims the starter's
// retired guestbook.test.ts made, now against the real domain), and — the
// actual point of this app over a shared spreadsheet — a second booking that
// overlaps an existing one in the same room is refused, not silently
// accepted. The seeded room ids (1-4, see src/lib/db.ts) are stable on a
// fresh throwaway database, so each test below picks a distinct room and time
// window to stay independent of the others.
const baseUrl = inject("baseUrl");

// Astro checks form POSTs carry a same-origin Origin header (CSRF
// protection); browsers send it automatically, a bare fetch doesn't.
const post = (path: string, body: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

// A rejection redirect's query string carries more than error/roomId (see
// the resubmitted-fields test below) — assert on the params that matter to
// each test, not the whole string, so adding another resubmitted field
// doesn't break every other rejection test.
const redirectParams = (res: Response) =>
  new URL(res.headers.get("location") ?? "", baseUrl).searchParams;

const booking = (overrides: Record<string, string>) =>
  new URLSearchParams({
    roomId: "1",
    tutor: "Test Tutor",
    startsAt: "2031-01-01T10:00",
    endsAt: "2031-01-01T11:00",
    ...overrides,
  });

describe("bookings", () => {
  it("accepts a booking and redirects back to the page", async () => {
    const res = await post(
      "/api/bookings",
      booking({
        pod: `probe ${process.hrtime.bigint()}`,
        roomId: "1",
        startsAt: "2031-02-01T09:00",
        endsAt: "2031-02-01T10:00",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/booking\/\d+\/\?new=1$/);
  });

  it("persists the booking: a fresh page load includes it", async () => {
    const pod = `persisted ${process.hrtime.bigint()}`;
    await post(
      "/api/bookings",
      booking({ pod, roomId: "1", startsAt: "2031-02-02T09:00", endsAt: "2031-02-02T10:00" }),
    );
    const res = await fetch(baseUrl);
    expect(await res.text()).toContain(pod);
  });

  it("broadcasts a new booking over the SSE stream", async () => {
    const pod = `live ${process.hrtime.bigint()}`;

    // subscribe first, then post, then read until the event arrives
    const stream = await fetch(new URL("/api/events", baseUrl));
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("no response body");

    await post(
      "/api/bookings",
      booking({ pod, roomId: "2", startsAt: "2031-02-03T09:00", endsAt: "2031-02-03T10:00" }),
    );

    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes(pod)) {
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended before the event arrived");
      received += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(received).toContain("data: ");
    expect(received).toContain(pod);
  }, 10_000);

  it("refuses a booking that overlaps an existing one in the same room", async () => {
    const first = `first ${process.hrtime.bigint()}`;
    const second = `second ${process.hrtime.bigint()}`;

    const firstRes = await post(
      "/api/bookings",
      booking({ pod: first, roomId: "3", startsAt: "2031-03-01T10:00", endsAt: "2031-03-01T11:00" }),
    );
    expect(firstRes.status).toBe(303);

    // starts before the first ends, ends after it starts: a genuine overlap
    const secondRes = await post(
      "/api/bookings",
      booking({ pod: second, roomId: "3", startsAt: "2031-03-01T10:30", endsAt: "2031-03-01T11:30" }),
    );
    expect(secondRes.status).toBe(303);
    expect(redirectParams(secondRes).get("error")).toBe("conflict");
    expect(redirectParams(secondRes).get("roomId")).toBe("3");

    const body = await (await fetch(baseUrl)).text();
    expect(body).toContain(first);
    expect(body).not.toContain(second);
  });

  it("allows a booking that starts exactly when another ends in the same room", async () => {
    // findConflict's windows are half-open ([start, end)) on purpose — a
    // 9-10am booking and a 10-11am booking in the same room don't overlap.
    // The comparison is `existing.start < new.end && existing.end > new.start`;
    // an off-by-one here (<=/>= instead of </>) would make legitimate
    // back-to-back bookings collide, and nothing else in this file exercises
    // the boundary.
    const first = `touch-first ${process.hrtime.bigint()}`;
    const second = `touch-second ${process.hrtime.bigint()}`;

    const firstRes = await post(
      "/api/bookings",
      booking({ pod: first, roomId: "4", startsAt: "2031-05-01T09:00", endsAt: "2031-05-01T10:00" }),
    );
    expect(firstRes.status).toBe(303);
    expect(firstRes.headers.get("location")).toMatch(/^\/booking\//);

    const secondRes = await post(
      "/api/bookings",
      booking({ pod: second, roomId: "4", startsAt: "2031-05-01T10:00", endsAt: "2031-05-01T11:00" }),
    );
    expect(secondRes.status).toBe(303);
    expect(secondRes.headers.get("location")).toMatch(/^\/booking\//);

    const body = await (await fetch(baseUrl)).text();
    expect(body).toContain(first);
    expect(body).toContain(second);
  });

  it("rejects a booking whose timestamps aren't in the datetime-local shape", async () => {
    // The form can only ever produce this shape, but the API route takes any
    // HTTP request — a client that isn't the form (or a broken one) could
    // send anything, and the ordering/overlap checks trust the shape without
    // this guard (see the TIME_SHAPE comment in src/lib/db.ts).
    const pod = `malformed ${process.hrtime.bigint()}`;
    const res = await post(
      "/api/bookings",
      booking({ pod, roomId: "4", startsAt: "banana", endsAt: "zebra" }),
    );
    expect(redirectParams(res).get("error")).toBe("bad-format");
    expect(redirectParams(res).get("roomId")).toBe("4");

    const body = await (await fetch(baseUrl)).text();
    expect(body).not.toContain(pod);
  });

  it("rejects a booking whose pod name is longer than the form allows", async () => {
    // The form's `maxlength="80"` on `pod`/`tutor` is a browser-side
    // courtesy — a client that isn't the form could send anything, and
    // with no edit or delete an oversized name would sit there forever.
    const pod = "x".repeat(81);
    const res = await post("/api/bookings", booking({ pod, roomId: "4" }));
    expect(redirectParams(res).get("error")).toBe("too-long");
    expect(redirectParams(res).get("roomId")).toBe("4");

    const body = await (await fetch(baseUrl)).text();
    expect(body).not.toContain(pod);
  });

  it("rejects a booking on a calendar date that doesn't exist", async () => {
    // TIME_SHAPE only checks digit shape, not that the day fits the month —
    // "day 30" matches the pattern for every month, but February never has
    // one. The datetime-local picker itself can't produce this value, but a
    // client that isn't the form can.
    const pod = `no-such-day ${process.hrtime.bigint()}`;
    const res = await post(
      "/api/bookings",
      booking({ pod, roomId: "4", startsAt: "2031-02-30T09:00", endsAt: "2031-02-30T10:00" }),
    );
    expect(redirectParams(res).get("error")).toBe("bad-format");
    expect(redirectParams(res).get("roomId")).toBe("4");

    const body = await (await fetch(baseUrl)).text();
    expect(body).not.toContain(pod);
  });

  it("rejects a booking for a room that doesn't exist", async () => {
    const pod = `no-such-room ${process.hrtime.bigint()}`;
    const res = await post(
      "/api/bookings",
      booking({ pod, roomId: "999", startsAt: "2031-06-01T09:00", endsAt: "2031-06-01T10:00" }),
    );
    expect(redirectParams(res).get("error")).toBe("unknown-room");
    expect(redirectParams(res).get("roomId")).toBe("999");

    const body = await (await fetch(baseUrl)).text();
    expect(body).not.toContain(pod);
  });

  it("rejects a booking that ends before it starts", async () => {
    const pod = `backwards ${process.hrtime.bigint()}`;
    const res = await post(
      "/api/bookings",
      booking({ pod, roomId: "4", startsAt: "2031-04-01T11:00", endsAt: "2031-04-01T10:00" }),
    );
    expect(redirectParams(res).get("error")).toBe("bad-range");
    expect(redirectParams(res).get("roomId")).toBe("4");

    const body = await (await fetch(baseUrl)).text();
    expect(body).not.toContain(pod);
  });

  it("refills the form with what was submitted after a rejection", async () => {
    // WCAG 2.2 SC 3.3.7 (Redundant Entry): the server already has every
    // field from a rejected submission, so the redirect carries them back
    // rather than making someone retype the whole booking over one bad
    // field (see withInput in api/bookings.ts). Room 3 (not the select's
    // first option) checks the room is actually re-selected, not just
    // defaulted; the ampersand/apostrophe check that the page escapes the
    // resubmitted values rather than injecting them raw.
    const pod = `Bravo & Co ${process.hrtime.bigint()}`;
    const res = await post(
      "/api/bookings",
      booking({
        pod,
        tutor: "O'Carol",
        roomId: "3",
        startsAt: "2031-07-01T11:00",
        endsAt: "2031-07-01T10:00", // ends before it starts: bad-range
      }),
    );
    const params = redirectParams(res);
    expect(params.get("error")).toBe("bad-range");
    expect(params.get("roomId")).toBe("3");
    expect(params.get("pod")).toBe(pod);
    expect(params.get("tutor")).toBe("O'Carol");
    expect(params.get("startsAt")).toBe("2031-07-01T11:00");
    expect(params.get("endsAt")).toBe("2031-07-01T10:00");

    const page = await (await fetch(new URL(res.headers.get("location") ?? "", baseUrl))).text();
    expect(page).toContain(`value="${pod.replace("&", "&amp;")}"`);
    expect(page).toContain('value="O\'Carol"');
    expect(page).toContain('<option value="3" selected>');
  });

  it("rejects a request body far larger than any real booking could be", async () => {
    // The form can only ever send a few short fields (well under 1KB even
    // at the 80-char pod/tutor cap), but a client that isn't the form could
    // send anything — and the deployed machine only has 256MB (fly.toml),
    // well below @astrojs/node's 1GB default body limit. astro.config.ts
    // sets bodySizeLimit to 64KB so an oversized POST is rejected instead
    // of buffered; this asserts the rejection is clean (no crash) and the
    // server keeps serving requests afterward.
    const res = await post("/api/bookings", booking({ pod: "z".repeat(100_000), roomId: "4" }));
    expect(res.status).toBe(500);

    const stillUp = await fetch(baseUrl);
    expect(stillUp.status).toBe(200);
  });
});
