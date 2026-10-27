import { CLIMB_TYPES, ClimbType, LEADABLE, Leadable, Route, ROUTE_LINES, RouteLine } from "./models/Route";

const MAX_TEXT_LENGTH = 128;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The details that describe a climb, as imports and edits send them. The
// website calls the grade `grade`; it's stored as `proposedGrade`.
export type RouteFields = Pick<Route, "type" | "colour" | "secondary" | "tape" | "line" | "proposedGrade" | "setter" | "setAt">;

export function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

export function isFilledText(value: unknown): value is string {
  return isText(value) && value.trim() !== "";
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_PATTERN.test(value);
}

export function isLeadable(value: unknown): value is Leadable {
  return LEADABLE.includes(value as Leadable);
}

// Checks and tidies a climb's details, or returns null if any are missing or
// malformed.
export function readRouteFields(value: unknown): RouteFields | null {
  if (typeof value !== "object" || value === null) return null;
  const { type, colour, secondary, tape, line, grade, setter, setAt } = value as Record<string, unknown>;

  if (!CLIMB_TYPES.includes(type as ClimbType)) return null;
  if (!isFilledText(colour) || !isText(grade) || !isText(setter)) return null;
  // Blank grades, setters and dates are allowed - old records are patchy.
  if (setAt !== "" && !isDate(setAt)) return null;
  if (tape !== undefined && (type !== "boulder" || !isFilledText(tape))) return null;
  if (secondary !== undefined && (type !== "combo" || !isFilledText(secondary))) return null;
  // Boulders aren't on a line; routes and combos must be.
  if (type === "boulder" ? line !== undefined : !ROUTE_LINES.includes(line as RouteLine)) return null;

  return {
    type: type as ClimbType,
    colour: colour.trim(),
    secondary: secondary?.trim(),
    tape: tape?.trim(),
    line: line as RouteLine | undefined,
    proposedGrade: grade.trim(),
    setter: setter.trim(),
    setAt: setAt as string,
  };
}
