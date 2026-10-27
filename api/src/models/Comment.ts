export const COMMENT_CONTAINER = "Comments";

// Partition key: /commentID. `id` mirrors commentID (Cosmos requires an id).
export type Comment = {
  id: string;
  commentID: string;
  userID: string;
  routeID: string;
  commentedAt: string;
  comment: string;
  // Optional so someone can leave a plain comment without rating or grading.
  rating?: number; // 0-10
  grade?: string;
  send?: boolean;
};
