import { PatchOperation } from "@azure/cosmos";
import { InvocationContext } from "@azure/functions";
import { getContainer } from "./cosmosClient";
import { Comment, COMMENT_CONTAINER } from "./models/Comment";
import { Route, ROUTE_CONTAINER } from "./models/Route";
import { User, USER_CONTAINER, UserMetrics } from "./models/User";

// Keeps the numbers on someone's dashboard saved in their settings, so opening
// it doesn't have to go through their comments. They're always worked out
// afresh from those comments rather than added to, so a removed send can't
// leave a stale hardest grade behind, and any miss is put right by the next
// change.

export type MetricComment = Pick<Comment, "routeID" | "send" | "sentAt" | "commentedAt"> & { hasText?: boolean };
export type SentRoute = Pick<Route, "routeID" | "type" | "line" | "proposedGrade">;

// Easiest to hardest. Mirrors website/src/lib/grades.ts - Dyno isn't a
// difficulty, so it can't be anyone's hardest.
const BOULDER_GRADES = ["VB", "V0-1", "V2-3", "V4-5", "V6-7", "V8-9", "V10+"];

// A route grade as a number to compare, so "5.10" (no letter, as people often
// write it) sits between 5.10b and 5.10c. Null when it isn't one.
function routeGradeValue(grade: string) {
  const match = /^5\.(\d+)([a-d])?$/i.exec(grade.trim());
  if (!match) return null;
  const letter = match[2] ? "abcd".indexOf(match[2].toLowerCase()) : 1.5;
  return Number(match[1]) + letter / 4;
}

function boulderGradeValue(grade: string) {
  const index = BOULDER_GRADES.indexOf(grade.trim());
  return index === -1 ? null : index;
}

// The sum of someone's comments and the climbs they've sent. A climb counts
// once however many comments say it was sent, and a sent climb that's since
// been deleted isn't counted at all.
export function buildMetrics(comments: MetricComment[], routes: SentRoute[]): UserMetrics {
  const metrics: UserMetrics = {
    sends: { route: 0, boulder: 0, combo: 0 },
    hardestSend: {},
    lineSends: {},
    commentsPosted: comments.filter((comment) => comment.hasText).length,
    latestSend: null,
  };

  // When each climb was sent - the day, then when it was logged to settle two
  // on one day. Sends from before the day was asked for use when they were
  // logged.
  const sentWhen = new Map<string, string>();
  for (const { routeID, send, sentAt, commentedAt } of comments) {
    if (!send) continue;
    const when = `${sentAt ?? commentedAt.slice(0, 10)} ${commentedAt}`;
    if (when > (sentWhen.get(routeID) ?? "")) sentWhen.set(routeID, when);
  }

  const hardestValue = { route: -Infinity, boulder: -Infinity };
  let latest = "";
  for (const route of routes) {
    const when = sentWhen.get(route.routeID);
    if (!when) continue;

    // Climbs from before types existed are routes.
    const type = route.type ?? "route";
    metrics.sends[type] += 1;
    if (route.line !== undefined) metrics.lineSends[route.line] = (metrics.lineSends[route.line] ?? 0) + 1;

    // Combos are graded on the route scale. Ungraded climbs are left out.
    const scale = type === "boulder" ? "boulder" : "route";
    const value = (scale === "boulder" ? boulderGradeValue : routeGradeValue)(route.proposedGrade);
    if (value !== null && value > hardestValue[scale]) {
      hardestValue[scale] = value;
      metrics.hardestSend[scale] = route.proposedGrade.trim();
    }

    if (when > latest) {
      latest = when;
      metrics.latestSend = { routeID: route.routeID, date: when.slice(0, 10) };
    }
  }
  return metrics;
}

export async function computeMetrics(userID: string): Promise<UserMetrics> {
  const { resources: comments } = await getContainer(COMMENT_CONTAINER)
    .items.query<MetricComment>({
      query: `SELECT c.routeID, c.comment != "" AS hasText, c.send, c.sentAt, c.commentedAt FROM c
              WHERE c.userID = @userID`,
      parameters: [{ name: "@userID", value: userID }],
    })
    .fetchAll();

  const sentIDs = [...new Set(comments.filter((comment) => comment.send).map((comment) => comment.routeID))];
  if (sentIDs.length === 0) return buildMetrics(comments, []);

  const { resources: routes } = await getContainer(ROUTE_CONTAINER)
    .items.query<SentRoute>({
      query: `SELECT c.routeID, c.type, c.line, c.proposedGrade FROM c WHERE ARRAY_CONTAINS(@routeIDs, c.routeID)`,
      parameters: [{ name: "@routeIDs", value: sentIDs }],
    })
    .fetchAll();
  return buildMetrics(comments, routes);
}

// The patch that saves `metrics`. Accounts made before settings existed need
// the whole object - a patch can't reach inside one that isn't there.
export function metricsPatch(user: User, metrics: UserMetrics): PatchOperation {
  return user.settings
    ? { op: "set", path: "/settings/metrics", value: metrics }
    : { op: "set", path: "/settings", value: { metrics } };
}

export async function refreshMetrics(userID: string) {
  const metrics = await computeMetrics(userID);
  const item = getContainer(USER_CONTAINER).item(userID, userID);
  const { resource: user } = await item.read<User>();
  if (user) await item.patch([metricsPatch(user, metrics)]);
}

// Not fatal, like refreshing one person's: the change is saved, and their next
// comment works them out afresh.
export async function refreshMetricsOf(userIDs: string[], context: InvocationContext) {
  const results = await Promise.allSettled([...new Set(userIDs)].map(refreshMetrics));
  for (const result of results) {
    if (result.status === "rejected") context.warn("Failed to update a user's metrics", result.reason);
  }
}

// For when these climbs' grades or lines change: everyone who sent one has
// different numbers now, whichever grade they'd taken as their hardest.
export async function refreshSendersOf(routeIDs: string[], context: InvocationContext) {
  if (routeIDs.length === 0) return;
  try {
    const { resources: userIDs } = await getContainer(COMMENT_CONTAINER)
      .items.query<string>({
        query: "SELECT DISTINCT VALUE c.userID FROM c WHERE ARRAY_CONTAINS(@routeIDs, c.routeID) AND c.send = true",
        parameters: [{ name: "@routeIDs", value: routeIDs }],
      })
      .fetchAll();
    await refreshMetricsOf(userIDs, context);
  } catch (error) {
    context.warn("Failed to find who sent the changed climbs", error);
  }
}
