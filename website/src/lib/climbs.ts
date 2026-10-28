// Climb data shared by the admin climbs table and the climb import.

import { adminRequest, apiUrl } from "@/lib/api";

export const CLIMB_TYPES = { route: "Route", boulder: "Boulder", combo: "Combo" } as const;
export type ClimbType = keyof typeof CLIMB_TYPES;

export const LEADABLE = ["Yes", "Sketch", "No", "?"] as const;
export type Leadable = (typeof LEADABLE)[number];

export type ClimbStatus = "active" | "past";

export const LINES = [1, 2, 3, 4, 5, 6] as const;

export type Climb = {
  id: string;
  type: ClimbType;
  status: ClimbStatus;
  colour: string;
  // Combos only - one colour per hand, so the climb is `colour` / `secondary`.
  secondary?: string;
  // Boulders only.
  tape?: string;
  grade: string;
  // Routes and combos only - boulders aren't on a line.
  line?: number;
  setter: string;
  // "" when the set date was never recorded.
  setAt: string;
  // Past climbs only, and only when the removal date was recorded.
  removedAt?: string;
  leadable: Leadable;
  sends: number;
  comments: number;
  // Average of its comments' ratings as stars out of 5, or null when nobody
  // has rated it.
  stars: number | null;
  // How many ratings the average is of.
  ratings: number;
};

// Comments rate a climb 0-10, shown as stars out of 5.
const RATING_SCALE = 10;
export const MAX_STARS = 5;

// Rounded to the nearest tenth of a star.
function toStars(rating: { total: number; count: number } | undefined) {
  if (!rating || rating.count <= 0) return null;
  return Math.round((rating.total / rating.count / RATING_SCALE) * MAX_STARS * 10) / 10;
}

// One comment's 0-10 rating as stars.
export function ratingStars(rating: number) {
  return toStars({ total: rating, count: 1 })!;
}

// All the API shares of someone. Mirrors PublicPerson in
// api/src/functions/routeActivity.ts.
export type ClimbPerson = { userID: string; username: string; avatarUpdatedAt?: string };

export type ClimbComment = {
  commentID: string;
  commentedAt: string;
  comment: string;
  // 0-10.
  rating?: number;
  grade?: string;
  send?: boolean;
  // Null once their account is gone.
  author: ClimbPerson | null;
};

// A climb's newest comments and who sent it last - null when nobody has, or
// their account is gone.
export type ClimbActivity = { comments: ClimbComment[]; lastSend: ClimbPerson | null };

// The newest `limit` comments - the API caps it at 50.
export async function fetchClimbActivity(id: string, limit?: number): Promise<ClimbActivity> {
  const query = limit ? `?limit=${limit}` : "";
  const res = await fetch(apiUrl(`/routes/${encodeURIComponent(id)}/activity${query}`));
  if (!res.ok) throw new Error(`Failed to load the climb's activity (${res.status})`);
  return (await res.json()) as ClimbActivity;
}

// Mirrors Route in api/src/models/Route.ts. Documents written before climb
// types, setter names, leadable, comment counts and ratings existed may lack
// them.
type ApiRoute = {
  routeID: string;
  type?: ClimbType;
  setter?: string;
  setAt: string;
  removedAt: string | 0 | null;
  colour: string;
  tape?: string;
  line?: number;
  proposedGrade: string;
  secondary?: string;
  leadable?: Leadable;
  ascents?: string[];
  comments?: number;
  rating?: { total: number; count: number };
};

function toClimb(route: ApiRoute): Climb {
  return {
    id: route.routeID,
    type: route.type ?? "route",
    status: route.removedAt === 0 ? "active" : "past",
    colour: route.colour,
    secondary: route.secondary,
    tape: route.tape,
    grade: route.proposedGrade,
    line: route.line,
    setter: route.setter ?? "",
    setAt: route.setAt,
    removedAt: typeof route.removedAt === "string" ? route.removedAt : undefined,
    leadable: route.leadable ?? "?",
    sends: route.ascents?.length ?? 0,
    comments: route.comments ?? 0,
    stars: toStars(route.rating),
    ratings: Math.max(0, route.rating?.count ?? 0),
  };
}

export async function fetchClimbs(): Promise<Climb[]> {
  const res = await fetch(apiUrl("/routes"));
  if (!res.ok) throw new Error(`Failed to load climbs (${res.status})`);
  return ((await res.json()) as ApiRoute[]).map(toClimb);
}

