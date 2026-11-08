import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readCurrentUser, rejectUnlessAdmin } from "../authUtils";
import { readClimbs } from "../climbLinks";
import { applyCommentChange } from "../climbStats";
import { isNotFound, readPeople, toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { ROUTE_CONTAINER, ROUTE_LINES } from "../models/Route";
import { User, USER_CONTAINER, USER_LEVEL } from "../models/User";

const FORBIDDEN = "Only staff and admins can moderate comments.";
// Mirrors MODERATION_PAGE_SIZES in website/src/lib/moderation.ts.
const PAGE_SIZES = [10, 25, 50];
const MAX_SEARCH_LENGTH = 64;
// Mirrors MAX_COMMENT_LENGTH in commentFields.ts.
const MAX_COMMENT_LENGTH = 1000;

type StoredComment = Comment & { _etag: string };

// A list of IDs as a Cosmos IN list. They come from the database, not the
// request, and go in as JSON strings, which are Cosmos string literals.
function inList(ids: string[]) {
  return `(${ids.map((id) => JSON.stringify(id)).join(", ")})`;
}

// The userIDs whose username contains `search`, ignoring case.
async function matchingUsers(search: string): Promise<string[]> {
  const { resources } = await getContainer(USER_CONTAINER)
    .items.query<string>({
      query: "SELECT VALUE c.userID FROM c WHERE CONTAINS(c.username, @search, true)",
      parameters: [{ name: "@search", value: search }],
    })
    .fetchAll();
  return resources;
}

// The routeIDs of every climb - up or come down - on `line`, in `colour`
// (either colour of a combo or buddy climb) and at `grade`, each only when
// given.
async function matchingClimbs(line: number | null, colour: string, grade: string): Promise<string[]> {
  const conditions: string[] = [];
  if (line !== null) conditions.push("c.line = @line");
  if (colour) conditions.push("(c.colour = @colour OR c.secondary = @colour)");
  if (grade) conditions.push("c.proposedGrade = @grade");
  const { resources } = await getContainer(ROUTE_CONTAINER)
    .items.query<string>({
      query: `SELECT VALUE c.routeID FROM c WHERE ${conditions.join(" AND ")}`,
      parameters: [
        { name: "@line", value: line },
        { name: "@colour", value: colour },
        { name: "@grade", value: grade },
      ],
    })
    .fetchAll();
  return resources;
}

function readText(request: HttpRequest, name: string) {
  return (request.query.get(name) ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

// GET /moderation/comments?user=&line=&colour=&grade=&page=&pageSize= - one
// page of every comment with text, newest first, each with who wrote it and
// its climb (null if that's gone), and how many there are in all. `user`
// keeps those by people whose username contains it; `line`, `colour` and
// `grade` keep those on climbs that match. Any left out don't filter.
export async function listModerationComments(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const requestedSize = Number(request.query.get("pageSize"));
    const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : PAGE_SIZES[0];
    const page = Math.max(1, Math.floor(Number(request.query.get("page")) || 1));
    const user = readText(request, "user");
    const colour = readText(request, "colour");
    const grade = readText(request, "grade");
    const lineParam = request.query.get("line");
    const line = lineParam ? Number(lineParam) : null;
    if (line !== null && !ROUTE_LINES.includes(line as (typeof ROUTE_LINES)[number])) {
      return { status: 400, headers, jsonBody: { error: "That isn't a line on the wall." } };
    }

    const empty = { status: 200, headers, jsonBody: { total: 0, page, pageSize, comments: [] } };
    const conditions = ['c.comment != ""'];
    if (user) {
      const userIDs = await matchingUsers(user);
      if (userIDs.length === 0) return empty;
      conditions.push(`c.userID IN ${inList(userIDs)}`);
    }
    if (line !== null || colour || grade) {
      const routeIDs = await matchingClimbs(line, colour, grade);
      if (routeIDs.length === 0) return empty;
      conditions.push(`c.routeID IN ${inList(routeIDs)}`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const container = getContainer(COMMENT_CONTAINER);
    let total: number;
    let comments: Comment[];
    try {
      const [{ resources: counts }, { resources }] = await Promise.all([
        container.items.query<number>(`SELECT VALUE COUNT(1) FROM c ${where}`).fetchAll(),
        container.items
          .query<Comment>({
            query: `SELECT * FROM c ${where} ORDER BY c.commentedAt DESC OFFSET @offset LIMIT @limit`,
            parameters: [
              { name: "@offset", value: (page - 1) * pageSize },
              { name: "@limit", value: pageSize },
            ],
          })
          .fetchAll(),
      ]);
      total = counts[0] ?? 0;
      comments = resources;
    } catch (error) {
      // The container may not exist until comments can be posted.
      if (isNotFound(error)) return empty;
      throw error;
    }

    const [people, climbs] = await Promise.all([
      readPeople(comments.map((comment) => comment.userID)),
      readClimbs([...new Set(comments.map((comment) => comment.routeID))]),
    ]);
    return {
      status: 200,
      headers,
      jsonBody: {
        total,
        page,
        pageSize,
        comments: comments.map((comment) => ({
          // So the author's account can be opened even when it's been deleted.
          userID: comment.userID,
          comment: toPublicComment(comment, people),
          climb: climbs.get(comment.routeID) ?? null,
        })),
      },
    };
  } catch (error) {
    context.error("Failed to list comments for moderation", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the comments." } };
  }
}

// The comment, and why `actor` can't change it, if they can't: as with
// accounts, only comments by people below your own level - or your own.
async function readModeratable(
  commentID: string,
  actor: User,
): Promise<{ comment: StoredComment } | { status: number; error: string }> {
  const { resource: comment } = await getContainer(COMMENT_CONTAINER).item(commentID, commentID).read<StoredComment>();
  if (!comment) return { status: 404, error: "That comment doesn't exist any more." };
  if (comment.userID !== actor.userID) {
    const { resource: author } = await getContainer(USER_CONTAINER).item(comment.userID, comment.userID).read<User>();
    if ((author?.level ?? USER_LEVEL.member) >= actor.level) {
      return { status: 403, error: "You can only moderate comments by people below your own level." };
    }
  }
  return { comment };
}

// PUT /moderation/comments/{commentID} { comment } - changes what a comment
// says, keeping its send, grade and rating. It can only be cleared when it
// has one of those left - otherwise delete it. Marked as edited, and by whom.
export async function updateModerationComment(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;
    const actor = (await readCurrentUser(request))!;

    const body = ((await request.json().catch(() => null)) ?? {}) as { comment?: unknown };
    if (typeof body.comment !== "string" || body.comment.length > MAX_COMMENT_LENGTH) {
      return { status: 400, headers, jsonBody: { error: `Keep it under ${MAX_COMMENT_LENGTH} characters.` } };
    }
    const text = body.comment.trim();

    const found = await readModeratable(request.params.commentID, actor);
    if ("error" in found) return { status: found.status, headers, jsonBody: { error: found.error } };
    const { comment: existing } = found;
    if (!text && !existing.send && !existing.grade && existing.rating === undefined) {
      return {
        status: 400,
        headers,
        jsonBody: { error: "It has no send, grade or rating to keep, so delete it instead of clearing it." },
      };
    }

    const { _etag, ...rest } = existing;
    const updated: Comment = { ...rest, comment: text, editedAt: new Date().toISOString(), moderatedBy: actor.userID };
    try {
      await getContainer(COMMENT_CONTAINER)
        .item(existing.id, existing.commentID)
        .replace(updated, { accessCondition: { type: "IfMatch", condition: _etag } });
    } catch (error) {
      if ((error as { code?: number }).code === 412) {
        return { status: 409, headers, jsonBody: { error: "The comment changed while saving - refresh and try again." } };
      }
      throw error;
    }

    // Only the text changed, so this only moves the climb's comment count
    // when it's been cleared.
    await applyCommentChange(existing.routeID, existing.userID, existing, updated, context);
    const people = await readPeople([existing.userID]);
    return { status: 200, headers, jsonBody: { comment: toPublicComment(updated, people) } };
  } catch (error) {
    context.error("Failed to moderate a comment", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save the comment." } };
  }
}

// DELETE /moderation/comments/{commentID} - takes a comment down for its
// author, along with the send, grade and rating it counted towards, as if
// they'd deleted it themselves.
export async function deleteModerationComment(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;
    const actor = (await readCurrentUser(request))!;

    const found = await readModeratable(request.params.commentID, actor);
    if ("error" in found) {
      // Gone already - nothing left to do.
      if (found.status === 404) return { status: 204, headers };
      return { status: found.status, headers, jsonBody: { error: found.error } };
    }
    const { comment: existing } = found;

    try {
      await getContainer(COMMENT_CONTAINER)
        .item(existing.id, existing.commentID)
        .delete({ accessCondition: { type: "IfMatch", condition: existing._etag } });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 404) return { status: 204, headers };
      if (code === 412) {
        return { status: 409, headers, jsonBody: { error: "The comment changed while deleting - refresh and try again." } };
      }
      throw error;
    }

    await applyCommentChange(existing.routeID, existing.userID, existing, null, context);
    return { status: 204, headers };
  } catch (error) {
    context.error("Failed to delete a comment for moderation", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete the comment." } };
  }
}

app.http("moderationComments", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "moderation/comments",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return listModerationComments(request, context);
  },
});

app.http("moderationCommentItem", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "moderation/comments/{commentID}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return request.method === "DELETE"
      ? deleteModerationComment(request, context)
      : updateModerationComment(request, context);
  },
});
