import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readCurrentUser } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { Flag, FLAG_CONTAINER, FLAG_REASONS, FlagReason, MAX_FLAG_DETAILS_LENGTH } from "../models/Flag";

// POST /flags { commentID, reason, details } - reports a comment for staff to
// look at. The climb and author come from the comment itself, not the
// request. Anyone logged in can flag someone else's comment - being timed out
// doesn't stop it - but only once while their flag on it is still open.
export async function createFlag(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { status: 401, headers, jsonBody: { error: "You need to be logged in to flag a comment." } };

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const { commentID, reason, details = "" } = body;
    if (typeof commentID !== "string" || !commentID) {
      return { status: 400, headers, jsonBody: { error: "Which comment is being flagged?" } };
    }
    if (!FLAG_REASONS.includes(reason as FlagReason)) {
      return { status: 400, headers, jsonBody: { error: "Choose why you're flagging it." } };
    }
    if (typeof details !== "string" || details.length > MAX_FLAG_DETAILS_LENGTH) {
      return {
        status: 400,
        headers,
        jsonBody: { error: `Keep the details under ${MAX_FLAG_DETAILS_LENGTH} characters.` },
      };
    }

    const { resource: comment } = await getContainer(COMMENT_CONTAINER).item(commentID, commentID).read<Comment>();
    if (!comment) return { status: 404, headers, jsonBody: { error: "That comment doesn't exist any more." } };
    if (comment.userID === user.userID) {
      return { status: 400, headers, jsonBody: { error: "You can't flag your own comment." } };
    }

    const container = getContainer(FLAG_CONTAINER);
    const { resources: open } = await container.items
      .query<number>({
        query: `SELECT VALUE COUNT(1) FROM c
                WHERE c.commentID = @commentID AND c.flaggerID = @flaggerID AND NOT IS_DEFINED(c.resolution)`,
        parameters: [
          { name: "@commentID", value: commentID },
          { name: "@flaggerID", value: user.userID },
        ],
      })
      .fetchAll();
    if ((open[0] ?? 0) > 0) {
      return { status: 409, headers, jsonBody: { error: "You've already flagged this comment - staff will look at it." } };
    }

    const flagID = randomUUID();
    const flag: Flag = {
      id: flagID,
      flagID,
      commentID,
      routeID: comment.routeID,
      flaggedUserID: comment.userID,
      flaggerID: user.userID,
      reason: reason as FlagReason,
      details: details.trim(),
      flaggedAt: new Date().toISOString(),
    };
    await container.items.create(flag);
    return { status: 201, headers, jsonBody: { flagID } };
  } catch (error) {
    context.error("Failed to flag a comment", error);
    return { status: 500, headers, jsonBody: { error: "Failed to send your report. Try again." } };
  }
}

app.http("flags", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "flags",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return createFlag(request, context);
  },
});
