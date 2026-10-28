import { getContainer } from "./cosmosClient";
import { ROUTE_CONTAINER } from "./models/Route";

// Keeps a climb's comment count and rating in step with its comments, so
// they come free with the climb instead of being worked out on every read.
//
// Comments live in another container, so these can't share a transaction
// with the comment itself - if one fails after the comment is saved, the
// climb's numbers are off by that comment.

function routeItem(routeID: string) {
  return getContainer(ROUTE_CONTAINER).item(routeID, routeID);
}

function isPreconditionFailed(error: unknown) {
  return (error as { code?: number }).code === 412;
}

// Call with 1 once a comment is saved, and -1 once one is deleted. The
// increment adds the field to climbs that don't have it yet.
export async function changeCommentCount(routeID: string, delta: 1 | -1) {
  await routeItem(routeID).patch([{ op: "incr", path: "/comments", value: delta }]);
}

// Adds `total` to the climb's rating total and `count` to its number of
// ratings: (rating, 1) for a new rating, (-rating, -1) for a removed one,
// and (new - old, 0) for a changed one.
//
// An increment can't reach inside a `rating` that isn't there yet (climbs
// added before ratings existed), so those get it set instead. Each patch only
// applies if `rating` is still as expected, so two first ratings at once
// can't overwrite each other - the loser goes round again and increments.
export async function changeRating(routeID: string, total: number, count: 1 | 0 | -1) {
  const item = routeItem(routeID);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await item.patch({
        condition: "FROM c WHERE IS_DEFINED(c.rating)",
        operations: [
          { op: "incr", path: "/rating/total", value: total },
          { op: "incr", path: "/rating/count", value: count },
        ],
      });
      return;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }
    try {
      await item.patch({
        condition: "FROM c WHERE NOT IS_DEFINED(c.rating)",
        operations: [{ op: "set", path: "/rating", value: { total, count } }],
      });
      return;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }
  }
  throw new Error(`Couldn't update the rating of climb ${routeID}`);
}
