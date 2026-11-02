import {
  ATTENDANCE_COLUMN_KEYS,
  ATTENDANCE_TYPES,
  AttendanceColumnKey,
  AttendanceCounts,
  AttendanceDay,
  AttendanceRecord,
  AttendanceType,
} from "./models/Attendance";
import { isDate, isFilledText } from "./routeFields";

// Far more than fit on the wall in an hour - anything bigger is a typo. A month
// adds several of those hours together.
const MAX_WEEKLY_COUNT = 999;
const MAX_MONTHLY_COUNT = 9999;
const MAX_NOTES = 20;
const MAX_NOTE_LENGTH = 2000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;

function isCount(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utcDay(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function isHour(hour: string) {
  return /^\d{1,2}$/.test(hour) && Number(hour) <= 23;
}

function readCounts(value: unknown, max: number): AttendanceCounts | null {
  if (!isObject(value)) return null;
  const counts: AttendanceCounts = {};
  for (const [key, count] of Object.entries(value)) {
    if (!ATTENDANCE_COLUMN_KEYS.includes(key as AttendanceColumnKey) || !isCount(count, max)) return null;
    if (count > 0) counts[key as AttendanceColumnKey] = count;
  }
  return counts;
}

function readDay(value: unknown, max: number): AttendanceDay | null {
  if (!isObject(value)) return null;
  const { hours, turnedAway, hourMarks } = value;
  if (!isCount(turnedAway, max) || !isObject(hours)) return null;

  const readHours: AttendanceDay["hours"] = {};
  for (const [hour, counts] of Object.entries(hours)) {
    const read = readCounts(counts, max);
    if (!isHour(hour) || !read) return null;
    readHours[String(Number(hour))] = read;
  }
  const day: AttendanceDay = { hours: readHours, turnedAway };

  if (hourMarks !== undefined) {
    if (!isObject(hourMarks)) return null;
    const marks = Object.entries(hourMarks);
    if (marks.some(([hour, mark]) => !isHour(hour) || typeof mark !== "string" || !/^\*{1,3}$/.test(mark))) return null;
    if (marks.length > 0) day.hourMarks = hourMarks as Record<string, string>;
  }
  return day;
}

function readNotes(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_NOTES) return null;
  const valid = value.every((note) => typeof note === "string" && note.length <= MAX_NOTE_LENGTH);
  return valid ? (value as string[]) : null;
}

// Sorting is left to the website, since an ORDER BY here costs several times the
// request units of the same query without one.
function typeParameter(type: AttendanceType) {
  return { name: "@type", value: type };
}

// Every record of a type, or those overlapping a calendar year. Overlapping
// rather than filed under it, since that year's totals include the days of the
// week crossing into the next one.
export function attendanceQuery(type: AttendanceType, year?: string) {
  if (!year) return { query: "SELECT * FROM c WHERE c.type = @type", parameters: [typeParameter(type)] };
  return {
    query: "SELECT * FROM c WHERE c.type = @type AND c.endDay >= @from AND c.startDay <= @to",
    parameters: [typeParameter(type), { name: "@from", value: `${year}-01-01` }, { name: "@to", value: `${year}-12-31` }],
  };
}

// Which years have records of a type, and how many. A record is filed under the
// year it ends in.
export function attendanceYearsQuery(type: AttendanceType) {
  return {
    query: "SELECT LEFT(c.endDay, 4) AS year, COUNT(1) AS count FROM c WHERE c.type = @type GROUP BY LEFT(c.endDay, 4)",
    parameters: [typeParameter(type)],
  };
}

// When each record of a type from a date on starts, and nothing else - enough to
// tell which are on file without reading any of them.
export function attendanceStartsQuery(type: AttendanceType, from: string) {
  return {
    query: "SELECT VALUE c.startDay FROM c WHERE c.type = @type AND c.startDay >= @from",
    parameters: [typeParameter(type), { name: "@from", value: from }],
  };
}

// W-20261024-20261030 for a week, M-20260901-20260930 for a month.
export function attendanceId(type: AttendanceType, startDay: string, endDay: string) {
  const compact = (date: string) => date.replaceAll("-", "");
  return `${type === "weekly" ? "W" : "M"}-${compact(startDay)}-${compact(endDay)}`;
}

function isWeek(startDay: unknown, endDay: unknown): boolean {
  if (!isDate(startDay) || !isDate(endDay)) return false;
  if (new Date(utcDay(endDay)).getUTCDay() !== FRIDAY) return false;
  return utcDay(endDay) - utcDay(startDay) === 6 * ONE_DAY_MS;
}

function isMonth(startDay: unknown, endDay: unknown): boolean {
  if (!isDate(startDay) || !isDate(endDay) || !startDay.endsWith("-01")) return false;
  const [year, month] = startDay.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return utcDay(endDay) === Date.UTC(year, month, 0);
}

// Checks and tidies a saved period, or returns null if anything's missing or
// malformed. Every day of a week must fall inside it.
export function readAttendanceRecord(value: unknown, updatedBy: string, updatedAt: string): AttendanceRecord | null {
  if (!isObject(value)) return null;
  const { type, startDay, endDay, attendance } = value;
  if (!ATTENDANCE_TYPES.includes(type as AttendanceType) || !isObject(attendance)) return null;
  const weekly = type === "weekly";
  if (!(weekly ? isWeek(startDay, endDay) : isMonth(startDay, endDay))) return null;
  const start = startDay as string;
  const end = endDay as string;

  const days: AttendanceRecord["attendance"] = {};
  for (const key of Object.keys(attendance)) {
    const day = readDay(attendance[key], weekly ? MAX_WEEKLY_COUNT : MAX_MONTHLY_COUNT);
    if (!day) return null;
    if (weekly ? !isDate(key) || key < start || key > end : !isFilledText(key)) return null;
    days[key] = day;
  }

  const id = attendanceId(type as AttendanceType, start, end);
  const record: AttendanceRecord = {
    id,
    attendanceID: id,
    type: type as AttendanceType,
    startDay: start,
    endDay: end,
    attendance: days,
    updatedAt,
    updatedBy,
  };
  const notes = readNotes(value.notes);
  if (!notes || notes.join("").length > MAX_NOTES * MAX_NOTE_LENGTH) return null;
  if (notes.length > 0) record.notes = notes;
  return record;
}
