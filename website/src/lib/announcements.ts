// Announcement data shared by the admin announcement pages.

import { adminRequest, apiUrl } from "@/lib/api";
import { type ClimbType, parseDate } from "@/lib/climbs";

// Mirrors ANNOUNCEMENT_TYPES in api/src/models/Announcement.ts, and its
// RANGE_TYPES (`range`) and OPTIONAL_TARGET_TYPES (`targetOptional`).
// `defaultPriority` is what the form picks when the type is chosen - CotW's
// is fixed, the rest can be changed.
export const ANNOUNCEMENT_TYPES = {
  cotw: {
    label: "CotW",
    description: "Climber of the Week challenge - its rules and conditions.",
    defaultPriority: "low",
    range: false,
    targetOptional: false,
  },
  sets: {
    label: "Sets",
    description: "Routes coming down, or new ones going up.",
    defaultPriority: "medium",
    range: false,
    targetOptional: false,
  },
  events: {
    label: "Events",
    description: "Climbing events and group hangouts.",
    defaultPriority: "medium",
    range: true,
    targetOptional: false,
  },
  closures: {
    label: "Closures",
    description: "When the wall is closed - one day or a range.",
    defaultPriority: "urgent",
    range: true,
    targetOptional: false,
  },
  features: {
    label: "Features",
    description: "New equipment, furniture, holds and the like.",
    defaultPriority: "medium",
    range: false,
    targetOptional: true,
  },
  updates: {
    label: "Updates",
    description: "Rules, schedules, lost and found, construction.",
    defaultPriority: "high",
    range: false,
    targetOptional: true,
  },
  reminders: {
    label: "Reminders",
    description: "Rules being broken, or a nudge toward another announcement.",
    defaultPriority: "high",
    range: false,
    targetOptional: true,
  },
  misc: {
    label: "Misc",
    description: "Anything the other types don't cover.",
    defaultPriority: "low",
    range: true,
    targetOptional: true,
  },
} as const;
export type AnnouncementType = keyof typeof ANNOUNCEMENT_TYPES;

// Lowest to highest. How each one shows on the public updates page, once
// that's built.
export const ANNOUNCEMENT_PRIORITIES = {
  low: { label: "Low", description: "Added to the catalogue only." },
  medium: { label: "Medium", description: "Listed, and members like it to show they've seen it." },
  high: { label: "High", description: "At the top of the updates page, then a headline once viewed." },
  urgent: { label: "Urgent", description: "Stays at the top of the updates page, viewed or not." },
} as const;
export type AnnouncementPriority = keyof typeof ANNOUNCEMENT_PRIORITIES;

