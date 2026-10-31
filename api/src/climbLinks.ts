import { BulkOperationType, OperationInput } from "@azure/cosmos";
import { InvocationContext } from "@azure/functions";
import { getContainer } from "./cosmosClient";
import { Comment, COMMENT_CONTAINER } from "./models/Comment";
import { COMBO_LINE_REACH, ComboHand, Route, ROUTE_CONTAINER } from "./models/Route";
import { refreshMetricsOf } from "./userMetrics";

// Keeps what hangs off a climb in step with it: the combos built from a route, and
// the comments on either. A combo says which routes its hands take, so that's the
// one place the link is kept, and one query finds a route's combos from it.
//
// Climbs and comments live in separate documents, so none of this is a transaction.
// Each step can safely run twice, so an action that fails partway can be tried again.

function routeItem(routeID: string) {
  return getContainer(ROUTE_CONTAINER).item(routeID, routeID);
}

function isNotFound(error: unknown) {
  return (error as { code?: number }).code === 404;
}

// Only routes have combos. Climbs from before types existed are routes.
export function canHaveCombos(climb: Route) {
  return (climb.type ?? "route") === "route";
}

export function toComboHand(route: Route): ComboHand {
  return { routeID: route.routeID, line: route.line!, colour: route.colour, grade: route.proposedGrade };
}

// `left` and `right` are reserved words in Cosmos SQL, so the queries need the
// brackets to reach them.
export async function findCombosOn(routeID: string): Promise<Route[]> {
  const { resources } = await getContainer(ROUTE_CONTAINER)
    .items.query<Route>({
      query: `SELECT * FROM c WHERE c.type = "combo"
              AND (c.hands["left"].routeID = @routeID OR c.hands["right"].routeID = @routeID)`,
      parameters: [{ name: "@routeID", value: routeID }],
    })
    .fetchAll();
  return resources;
}

// Whether a combo with this left and right hand is already on record, up or down.
export async function comboExists(leftID: string, rightID: string) {
  const { resources } = await getContainer(ROUTE_CONTAINER)
    .items.query<number>({
      query: `SELECT VALUE COUNT(1) FROM c WHERE c.type = "combo"
              AND c.hands["left"].routeID = @leftID AND c.hands["right"].routeID = @rightID`,
      parameters: [
        { name: "@leftID", value: leftID },
        { name: "@rightID", value: rightID },
      ],
    })
    .fetchAll();
  return resources[0] > 0;
}

export function isLineInReach(line: number, hand: ComboHand) {
  return Math.abs(hand.line - line) <= COMBO_LINE_REACH;
}

// Where a combo belongs once a hand has moved: its own line while both hands are
// in reach, otherwise the nearest line that is. Hands moved too far apart for any
// line to reach both leave it as close as it can get.
function comboLineFor(line: number, { left, right }: NonNullable<Route["hands"]>) {
  const lowest = Math.max(left.line, right.line) - COMBO_LINE_REACH;
  const highest = Math.min(left.line, right.line) + COMBO_LINE_REACH;
  return Math.min(Math.max(line, lowest), highest);
}

function isSameHand(a: ComboHand, b: ComboHand) {
  return a.routeID === b.routeID && a.line === b.line && a.colour === b.colour && a.grade === b.grade;
}

// Copies a route's colour, grade and line onto the combos using it, skipping any
// that already match. Returns the combos that moved to another line, as anyone who
// sent those has different numbers now. A combo's own grade is its own, and stays.
export async function syncCombosOn(route: Route): Promise<string[]> {
  const combos = await findCombosOn(route.routeID);
  const hand = toComboHand(route);
  const moved: string[] = [];

  await Promise.all(
    combos.map(async (combo) => {
      const { left, right } = combo.hands!;
      const hands = {
        left: left.routeID === route.routeID ? hand : left,
        right: right.routeID === route.routeID ? hand : right,
      };
      if (isSameHand(hands.left, left) && isSameHand(hands.right, right)) return;

      const line = comboLineFor(combo.line!, hands);
      await routeItem(combo.routeID).patch([
        { op: "set", path: "/hands", value: hands },
        { op: "set", path: "/colour", value: hands.left.colour },
        { op: "set", path: "/secondary", value: hands.right.colour },
        { op: "set", path: "/line", value: line },
      ]);
      if (line !== combo.line) moved.push(combo.routeID);
    }),
  );
  return moved;
}

