import type { APIRoute } from "astro";
import { cancelBooking } from "../../../../lib/db";
import { bus } from "../../../../lib/events";
import { removeMine, tokenFor } from "../../../../lib/mine";

// Cancelling needs the token from this browser's own cookie — a booking made
// elsewhere (or before cancelling existed) can't be cancelled from here.
export const POST: APIRoute = ({ params, cookies, redirect, url }) => {
  const id = Number(params.id);
  const cancelled = cancelBooking(id, tokenFor(cookies, id) ?? "");
  if (!cancelled) {
    return new Response("You can only cancel bookings made in this browser.", { status: 403 });
  }
  removeMine(cookies, id, url.protocol === "https:");
  bus.emit("cancel", cancelled);
  const query = new URLSearchParams({
    cancelled: `${cancelled.roomName}|${cancelled.startsAt}|${cancelled.endsAt}`,
  });
  return redirect(`/mine/?${query}`, 303);
};
