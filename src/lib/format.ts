// Human formatting for the app's timezone-less `YYYY-MM-DDTHH:mm` strings.
// Pure string/calendar maths so it runs identically on server and client.
import { addMinutes } from "./board";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtTime(ts: string): string {
  const h = Number(ts.slice(11, 13));
  const m = ts.slice(14, 16);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export function fmtDate(day: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[mo - 1]}`;
}

export function fmtDay(ts: string, now: string): string {
  const day = ts.slice(0, 10);
  if (day === now.slice(0, 10)) return "Today";
  if (day === addMinutes(`${now.slice(0, 10)}T00:00`, 24 * 60).slice(0, 10)) return "Tomorrow";
  return fmtDate(day);
}

export function fmtRange(startsAt: string, endsAt: string, now: string): string {
  const sameDay = startsAt.slice(0, 10) === endsAt.slice(0, 10);
  return sameDay
    ? `${fmtDay(startsAt, now)}, ${fmtTime(startsAt)} – ${fmtTime(endsAt)}`
    : `${fmtDay(startsAt, now)} ${fmtTime(startsAt)} – ${fmtDay(endsAt, now)} ${fmtTime(endsAt)}`;
}

export function minutesBetween(a: string, b: string): number {
  const toMin = (ts: string) => {
    const [y, mo, d, h, mi] = ts.split(/[-T:]/).map(Number);
    return Date.UTC(y, mo - 1, d, h, mi) / 60000;
  };
  return toMin(b) - toMin(a);
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
