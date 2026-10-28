import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { Route, ROUTE_CONTAINER } from "../models/Route";
import { isDate, isLeadable, readRouteFields } from "../routeFields";

function isNotFound(error: unknown) {
  return (error as { code?: number }).code === 404;
}

function notFound(headers: Record<string, string>): HttpResponseInit {
  return { status: 404, headers, jsonBody: { error: "That climb doesn't exist any more." } };
}

// GET /routes/{routeID} - one climb, for its own page.
export async function getRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const { resource } = await getContainer(ROUTE_CONTAINER)
      .item(request.params.routeID, request.params.routeID)
      .read<Route>();
    if (!resource) return notFound(headers);
    return { status: 200, headers, jsonBody: resource };
  } catch (error) {
    context.error("Failed to fetch route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the climb." } };
  }
}

// PUT /routes/{routeID} - replaces the climb's details. Its type, ascents,
// comment count, rating and whether it's up or down are left alone.
export async function updateRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers);
    if (rejection) return rejection;

    const item = getContainer(ROUTE_CONTAINER).item(request.params.routeID, request.params.routeID);
    const { resource: existing } = await item.read<Route>();
    if (!existing) return notFound(headers);

    // A climb can't change type, so the details are checked against the type
    // it already has - whatever the request says.
    const body = (await request.json()) as Record<string, unknown>;
    const fields = readRouteFields({ ...body, type: existing.type ?? "route" });
    if (!fields || !isLeadable(body.leadable)) {
      return { status: 400, headers, jsonBody: { error: "Some of the climb's details are missing or invalid." } };
    }

    // Optional details left out of the edit come through as undefined, so a
    // cleared tape or line is dropped from the document rather than kept.
    // Only saved if nothing else changed it since it was read, so a send,
    // comment or rating counted in between isn't written over.
    const { resource: updated } = await item.replace<Route>(
      { ...existing, ...fields, leadable: body.leadable },
      { accessCondition: { type: "IfMatch", condition: existing._etag } }
    );
    return { status: 200, headers, jsonBody: updated };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: "The climb changed while you were editing it. Try saving again." } };
    }
    context.error("Failed to update route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save the climb." } };
  }
}

// DELETE /routes/{routeID}
export async function deleteRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers);
    if (rejection) return rejection;

    await getContainer(ROUTE_CONTAINER).item(request.params.routeID, request.params.routeID).delete();
    return { status: 204, headers };
  } catch (error) {
    if (isNotFound(error)) return notFound(headers);
    context.error("Failed to delete route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete the climb." } };
  }
}

// POST /routes/{routeID}/archive - takes the climb down. `removedAt` is the
// date it came down; leaving it out (or null) archives it with the date
// unrecorded.
export async function archiveRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers);
    if (rejection) return rejection;

    const body = (await request.json()) as { removedAt?: unknown };
    const removedAt = body.removedAt ?? null;
    if (removedAt !== null && !isDate(removedAt)) {
      return { status: 400, headers, jsonBody: { error: "The retirement date isn't a valid date." } };
    }

    const { resource: updated } = await getContainer(ROUTE_CONTAINER)
      .item(request.params.routeID, request.params.routeID)
      .patch<Route>([{ op: "set", path: "/removedAt", value: removedAt }]);
    return { status: 200, headers, jsonBody: updated };
  } catch (error) {
    if (isNotFound(error)) return notFound(headers);
    context.error("Failed to archive route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to archive the climb." } };
  }
}

// POST /routes/{routeID}/restore - puts an archived climb back up, clearing
// its retirement date.
export async function restoreRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers);
    if (rejection) return rejection;

    const { resource: updated } = await getContainer(ROUTE_CONTAINER)
      .item(request.params.routeID, request.params.routeID)
      .patch<Route>([{ op: "set", path: "/removedAt", value: 0 }]);
    return { status: 200, headers, jsonBody: updated };
  } catch (error) {
    if (isNotFound(error)) return notFound(headers);
    context.error("Failed to restore route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to restore the climb." } };
  }
}

app.http("routeItem", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    if (request.method === "GET") return getRoute(request, context);
    return request.method === "DELETE" ? deleteRoute(request, context) : updateRoute(request, context);
  },
});

app.http("archiveRoute", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}/archive",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return archiveRoute(request, context);
  },
});

app.http("restoreRoute", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}/restore",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return restoreRoute(request, context);
  },
});
