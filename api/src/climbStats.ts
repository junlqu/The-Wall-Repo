import { getContainer } from "./cosmosClient";
import { Comment } from "./models/Comment";
import { Route, ROUTE_CONTAINER } from "./models/Route";

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

// Call with 1 once a comment with text is saved, and -1 once one loses its
// text or is deleted. The increment adds the field to climbs that don't
// have it yet.
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

// Adds or takes `userID` off the climb's ascents. Taking someone off needs
// their place in the list, so it only saves if the list hasn't changed since
// it was read, and tries again if it has.
export async function setSent(routeID: string, userID: string, sent: boolean) {
  const item = routeItem(routeID);
  if (sent) {
    await item.patch([{ op: "add", path: "/ascents/-", value: userID }]);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { resource: route } = await item.read<Route>();
    const index = route?.ascents?.lastIndexOf(userID) ?? -1;
    if (!route || index === -1) return;
    try {
      await item.patch([{ op: "remove", path: `/ascents/${index}` }], {
        accessCondition: { type: "IfMatch", condition: route._etag },
      });
      return;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }
  }
  throw new Error(`Couldn't take a send off climb ${routeID}`);
}

type Counted = Pick<Comment, "comment" | "rating" | "send">;

// Brings the climb's comment count, rating and ascents in line with one
// person's comment going from `before` to `after` - null for a comment that
// doesn't exist (yet, or any more). Only comments with text are counted.
export async function applyCommentChange(routeID: string, userID: string, before: Counted | null, after: Counted | null) {
  const textDelta = Number(Boolean(after?.comment)) - Number(Boolean(before?.comment));
  if (textDelta !== 0) await changeCommentCount(routeID, textDelta as 1 | -1);

  const ratingBefore = before?.rating;
  const ratingAfter = after?.rating;
  if (ratingBefore !== ratingAfter) {
    const countDelta = Number(ratingAfter !== undefined) - Number(ratingBefore !== undefined);
    await changeRating(routeID, (ratingAfter ?? 0) - (ratingBefore ?? 0), countDelta as 1 | 0 | -1);
  }

  if (Boolean(before?.send) !== Boolean(after?.send)) await setSent(routeID, userID, Boolean(after?.send));
}
