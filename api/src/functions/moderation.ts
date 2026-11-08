import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, rejectUnlessAdmin } from "../authUtils";
import { isNotFound, readPeople, toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { CLIMB_TYPES, ClimbType, Route, ROUTE_CONTAINER } from "../models/Route";

const FORBIDDEN = "Only staff and admins can see moderation reports.";

// How many comments proposed each grade on each climb. Mirrors GradeTally in
// website/src/lib/moderation.ts.
type GradeTally = { routeID: string; grade: string; count: number };

// What the grading reports show of a climb - only what the page's toClimb
// needs to draw its colour and grade and sort it.
const REPORT_FIELDS = ["routeID", "type", "colour", "secondary", "tape", "line", "proposedGrade", "setAt", "removedAt"];

// Climbs from before there were types are routes, as on the page.
const TYPE_FILTERS: Record<ClimbType, string> = {
  route: '(c.type = "route" OR NOT IS_DEFINED(c.type))',
  boulder: 'c.type = "boulder"',
  combo: 'c.type = "combo"',
};

// Each grade the comments on `routeIDs` proposed, and how many did, counting
// comments with or without text. The IDs come from the Routes container, not
// the request, and go in as JSON strings, which are Cosmos string literals.
async function tallyGrades(routeIDs: string[]): Promise<GradeTally[]> {
  if (routeIDs.length === 0) return [];
  try {
    const { resources } = await getContainer(COMMENT_CONTAINER)
      .items.query<GradeTally>(
        `SELECT c.routeID, c.grade, COUNT(1) AS count FROM c
         WHERE c.routeID IN (${routeIDs.map((id) => JSON.stringify(id)).join(", ")})
           AND IS_STRING(c.grade) AND c.grade != ""
         GROUP BY c.routeID, c.grade`,
      )
      .fetchAll();
    return resources;
  } catch (error) {
    // The container may not exist until comments can be posted.
    if (isNotFound(error)) return [];
    throw error;
  }
}

// GET /moderation/grades?type= - every climb that's up, or only its routes,
// boulders or combos, with how many of their comments proposed each grade -
// so the grading reports only read the climbs and comments being looked at,
// and never the climbs that have come down. The page compares the grades
// with each climb's own, as grades.ts knows the scales.
export async function getGradeReport(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const type = request.query.get("type");
    if (type !== null && !CLIMB_TYPES.includes(type as ClimbType)) {
      return { status: 400, headers, jsonBody: { error: "That isn't a kind of climb." } };
    }

    // Comments don't say what kind of climb they're on, so the climbs come
    // first and only their comments are read.
    const fields = REPORT_FIELDS.map((field) => `c.${field}`).join(", ");
    const filter = type === null ? "" : ` AND ${TYPE_FILTERS[type as ClimbType]}`;
    const { resources: climbs } = await getContainer(ROUTE_CONTAINER)
      .items.query<Partial<Route> & { routeID: string }>(`SELECT ${fields} FROM c WHERE c.removedAt = 0${filter}`)
      .fetchAll();
    const tallies = await tallyGrades(climbs.map((climb) => climb.routeID));
    return { status: 200, headers, jsonBody: { climbs, tallies } };
  } catch (error) {
    context.error("Failed to load a grading report", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the grading reports." } };
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_YEAR = 2000;

// The earliest anything was commented or sent, so the page knows how far back
// its chart can go - null with no comments yet.
async function readEarliest(): Promise<string | null> {
  const container = getContainer(COMMENT_CONTAINER);
  const [{ resources: commented }, { resources: sent }] = await Promise.all([
    container.items.query<string>("SELECT VALUE MIN(c.commentedAt) FROM c").fetchAll(),
    container.items.query<string>("SELECT VALUE MIN(c.sentAt) FROM c WHERE IS_STRING(c.sentAt)").fetchAll(),
  ]);
  const days = [commented[0], sent[0]].filter((value): value is string => typeof value === "string");
  return days.length > 0 ? days.map((value) => value.slice(0, 10)).sort()[0] : null;
}

// GET /moderation/activity?year= - when each comment with text was posted and
// each send happened in `year`, for the page to count up per day or month,
// plus the earliest day there's anything. A send is dated by the day its
// climber said they sent it (a YYYY-MM-DD in their own timezone), or when it
// was logged for sends from before that was asked. A day of slack each side
// lets the page bucket by its own timezone.
export async function getCommentActivity(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const year = Number(request.query.get("year"));
    if (!Number.isInteger(year) || year < FIRST_YEAR || year > new Date().getUTCFullYear() + 1) {
      return { status: 400, headers, jsonBody: { error: "That isn't a year with activity to show." } };
    }

    const since = new Date(Date.UTC(year, 0, 1) - ONE_DAY_MS).toISOString();
    const until = new Date(Date.UTC(year + 1, 0, 1) + ONE_DAY_MS).toISOString();
    const parameters = [
      { name: "@since", value: since },
      { name: "@until", value: until },
      { name: "@sinceDay", value: since.slice(0, 10) },
      { name: "@untilDay", value: until.slice(0, 10) },
    ];
    const [{ resources }, earliest] = await Promise.all([
      getContainer(COMMENT_CONTAINER)
        .items.query<{ commentedAt: string; hasText: boolean; send?: boolean; sentAt?: string }>({
          query: `SELECT c.commentedAt, c.comment != "" AS hasText, c.send, c.sentAt FROM c
                  WHERE (c.commentedAt >= @since AND c.commentedAt < @until)
                     OR (c.sentAt >= @sinceDay AND c.sentAt < @untilDay)`,
          parameters,
        })
        .fetchAll(),
      readEarliest(),
    ]);
    const inYear = (value: string) => value >= since && value < until;

    return {
      status: 200,
      headers,
      jsonBody: {
        earliest,
        comments: resources
          .filter((comment) => comment.hasText && inYear(comment.commentedAt))
          .map((comment) => comment.commentedAt),
        sends: resources
          .filter((comment) => comment.send)
          .map((comment) => comment.sentAt ?? comment.commentedAt)
          .filter((day) => day >= since.slice(0, 10) && day < until),
      },
    };
  } catch (error) {
    // The container may not exist until comments can be posted.
    if (isNotFound(error)) return { status: 200, headers, jsonBody: { earliest: null, comments: [], sends: [] } };
    context.error("Failed to read comment activity", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the comment activity." } };
  }
}

app.http("moderationActivity", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "moderation/activity",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getCommentActivity(request, context);
  },
});

// More than any one climb gets; a guard so one request can't read without end.
const MAX_GRADED_COMMENTS = 500;

// GET /moderation/climbs/{routeID}/grades - every comment on the climb that
// proposed a grade, newest first, with or without text, each with who wrote
// it. For a climb's grading report, which sorts them by whether they put it
// under, at or over its grade.
export async function getClimbGradeComments(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { routeID } = request.params;
    let comments: Comment[];
    try {
      ({ resources: comments } = await getContainer(COMMENT_CONTAINER)
        .items.query<Comment>({
          query: `SELECT * FROM c WHERE c.routeID = @routeID AND IS_STRING(c.grade) AND c.grade != ""
                  ORDER BY c.commentedAt DESC OFFSET 0 LIMIT @limit`,
          parameters: [
            { name: "@routeID", value: routeID },
            { name: "@limit", value: MAX_GRADED_COMMENTS },
          ],
        })
        .fetchAll());
    } catch (error) {
      // The container may not exist until comments can be posted.
      if (!isNotFound(error)) throw error;
      comments = [];
    }
    const people = await readPeople(comments.map((comment) => comment.userID));
    return { status: 200, headers, jsonBody: { comments: comments.map((comment) => toPublicComment(comment, people)) } };
  } catch (error) {
    context.error("Failed to load a climb's graded comments", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the climb's comments." } };
  }
}

app.http("moderationClimbGrades", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "moderation/climbs/{routeID}/grades",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getClimbGradeComments(request, context);
  },
});

app.http("moderationGrades", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "moderation/grades",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getGradeReport(request, context);
  },
});
