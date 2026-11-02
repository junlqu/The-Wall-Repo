import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BulkOperationType, JSONObject, OperationInput } from "@azure/cosmos";
import { attendanceQuery, attendanceStartsQuery, attendanceYearsQuery, readAttendanceRecord } from "../attendanceFields";
import { corsHeaders, readSessionUser, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { ATTENDANCE_CONTAINER, ATTENDANCE_TYPES, AttendanceRecord, AttendanceType } from "../models/Attendance";
import { isDate } from "../routeFields";

const FORBIDDEN = "Only staff and admins can see and change attendance.";
// Ten years of weeks in one request, and still a bound on it.
const MAX_RECORDS = 520;

// GET /attendance?type=weekly&year=2026 - the recorded weeks or months
// overlapping a year, or all of them without a year. Both live in one container,
// told apart by `type`. Admin-only, since it includes earnings.
export async function getAttendance(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const type = request.query.get("type");
    if (!ATTENDANCE_TYPES.includes(type as AttendanceType)) {
      return { status: 400, headers, jsonBody: { error: "Ask for weekly or monthly attendance." } };
    }

    const year = request.query.get("year") ?? undefined;
    if (year !== undefined && !/^\d{4}$/.test(year)) {
      return { status: 400, headers, jsonBody: { error: "That isn't a year." } };
    }

    const { resources } = await getContainer(ATTENDANCE_CONTAINER)
      .items.query(attendanceQuery(type as AttendanceType, year))
      .fetchAll();
    return { status: 200, headers, jsonBody: resources };
  } catch (error) {
    context.error("Failed to fetch attendance", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load attendance." } };
  }
}

// GET /attendance/years?type=weekly - which years have records, and how many.
// Admin-only.
export async function getAttendanceYears(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const type = request.query.get("type");
    if (!ATTENDANCE_TYPES.includes(type as AttendanceType)) {
      return { status: 400, headers, jsonBody: { error: "Ask for weekly or monthly attendance." } };
    }

    const { resources } = await getContainer(ATTENDANCE_CONTAINER)
      .items.query(attendanceYearsQuery(type as AttendanceType))
      .fetchAll();
    return { status: 200, headers, jsonBody: resources };
  } catch (error) {
    context.error("Failed to fetch attendance years", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load attendance." } };
  }
}

// GET /attendance/starts?type=monthly&from=2026-05-01 - the start dates of the
// records from a date on, which is all it takes to see which are missing.
// Admin-only.
export async function getAttendanceStarts(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const type = request.query.get("type");
    if (!ATTENDANCE_TYPES.includes(type as AttendanceType)) {
      return { status: 400, headers, jsonBody: { error: "Ask for weekly or monthly attendance." } };
    }
    const from = request.query.get("from");
    if (!isDate(from)) {
      return { status: 400, headers, jsonBody: { error: "That isn't a date." } };
    }

    const { resources } = await getContainer(ATTENDANCE_CONTAINER)
      .items.query(attendanceStartsQuery(type as AttendanceType, from))
      .fetchAll();
    return { status: 200, headers, jsonBody: resources };
  } catch (error) {
    context.error("Failed to fetch attendance starts", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load attendance." } };
  }
}

// PUT /attendance - saves whole weeks or months, replacing what was recorded
// for them. Used by both the weekly form (one week) and the import. Admin-only.
// Every record is checked before anything is written.
export async function saveAttendance(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { records } = (await request.json()) as { records?: unknown };
    if (!Array.isArray(records) || records.length === 0) {
      return { status: 400, headers, jsonBody: { error: "There's no attendance to save." } };
    }
    if (records.length > MAX_RECORDS) {
      return { status: 413, headers, jsonBody: { error: `At most ${MAX_RECORDS} records can be saved at once.` } };
    }

    const updatedBy = readSessionUser(request)!.username;
    const updatedAt = new Date().toISOString();
    const read = records.map((record) => readAttendanceRecord(record, updatedBy, updatedAt));
    const invalid = read.findIndex((record) => record === null);
    if (invalid !== -1) {
      return { status: 400, headers, jsonBody: { error: `Record ${invalid + 1} is missing or has invalid details.` } };
    }

    const operations: OperationInput[] = (read as AttendanceRecord[]).map((record) => ({
      operationType: BulkOperationType.Upsert,
      partitionKey: record.attendanceID,
      resourceBody: record as unknown as JSONObject,
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

// DELETE /attendance/{attendanceID} - removes one week or month. Admin-only.
export async function deleteAttendance(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { attendanceID } = request.params;
    await getContainer(ATTENDANCE_CONTAINER).item(attendanceID, attendanceID).delete();
    return { status: 204, headers };
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      return { status: 404, headers, jsonBody: { error: "That attendance doesn't exist any more." } };
    }
    context.error("Failed to delete attendance", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete the attendance." } };
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

app.http("attendanceYears", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "attendance/years",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getAttendanceYears(request, context);
  },
});

app.http("attendanceStarts", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "attendance/starts",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getAttendanceStarts(request, context);
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
