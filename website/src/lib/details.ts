// The wall's operating details - prices, opening hours and closures - that
// admins set on the Operations pages. The schedule page shows them, the
// attendance form suggests each week's days and hours from them, and earnings
// are counted at the prices in effect at the time.
//
// Prices and hours are periods: a start date, and an end date unless it's the
// one in effect with no end in sight. A date no period covers falls back on
// the built-in defaults below. Closures are single days or ranges.

import { useEffect, useSyncExternalStore } from "react";
import { adminRequest, apiUrl } from "@/lib/api";
import type { AttendanceColumnKey } from "@/lib/attendanceFormats";
import { parseDate } from "@/lib/climbs";

// Mirrors DETAIL_IDS in api/src/models/Detail.ts.
export const DETAIL_IDS = ["pricing", "hours", "closures"] as const;
export type DetailID = (typeof DETAIL_IDS)[number];

// Mirrors PRICE_KEYS in api/src/models/Detail.ts.
export const PRICE_KEYS = [
  "utscDropIn",
  "utscGear",
  "utscLesson",
  "memberDropIn",
  "memberGear",
  "memberBelay",
  "lesson",
  "nonMemberGear",
  "belay5to12",
  "belay13to21",
  "belay22plus",
] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

// In cents.
export type Prices = Record<PriceKey, number>;

// What each price is called on the admin form, and the attendance sheet
// columns it prices. Lessons cost members and non-members the same, and TPASC
// members' free drop-ins are the sheet's "Drop-ins Free" columns.
export const PRICE_INFO: Record<PriceKey, { group: string; label: string; columns: AttendanceColumnKey[] }> = {
  utscDropIn: { group: "UTSC Students", label: "Drop-in (own gear)", columns: ["utscDropInNoGear"] },
  utscGear: { group: "UTSC Students", label: "Drop-in + Gear", columns: ["utscDropInGear"] },
  utscLesson: { group: "UTSC Students", label: "Learn-to-Climb", columns: ["utscLearnToClimb"] },
  memberDropIn: { group: "TPASC Members", label: "Drop-in (own gear)", columns: ["free5to12", "free13to21", "free22plus"] },
  memberGear: { group: "TPASC Members", label: "Drop-in + Gear", columns: ["equipmentRental"] },
  memberBelay: { group: "TPASC Members", label: "Belay service + Gear (1 hour)", columns: ["belayTpasc"] },
  lesson: { group: "Everyone else", label: "Learn-to-Climb (TPASC and non-members)", columns: ["lessons"] },
  nonMemberGear: { group: "Non-TPASC Members", label: "Drop-in + Gear", columns: ["wallPass"] },
  belay5to12: { group: "Non-TPASC Members", label: "Belay service + Gear, age 5–12", columns: ["belay5to12"] },
  belay13to21: { group: "Non-TPASC Members", label: "Belay service + Gear, age 13–21", columns: ["belay13to21"] },
  belay22plus: { group: "Non-TPASC Members", label: "Belay service + Gear, age 22+", columns: ["belay22plus"] },
};

// The prices the site started with - the attendance sheet's since Sep 2025.
export const DEFAULT_PRICES: Prices = {
  utscDropIn: 0,
  utscGear: 500,
  utscLesson: 500,
  memberDropIn: 0,
  memberGear: 600,
  memberBelay: 1200,
  lesson: 3000,
  nonMemberGear: 1200,
  belay5to12: 1800,
  belay13to21: 2040,
  belay22plus: 2400,
};

export type PriceListItem = {
  label: string;
  key?: PriceKey;
  note?: string;
  // Shows an info icon explaining the belay test requirement.
  needsBelayTest?: boolean;
  tiers?: { label: string; key: PriceKey }[];
};

// The price list as the schedule page lays it out.
export const PRICE_LIST: { audience: string; items: PriceListItem[] }[] = [
  {
    audience: "UTSC Students",
    items: [
      { label: "Drop-in", key: "utscDropIn", note: "You have your own gear (shoes + harness)", needsBelayTest: true },
      { label: "Drop-in + Gear", key: "utscGear", needsBelayTest: true },
      { label: "Learn-to-Climb", key: "utscLesson" },
    ],
  },
  {
    audience: "TPASC Members",
    items: [
      { label: "Drop-in", key: "memberDropIn", note: "You have your own gear (shoes + harness)", needsBelayTest: true },
      { label: "Drop-in + Gear", key: "memberGear", needsBelayTest: true },
      { label: "Belay service + Gear (1 hour)", key: "memberBelay" },
      { label: "Learn-to-Climb", key: "lesson" },
    ],
  },
  {
    audience: "Non-TPASC Members",
    items: [
      { label: "Drop-in + Gear", key: "nonMemberGear", needsBelayTest: true },
      {
        label: "Belay service + Gear (1 hour)",
        tiers: [
          { label: "Age 5–12", key: "belay5to12" },
          { label: "Age 13–21", key: "belay13to21" },
          { label: "Age 22+", key: "belay22plus" },
        ],
      },
      { label: "Learn-to-Climb", key: "lesson" },
    ],
  },
];