// Takes down the combos on a route that's come down, with the same date. One that
// was already down keeps the date it has.
export async function archiveCombosOn(routeID: string, removedAt: Route["removedAt"]) {
  const combos = await findCombosOn(routeID);
  await Promise.all(
    combos
      .filter((combo) => combo.removedAt === 0)
      .map((combo) => routeItem(combo.routeID).patch([{ op: "set", path: "/removedAt", value: removedAt }])),
  );
}

// Whether both of a combo's routes are up, as it can't be up without them.
export async function handsAreUp(combo: Route) {
  if (!combo.hands) return true;
  const routes = await Promise.all([combo.hands.left, combo.hands.right].map(({ routeID }) => routeItem(routeID).read<Route>()));
  return routes.every(({ resource }) => resource?.removedAt === 0);
}

// Brings back the combos on a route that's gone back up, if their other route is up too.
export async function restoreCombosOn(routeID: string) {
  const combos = await findCombosOn(routeID);
  await Promise.all(
    combos
      .filter((combo) => combo.removedAt !== 0)
      .map(async (combo) => {
        if (await handsAreUp(combo)) await routeItem(combo.routeID).patch([{ op: "set", path: "/removedAt", value: 0 }]);
      }),
  );
}

// Passes on what changed between two saved versions of a climb. Returns the climbs
// whose senders' numbers are affected, for refreshSendersOf.
export async function spreadClimbChange(before: Route, after: Route): Promise<string[]> {
  const moved = canHaveCombos(after) ? await syncCombosOn(after) : [];
  const countsDiffer = before.proposedGrade !== after.proposedGrade || before.line !== after.line;
  return countsDiffer ? [after.routeID, ...moved] : moved;
}

type LinkedComment = Pick<Comment, "id" | "commentID" | "userID">;

async function findCommentsOn(routeIDs: string[]) {
  const { resources } = await getContainer(COMMENT_CONTAINER)
    .items.query<LinkedComment>({
      query: "SELECT c.id, c.commentID, c.userID FROM c WHERE ARRAY_CONTAINS(@routeIDs, c.routeID)",
      parameters: [{ name: "@routeIDs", value: routeIDs }],
    })
    .fetchAll();
  return resources;
}

// Everything that goes with a climb when it's deleted: the combos using it, and
// the comments on the climb and on those combos.
export async function findDeletionReach(climb: Route) {
  const combos = canHaveCombos(climb) ? await findCombosOn(climb.routeID) : [];
  const comments = await findCommentsOn([climb.routeID, ...combos.map((combo) => combo.routeID)]);
  return { combos, comments };
}

async function deleteComments(comments: LinkedComment[]) {
  if (comments.length === 0) return;
  const operations: OperationInput[] = comments.map((comment) => ({
    operationType: BulkOperationType.Delete,
    id: comment.id,
    partitionKey: comment.commentID,
  }));
  const results = await getContainer(COMMENT_CONTAINER).items.executeBulkOperations(operations);
  // A comment that's already gone is what was wanted.
  const failed = results.filter((result) => {
    const statusCode = result.response?.statusCode ?? 500;
    return statusCode !== 404 && (result.error || statusCode >= 400);
  });
  if (failed.length > 0) throw new Error(`Couldn't delete ${failed.length} of ${comments.length} comments`);
}

// Deletes a climb with its combos and all their comments, then works out afresh
// the numbers of everyone who commented. The climb goes last, so if anything fails
// it's still there to try again.
export async function deleteClimbAndLinks(climb: Route, context: InvocationContext) {
  const { combos, comments } = await findDeletionReach(climb);
  await deleteComments(comments);
  await Promise.all(
    combos.map((combo) =>
      routeItem(combo.routeID)
        .delete()
        .catch((error) => {
          if (!isNotFound(error)) throw error;
        }),
    ),
  );
  await routeItem(climb.routeID).delete();
  await refreshMetricsOf(comments.map((comment) => comment.userID), context);
}

// Reads the climbs with these IDs, keyed by ID.
export async function readClimbs(routeIDs: string[]): Promise<Map<string, Route>> {
  const { resources } = await getContainer(ROUTE_CONTAINER)
    .items.query<Route>({
      query: "SELECT * FROM c WHERE ARRAY_CONTAINS(@routeIDs, c.routeID)",
      parameters: [{ name: "@routeIDs", value: routeIDs }],
    })
    .fetchAll();
  return new Map(resources.map((route) => [route.routeID, route]));
}
