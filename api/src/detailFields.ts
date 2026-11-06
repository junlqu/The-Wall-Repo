import {
  ClosureEntry,
  DayHours,
  DetailEntry,
  DetailID,
  HoursEntry,
  PRICE_KEYS,
  PricingEntry,
  Prices,
} from "./models/Detail";
import { isDate, isFilledText } from "./routeFields";

// Years of changes, and still a bound on a request.
const MAX_ENTRIES = 500;
// $1,000 - well past anything the wall charges.
const MAX_CENTS = 100000;
const MAX_REASON_LENGTH = 200;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS_IN_WEEK = 7;
// More than a day of back-to-back lessons.
const MAX_LESSONS_PER_DAY = 8;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPrices(value: unknown): Prices | null {
  if (!isObject(value)) return null;
  const prices = {} as Prices;
  for (const key of PRICE_KEYS) {
    const cents = value[key];
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) return null;
    prices[key] = cents;
  }
  return prices;
}

function readDayHours(value: unknown): DayHours | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  const { open, close } = value;
  if (typeof open !== "string" || typeof close !== "string") return undefined;
  if (!TIME_PATTERN.test(open) || !TIME_PATTERN.test(close) || open >= close) return undefined;
  return { open, close };
}

function readWeek(value: unknown): (DayHours | null)[] | null {
  if (!Array.isArray(value) || value.length !== DAYS_IN_WEEK) return null;
  const week = value.map(readDayHours);
  return week.some((day) => day === undefined) ? null : (week as (DayHours | null)[]);
}

// Each day's lessons, earliest first. A lesson has to fit inside the day's
// hours, so a closed day can't have any.
function readLessons(value: unknown, week: (DayHours | null)[]): DayHours[][] | null {
  if (!Array.isArray(value) || value.length !== DAYS_IN_WEEK) return null;
  const lessons: DayHours[][] = [];
  for (const [index, day] of value.entries()) {
    if (!Array.isArray(day) || day.length > MAX_LESSONS_PER_DAY) return null;
    const sessions = day.map(readDayHours);
    if (sessions.some((session) => !session)) return null;
    const hours = week[index];
    const sorted = (sessions as DayHours[]).sort((a, b) => a.open.localeCompare(b.open));
    if (sorted.some((session) => !hours || session.open < hours.open || session.close > hours.close)) return null;
    lessons.push(sorted);
  }
  return lessons;
}

// The parts every entry has. An end date can't come before the start.
function readBase(value: Record<string, unknown>) {
  const { id, startDate, endDate, announcementID, noAnnouncement } = value;
  if (!isFilledText(id) || !isDate(startDate)) return null;
  if (endDate !== undefined && (!isDate(endDate) || endDate < startDate)) return null;
  if (announcementID !== undefined && !isFilledText(announcementID)) return null;
  if (noAnnouncement !== undefined && typeof noAnnouncement !== "boolean") return null;
  return {
    id,
    startDate,
    endDate: endDate as string | undefined,
    announcementID: announcementID as string | undefined,
    noAnnouncement: noAnnouncement === true ? true : undefined,
  };
}

function readEntry(detailID: DetailID, value: unknown): DetailEntry | null {
  if (!isObject(value)) return null;
  const base = readBase(value);
  if (!base) return null;
  if (detailID === "pricing") {
    const prices = readPrices(value.prices);
    return prices ? ({ ...base, prices } satisfies PricingEntry) : null;
  }
  if (detailID === "hours") {
    const week = readWeek(value.week);
    if (!week) return null;
    if (value.lessons === undefined) return { ...base, week } satisfies HoursEntry;
    const lessons = readLessons(value.lessons, week);
    return lessons ? ({ ...base, week, lessons } satisfies HoursEntry) : null;
  }
  const { reason } = value;
  if (!isFilledText(reason) || reason.length > MAX_REASON_LENGTH) return null;
  return { ...base, reason: reason.trim() } satisfies ClosureEntry;
}

// Prices and hours are periods: one at a time, so they can't overlap, and only
// the last can run on with no end date.
function periodsProblem(entries: DetailEntry[]) {
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1];
    if (!previous.endDate) return "Only the latest period can be left without an end date.";
    if (previous.endDate >= entries[index].startDate) return "Two periods overlap - each has to end before the next starts.";
  }
  return null;
}

// Checks and tidies one detail's whole list, oldest first, or says what's
// wrong with it, written for the admin to read.
export function readDetailEntries(detailID: DetailID, value: unknown): { entries: DetailEntry[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "There's nothing to save." };
  if (value.length > MAX_ENTRIES) return { error: `At most ${MAX_ENTRIES} entries can be saved.` };

  const entries: DetailEntry[] = [];
  for (const [index, item] of value.entries()) {
    const entry = readEntry(detailID, item);
    if (!entry) return { error: `Entry ${index + 1} is missing or has invalid details.` };
    entries.push(entry);
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    return { error: "Two entries share an id." };
  }

  entries.sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (detailID !== "closures") {
    const problem = periodsProblem(entries);
    if (problem) return { error: problem };
  }
  return { entries };
}