// One climb, or null when there's no climb with that ID.
export async function fetchClimb(id: string): Promise<Climb | null> {
  const res = await fetch(apiUrl(`/routes/${encodeURIComponent(id)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load the climb (${res.status})`);
  return toClimb((await res.json()) as ApiRoute);
}

// A climb's own page. The site is a static export, so the ID goes in the
// query rather than the path.
export function climbHref(id: string) {
  return `/climbs/climb?id=${encodeURIComponent(id)}`;
}

// What an admin can change on a climb with the edit form.
export type ClimbDetails = Pick<
  Climb,
  "type" | "colour" | "secondary" | "tape" | "line" | "grade" | "setter" | "setAt" | "leadable"
>;

function climbRequest(id: string, path: string, init: RequestInit) {
  return adminRequest(`/routes/${encodeURIComponent(id)}${path}`, init);
}

// Adds a climb that's up on the wall now.
export async function createClimb(details: ClimbDetails): Promise<Climb> {
  return toClimb(await adminRequest("/routes", { method: "POST", body: JSON.stringify(details) }));
}

export async function updateClimb(id: string, details: ClimbDetails): Promise<Climb> {
  return toClimb(await climbRequest(id, "", { method: "PUT", body: JSON.stringify(details) }));
}

// `removedAt` is the date it came down, or null when that isn't known.
export async function archiveClimb(id: string, removedAt: string | null): Promise<Climb> {
  return toClimb(await climbRequest(id, "/archive", { method: "POST", body: JSON.stringify({ removedAt }) }));
}

// Puts an archived climb back up, clearing its retirement date.
export async function restoreClimb(id: string): Promise<Climb> {
  return toClimb(await climbRequest(id, "/restore", { method: "POST" }));
}

export async function deleteClimb(id: string): Promise<void> {
  await climbRequest(id, "", { method: "DELETE" });
}

// Today in the admin's own timezone, as YYYY-MM-DD.
export function todayDate() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
}

// The wall's hold and tape colours, in the order the colour pickers list them.
export const CLIMB_COLOURS = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Lime Green",
  "Blue",
  "Sea Foam",
  "Purple",
  "Pink",
  "Brown",
  "Grey",
  "Black",
  "White",
  "Multi-Colour",
  "Clear",
] as const;

// Everyone who sets on the wall: every setter named in local/TPASC Climbing
// Wall Routes.xlsx, plus Margad and Amy.
export const SETTERS = [
  "Aidan",
  "Alex",
  "Amy",
  "Aryan",
  "Denzil",
  "Josiah",
  "Jun",
  "Mae",
  "Margad",
  "Oscar",
  "Peter",
  "Sasha",
  "Thea",
  "Ujwal",
] as const;

// A climb set by more than one person is recorded as "Denzil/Alex".
export function climbSetters(climb: Pick<Climb, "setter">) {
  return climb.setter
    .split("/")
    .map((name) => name.trim())
    .filter(Boolean);
}

// CSS backgrounds, so multi-coloured holds can be a gradient. Colours off the
// list (older records, multi-colour tape) fall back to grey.
const SWATCHES: Record<(typeof CLIMB_COLOURS)[number], string> = {
  Red: "#ef4444",
  Orange: "#f97316",
  Yellow: "#eab308",
  Green: "#22c55e",
  "Lime Green": "#84cc16",
  Blue: "#3b82f6",
  "Sea Foam": "#5eead4",
  Purple: "#a855f7",
  Pink: "#ec4899",
  Brown: "#92400e",
  Grey: "#9ca3af",
  Black: "#171717",
  White: "#e5e5e5",
  "Multi-Colour": "conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)",
  Clear: "#ffffff",
};

export function swatchFor(colour: string) {
  return SWATCHES[colour as keyof typeof SWATCHES] ?? "#a3a3a3";
}

export function climbColour(climb: Pick<Climb, "colour" | "secondary">) {
  return climb.secondary ? `${climb.colour} / ${climb.secondary}` : climb.colour;
}

// How a climb is named in messages, e.g. "Blue 5.10a on line 1".
export function climbName(climb: Climb) {
  const where = climb.line === undefined ? "" : ` on line ${climb.line}`;
  return `${climbColour(climb)} ${climb.grade || CLIMB_TYPES[climb.type].toLowerCase()}${where}`;
}

// Parse as a local date so "2026-06-12" doesn't shift a day in UTC-minus zones.
export function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(date: string) {
  if (!date) return "—";
  return parseDate(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
