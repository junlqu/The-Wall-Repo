import { PatchOperation, SqlParameter } from "@azure/cosmos";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { isDateTime, toPublicAnnouncement } from "../announcementFields";
import { corsHeaders, readCurrentUser, readSessionUser } from "../authUtils";
import { PublicPerson, readPeople, toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Announcement, ANNOUNCEMENT_CONTAINER } from "../models/Announcement";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { Route, ROUTE_CONTAINER } from "../models/Route";
import { USER_CONTAINER } from "../models/User";
import { computeMetrics, metricsPatch } from "../userMetrics";

// How many older updates sit under the new ones, so the column isn't empty
// when nothing has happened since the last visit.
const EARLIER_UPDATES = 5;
// How many more each "Load more" adds.
const OLDER_UPDATES = 10;
const RECENT_COMMENTS = 3;

// Where one kind of update is kept, and which of them count.
type UpdateSource = { container: string; timeField: string; filter: string; parameters: SqlParameter[] };

// The newest `count` from before `before`, and one more than that if there is
// one, to tell whether there's another page after them.
async function readOlder<T>(source: UpdateSource, before: string, count: number): Promise<T[]> {
  const { resources } = await getContainer(source.container)
    .items.query<T>({
      query: `SELECT TOP @limit * FROM c WHERE ${source.filter} AND c.${source.timeField} < @before
              ORDER BY c.${source.timeField} DESC`,
      parameters: [
        ...source.parameters,
        { name: "@before", value: before },
        { name: "@limit", value: count + 1 },
      ],
    })
    .fetchAll();
  return resources;
}

// Everything from `since` on, and the newest few from before it.
async function readAround<T>(source: UpdateSource, since: string): Promise<T[]> {
  const [{ resources: fresh }, earlier] = await Promise.all([
    getContainer(source.container)
      .items.query<T>({
        query: `SELECT * FROM c WHERE ${source.filter} AND c.${source.timeField} >= @since`,
        parameters: [...source.parameters, { name: "@since", value: since }],
      })
      .fetchAll(),
    readOlder<T>(source, since, EARLIER_UPDATES),
  ]);
  return [...fresh, ...earlier];
}

// Archived announcements are left out, new or not: they've stopped being
// relevant, or were recorded straight into the archive as a backlog.
function announcementSource(now: string): UpdateSource {
  return {
    container: ANNOUNCEMENT_CONTAINER,
    timeField: "announcedAt",
    filter: "c.relevantUntil > @now",
    parameters: [{ name: "@now", value: now }],
  };
}

// What other people have said on the climbs they follow that are still up, as
// `read` picks them out. Nothing to look through for someone who follows nothing.
async function readFollowedComments(userID: string, read: (source: UpdateSource) => Promise<Comment[]>) {
  const { resources: routeIDs } = await getContainer(ROUTE_CONTAINER)
    .items.query<string>({
      query: "SELECT VALUE c.routeID FROM c WHERE ARRAY_CONTAINS(c.follows, @userID) AND c.removedAt = 0",
      parameters: [{ name: "@userID", value: userID }],
    })
    .fetchAll();
  if (routeIDs.length === 0) return [];

  return read({
    container: COMMENT_CONTAINER,
    timeField: "commentedAt",
    filter: `ARRAY_CONTAINS(@routeIDs, c.routeID) AND c.userID != @userID AND c.comment != ""`,
    parameters: [
      { name: "@routeIDs", value: routeIDs },
      { name: "@userID", value: userID },
    ],
  });
}

async function readMyRecentComments(userID: string): Promise<Comment[]> {
  const { resources } = await getContainer(COMMENT_CONTAINER)
    .items.query<Comment>({
      query: `SELECT TOP @limit * FROM c WHERE c.userID = @userID AND c.comment != "" ORDER BY c.commentedAt DESC`,
      parameters: [
        { name: "@limit", value: RECENT_COMMENTS },
        { name: "@userID", value: userID },
      ],
    })
    .fetchAll();
  return resources;
}

// One point read each. Climbs that are gone are left out.
async function readRoutes(routeIDs: string[]): Promise<Map<string, Route>> {
  const container = getContainer(ROUTE_CONTAINER);
  const routes = await Promise.all(
    [...new Set(routeIDs)].map(async (routeID) => (await container.item(routeID, routeID).read<Route>()).resource),
  );
  return new Map(routes.filter((route) => route !== undefined).map((route) => [route.routeID, route]));
}

type UpdateItem = { at: string; announcement: Announcement } | { at: string; comment: Comment };

