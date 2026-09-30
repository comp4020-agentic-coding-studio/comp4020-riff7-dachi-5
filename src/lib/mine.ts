import type { AstroCookies } from "astro";

// "My bookings" without accounts: this browser's bookings live in one
// httpOnly cookie of `id.token` pairs. The token is what authorises a cancel,
// so the cookie is the capability — nothing else identifies a person.
const COOKIE = "crit_mine";
const MAX = 40;
const ENTRY = /^(\d{1,9})\.([0-9a-f]{32})$/;

export type MineEntry = { id: number; token: string };

export function readMine(cookies: AstroCookies): MineEntry[] {
  const raw = cookies.get(COOKIE)?.value ?? "";
  return raw
    .split("|")
    .map((part) => ENTRY.exec(part))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ id: Number(m[1]), token: m[2] }));
}

function writeMine(cookies: AstroCookies, entries: MineEntry[], secure: boolean) {
  cookies.set(COOKIE, entries.map((e) => `${e.id}.${e.token}`).join("|"), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function addMine(cookies: AstroCookies, entry: MineEntry, secure: boolean) {
  const rest = readMine(cookies).filter((e) => e.id !== entry.id);
  writeMine(cookies, [entry, ...rest].slice(0, MAX), secure);
}

export function removeMine(cookies: AstroCookies, id: number, secure: boolean) {
  writeMine(
    cookies,
    readMine(cookies).filter((e) => e.id !== id),
    secure,
  );
}

export function tokenFor(cookies: AstroCookies, id: number): string | undefined {
  return readMine(cookies).find((e) => e.id === id)?.token;
}
