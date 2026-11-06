export const DETAIL_CONTAINER = "Details";

// The wall's operating details, one document each. Mirrors DETAIL_IDS in
// website/src/lib/details.ts.
export const DETAIL_IDS = ["pricing", "hours", "closures"] as const;
export type DetailID = (typeof DETAIL_IDS)[number];

// What each price on the public price list is called. Mirrors PRICE_KEYS in
// website/src/lib/details.ts, which also holds their labels and the
// attendance columns each one prices.
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

// Toronto time, 24-hour "HH:mm".
export type DayHours = { open: string; close: string };

// Every entry, whatever the detail. Dates are YYYY-MM-DD and inclusive.
type EntryBase = {
  id: string;
  startDate: string;
  // Left out while it's the one in effect with no end in sight - the current
  // prices, or the regular hours. A closure without one is a single day.
  endDate?: string;
  // The announcement that told everyone about it.
  announcementID?: string;
  // Set when it needs no announcement of its own - a correction, or the
  // details the site started from.
  noAnnouncement?: boolean;
};

export type PricingEntry = EntryBase & { prices: Prices };

// Monday first: 0 = Monday ... 6 = Sunday. In `week`, null is closed all
// day. `lessons` holds each day's Learn-to-Climb sessions, earliest first -
// an empty list for a day without any. Entries saved before lessons were
// stored leave it out, and the website falls back on its built-in lessons.
export type HoursEntry = EntryBase & { week: (DayHours | null)[]; lessons?: DayHours[][] };

export type ClosureEntry = EntryBase & { reason: string };

export type DetailEntry = PricingEntry | HoursEntry | ClosureEntry;

// Partition key: /detailID. `id` mirrors detailID (Cosmos requires an id).
// Prices and hours are periods that don't overlap, oldest first; closures are
// any number of days or ranges, oldest first.
export type DetailRecord = {
  id: DetailID;
  detailID: DetailID;
  entries: DetailEntry[];
  updatedAt: string;
  // Username of whoever saved it last.
  updatedBy: string;
};