// Toronto time, 24-hour "HH:mm".
export type DayHours = { open: string; close: string };
// Monday first: 0 = Monday ... 6 = Sunday. null is closed all day.
export type WeekHours = (DayHours | null)[];

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The regular hours, for any date no saved period covers.
export const DEFAULT_WEEK: WeekHours = [
  { open: "16:00", close: "22:00" },
  null,
  { open: "16:00", close: "22:00" },
  null,
  { open: "16:00", close: "22:00" },
  { open: "12:00", close: "16:00" },
  { open: "12:00", close: "16:00" },
];

// Each day's Learn-to-Climb sessions, Monday first and earliest first - an
// empty list for a day without any. Lessons run inside the wall's hours.
export type WeekLessons = DayHours[][];

const EVENING_LESSONS: DayHours[] = [
  { open: "16:00", close: "17:30" },
  { open: "18:00", close: "19:30" },
];

// The regular lessons - Mon, Wed and Fri evenings - for any date no saved
// period covers, or one saved before lessons were stored.
export const DEFAULT_LESSONS: WeekLessons = [EVENING_LESSONS, [], EVENING_LESSONS, [], EVENING_LESSONS, [], []];

// Mirrors the entry types in api/src/models/Detail.ts. Dates are YYYY-MM-DD
// and inclusive.
export type EntryBase = {
  id: string;
  startDate: string;
  // Left out while it's the period in effect with no end in sight. A closure
  // without one is a single day.
  endDate?: string;
  announcementID?: string;
  // Set when it needs no announcement - a correction, say.
  noAnnouncement?: boolean;
};
export type PricingEntry = EntryBase & { prices: Prices };
export type HoursEntry = EntryBase & { week: WeekHours; lessons?: WeekLessons };
export type ClosureEntry = EntryBase & { reason: string };

export type EntryOf<K extends DetailID> = K extends "pricing" ? PricingEntry : K extends "hours" ? HoursEntry : ClosureEntry;

export type DetailState<E> = { entries: E[]; updatedAt?: string; updatedBy?: string };
export type Details = { [K in DetailID]: DetailState<EntryOf<K>> };

export const EMPTY_DETAILS: Details = { pricing: { entries: [] }, hours: { entries: [] }, closures: { entries: [] } };

export async function fetchDetails(): Promise<Details> {
  const res = await fetch(apiUrl("/details"));
  if (!res.ok) throw new Error(`Failed to load prices, hours and closures (${res.status})`);
  return (await res.json()) as Details;
}

// Replaces a detail's whole list - also how an announcement is linked. The
// saved list becomes what the rest of the site goes by.
export async function saveDetail<K extends DetailID>(detailID: K, entries: EntryOf<K>[]): Promise<DetailState<EntryOf<K>>> {
  const saved = (await adminRequest(`/details/${detailID}`, {
    method: "PUT",
    body: JSON.stringify({ entries }),
  })) as DetailState<EntryOf<K>>;
  setStore({ ...store, [detailID]: saved });
  return saved;
}

// --- The loaded details, shared by every page ---------------------------------

// Until they load (or if they can't), everything goes by the defaults.
let store: Details = EMPTY_DETAILS;
// undefined until the first load settles, then whether it worked.
let loaded: boolean | undefined;
let loading: Promise<Details> | null = null;
const listeners = new Set<() => void>();
// Bumped on every change, so derived lookups know to start over.
let version = 0;

function setStore(next: Details) {
  store = next;
  version++;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Loads them once per visit. A failed load leaves the defaults in place and
// tries again next time.
export function loadDetails(): Promise<Details> {
  if (!loading) {
    loading = fetchDetails()
      .then((details) => {
        loaded = true;
        setStore(details);
        return details;
      })
      .catch((error) => {
        loaded = false;
        loading = null;
        listeners.forEach((listener) => listener());
        throw error;
      });
  }
  return loading;
}

export function currentDetails() {
  return store;
}

export function detailsVersion() {
  return version;
}

// The details, loading them if they haven't been: undefined while loading,
// null if they couldn't be (the defaults are in use).
export function useDetails(): Details | null | undefined {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (loaded === undefined ? undefined : loaded ? store : null),
    () => undefined,
  );
  useEffect(() => {
    loadDetails().catch(() => {});
  }, []);
  return snapshot;
}

