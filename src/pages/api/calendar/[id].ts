import type { APIRoute } from "astro";
import { getBooking } from "../../../lib/db";

// RFC 5545 TEXT escaping: backslash first, then the separators.
const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Stored times are Canberra wall-clock, which is the Australia/Sydney zone.
const ical = (ts: string) => `${ts.replace(/[-:]/g, "")}00`;

export const GET: APIRoute = ({ params, url }) => {
  const booking = getBooking(Number(params.id));
  if (!booking) return new Response("No such booking", { status: 404 });

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Crit Rooms//riff//EN",
    "BEGIN:VEVENT",
    `UID:booking-${booking.id}@${url.hostname}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Australia/Sydney:${ical(booking.startsAt)}`,
    `DTEND;TZID=Australia/Sydney:${ical(booking.endsAt)}`,
    `SUMMARY:${esc(`Crit: ${booking.pod}`)}`,
    `LOCATION:${esc(booking.roomName)}`,
    `DESCRIPTION:${esc(booking.tutor ? `Tutor: ${booking.tutor}` : "Booked on Crit Rooms")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="crit-${booking.id}.ics"`,
    },
  });
};
