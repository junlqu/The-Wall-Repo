import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { BulkOperationType, JSONObject, OperationInput, PatchOperation } from "@azure/cosmos";
import { corsHeaders, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { Route, ROUTE_CONTAINER } from "../models/Route";
import { isDate, isFilledText, isText, readRouteFields } from "../routeFields";

// Well past the wall's whole history in one spreadsheet, but still a bound on
// what one request can write.
const MAX_CHANGES = 5000;

type ClimbStatus = "active" | "past";

// Shapes match website/src/lib/climbImport.ts (saveClimbImport).
type ImportBody = {
  add?: unknown;
  update?: unknown;
};

function isStatus(value: unknown): value is ClimbStatus {
  return value === "active" || value === "past";
}

// A past climb keeps its retirement date when the sheet has one (the site's
// own export does; the original spreadsheet doesn't), otherwise it's unknown.
function removedAtFor(status: ClimbStatus, removedAt: string | undefined) {
  return status === "active" ? 0 : (removedAt ?? null);
}

function readRemovedAt(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  return isDate(value) ? value : false;
}

function toNewRoute(value: unknown): Route | null {
  const fields = readRouteFields(value);
  const { status, removedAt: rawRemovedAt } = value as Record<string, unknown>;
  const removedAt = readRemovedAt(rawRemovedAt);
  if (!fields || !isStatus(status) || removedAt === false) return null;

  const routeID = randomUUID();
  return {
    id: routeID,
    routeID,
    ...fields,
    removedAt: removedAtFor(status, removedAt),
    leadable: fields.type === "boulder" ? "No" : "?",
    ascents: [],
    follows: [],
    comments: 0,
    rating: { total: 0, count: 0 },
  };
}

function toRoutePatch(value: unknown): { routeID: string; operations: PatchOperation[] } | null {
  if (typeof value !== "object" || value === null) return null;
  const { routeID, grade, setter, status, removedAt: rawRemovedAt } = value as Record<string, unknown>;
  const removedAt = readRemovedAt(rawRemovedAt);
  if (!isFilledText(routeID) || removedAt === false) return null;

  const operations: PatchOperation[] = [];
  if (grade !== undefined) {
    if (!isText(grade)) return null;
    operations.push({ op: "set", path: "/proposedGrade", value: grade.trim() });
  }
  if (setter !== undefined) {
    if (!isText(setter)) return null;
    operations.push({ op: "set", path: "/setter", value: setter.trim() });
  }
  if (status !== undefined) {
    if (!isStatus(status)) return null;
    operations.push({ op: "set", path: "/removedAt", value: removedAtFor(status, removedAt) });
  } else if (removedAt !== undefined) {
    // Only a new retirement date for a climb that was already down.
    operations.push({ op: "set", path: "/removedAt", value: removedAt });
  }
  return operations.length > 0 ? { routeID, operations } : null;
}

// Admin-only. Every row is checked before anything is written, so a bad row
// rejects the whole import rather than leaving half of it saved.
export async function importRoutes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers);
    if (rejection) return rejection;

    const body = (await request.json()) as ImportBody;
    const add = body.add ?? [];
    const update = body.update ?? [];
    if (!Array.isArray(add) || !Array.isArray(update)) {
      return { status: 400, headers, jsonBody: { error: "Expected lists of climbs to add and update." } };
    }
    if (add.length + update.length === 0) {
      return { status: 400, headers, jsonBody: { error: "There's nothing to import." } };
    }
    if (add.length + update.length > MAX_CHANGES) {
      return { status: 413, headers, jsonBody: { error: `An import can change at most ${MAX_CHANGES} climbs.` } };
    }

    const routes = add.map(toNewRoute);
    const invalidAdd = routes.findIndex((route) => route === null);
    if (invalidAdd !== -1) {
      return { status: 400, headers, jsonBody: { error: `New climb ${invalidAdd + 1} is missing or has invalid details.` } };
    }
    const patches = update.map(toRoutePatch);
    const invalidUpdate = patches.findIndex((patch) => patch === null);
    if (invalidUpdate !== -1) {
      return { status: 400, headers, jsonBody: { error: `Edit ${invalidUpdate + 1} is missing or has invalid details.` } };
    }

    const operations: OperationInput[] = [
      ...routes.map((route) => ({
        operationType: BulkOperationType.Create,
        // executeBulkOperations won't read the key out of the body itself.
        partitionKey: route!.routeID,
        // Cosmos drops the undefined optional fields when it serialises.
        resourceBody: route as unknown as JSONObject,
      })),
      ...patches.map((patch) => ({
        operationType: BulkOperationType.Patch,
        id: patch!.routeID,
        partitionKey: patch!.routeID,
        resourceBody: { operations: patch!.operations },
      })),
    ];
    const results = await getContainer(ROUTE_CONTAINER).items.executeBulkOperations(operations);

    let added = 0;
    let updated = 0;
    let failed = 0;
    results.forEach((result, index) => {
      const statusCode = result.response?.statusCode ?? 500;
      if (result.error || statusCode >= 400) {
        failed++;
        context.warn("Climb import operation failed", result.operationInput.operationType, statusCode, result.error);
      } else if (index < routes.length) {
        added++;
      } else {
        updated++;
      }
    });

    return { status: 200, headers, jsonBody: { added, updated, failed } };
  } catch (error) {
    context.error("Failed to import routes", error);
    return { status: 500, headers, jsonBody: { error: "Failed to import climbs." } };
  }
}

app.http("importRoutes", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/import",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return importRoutes(request, context);
  },
});