export const PRIORITY_CLASS: Record<AnnouncementPriority, string> = {
  low: "bg-neutral-100 text-neutral-600",
  medium: "bg-secondary/20 text-primary",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

// What a sets announcement is about, and its default title. "Replaced"
// covers both at once - each climb says whether it went up or came down.
// Mirrors SET_KINDS in api/src/models/Announcement.ts.
export const SET_KINDS = {
  takedown: { label: "Taking Down Climbs" },
  new: { label: "New Climbs" },
  replaced: { label: "Replaced Climbs" },
} as const;
export type SetKind = keyof typeof SET_KINDS;

export type ClimbChange = "up" | "down";

// A climb named in a sets announcement, copied as it was when announced.
// Mirrors AnnouncementClimb in api/src/models/Announcement.ts.
export type AnnouncementClimb = {
  routeID: string;
  type: ClimbType;
  line?: number;
  colour: string;
  secondary?: string;
  grade: string;
  // Replaced climbs only.
  change?: ClimbChange;
};

// What an announcement says, saved as one JSON object. Every type but sets
// needs its details; CotW can add scoring, rules and remarks, and sets name
// their climbs. Mirrors AnnouncementContent in api/src/models/Announcement.ts.
export type AnnouncementContent = {
  details?: string;
  scoring?: string;
  rules?: string;
  remarks?: string;
  setKind?: SetKind;
  climbs?: AnnouncementClimb[];
};

// One line to sum it up in a list - a sets announcement with no details
// counts its climbs instead.
export function announcementPreview(content: AnnouncementContent) {
  if (content.details) return content.details;
  const count = content.climbs?.length ?? 0;
  return count > 0 ? `${count} climb${count === 1 ? "" : "s"}` : "";
}

// The parts a CotW is written in, in the order they're shown.
export const COTW_SECTIONS = [
  { key: "details" as const, label: "Details", required: true },
  { key: "scoring" as const, label: "Scoring", required: false },
  { key: "rules" as const, label: "Rules and conditions", required: false },
  { key: "remarks" as const, label: "Finishing remarks", required: false },
];

export type Announcement = {
  id: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  title: string;
  // Saved as `announcement`.
  content: AnnouncementContent;
  // Username of whoever posted it.
  author: string;
  // ISO date and time.
  announcedAt: string;
  // YYYY-MM-DD. With an end date it's a range. Some types can leave it out.
  targetDate?: string;
  targetEndDate?: string;
  // ISO date and time it moves to the archive.
  relevantUntil: string;
  // Still relevant, as of when the API sent it.
  active: boolean;
  likes: number;
  views: number;
};

// Mirrors toPublicAnnouncement in api/src/announcementFields.ts.
type ApiAnnouncement = Omit<Announcement, "id" | "content"> & {
  announcementID: string;
  announcement: AnnouncementContent;
};

function toAnnouncement({ announcementID, announcement, ...rest }: ApiAnnouncement): Announcement {
  return {
    id: announcementID,
    type: rest.type,
    priority: rest.priority,
    title: rest.title,
    content: announcement,
    author: rest.author,
    announcedAt: rest.announcedAt,
    targetDate: rest.targetDate,
    targetEndDate: rest.targetEndDate,
    relevantUntil: rest.relevantUntil,
    active: rest.active,
    likes: rest.likes,
    views: rest.views,
  };
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const res = await fetch(apiUrl("/announcements"), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load announcements (${res.status})`);
  return ((await res.json()) as ApiAnnouncement[]).map(toAnnouncement);
}

// What an admin writes in the new and edit forms.
export type AnnouncementDetails = Pick<
  Announcement,
  "type" | "priority" | "title" | "content" | "targetDate" | "targetEndDate" | "relevantUntil"
>;

function toRequestBody({ content, ...rest }: AnnouncementDetails) {
  return JSON.stringify({ ...rest, announcement: content });
}

function announcementRequest(id: string, path: string, init: RequestInit) {
  return adminRequest(`/announcements/${encodeURIComponent(id)}${path}`, init);
}

export async function createAnnouncement(details: AnnouncementDetails): Promise<Announcement> {
  return toAnnouncement(await adminRequest("/announcements", { method: "POST", body: toRequestBody(details) }));
}

export async function updateAnnouncement(id: string, details: AnnouncementDetails): Promise<Announcement> {
  return toAnnouncement(await announcementRequest(id, "", { method: "PUT", body: toRequestBody(details) }));
}

// Ends its relevance now, moving it to the archive.
export async function archiveAnnouncement(id: string): Promise<Announcement> {
  return toAnnouncement(await announcementRequest(id, "/archive", { method: "POST" }));
}

// Makes it relevant again until `relevantUntil` (ISO, in the future).
export async function restoreAnnouncement(id: string, relevantUntil: string): Promise<Announcement> {
  return toAnnouncement(
    await announcementRequest(id, "/restore", { method: "POST", body: JSON.stringify({ relevantUntil }) }),
  );
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await announcementRequest(id, "", { method: "DELETE" });
}

function pad(part: number) {
  return String(part).padStart(2, "0");
}

// A moment as the admin's own YYYY-MM-DD.
export function localDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: string, days: number) {
  const day = parseDate(date);
  day.setDate(day.getDate() + days);
  return localDate(day);
}

const FRIDAY = 5;

export function isFriday(date: string) {
  return parseDate(date).getDay() === FRIDAY;
}

// The first Friday on or after a YYYY-MM-DD - when the next CotW is.
export function upcomingFriday(date: string) {
  return addDays(date, (FRIDAY - parseDate(date).getDay() + 7) % 7);
}

// The last moment of a YYYY-MM-DD in the admin's timezone, as ISO - a
// relevance date covers the whole of that day.
export function endOfDay(date: string) {
  const day = parseDate(date);
  day.setHours(23, 59, 59, 999);
  return day.toISOString();
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// "Nov 3, 2026", "Nov 3 – Nov 10, 2026" for a range, or "—" without one.
export function formatTarget(announcement: Pick<Announcement, "targetDate" | "targetEndDate">) {
  if (!announcement.targetDate) return "—";
  const start = parseDate(announcement.targetDate);
  if (!announcement.targetEndDate) return formatShortDate(start);
  const end = parseDate(announcement.targetEndDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return `${startText} – ${formatShortDate(end)}`;
}
