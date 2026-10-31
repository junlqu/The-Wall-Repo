import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readSessionUser } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { COMMENT_CONTAINER } from "../models/Comment";
import { Route, ROUTE_CONTAINER } from "../models/Route";

// GET /archives - the climbs that have come down that the logged-in visitor
// left a comment on, including one that only sent, graded or rated it. A climb
// that's down has a removal date, or null when nobody recorded it.
export async function getMyArchive(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return { status: 401, headers, jsonBody: { error: "You need to be logged in." } };

    const { resources: routeIDs } = await getContainer(COMMENT_CONTAINER)
      .items.query<string>({
        query: "SELECT DISTINCT VALUE c.routeID FROM c WHERE c.userID = @userID",
        parameters: [{ name: "@userID", value: session.userID }],
      })
      .fetchAll();
    if (routeIDs.length === 0) return { status: 200, headers, jsonBody: [] };

    const { resources: routes } = await getContainer(ROUTE_CONTAINER)
      .items.query<Route>({
        query: `SELECT * FROM c WHERE ARRAY_CONTAINS(@routeIDs, c.routeID)
                AND (IS_STRING(c.removedAt) OR IS_NULL(c.removedAt))`,
        parameters: [{ name: "@routeIDs", value: routeIDs }],
      })
      .fetchAll();
    return { status: 200, headers, jsonBody: routes };
  } catch (error) {
    context.error("Failed to load the archive", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load your archive." } };
  }
}

app.http("archives", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "archives",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getMyArchive(request, context);
  },
});
