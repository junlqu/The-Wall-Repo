import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BulkOperationType, JSONObject, OperationInput } from "@azure/cosmos";
import { corsHeaders, readSessionUser, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import {
  ATTENDANCE_COLUMN_KEYS,
  ATTENDANCE_CONTAINER,
  AttendanceColumnKey,
  AttendanceCounts,
  AttendanceDay,
  AttendanceWeek,
} from "../models/Attendance";
import { isDate } from "../routeFields";

const FORBIDDEN = "Only admins can see and change attendance.";
// Ten years of weeks in one import, and still a bound on one request.
const MAX_WEEKS = 520;
// Far more than fit on the wall in an hour - anything bigger is a typo.
const MAX_COUNT = 999;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT;
}

function utcDay(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function readCounts(value: unknown): AttendanceCounts | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const counts: AttendanceCounts = {};
  for (const [key, count] of Object.entries(value)) {
    if (!ATTENDANCE_COLUMN_KEYS.includes(key as AttendanceColumnKey) || !isCount(count)) return null;
    if (count > 0) counts[key as AttendanceColumnKey] = count;
  }
  return counts;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDay(value: unknown): AttendanceDay | null {
  if (!isObject(value)) return null;
  const { hours, turnedAway } = value;
  if (!isCount(turnedAway) || !isObject(hours)) return null;

  const readHours: AttendanceDay["hours"] = {};
  for (const [hour, counts] of Object.entries(hours)) {
    const start = Number(hour);
    const read = readCounts(counts);
    if (!/^\d{1,2}$/.test(hour) || start > 23 || !read) return null;
    readHours[String(start)] = read;
  }
  return { hours: readHours, turnedAway };
}

// A week runs Saturday to Friday, and every day in its attendance must fall
// inside it.
function readWeek(value: unknown, updatedBy: string, updatedAt: string): AttendanceWeek | null {
  if (!isObject(value)) return null;
  const { startDay, endDay, attendance } = value;
  if (!isDate(endDay) || new Date(utcDay(endDay)).getUTCDay() !== FRIDAY) return null;
  if (!isDate(startDay) || utcDay(endDay) - utcDay(startDay) !== 6 * ONE_DAY_MS) return null;
  if (!isObject(attendance)) return null;

  const days: AttendanceWeek["attendance"] = {};
  for (const date of Object.keys(attendance).sort()) {
    const day = readDay(attendance[date]);
    if (!isDate(date) || date < startDay || date > endDay || !day) return null;
    days[date] = day;
  }
  return { id: endDay, attendanceID: endDay, startDay, endDay, attendance: days, updatedAt, updatedBy };
}

// GET /attendance - every recorded week. Admin-only, since it includes earnings.
export async function getAttendance(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { resources } = await getContainer(ATTENDANCE_CONTAINER).items.query("SELECT * FROM c").fetchAll();
    return { status: 200, headers, jsonBody: resources };
  } catch (error) {
    context.error("Failed to fetch attendance", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load attendance." } };
  }
}

// PUT /attendance - saves whole weeks, replacing what was recorded for them.
// Used by both the weekly form (one week) and the import (many). Admin-only.
// Every week is checked before anything is written.
export async function saveAttendance(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { weeks } = (await request.json()) as { weeks?: unknown };
    if (!Array.isArray(weeks) || weeks.length === 0) {
      return { status: 400, headers, jsonBody: { error: "There's no attendance to save." } };
    }
    if (weeks.length > MAX_WEEKS) {
      return { status: 413, headers, jsonBody: { error: `At most ${MAX_WEEKS} weeks can be saved at once.` } };
    }

    const updatedBy = readSessionUser(request)!.username;
    const updatedAt = new Date().toISOString();
    const read = weeks.map((week) => readWeek(week, updatedBy, updatedAt));
    const invalid = read.findIndex((week) => week === null);
    if (invalid !== -1) {
      return { status: 400, headers, jsonBody: { error: `Week ${invalid + 1} is missing or has invalid details.` } };
    }

    const operations: OperationInput[] = (read as AttendanceWeek[]).map((week) => ({
      operationType: BulkOperationType.Upsert,
      partitionKey: week.attendanceID,
      resourceBody: week as unknown as JSONObject,
    }));
    const results = await getContainer(ATTENDANCE_CONTAINER).items.executeBulkOperations(operations);

    let failed = 0;
    for (const result of results) {
      const statusCode = result.response?.statusCode ?? 500;
      if (result.error || statusCode >= 400) {
        failed++;
        context.warn("Attendance save operation failed", statusCode, result.error);
      }
    }

    return { status: 200, headers, jsonBody: { saved: results.length - failed, failed } };
  } catch (error) {
    context.error("Failed to save attendance", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save attendance." } };
  }
}

// DELETE /attendance/{attendanceID} - removes one week. Admin-only.
export async function deleteAttendance(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { attendanceID } = request.params;
    await getContainer(ATTENDANCE_CONTAINER).item(attendanceID, attendanceID).delete();
    return { status: 204, headers };
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return { status: 404, headers, jsonBody: { error: "That week doesn't exist any more." } };
    }
    context.error("Failed to delete attendance", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete the week." } };
  }
}

app.http("attendance", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "attendance",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return request.method === "PUT" ? saveAttendance(request, context) : getAttendance(request, context);
  },
});

app.http("attendanceItem", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "attendance/{attendanceID}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return deleteAttendance(request, context);
  },
});
