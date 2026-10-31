import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readSessionUser } from "../authUtils";
import { applyCommentChange } from "../climbStats";
import { readCommentFields, readPeople, toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Comment, COMMENT_CONTAINER, commentIDFor } from "../models/Comment";
import { Route, ROUTE_CONTAINER } from "../models/Route";

const PAGE_SIZE = 10;
// Far past any climb's comments, but a bound on how deep a page can start.
const MAX_OFFSET = 5000;

type StoredComment = Comment & { _etag: string };

function readOffset(request: HttpRequest) {
  const offset = Number(request.query.get("offset") ?? 0);
  return Number.isInteger(offset) && offset >= 0 && offset <= MAX_OFFSET ? offset : null;
}

function notLoggedIn(headers: Record<string, string>): HttpResponseInit {
  return { status: 401, headers, jsonBody: { error: "You need to be logged in to comment." } };
}

function noComment(headers: Record<string, string>): HttpResponseInit {
  return { status: 404, headers, jsonBody: { error: "You haven't commented on this climb yet." } };
}

function invalid(headers: Record<string, string>): HttpResponseInit {
  return {
    status: 400,
    headers,
    jsonBody: { error: "Write something, or mark a send, grade or rating - and keep it under 1000 characters." },
  };
}

// Their comment on the climb: the one-per-climb ID first (one point read),
// then the newest they left, for comments seeded before that rule.
async function findMyComment(routeID: string, userID: string): Promise<StoredComment | undefined> {
  const container = getContainer(COMMENT_CONTAINER);
  const commentID = commentIDFor(routeID, userID);
  const { resource } = await container.item(commentID, commentID).read<Comment>();
  if (resource) return resource;

  const { resources } = await container.items
    .query<StoredComment>({
      query: "SELECT TOP 1 * FROM c WHERE c.routeID = @routeID AND c.userID = @userID ORDER BY c.commentedAt DESC",
      parameters: [
        { name: "@routeID", value: routeID },
        { name: "@userID", value: userID },
      ],
    })
    .fetchAll();
  return resources[0];
}

// GET /routes/{routeID}/comments?offset= - a page of the climb's comments
// that have text, newest first, and whether there are more.
export async function getComments(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const offset = readOffset(request);
    if (offset === null) return { status: 400, headers, jsonBody: { error: "That isn't a valid page of comments." } };

    // One more than a page, to tell whether there's another after it.
    const { resources } = await getContainer(COMMENT_CONTAINER)
      .items.query<Comment>({
        query: `SELECT * FROM c WHERE c.routeID = @routeID AND c.comment != ""
          ORDER BY c.commentedAt DESC OFFSET @offset LIMIT @limit`,
        parameters: [
          { name: "@routeID", value: request.params.routeID },
          { name: "@offset", value: offset },
          { name: "@limit", value: PAGE_SIZE + 1 },
        ],
      })
      .fetchAll();

    const page = resources.slice(0, PAGE_SIZE);
    const people = await readPeople(page.map((comment) => comment.userID));
    return {
      status: 200,
      headers,
      jsonBody: {
        comments: page.map((comment) => toPublicComment(comment, people)),
        hasMore: resources.length > PAGE_SIZE,
      },
    };
  } catch (error) {
    context.error("Failed to fetch comments", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the comments." } };
  }
}

// GET /routes/{routeID}/comments/mine - the logged-in visitor's comment on
// the climb, or null when they haven't left one.
export async function getMyComment(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return notLoggedIn(headers);

    const mine = await findMyComment(request.params.routeID, session.userID);
    if (!mine) return { status: 200, headers, jsonBody: { comment: null } };

    const people = await readPeople([session.userID]);
    return { status: 200, headers, jsonBody: { comment: toPublicComment(mine, people) } };
  } catch (error) {
    context.error("Failed to fetch own comment", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load your comment." } };
  }
}

