import { ClimbType, RouteLine } from "./Route";

export const ANNOUNCEMENT_CONTAINER = "Announcements";

// Mirrors ANNOUNCEMENT_TYPES in website/src/lib/announcements.ts, which also
// holds each type's label and description.
export const ANNOUNCEMENT_TYPES = [
  "cotw",
  "sets",
  "events",
  "closures",
  "features",
  "updates",
  "reminders",
  "misc",
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

// Lowest to highest.
export const ANNOUNCEMENT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

// Types that can be a range, with an end date as well as a target date.
export const RANGE_TYPES: AnnouncementType[] = ["events", "closures", "misc"];
// Types that don't need a target date at all.
export const OPTIONAL_TARGET_TYPES: AnnouncementType[] = ["features", "updates", "reminders", "misc"];

// What a sets announcement is about. "replaced" covers both at once - each of
// its climbs says whether it went up or came down.
export const SET_KINDS = ["takedown", "new", "replaced"] as const;
export type SetKind = (typeof SET_KINDS)[number];

export const CLIMB_CHANGES = ["up", "down"] as const;
export type ClimbChange = (typeof CLIMB_CHANGES)[number];

// A climb named in a sets announcement, copied as it was when announced so
// the record still reads right if the climb is later changed or deleted.
export type AnnouncementClimb = {
  routeID: string;
  type: ClimbType;
  line?: RouteLine;
  colour: string;
  secondary?: string;
  grade: string;
  // Replaced climbs only: put up, or taken down.
  change?: ClimbChange;
};

// What the announcement says. Every type but sets needs its details; CotW
// can add scoring, rules and remarks, and sets name their climbs. Optional
// parts are left out when blank.
export type AnnouncementContent = {
  details?: string;
  // CotW only.
  scoring?: string;
  rules?: string;
  remarks?: string;
  // Sets only.
  setKind?: SetKind;
  climbs?: AnnouncementClimb[];
};

// Partition key: /announcementID. `id` mirrors announcementID (Cosmos requires
// an id).
export type Announcement = {
  id: string;
  announcementID: string;
  userID: string; // the author
  // The author's username when it was posted.
  author: string;
  // ISO date and time it was announced.
  announcedAt: string;
  type: AnnouncementType;
  // Always "low" for CotW, which has its own slot instead.
  priority: AnnouncementPriority;
  title: string;
  announcement: AnnouncementContent;
  // YYYY-MM-DD - the day it's about. With an end date it's a range, e.g. a
  // closure from targetDate to targetEndDate. CotW is always one Friday.
  // Left out for the OPTIONAL_TARGET_TYPES when there isn't one.
  targetDate?: string;
  targetEndDate?: string;
  // ISO date and time it stops being relevant and moves to the archive.
  // Archiving sets it to the moment it was archived.
  relevantUntil: string;
  // userIDs of everyone who liked it.
  likes: string[];
  // userIDs of everyone who has opened it.
  views: string[];
};
