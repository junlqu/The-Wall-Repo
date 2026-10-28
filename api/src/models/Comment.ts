export const COMMENT_CONTAINER = "Comments";

// Partition key: /commentID. `id` mirrors commentID (Cosmos requires an id).
// Someone gets one comment per climb, so commentID is commentIDFor(routeID,
// userID) - the database turns away a second. (Test comments seeded before
// that have random IDs.)
export type Comment = {
  id: string;
  commentID: string;
  userID: string;
  routeID: string;
  commentedAt: string;
  // When it was last edited, if it has been.
  editedAt?: string;
  // "" when they only sent, graded or rated the climb.
  comment: string;
  // Optional so someone can leave a plain comment without rating or grading.
  rating?: number; // 0-10
  grade?: string;
  send?: boolean;
};

export function commentIDFor(routeID: string, userID: string) {
  return `${routeID}_${userID}`;
}
