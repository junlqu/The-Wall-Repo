import { getContainer } from "./cosmosClient";
import { Comment } from "./models/Comment";
import { User, USER_CONTAINER } from "./models/User";
import { isDate } from "./routeFields";

const MAX_COMMENT_LENGTH = 1000;
const MAX_GRADE_LENGTH = 16;
const MAX_RATING = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// What someone writes when they comment, checked and tidied.
export type CommentFields = Pick<Comment, "comment" | "rating" | "grade" | "send" | "sentAt">;

// A YYYY-MM-DD that's a real day and not in the future. A day of slack, as
// the date is the visitor's own and they may be ahead of UTC.
export function isSendDate(value: unknown): value is string {
  if (!isDate(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value) && time <= Date.now() + ONE_DAY_MS;
}

// Text, a rating (a whole number 0-10), a grade and whether they sent it -
// each optional, but at least one has to be there - and, with a send, the
// day it was sent. Null when anything is malformed or it's all empty.
export function readCommentFields(value: unknown): CommentFields | null {
  if (typeof value !== "object" || value === null) return null;
  const { comment = "", rating, grade = "", send = false, sentAt } = value as Record<string, unknown>;

  if (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH) return null;
  if (rating != null && !(Number.isInteger(rating) && (rating as number) >= 0 && (rating as number) <= MAX_RATING)) {
    return null;
  }
  if (typeof grade !== "string" || grade.length > MAX_GRADE_LENGTH) return null;
  if (typeof send !== "boolean") return null;
  if (sentAt != null && !isSendDate(sentAt)) return null;

  const fields: CommentFields = {
    comment: comment.trim(),
    rating: rating == null ? undefined : (rating as number),
    grade: grade.trim() || undefined,
    send,
    // Dropped without a send, so un-sending clears it.
    sentAt: send && sentAt != null ? sentAt : undefined,
  };
  const empty = !fields.comment && fields.rating === undefined && !fields.grade && !fields.send;
  return empty ? null : fields;
}

// All the climbs pages show of someone - never the rest of their account.
export type PublicPerson = { userID: string; username: string; avatarUpdatedAt?: string };

// One point read each. Anyone whose account is gone is left out.
export async function readPeople(userIDs: string[]): Promise<Map<string, PublicPerson>> {
  const container = getContainer(USER_CONTAINER);
  const people = await Promise.all(
    [...new Set(userIDs)].map(async (userID): Promise<PublicPerson | null> => {
      const { resource } = await container.item(userID, userID).read<User>();
      return resource ? { userID, username: resource.username, avatarUpdatedAt: resource.avatarUpdatedAt } : null;
    })
  );
  return new Map(people.filter((person) => person !== null).map((person) => [person.userID, person]));
}

// A comment as pages see it - who wrote it in place of their userID. Mirrors
// ClimbComment in website/src/lib/climbs.ts.
export function toPublicComment(comment: Comment, people: Map<string, PublicPerson>) {
  return {
    commentID: comment.commentID,
    commentedAt: comment.commentedAt,
    editedAt: comment.editedAt,
    comment: comment.comment,
    rating: comment.rating,
    grade: comment.grade,
    send: comment.send,
    sentAt: comment.sentAt,
    author: people.get(comment.userID) ?? null,
  };
}

export function isNotFound(error: unknown) {
  return (error as { code?: number }).code === 404;
}
