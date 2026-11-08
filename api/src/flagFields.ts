import { InvocationContext } from "@azure/functions";
import { isNotFound, PublicPerson } from "./commentFields";
import { getContainer } from "./cosmosClient";
import { Flag, FLAG_CONTAINER, FlagResolution } from "./models/Flag";

// IDs as a Cosmos IN list. They come from the database, not the request, and
// go in as JSON strings, which are Cosmos string literals.
export function inList(ids: string[]) {
  return `(${ids.map((id) => JSON.stringify(id)).join(", ")})`;
}

// The flags nobody has dealt with yet - on these comments, or on any when
// null - newest first.
export async function readOpenFlags(commentIDs: string[] | null): Promise<Flag[]> {
  if (commentIDs?.length === 0) return [];
  try {
    const { resources } = await getContainer(FLAG_CONTAINER)
      .items.query<Flag>(
        `SELECT * FROM c WHERE NOT IS_DEFINED(c.resolution)${
          commentIDs ? ` AND c.commentID IN ${inList(commentIDs)}` : ""
        } ORDER BY c.flaggedAt DESC`,
      )
      .fetchAll();
    return resources;
  } catch (error) {
    // The container may not exist until something's been flagged.
    if (isNotFound(error)) return [];
    throw error;
  }
}

// A flag as the moderation pages show it - who flagged it in place of their
// userID. Mirrors CommentFlag in website/src/lib/moderation.ts.
export function toCommentFlag(flag: Flag, people: Map<string, PublicPerson>) {
  return {
    flagID: flag.flagID,
    reason: flag.reason,
    details: flag.details,
    flaggedAt: flag.flaggedAt,
    flagger: people.get(flag.flaggerID) ?? null,
  };
}

// Each comment's open flags, newest first, by commentID.
export function groupByComment(flags: Flag[]): Map<string, Flag[]> {
  const groups = new Map<string, Flag[]>();
  for (const flag of flags) groups.set(flag.commentID, [...(groups.get(flag.commentID) ?? []), flag]);
  return groups;
}

// Marks every open flag on the comment as dealt with: dismissed, or the
// comment edited or deleted. Not fatal - the change to the comment has
// already happened - so a failure is only logged. Returns how many it closed.
export async function resolveFlags(
  commentID: string,
  resolution: FlagResolution,
  resolvedBy: string,
  context: InvocationContext,
): Promise<number> {
  try {
    const open = await readOpenFlags([commentID]);
    const resolvedAt = new Date().toISOString();
    await Promise.all(
      open.map((flag) =>
        getContainer(FLAG_CONTAINER)
          .item(flag.flagID, flag.flagID)
          .patch([
            { op: "set", path: "/resolution", value: resolution },
            { op: "set", path: "/resolvedAt", value: resolvedAt },
            { op: "set", path: "/resolvedBy", value: resolvedBy },
          ]),
      ),
    );
    return open.length;
  } catch (error) {
    context.warn(`Failed to resolve the flags on comment ${commentID}`, error);
    return 0;
  }
}
