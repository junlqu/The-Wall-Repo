import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders } from "../authUtils";
import { isNotFound, readPeople, toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { Route, ROUTE_CONTAINER } from "../models/Route";

const RECENT_COMMENTS = 3;

// The newest comments on a climb. Comments are partitioned by their own ID,
// so this looks across every partition - fine for one climb, but not
// something to run for every climb at once.
async function recentComments(routeID: string): Promise<Comment[]> {
  try {
    const { resources } = await getContainer(COMMENT_CONTAINER)
      .items.query<Comment>({
        query: "SELECT TOP @limit * FROM c WHERE c.routeID = @routeID ORDER BY c.commentedAt DESC",
        parameters: [
          { name: "@limit", value: RECENT_COMMENTS },
          { name: "@routeID", value: routeID },
        ],
      })
      .fetchAll();
    return resources;
  } catch (error) {
    // The container may not exist until comments can be posted.
    if (isNotFound(error)) return [];
    throw error;
  }
}

// GET /routes/{routeID}/activity - the climb's newest comments and who sent
// it last. `lastSend` is null when nobody has, or their account is gone.
export async function getRouteActivity(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const { routeID } = request.params;
    const [{ resource: route }, comments] = await Promise.all([
      getContainer(ROUTE_CONTAINER).item(routeID, routeID).read<Route>(),
      recentComments(routeID),
    ]);
    if (!route) return { status: 404, headers, jsonBody: { error: "That climb doesn't exist any more." } };

    // Ascents are kept in the order they were sent.
    const ascents = route.ascents ?? [];
    const lastSender = ascents.length > 0 ? ascents[ascents.length - 1] : undefined;
    const people = await readPeople([...comments.map((comment) => comment.userID), ...(lastSender ? [lastSender] : [])]);

    return {
      status: 200,
      headers,
      jsonBody: {
        comments: comments.map((comment) => toPublicComment(comment, people)),
        lastSend: (lastSender && people.get(lastSender)) ?? null,
      },
    };
  } catch (error) {
    context.error("Failed to fetch route activity", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the climb's comments and sends." } };
  }
}

app.http("routeActivity", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}/activity",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getRouteActivity(request, context);
  },
});