// POST /routes/{routeID}/comments/mine - leaves the visitor's one comment on
// the climb, if it's up. Its ID is fixed by who and where, so even two at once
// can't both be saved.
export async function createMyComment(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);
  const alreadyCommented: HttpResponseInit = {
    status: 409,
    headers,
    jsonBody: { error: "You've already commented on this climb - edit that one instead." },
  };

  try {
    const session = readSessionUser(request);
    if (!session) return notLoggedIn(headers);

    const fields = readCommentFields(await request.json().catch(() => null));
    if (!fields) return invalid(headers);

    const { routeID } = request.params;
    const { resource: route } = await getContainer(ROUTE_CONTAINER).item(routeID, routeID).read<Route>();
    if (!route) {
      return { status: 404, headers, jsonBody: { error: "That climb doesn't exist any more." } };
    }
    if (route.removedAt !== 0) {
      return { status: 403, headers, jsonBody: { error: "This climb has come down, so it isn't taking new comments." } };
    }
    if (await findMyComment(routeID, session.userID)) return alreadyCommented;

    const commentID = commentIDFor(routeID, session.userID);
    const comment: Comment = {
      id: commentID,
      commentID,
      userID: session.userID,
      routeID,
      commentedAt: new Date().toISOString(),
      ...fields,
    };
    try {
      await getContainer(COMMENT_CONTAINER).items.create(comment);
    } catch (error) {
      if ((error as { code?: number }).code === 409) return alreadyCommented;
      throw error;
    }

    await applyCommentChange(routeID, session.userID, null, comment, context);
    const people = await readPeople([session.userID]);
    return { status: 201, headers, jsonBody: { comment: toPublicComment(comment, people) } };
  } catch (error) {
    context.error("Failed to create comment", error);
    return { status: 500, headers, jsonBody: { error: "Failed to post your comment." } };
  }
}

// PUT /routes/{routeID}/comments/mine - replaces what the visitor's comment
// says, keeping when it was first posted.
export async function updateMyComment(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return notLoggedIn(headers);

    const fields = readCommentFields(await request.json().catch(() => null));
    if (!fields) return invalid(headers);

    const { routeID } = request.params;
    const existing = await findMyComment(routeID, session.userID);
    if (!existing) return noComment(headers);

    // Built afresh rather than spread from `existing`, so a cleared rating or
    // grade goes rather than lingering.
    const updated: Comment = {
      id: existing.id,
      commentID: existing.commentID,
      userID: existing.userID,
      routeID: existing.routeID,
      commentedAt: existing.commentedAt,
      editedAt: new Date().toISOString(),
      ...fields,
    };
    try {
      await getContainer(COMMENT_CONTAINER)
        .item(existing.id, existing.commentID)
        .replace(updated, { accessCondition: { type: "IfMatch", condition: existing._etag } });
    } catch (error) {
      if ((error as { code?: number }).code === 412) {
        return { status: 409, headers, jsonBody: { error: "Your comment changed somewhere else. Reload and try again." } };
      }
      throw error;
    }

    await applyCommentChange(routeID, session.userID, existing, updated, context);
    const people = await readPeople([session.userID]);
    return { status: 200, headers, jsonBody: { comment: toPublicComment(updated, people) } };
  } catch (error) {
    context.error("Failed to update comment", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save your comment." } };
  }
}

// DELETE /routes/{routeID}/comments/mine - takes the visitor's comment down,
// along with the send, grade and rating it counted towards.
export async function deleteMyComment(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return notLoggedIn(headers);

    const { routeID } = request.params;
    const existing = await findMyComment(routeID, session.userID);
    if (!existing) return noComment(headers);

    try {
      await getContainer(COMMENT_CONTAINER).item(existing.id, existing.commentID).delete();
    } catch (error) {
      // Gone already - nothing left to count down.
      if ((error as { code?: number }).code === 404) return { status: 204, headers };
      throw error;
    }

    await applyCommentChange(routeID, session.userID, existing, null, context);
    return { status: 204, headers };
  } catch (error) {
    context.error("Failed to delete comment", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete your comment." } };
  }
}

app.http("routeComments", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}/comments",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getComments(request, context);
  },
});

app.http("myRouteComment", {
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}/comments/mine",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    if (request.method === "POST") return createMyComment(request, context);
    if (request.method === "PUT") return updateMyComment(request, context);
    if (request.method === "DELETE") return deleteMyComment(request, context);
    return getMyComment(request, context);
  },
});