// --- Looking things up by date ---------------------------------------------------

// The last day an entry covers - a closure without an end is one day, and a
// period without one runs on.
export function lastDay(detailID: DetailID, entry: EntryBase) {
  return entry.endDate ?? (detailID === "closures" ? entry.startDate : undefined);
}

function covers(detailID: DetailID, entry: EntryBase, date: string) {
  const last = lastDay(detailID, entry);
  return entry.startDate <= date && (last === undefined || date <= last);
}

export function pricingOn(date: string, details = store): PricingEntry | undefined {
  return details.pricing.entries.find((entry) => covers("pricing", entry, date));
}

export function hoursPeriodOn(date: string, details = store): HoursEntry | undefined {
  return details.hours.entries.find((entry) => covers("hours", entry, date));
}

export function closureOn(date: string, details = store): ClosureEntry | undefined {
  return details.closures.entries.find((entry) => covers("closures", entry, date));
}

export function pricesOn(date: string, details = store): Prices {
  return pricingOn(date, details)?.prices ?? DEFAULT_PRICES;
}

// Monday first, like the week arrays.
export function weekdayOf(date: string) {
  return (parseDate(date).getDay() + 6) % 7;
}

// The regular hours for a date's weekday, closures aside.
export function regularHoursOn(date: string, details = store): DayHours | null {
  return (hoursPeriodOn(date, details)?.week ?? DEFAULT_WEEK)[weekdayOf(date)];
}

// When the wall is open on a date - null when it's closed, by the schedule or
// for a closure.
export function hoursOn(date: string, details = store): DayHours | null {
  return closureOn(date, details) ? null : regularHoursOn(date, details);
}

// A period's lessons - the built-in ones if it was saved before lessons were.
export function lessonsOf(period: HoursEntry | undefined): WeekLessons {
  return period?.lessons ?? DEFAULT_LESSONS;
}

// The Learn-to-Climb sessions on a date, earliest first - none on a closure.
export function lessonsOn(date: string, details = store): DayHours[] {
  if (closureOn(date, details)) return [];
  return lessonsOf(hoursPeriodOn(date, details))[weekdayOf(date)];
}

// The pricing period most of a stretch of days falls in - a monthly sheet adds
// up the whole month at one set of prices. Undefined when most of it has none.
export function pricingBetween(start: string, end: string, details = store): PricingEntry | undefined {
  const days = new Map<PricingEntry | undefined, number>();
  for (let date = start; date <= end; date = nextDay(date)) {
    const entry = pricingOn(date, details);
    days.set(entry, (days.get(entry) ?? 0) + 1);
  }
  let best: PricingEntry | undefined;
  let bestDays = 0;
  for (const [entry, count] of days) {
    if (count > bestDays) {
      best = entry;
      bestDays = count;
    }
  }
  return best;
}

// The attendance columns a pricing period sets, at its prices.
export function columnCents(entry: PricingEntry): Partial<Record<AttendanceColumnKey, number>> {
  const cents: Partial<Record<AttendanceColumnKey, number>> = {};
  for (const key of PRICE_KEYS) {
    for (const column of PRICE_INFO[key].columns) cents[column] = entry.prices[key];
  }
  return cents;
}

// --- Dates --------------------------------------------------------------------------

