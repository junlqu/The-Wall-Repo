import { HttpRequest } from "@azure/functions";
import { readSessionUser } from "./authUtils";
import {
  Announcement,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TYPES,
  AnnouncementClimb,
  AnnouncementContent,
  AnnouncementPriority,
  AnnouncementType,
  CLIMB_CHANGES,
  ClimbChange,
  OPTIONAL_TARGET_TYPES,
  RANGE_TYPES,
  SET_KINDS,
  SetKind,
} from "./models/Announcement";
import { CLIMB_TYPES, ClimbType, ROUTE_LINES, RouteLine } from "./models/Route";
import { isDate, isFilledText, isText } from "./routeFields";

const MAX_BODY_LENGTH = 4000;
// More than a full reset of the wall.
const MAX_CLIMBS = 100;

export const FORBIDDEN = "Only admins can change announcements.";

const FRIDAY = 5;

// The details an admin writes, as the new and edit forms send them. The
// announcement time isn't one of them - it's when it was posted.
export type AnnouncementFields = Pick<
  Announcement,
  "type" | "priority" | "title" | "announcement" | "targetDate" | "targetEndDate" | "relevantUntil"
>;

export function isDateTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function isBody(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= MAX_BODY_LENGTH;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// One climb as the website copied it. Replaced climbs must say whether they
// went up or came down; the others mustn't.
function readClimb(value: unknown, isReplaced: boolean): AnnouncementClimb | null {
  if (!isObject(value)) return null;
  const { routeID, type, line, colour, secondary, grade, change } = value;
  if (!isFilledText(routeID) || !CLIMB_TYPES.includes(type as ClimbType)) return null;
  if (line !== undefined && !ROUTE_LINES.includes(line as RouteLine)) return null;
  if (!isFilledText(colour) || (secondary !== undefined && !isFilledText(secondary)) || !isText(grade)) return null;
  if (isReplaced ? !CLIMB_CHANGES.includes(change as ClimbChange) : change !== undefined) return null;
  return {
    routeID,
    type: type as ClimbType,
    line: line as RouteLine | undefined,
    colour,
    secondary: secondary as string | undefined,
    grade,
    change: change as ClimbChange | undefined,
  };
}

// Every type but sets needs its details. Only CotW can have scoring, rules
// and remarks, and only sets have a kind and climbs - at least one. Optional
// parts are left out when blank.
function readContent(value: unknown, type: AnnouncementType): AnnouncementContent | null {
  if (!isObject(value)) return null;
  const { details, scoring, rules, remarks, setKind, climbs } = value;
  const isSets = type === "sets";
  if (details === undefined ? !isSets : !isBody(details)) return null;
  for (const optional of [scoring, rules, remarks]) {
    if (optional !== undefined && (type !== "cotw" || !isBody(optional))) return null;
  }

  let readClimbs: AnnouncementClimb[] | undefined;
  if (isSets) {
    if (!SET_KINDS.includes(setKind as SetKind)) return null;
    if (!Array.isArray(climbs) || climbs.length === 0 || climbs.length > MAX_CLIMBS) return null;
    readClimbs = [];
    for (const climb of climbs) {
      const read = readClimb(climb, setKind === "replaced");
      if (!read) return null;
      readClimbs.push(read);
    }
  } else if (setKind !== undefined || climbs !== undefined) {
    return null;
  }

  return {
    details: (details as string | undefined)?.trim(),
    scoring: (scoring as string | undefined)?.trim(),
    rules: (rules as string | undefined)?.trim(),
    remarks: (remarks as string | undefined)?.trim(),
    setKind: setKind as SetKind | undefined,
    climbs: readClimbs,
  };
}

// Checks and tidies an announcement's details, or returns null if any are
// missing or malformed. The relevance date can be in the past, so a backlogged
// announcement can be recorded straight into the archive.
export function readAnnouncementFields(value: unknown): AnnouncementFields | null {
  if (typeof value !== "object" || value === null) return null;
  const { type, priority, title, announcement, targetDate, targetEndDate, relevantUntil } = value as Record<
    string,
    unknown
  >;

  if (!ANNOUNCEMENT_TYPES.includes(type as AnnouncementType)) return null;
  const content = readContent(announcement, type as AnnouncementType);
  if (!content || !isFilledText(title)) return null;
  // Some types can go without a target date; only some can be a range, which
  // has to start with a target date and end after it.
  if (targetDate === undefined ? !OPTIONAL_TARGET_TYPES.includes(type as AnnouncementType) : !isDate(targetDate)) {
    return null;
  }
  const target = targetDate as string | undefined;
  if (targetEndDate !== undefined) {
    if (!RANGE_TYPES.includes(type as AnnouncementType) || target === undefined) return null;
    if (!isDate(targetEndDate) || targetEndDate <= target) return null;
  }
  if (!isDateTime(relevantUntil)) return null;

  const shared = {
    title: title.trim(),
    announcement: content,
    targetDate: target,
    relevantUntil: new Date(relevantUntil).toISOString(),
  };

  // CotW is always low priority - whatever priority is sent - since it has its
  // own slot rather than ranking by priority, and is on one Friday.
  if (type === "cotw") {
    if (new Date(`${target}T00:00:00Z`).getUTCDay() !== FRIDAY) return null;
    return { ...shared, type, priority: "low", targetEndDate: undefined };
  }

  if (!ANNOUNCEMENT_PRIORITIES.includes(priority as AnnouncementPriority)) return null;
  return {
    ...shared,
    type: type as AnnouncementType,
    priority: priority as AnnouncementPriority,
    targetEndDate,
  };
}

// What the website gets: who liked or opened it is reduced to counts, plus
// whether the logged-in visitor is one of them. `active` is worked out here so
// it goes by the same clock that archiving does.
export function toPublicAnnouncement(announcement: Announcement, request: HttpRequest) {
  const { likes, views, ...rest } = announcement;
  const userID = readSessionUser(request)?.userID;
  return {
    ...rest,
    active: Date.parse(announcement.relevantUntil) > Date.now(),
    likes: new Set(likes).size,
    views: new Set(views).size,
    liked: userID !== undefined && likes.includes(userID),
    viewed: userID !== undefined && views.includes(userID),
  };
}
