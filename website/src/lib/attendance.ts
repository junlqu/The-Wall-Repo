// Attendance data shared by the admin attendance pages. Drop-ins are
// tallied by hand on a sheet each day - a row per hour
// the wall is open, a column per kind of climber - then entered here at the
// end of the week. The wall's week runs Saturday to Friday, so a week is
// named by its Friday.

import { apiUrl } from "@/lib/api";
import { parseDate } from "@/lib/climbs";
import { parseTimeString, WEEKLY_HOURS } from "@/lib/schedule";

// One tally column. `cents` is what each person in it paid - 0 for the free
// ones, null for the columns that count people who didn't climb (waiting at
// capacity, no-shows), which stay out of the climber totals.
export type AttendanceColumn = {
  key: AttendanceColumnKey;
  label: string;
  cents: number | null;
};

export type AttendanceColumnGroup = {
  label: string;
  children: AttendanceColumnNode[];
};

export type AttendanceColumnNode = AttendanceColumn | AttendanceColumnGroup;

// Mirrors ATTENDANCE_COLUMN_KEYS in api/src/models/Attendance.ts.
export type AttendanceColumnKey =
  | "utscLearnToClimb"
  | "utscDropInGear"
  | "utscDropInNoGear"
  | "lessons"
  | "belayTpasc"
  | "belay5to12"
  | "belay13to21"
  | "belay22plus"
  | "equipmentRental"
  | "wallPass"
  | "free5to12"
  | "free13to21"
  | "free22plus"
  | "waiting"
  | "noShows";

// The sheet's columns as its header lays them out, left to right. Prices
// are today's - a past week's earnings are worked out with these too.
export const ATTENDANCE_COLUMN_GROUPS: AttendanceColumnNode[] = [
  {
    label: "UTSC",
    children: [
      { key: "utscLearnToClimb", label: "Learn to Climb", cents: 500 },
      { key: "utscDropInGear", label: "Drop-ins (Gear)", cents: 500 },
      { key: "utscDropInNoGear", label: "Drop-ins (No Gear)", cents: 0 },
    ],
  },
  {
    label: "TPASC & Other members",
    children: [
      { key: "lessons", label: "Lessons (13+)", cents: 3000 },
      {
        label: "Drop-ins (equipment + belay)",
        children: [
          { key: "belayTpasc", label: "TPASC", cents: 1200 },
          { key: "belay5to12", label: "5–12", cents: 1800 },
          { key: "belay13to21", label: "13–21", cents: 2040 },
          { key: "belay22plus", label: "22+", cents: 2400 },
        ],
      },
      { key: "equipmentRental", label: "Equipment Rental", cents: 600 },
      { key: "wallPass", label: "Wall pass", cents: 1200 },
    ],
  },
  {
    label: "Drop-ins Free",
    children: [
      { key: "free5to12", label: "5–12", cents: 0 },
      { key: "free13to21", label: "13–21", cents: 0 },
      { key: "free22plus", label: "22+", cents: 0 },
    ],
  },
  { key: "waiting", label: "Waiting (at capacity)", cents: null },
  { key: "noShows", label: "No shows", cents: null },
];

export function isColumnGroup(node: AttendanceColumnNode): node is AttendanceColumnGroup {
  return "children" in node;
}

function leavesOf(node: AttendanceColumnNode): AttendanceColumn[] {
  return isColumnGroup(node) ? node.children.flatMap(leavesOf) : [node];
}

// Every tally column, left to right.
export const ATTENDANCE_COLUMNS = ATTENDANCE_COLUMN_GROUPS.flatMap(leavesOf);
const CLIMBER_COLUMNS = ATTENDANCE_COLUMNS.filter((column) => column.cents !== null);

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

// What the totals and charts can show.
export type Metric = "numbers" | "earnings";

export function countClimbers(counts: AttendanceCounts) {
  return CLIMBER_COLUMNS.reduce((total, column) => total + (counts[column.key] ?? 0), 0);
}

export function countCents(counts: AttendanceCounts) {
  return CLIMBER_COLUMNS.reduce((total, column) => total + (counts[column.key] ?? 0) * column.cents!, 0);
}

// The climbers who came for a lesson - UTSC's Learn to Climb and TPASC's
// Lessons (13+). They're counted among the climbers too.
const LESSON_KEYS: AttendanceColumnKey[] = ["utscLearnToClimb", "lessons"];

export function countLessons(days: AttendanceDay[]) {
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

export function measure(counts: AttendanceCounts, metric: Metric) {
  return metric === "numbers" ? countClimbers(counts) : countCents(counts);
}

export function measureDay(day: AttendanceDay, metric: Metric) {
  return Object.values(day.hours).reduce((total, counts) => total + measure(counts, metric), 0);
}

export function measureDays(days: AttendanceDay[], metric: Metric) {
  return days.reduce((total, day) => total + measureDay(day, metric), 0);
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

// "4–5 PM", "11 AM–12 PM".
export function formatHourRange(hour: number) {
  const start = hourParts(hour);
  const end = hourParts((hour + 1) % 24);
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

// Which of the open days a date is, if any.
export function openDayOf(date: string) {
  const offset = daysBetween(addDays(weekEndingFor(date), -6), date);
  return OPEN_DAYS.find((day) => day.offset === offset);
}

// The dates of the open days in the week ending on `weekEnding`.
export function openDatesOf(weekEnding: string) {
  return OPEN_DAYS.map((day) => ({ day, date: addDays(weekEnding, day.offset - 6) }));
}

// A week as it's stored: a start and end day, and the week's attendance
// JSON keyed by date. Mirrors AttendanceWeek in api/src/models/Attendance.ts.
export type AttendanceRecord = {
  startDay: string;
  endDay: string;
  attendance: Record<string, Omit<AttendanceDay, "date">>;
  updatedAt?: string;
  updatedBy?: string;
};

export function weekFromRecord({ endDay, attendance, updatedAt, updatedBy }: AttendanceRecord): AttendanceWeek {
  const days = Object.entries(attendance)
    .map(([date, day]) => ({ date, ...day }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { weekEnding: endDay, days, updatedAt, updatedBy };
}

export function recordFromWeek({ weekEnding, days }: AttendanceWeek): AttendanceRecord {
  return {
    startDay: addDays(weekEnding, -6),
    endDay: weekEnding,
    attendance: Object.fromEntries(days.map(({ date, hours, turnedAway }) => [date, { hours, turnedAway }])),
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

// Every recorded week, newest first.
export async function fetchAttendance(): Promise<AttendanceWeek[]> {
  const records = (await attendanceRequest()) as AttendanceRecord[];
  return records.map(weekFromRecord).sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
}

export type SaveResult = { saved: number; failed: number };

// Replaces whatever was recorded for each of these weeks.
export async function saveAttendance(weeks: AttendanceWeek[]): Promise<SaveResult> {
  const body = weeks.map(recordFromWeek);
  return (await attendanceRequest("", { method: "PUT", body: JSON.stringify({ weeks: body }) })) as SaveResult;
}

// Removes a week's record for good. A week is stored under its Friday.
export async function deleteAttendance(weekEnding: string): Promise<void> {
  await attendanceRequest(`/${encodeURIComponent(weekEnding)}`, { method: "DELETE" });
}
