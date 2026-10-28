import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { Route, ROUTE_CONTAINER } from "../models/Route";
import { isLeadable, readRouteFields } from "../routeFields";

export async function getRoutes(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const container = getContainer(ROUTE_CONTAINER);
    const { resources } = await container.items
      .query("SELECT * FROM c")
      .fetchAll();

    return {
      status: 200,
      headers,
      jsonBody: resources,
    };
  } catch (error) {
    context.error("Failed to fetch routes", error);
    return {
      status: 500,
      headers,
      jsonBody: { error: "Failed to fetch routes" },
    };
  }
}

// POST /routes - adds one climb, up on the wall from its set date. Admin-only.
export async function createRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers);
    if (rejection) return rejection;

    const body = (await request.json()) as { leadable?: unknown };
    const fields = readRouteFields(body);
    if (!fields || !isLeadable(body.leadable)) {
      return { status: 400, headers, jsonBody: { error: "Some of the climb's details are missing or invalid." } };
    }

    const routeID = randomUUID();
    const route: Route = { id: routeID, routeID, ...fields, removedAt: 0, leadable: body.leadable, ascents: [], comments: 0, rating: { total: 0, count: 0 } };
    const { resource } = await getContainer(ROUTE_CONTAINER).items.create(route);
    return { status: 201, headers, jsonBody: resource };
  } catch (error) {
    context.error("Failed to create route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to add the climb." } };
  }
}

app.http("routes", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return request.method === "POST" ? createRoute(request, context) : getRoutes(request, context);
  },
});