function mergeUpdates(announcements: Announcement[], comments: Comment[]): UpdateItem[] {
  return [
    ...announcements.map((announcement) => ({ at: announcement.announcedAt, announcement })),
    ...comments.map((comment) => ({ at: comment.commentedAt, comment })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

// The first `count` of them, and any at the same moment as the last - the next
// page starts strictly before it, so they'd be skipped otherwise.
function firstUpdates(items: UpdateItem[], count: number) {
  const last = items[count - 1]?.at;
  return last === undefined ? items : items.filter((item) => item.at >= last);
}

function commentsIn(items: UpdateItem[]) {
  return items.flatMap((item) => ("comment" in item ? [item.comment] : []));
}

function withClimb(comment: Comment, people: Map<string, PublicPerson>, routes: Map<string, Route>) {
  return { comment: toPublicComment(comment, people), climb: routes.get(comment.routeID) ?? null };
}

function toPublicUpdate(
  item: UpdateItem,
  isNew: boolean,
  request: HttpRequest,
  people: Map<string, PublicPerson>,
  routes: Map<string, Route>,
) {
  return {
    at: item.at,
    isNew,
    ...("comment" in item
      ? { kind: "comment", ...withClimb(item.comment, people, routes) }
      : { kind: "announcement", announcement: toPublicAnnouncement(item.announcement, request) }),
  };
}

// POST /dashboard - everything the logged-in visitor's dashboard shows, and
// the one thing that moves their lastOnline on: an update is new if it came
// after the visit before this one. A POST so nothing can fire it by accident
// just by fetching a URL.
export async function openDashboard(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { status: 401, headers, jsonBody: { error: "You need to be logged in." } };

    // Taken before reading, so anything posted mid-read is still new next time.
    const now = new Date().toISOString();
    const since = user.lastOnline ?? user.createdAt;

    const savedMetrics = user.settings?.metrics;
    const [announcements, followedComments, myComments, metrics] = await Promise.all([
      readAround<Announcement>(announcementSource(now), since),
      readFollowedComments(user.userID, (source) => readAround<Comment>(source, since)),
      readMyRecentComments(user.userID),
      savedMetrics ?? computeMetrics(user.userID),
    ]);

    // Newest first, which puts every new update ahead of the older ones.
    const items = mergeUpdates(announcements, followedComments);
    const isNew = (item: UpdateItem) => item.at >= since;
    const shown = firstUpdates(items, items.filter(isNew).length + EARLIER_UPDATES);
    const shownComments = commentsIn(shown);

    const latestSendID = metrics.latestSend?.routeID;
    const [people, routes] = await Promise.all([
      readPeople([user.userID, ...shownComments.map((comment) => comment.userID)]),
      readRoutes([
        ...shownComments.map((comment) => comment.routeID),
        ...myComments.map((comment) => comment.routeID),
        ...(latestSendID ? [latestSendID] : []),
      ]),
    ]);

    // Last, so a failed load doesn't use up what's new. Not fatal: the worst
    // of it is the same updates showing as new again next time.
    const operations: PatchOperation[] = [{ op: "set", path: "/lastOnline", value: now }];
    if (!savedMetrics) operations.push(metricsPatch(user, metrics));
    try {
      await getContainer(USER_CONTAINER).item(user.userID, user.userID).patch(operations);
    } catch (error) {
      context.warn("Failed to update lastOnline", error);
    }

    return {
      status: 200,
      headers,
      jsonBody: {
        updates: shown.map((item) => toPublicUpdate(item, isNew(item), request, people, routes)),
        hasMoreUpdates: items.length > shown.length,
        metrics,
        latestSendClimb: (latestSendID && routes.get(latestSendID)) || null,
        recentComments: myComments.map((comment) => withClimb(comment, people, routes)),
      },
    };
  } catch (error) {
    context.error("Failed to load the dashboard", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load your dashboard." } };
  }
}

// GET /dashboard/updates?before= - the next few updates from before the given
// moment, and whether there are more. All the new ones came with the
// dashboard, so none of these are, and asking leaves lastOnline alone.
export async function getOlderUpdates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return { status: 401, headers, jsonBody: { error: "You need to be logged in." } };

    const before = request.query.get("before");
    if (!isDateTime(before)) {
      return { status: 400, headers, jsonBody: { error: "That isn't a valid page of updates." } };
    }

    const [announcements, comments] = await Promise.all([
      readOlder<Announcement>(announcementSource(new Date().toISOString()), before, OLDER_UPDATES),
      readFollowedComments(session.userID, (source) => readOlder<Comment>(source, before, OLDER_UPDATES)),
    ]);
    const items = mergeUpdates(announcements, comments);
    const shown = firstUpdates(items, OLDER_UPDATES);
    const shownComments = commentsIn(shown);

    const [people, routes] = await Promise.all([
      readPeople(shownComments.map((comment) => comment.userID)),
      readRoutes(shownComments.map((comment) => comment.routeID)),
    ]);
    return {
      status: 200,
      headers,
      jsonBody: {
        updates: shown.map((item) => toPublicUpdate(item, false, request, people, routes)),
        hasMoreUpdates: items.length > shown.length,
      },
    };
  } catch (error) {
    context.error("Failed to load older updates", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load more updates." } };
  }
}

app.http("dashboard", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return openDashboard(request, context);
  },
});

app.http("dashboardUpdates", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/updates",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getOlderUpdates(request, context);
  },
});