function pad(part: number) {
  return String(part).padStart(2, "0");
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDate(date: string, days: number) {
  const next = parseDate(date);
  next.setDate(next.getDate() + days);
  return toKey(next);
}

function nextDay(date: string) {
  return shiftDate(date, 1);
}

export function todayKey() {
  return toKey(new Date());
}

export type EntryStatus = "past" | "current" | "upcoming";

export function entryStatus(detailID: DetailID, entry: EntryBase, today = todayKey()): EntryStatus {
  if (entry.startDate > today) return "upcoming";
  const last = lastDay(detailID, entry);
  return last !== undefined && last < today ? "past" : "current";
}

// Still to come or in effect, with nothing telling anyone about it.
export function needsAnnouncement(detailID: DetailID, entry: EntryBase, today = todayKey()) {
  return !entry.announcementID && !entry.noAnnouncement && entryStatus(detailID, entry, today) !== "past";
}

// --- Formatting ------------------------------------------------------------------

// "4:00 PM" from "16:00".
export function formatClock(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${pad(minutes)} ${hours < 12 ? "AM" : "PM"}`;
}

// "4p" or "4:30p" - for the calendar's small cells.
export function formatShortClock(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}${minutes ? `:${pad(minutes)}` : ""}${hours < 12 ? "a" : "p"}`;
}

export function formatDayHours(hours: DayHours | null) {
  return hours ? `${formatClock(hours.open)} – ${formatClock(hours.close)}` : "Closed";
}

// "$5", "$20.40", "$0".
export function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(date: string, withYear = true) {
  return parseDate(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
}

// "Jun 1 – Aug 31, 2027", "From Sep 3, 2025", or one day for a closure.
export function formatEntryDates(detailID: DetailID, entry: EntryBase) {
  const last = lastDay(detailID, entry);
  if (last === undefined) return `From ${shortDate(entry.startDate)}`;
  if (last === entry.startDate) return shortDate(entry.startDate);
  const sameYear = last.slice(0, 4) === entry.startDate.slice(0, 4);
  return `${shortDate(entry.startDate, !sameYear)} – ${shortDate(last)}`;
}

// --- Changing periods ---------------------------------------------------------------

export function newEntryId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function laterOf(a: string, b: string) {
  return a > b ? a : b;
}

function valuesOf(entry: PricingEntry | HoursEntry) {
  return "prices" in entry ? entry.prices : { week: entry.week, lessons: lessonsOf(entry) };
}

function sameValues(a: PricingEntry | HoursEntry, b: PricingEntry | HoursEntry) {
  return JSON.stringify(valuesOf(a)) === JSON.stringify(valuesOf(b));
}

// Joins neighbouring periods that say the same thing, keeping the earlier
// one's id and whichever announcement there was.
function mergeNeighbours<E extends PricingEntry | HoursEntry>(entries: E[]): E[] {
  const merged: E[] = [];
  for (const entry of entries) {
    const previous = merged.at(-1);
    if (previous?.endDate && shiftDate(previous.endDate, 1) === entry.startDate && sameValues(previous, entry)) {
      merged[merged.length - 1] = {
        ...previous,
        endDate: entry.endDate,
        announcementID: previous.announcementID ?? entry.announcementID,
        noAnnouncement: previous.announcementID ? previous.noAnnouncement : (previous.noAnnouncement ?? entry.noAnnouncement),
      };
    } else {
      merged.push(entry);
    }
  }
  return merged;
}

// Puts a period in place over its dates. Whatever was in effect before it is
// cut short the day before; if it has an end date, whatever was in effect
// after picks up again the day after. Periods entirely inside it are replaced,
// and one with no end date replaces everything after its start.
export function placePeriod<E extends PricingEntry | HoursEntry>(entries: E[], period: E): E[] {
  const { startDate: start, endDate: end } = period;
  const placed: E[] = [];
  for (const entry of entries) {
    if (entry.id === period.id) continue;
    if (entry.startDate < start) {
      const cut = shiftDate(start, -1);
      placed.push({ ...entry, endDate: entry.endDate && entry.endDate < cut ? entry.endDate : cut });
    }
    if (end !== undefined && (entry.endDate === undefined || entry.endDate > end)) {
      const resumes = laterOf(entry.startDate, shiftDate(end, 1));
      // A period split around this one needs an id for its second half.
      placed.push({ ...entry, id: entry.startDate < start ? newEntryId() : entry.id, startDate: resumes });
    }
  }
  placed.push(period);
  return mergeNeighbours(placed.sort((a, b) => a.startDate.localeCompare(b.startDate)));
}

// Takes a period out. The one before it, if it ran right up to it, carries on
// over its dates so no days are left without one.
export function removePeriod<E extends PricingEntry | HoursEntry>(entries: E[], id: string): E[] {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return entries;
  const removed = entries[index];
  const previous = entries[index - 1];
  const rest = entries.filter((entry) => entry.id !== id);
  if (previous?.endDate && shiftDate(previous.endDate, 1) === removed.startDate) {
    return mergeNeighbours(rest.map((entry) => (entry.id === previous.id ? { ...entry, endDate: removed.endDate } : entry)));
  }
  return rest;
}

// Changes a period's dates or values: out of its old dates, into its new ones.
export function replacePeriod<E extends PricingEntry | HoursEntry>(entries: E[], period: E): E[] {
  return placePeriod(removePeriod(entries, period.id), period);
}

// Links (or marks as not needing) an announcement on some entries.
export function linkAnnouncement<E extends EntryBase>(
  entries: E[],
  ids: string[],
  link: { announcementID: string } | { noAnnouncement: true },
): E[] {
  return entries.map((entry) =>
    ids.includes(entry.id)
      ? "announcementID" in link
        ? { ...entry, announcementID: link.announcementID, noAnnouncement: undefined }
        : { ...entry, announcementID: undefined, noAnnouncement: true }
      : entry,
  );
}

export function unlinkAnnouncement<E extends EntryBase>(entries: E[], id: string): E[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, announcementID: undefined, noAnnouncement: undefined } : entry));
}
