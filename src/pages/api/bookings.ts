import type { APIRoute } from "astro";
import { createBooking } from "../../lib/db";
import { bus } from "../../lib/events";
import { addMine } from "../../lib/mine";

// The write half of the app: a plain HTML form POSTs here, the booking is
// validated (room exists, times make sense, no clash with an existing
// booking in the same room) and either lands in SQLite and is broadcast to
// every open SSE connection, or is refused — the redirect back to "/" carries
// the reason as a query param so the page can explain it. The 303 redirect
// makes the form work with no client-side JavaScript at all: the submitting
// tab re-renders from the database; every *other* tab hears about a success
// over the stream.
// WCAG 2.2 SC 3.3.7 (Redundant Entry): a rejected submission shouldn't make
// someone retype everything the server already received. The redirect carries
// what was submitted back as query params so the page can repopulate the
// form — see index.astro's reading of these same names.
function withInput(error: string, fields: Record<string, string | number>): string {
  const params = new URLSearchParams({ error, ...fields } as Record<string, string>);
  return `/?${params}`;
}

export const POST: APIRoute = async ({ request, redirect, cookies, url }) => {
  const form = await request.formData();
  const roomId = Number(form.get("roomId"));
  const pod = String(form.get("pod") ?? "").trim();
  const tutor = String(form.get("tutor") ?? "").trim();
  const startsAt = String(form.get("startsAt") ?? "").trim();
  const endsAt = String(form.get("endsAt") ?? "").trim();
  const resubmit = { roomId, pod, tutor, startsAt, endsAt };

  if (!roomId || !pod || !startsAt || !endsAt) {
    return redirect(withInput("missing", resubmit), 303);
  }

  const result = createBooking({ roomId, pod, tutor, startsAt, endsAt });
  if (!result.ok) {
    return redirect(withInput(result.reason, resubmit), 303);
  }

  bus.emit("booking", result.booking);
  addMine(
    cookies,
    { id: result.booking.id, token: result.cancelToken },
    url.protocol === "https:",
  );
  return redirect(`/booking/${result.booking.id}/?new=1`, 303);
};
