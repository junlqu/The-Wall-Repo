// Attendance data shared by the admin attendance pages. Drop-ins are
// tallied by hand on a sheet each day - a row per hour
// the wall is open, a column per kind of climber - then entered here at the
// end of the week. The wall's week runs Saturday to Friday, so a week is
// named by its Friday.

import { apiUrl } from "@/lib/api";
import { parseDate } from "@/lib/climbs";
import {
  type AttendanceColumnKey,
  type AttendanceFormat,
  formatForDate,
  formatForMonth,
} from "@/lib/attendanceFormats";
import { parseTimeString, WEEKLY_HOURS } from "@/lib/schedule";

// Tallies for one hour. Columns nobody was counted in are left out.
export type AttendanceCounts = Partial<Record<AttendanceColumnKey, number>>;

export type AttendanceDay = {
  // YYYY-MM-DD.
  date: string;
  // Keyed by the hour the slot starts, 24-hour: "16" is 4-5 PM. Every hour
  // the wall was open is present, even when nobody came.
  hours: Record<string, AttendanceCounts>;
  turnedAway: number;
};

export type AttendanceWeek = {
  // The Friday the week ends on, YYYY-MM-DD.
  weekEnding: string;
  // Only the days the wall was open, in date order.
  days: AttendanceDay[];
  updatedAt?: string;
  updatedBy?: string;
};

// One table on a monthly sheet: every Saturday of the month added up, say. Its
// label is the sheet's - "Saturdays", "Sundays (excl. 1)".
export type AttendanceBlock = {
  label: string;
  hours: Record<string, AttendanceCounts>;
  turnedAway: number;
  // The "*" or "**" the sheet puts before an hour, pointing at a note.
  hourMarks?: Record<string, string>;
};

export type AttendanceMonth = {
  // The month's first and last days, YYYY-MM-DD.
  startDay: string;
  endDay: string;
  // In the order the week runs, Saturday first.
  blocks: AttendanceBlock[];
  notes: string[];
  updatedAt?: string;
  updatedBy?: string;
};

// What the totals and charts can show.
export type Metric = "numbers" | "earnings";

// The columns that count people who didn't climb, in every format.
const NOT_CLIMBERS: AttendanceColumnKey[] = ["waiting", "noShows"];

export function countClimbers(counts: AttendanceCounts) {
  return Object.entries(counts).reduce(
    (total, [key, count]) => (NOT_CLIMBERS.includes(key as AttendanceColumnKey) ? total : total + (count ?? 0)),
    0,
  );
}

// At the prices of the format the tallies were counted in.
export function countCents(counts: AttendanceCounts, format: AttendanceFormat) {
  return format.columns.reduce((total, column) => total + (counts[column.key] ?? 0) * (column.cents ?? 0), 0);
}

// The climbers who came for a lesson. They're counted among the climbers too.
const LESSON_KEYS: AttendanceColumnKey[] = ["utscLearnToClimb", "lessons", "lessons13to20", "lessonsOver20"];

export function countLessons(days: Pick<AttendanceDay, "hours">[]) {
  return days.reduce(
    (total, day) =>
      total +
      Object.values(day.hours).reduce(
        (dayTotal, counts) => dayTotal + LESSON_KEYS.reduce((sum, key) => sum + (counts[key] ?? 0), 0),
        0,
      ),
    0,
  );
}

export function measure(counts: AttendanceCounts, metric: Metric, format: AttendanceFormat) {
  return metric === "numbers" ? countClimbers(counts) : countCents(counts, format);
}

export function measureDay(day: AttendanceDay, metric: Metric) {
  const format = formatForDate(day.date);
  return Object.values(day.hours).reduce((total, counts) => total + measure(counts, metric, format), 0);
}

export function measureDays(days: AttendanceDay[], metric: Metric) {
  return days.reduce((total, day) => total + measureDay(day, metric), 0);
}

export function measureBlock(block: AttendanceBlock, metric: Metric, format: AttendanceFormat) {
  return Object.values(block.hours).reduce((total, counts) => total + measure(counts, metric, format), 0);
}

export function measureMonth(month: AttendanceMonth, metric: Metric) {
  const format = formatForMonth(month.startDay);
  return month.blocks.reduce((total, block) => total + measureBlock(block, metric, format), 0);
}

