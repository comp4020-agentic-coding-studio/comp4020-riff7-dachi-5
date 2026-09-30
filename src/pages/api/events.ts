import type { APIRoute } from "astro";
import type { BookingWithRoom } from "../../lib/db";
import { bus } from "../../lib/events";

// The minimal server-sent-events (SSE) pattern: a long-lived streaming
// response the browser consumes with `new EventSource("/api/events")`.
// SSE is one-directional (server → browser) and plain HTTP, which makes it
// the simplest live channel that works everywhere — reach for WebSockets
// only when the client needs to push over the same connection.
export const GET: APIRoute = () => {
  let onBooking: (booking: BookingWithRoom) => void;
  let onCancel: (booking: BookingWithRoom) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onBooking = (booking) => {
        controller.enqueue(`data: ${JSON.stringify(booking)}\n\n`);
      };
      // a named event, so older pages' plain `message` listeners ignore it
      onCancel = (booking) => {
        controller.enqueue(`event: cancel\ndata: ${JSON.stringify(booking)}\n\n`);
      };
      bus.on("booking", onBooking);
      bus.on("cancel", onCancel);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("booking", onBooking);
      bus.off("cancel", onCancel);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
