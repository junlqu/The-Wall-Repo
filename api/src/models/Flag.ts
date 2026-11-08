export const FLAG_CONTAINER = "Flags";

// Why a comment was flagged. Mirrors FLAG_REASONS in website/src/lib/flags.ts,
// which has the titles people pick from.
export const FLAG_REASONS = ["rude", "hate", "spam", "irrelevant", "misinformation", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

// What staff did about it.
export const FLAG_RESOLUTIONS = ["dismissed", "edited", "deleted"] as const;
export type FlagResolution = (typeof FLAG_RESOLUTIONS)[number];

// Mirrors MAX_FLAG_DETAILS_LENGTH in website/src/lib/flags.ts.
export const MAX_FLAG_DETAILS_LENGTH = 1000;

// Partition key: /flagID. `id` mirrors flagID (Cosmos requires an id).
// Someone reporting a comment. The comment's climb and author are copied in
// when it's flagged, so the flag still says what it was about if the comment
// is later deleted.
export type Flag = {
  id: string;
  flagID: string;
  commentID: string;
  routeID: string;
  // Who wrote the comment.
  flaggedUserID: string;
  // Who flagged it.
  flaggerID: string;
  reason: FlagReason;
  // What they wrote about it - "" when they didn't.
  details: string;
  flaggedAt: string;
  // Unset until it's dealt with - see resolveFlags in flagFields.ts.
  resolution?: FlagResolution;
  // When and by whom: the staff member, or the author deleting it themselves.
  resolvedAt?: string;
  resolvedBy?: string;
};