// "$5", "$20.40", "$1,234". Fractions of a cent (from averages) are rounded.
export function formatMoney(cents: number) {
  const rounded = Math.round(cents);
  return `$${(rounded / 100).toLocaleString(undefined, {
    minimumFractionDigits: rounded % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPrice(cents: number | null) {
  if (cents === null) return "—";
  return cents === 0 ? "Free" : formatMoney(cents);
}

export function formatMetric(value: number, metric: Metric) {
  return metric === "numbers" ? value.toLocaleString() : formatMoney(value);
}

function hourParts(hour: number) {
  return { number: hour % 12 === 0 ? 12 : hour % 12, period: hour < 12 ? "AM" : "PM" };
}

// "4–5 PM", "11 AM–12 PM" - or, from a first to a last hour slot, "2–9 PM".
export function formatHourRange(hour: number, lastHour = hour) {
  const start = hourParts(hour);
  const end = hourParts((lastHour + 1) % 24);
  return start.period === end.period
    ? `${start.number}–${end.number} ${end.period}`
    : `${start.number} ${start.period}–${end.number} ${end.period}`;
}

// Hours in a day's record, earliest first.
export function hoursOf(day: Pick<AttendanceDay, "hours">) {
  return Object.keys(day.hours)
    .map(Number)
    .sort((a, b) => a - b);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD in local time, matching parseDate.
export function dateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

export function addDays(date: string, days: number) {
  const next = parseDate(date);
  next.setDate(next.getDate() + days);
  return dateKey(next);
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / ONE_DAY_MS);
}

const FRIDAY = 5;

// The Friday ending the week `date` falls in - itself when it's a Friday.
export function weekEndingFor(date: string) {
  return addDays(date, (FRIDAY - parseDate(date).getDay() + 7) % 7);
}

// The week before the one `today` is in. Weeks are only entered once they've
// ended, so this is the latest week the dashboard can expect to have.
export function priorWeekEnding(today: string) {
  return addDays(weekEndingFor(today), -7);
}

// "Oct 17 – Oct 23, 2026", or "Dec 26, 2026 – Jan 1, 2027" across a new year.
export function formatWeekRange(weekEnding: string) {
  const start = parseDate(addDays(weekEnding, -6));
  const end = parseDate(weekEnding);
  const monthDay = { month: "short", day: "numeric" } as const;
  const full = { ...monthDay, year: "numeric" } as const;
  const from = start.toLocaleDateString(undefined, start.getFullYear() === end.getFullYear() ? monthDay : full);
  return `${from} – ${end.toLocaleDateString(undefined, full)}`;
}

export type WeekDay = {
  // Days after the week's Saturday, 0-6.
  offset: number;
  short: string;
  name: string;
  weekend: boolean;
  // Hour slots the wall is open for, by the hour each starts.
  hours: number[];
};

// The schedule's hours as one-hour slots - 12:00-4:00 PM is 12, 13, 14, 15.
function slotsFor(weekday: number) {
  const hours = WEEKLY_HOURS[weekday];
  if (!hours) return [];
  const open = parseTimeString(hours.open);
  const close = parseTimeString(hours.close);
  const last = close.minutes > 0 ? close.hours : close.hours - 1;
  return Array.from({ length: Math.max(0, last - open.hours + 1) }, (_, index) => open.hours + index);
}

// WEEKLY_HOURS is Monday-first; the wall's week starts on Saturday.
const SATURDAY_FIRST = [5, 6, 0, 1, 2, 3, 4];
const NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The days the wall opens, in the order the week runs: Sat, Sun, Mon, Wed, Fri.
export const OPEN_DAYS: WeekDay[] = SATURDAY_FIRST.flatMap((weekday, offset) => {
  const hours = slotsFor(weekday);
  if (hours.length === 0) return [];
  return [{ offset, short: NAMES[weekday].slice(0, 3), name: NAMES[weekday], weekend: weekday >= 5, hours }];
});

// Older weeks have days the wall doesn't open any more, like the Tuesdays of a
// holiday, which have no schedule.
function weekDayAt(offset: number): WeekDay {
  const open = OPEN_DAYS.find((day) => day.offset === offset);
  if (open) return open;
  const weekday = SATURDAY_FIRST[offset];
  return { offset, short: NAMES[weekday].slice(0, 3), name: NAMES[weekday], weekend: weekday >= 5, hours: [] };
}

// Which of the week's days a date is.
export function weekDayOf(date: string): WeekDay {
  return weekDayAt(daysBetween(addDays(weekEndingFor(date), -6), date));
}

// The dates of the open days in the week ending on `weekEnding`.
export function openDatesOf(weekEnding: string) {
  return OPEN_DAYS.map((day) => ({ day, date: addDays(weekEnding, day.offset - 6) }));
}

// The months as a monthly sheet's title writes them.
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "September 2026".
export function formatMonth(startDay: string) {
  return `${MONTH_NAMES[Number(startDay.slice(5, 7)) - 1]} ${startDay.slice(0, 4)}`;
}

// The first and last days of the month `date` falls in.
export function monthRange(date: string) {
  const [year, month] = date.split("-").map(Number);
  return { startDay: `${date.slice(0, 7)}-01`, endDay: dateKey(new Date(year, month, 0)) };
}

// The first days of the `count` months before the one `today` is in, newest first.
export function monthsBefore(today: string, count: number) {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => dateKey(new Date(year, month - 2 - index, 1)));
}

// The Fridays of weeks that have reached a month but have no weekly sheet on
// record, oldest first. They could be weeks not entered yet, or weeks the wall
// was closed.
export function unrecordedWeeks(weeks: AttendanceWeek[], startDay: string, endDay: string, today = dateKey(new Date())) {
  const missing: string[] = [];
  for (let friday = weekEndingFor(startDay); addDays(friday, -6) <= endDay; friday = addDays(friday, 7)) {
    const started = addDays(friday, -6) <= today && startDay <= today;
    if (started && !weeks.some((week) => week.weekEnding === friday)) missing.push(friday);
  }
  return missing;
}

const BLOCK_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

function blockRank(label: string) {
  const index = BLOCK_ORDER.indexOf(label.slice(0, 3).toLowerCase());
  return index === -1 ? BLOCK_ORDER.length : index;
}

// Which of the week's days a table on a monthly sheet adds up, going by its
// label - "Saturdays", "Sat., Dec. 24 & 31". Null if the label doesn't say.
export function blockWeekDay(label: string): WeekDay | null {
  const offset = blockRank(label);
  return offset < BLOCK_ORDER.length ? weekDayAt(offset) : null;
}

function compact(date: string) {
  return date.replaceAll("-", "");
}

// How weeks and months are stored, told apart by `type`, with ids like
// W-20261024-20261030. Mirrors AttendanceRecord in api/src/models/Attendance.ts.
export type AttendanceRecord = {
  type: "weekly" | "monthly";
  startDay: string;
  endDay: string;
  attendance: Record<string, Omit<AttendanceDay, "date">>;
  notes?: string[];
  updatedAt?: string;
  updatedBy?: string;
};

export function weekId(weekEnding: string) {
  return `W-${compact(addDays(weekEnding, -6))}-${compact(weekEnding)}`;
}

export function monthId(month: Pick<AttendanceMonth, "startDay" | "endDay">) {
  return `M-${compact(month.startDay)}-${compact(month.endDay)}`;
}

export function weekFromRecord({ endDay, attendance, updatedAt, updatedBy }: AttendanceRecord): AttendanceWeek {
  const days = Object.entries(attendance)
    .map(([date, day]) => ({ date, ...day }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { weekEnding: endDay, days, updatedAt, updatedBy };
}

export function recordFromWeek({ weekEnding, days }: AttendanceWeek): AttendanceRecord {
  return {
    type: "weekly",
    startDay: addDays(weekEnding, -6),
    endDay: weekEnding,
    attendance: Object.fromEntries(days.map(({ date, hours, turnedAway }) => [date, { hours, turnedAway }])),
  };
}

export function monthFromRecord({ startDay, endDay, attendance, notes, updatedAt, updatedBy }: AttendanceRecord): AttendanceMonth {
  const blocks = Object.entries(attendance)
    .map(([label, block]) => ({ label, ...block }))
    .sort((a, b) => blockRank(a.label) - blockRank(b.label));
  return { startDay, endDay, blocks, notes: notes ?? [], updatedAt, updatedBy };
}

export function recordFromMonth({ startDay, endDay, blocks, notes }: AttendanceMonth): AttendanceRecord {
  return {
    type: "monthly",
    startDay,
    endDay,
    attendance: Object.fromEntries(blocks.map(({ label, ...block }) => [label, block])),
    notes,
  };
}

// Admin-only requests. Errors carry the API's message, which is written for
// the admin to read.
async function attendanceRequest(path = "", init: RequestInit = {}) {
  const res = await fetch(apiUrl(`/attendance${path}`), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  }).catch(() => {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}

export type YearCount = { year: string; count: number };

// Which years have weeks or months on record and how many, newest first. A week
// crossing New Year is filed under the year it ends in.
export async function fetchAttendanceYears(type: AttendanceRecord["type"]): Promise<YearCount[]> {
  const years = (await attendanceRequest(`/years?type=${type}`)) as YearCount[];
  return years.sort((a, b) => b.year.localeCompare(a.year));
}

// Which months from a date on have a monthly sheet, by their first days, without
// loading any of them.
export async function fetchMonthlySheetStarts(from: string): Promise<string[]> {
  return (await attendanceRequest(`/starts?type=monthly&from=${from}`)) as string[];
}

// The weeks overlapping a year, newest first. That can include the week filed
// under the next year, which holds the last days of this one.
export async function fetchAttendanceWeeksOverlapping(year: string): Promise<AttendanceWeek[]> {
  const records = (await attendanceRequest(`?type=weekly&year=${year}`)) as AttendanceRecord[];
  return records.map(weekFromRecord).sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
}

// A year's months, newest first.
export async function fetchAttendanceMonthsOf(year: string): Promise<AttendanceMonth[]> {
  const records = (await attendanceRequest(`?type=monthly&year=${year}`)) as AttendanceRecord[];
  return records.map(monthFromRecord).sort((a, b) => b.startDay.localeCompare(a.startDay));
}

// Every recorded week, newest first.
export async function fetchAttendance(): Promise<AttendanceWeek[]> {
  const records = (await attendanceRequest("?type=weekly")) as AttendanceRecord[];
  return records.map(weekFromRecord).sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
}

// Every recorded month, newest first.
export async function fetchAttendanceMonths(): Promise<AttendanceMonth[]> {
  const records = (await attendanceRequest("?type=monthly")) as AttendanceRecord[];
  return records.map(monthFromRecord).sort((a, b) => b.startDay.localeCompare(a.startDay));
}

export type SaveResult = { saved: number; failed: number };

// Replaces whatever was recorded for each of these weeks.
export async function saveAttendance(weeks: AttendanceWeek[]): Promise<SaveResult> {
  const body = { records: weeks.map(recordFromWeek) };
  return (await attendanceRequest("", { method: "PUT", body: JSON.stringify(body) })) as SaveResult;
}

// Replaces whatever was recorded for this month.
export async function saveAttendanceMonth(month: AttendanceMonth): Promise<SaveResult> {
  const body = { records: [recordFromMonth(month)] };
  return (await attendanceRequest("", { method: "PUT", body: JSON.stringify(body) })) as SaveResult;
}

// Mirrors the limits in api/src/attendanceFields.ts.
const MAX_NOTES = 20;
const MAX_NOTE_LENGTH = 2000;

// Notes as they're typed, one per line, without the empty lines.
export function notesFromText(text: string) {
  return text
    .split(/\r?\n/)
    .map((note) => note.trim())
    .filter(Boolean);
}

// Why the API would turn these notes down, if it would.
export function notesProblem(notes: string[]) {
  if (notes.length > MAX_NOTES) return `A sheet can have at most ${MAX_NOTES} notes.`;
  if (notes.some((note) => note.length > MAX_NOTE_LENGTH)) return `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString()} characters.`;
  return null;
}

// Removes a week's or month's record for good, by its id.
export async function deleteAttendance(id: string): Promise<void> {
  await attendanceRequest(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
