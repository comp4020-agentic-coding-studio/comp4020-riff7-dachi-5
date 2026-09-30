// Progressive enhancement for the find-a-space page. Everything works without
// it (plain GET search, plain POST booking); this makes it feel live:
//  - search controls apply as soon as they change
//  - a booking or cancellation anywhere re-renders the results in place, by
//    re-fetching this same URL — the server stays the one source of truth
//  - a toast says what changed

type Booking = { roomName: string; pod: string; startsAt: string; endsAt: string };

const results = document.querySelector<HTMLElement>("#results");
const toasts = document.querySelector<HTMLElement>("#toasts");

const time = (ts: string) => {
  const h = Number(ts.slice(11, 13));
  return `${h % 12 === 0 ? 12 : h % 12}:${ts.slice(14, 16)} ${h < 12 ? "am" : "pm"}`;
};

function toast(text: string) {
  if (!toasts) return;
  const el = document.createElement("p");
  el.className = "toast";
  el.textContent = text;
  toasts.append(el);
  setTimeout(() => el.classList.add("toast-out"), 5000);
  setTimeout(() => el.remove(), 5600);
}

let refreshing: Promise<void> | undefined;
async function refresh() {
  if (refreshing || !results) return;
  refreshing = (async () => {
    results.setAttribute("aria-busy", "true");
    try {
      const res = await fetch(location.pathname + location.search, { headers: { accept: "text/html" } });
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      for (const id of ["results", "hero-stat", "schedule", "sheet-status"]) {
        const fresh = doc.getElementById(id);
        const current = document.getElementById(id);
        if (fresh && current) current.replaceWith(fresh);
      }
    } finally {
      document.querySelector("#results")?.setAttribute("aria-busy", "false");
      refreshing = undefined;
    }
  })();
  await refreshing;
}

const source = new EventSource("/api/events");
source.addEventListener("message", (event) => {
  const b: Booking = JSON.parse(event.data);
  toast(`Just booked: ${b.roomName.split(" — ").pop()}, ${time(b.startsAt)} – ${time(b.endsAt)} (${b.pod})`);
  refresh();
});
source.addEventListener("cancel", (event) => {
  const b: Booking = JSON.parse((event as MessageEvent).data);
  toast(`Freed up: ${b.roomName.split(" — ").pop()}, ${time(b.startsAt)} – ${time(b.endsAt)}`);
  refresh();
});

// keep "now" (the timeline marker, "free until") honest on an idle tab
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, 60_000);

// search controls apply on change — but the date input fires on every
// keystroke, so it waits for blur/enter via the native "change" event only
const finder = document.querySelector<HTMLFormElement>("form[data-autosubmit]");
finder?.addEventListener("change", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("details.more") && target.matches("input[type=checkbox]")) return;
  finder.requestSubmit();
});

// Esc closes the booking sheet, like any other panel
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const close = document.querySelector<HTMLAnchorElement>(".sheet-close");
  if (close && !(event.target as HTMLElement).matches("input, select, textarea")) close.click();
});

// Opening the sheet from a card: bring it into view and focus the first field
// (on a phone, focusing the input would throw the keyboard over the summary,
// so the sheet heading takes focus instead)
if (location.hash === "#book") {
  const wide = matchMedia("(min-width: 64rem)").matches;
  const target = document.querySelector<HTMLElement>(wide ? "#book #pod" : "#book-heading");
  if (target && !wide) target.tabIndex = -1;
  target?.focus({ preventScroll: true });
}
