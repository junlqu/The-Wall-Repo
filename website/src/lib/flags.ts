import { adminRequest } from "@/lib/api";

// Why a comment can be flagged, as people pick from them. Mirrors
// FLAG_REASONS in api/src/models/Flag.ts.
export const FLAG_REASONS = [
  { id: "rude", label: "Rude/Offensive" },
  { id: "hate", label: "Hate speech" },
  { id: "spam", label: "Spam" },
  { id: "irrelevant", label: "Not relevant" },
  { id: "misinformation", label: "Misinformation" },
  { id: "other", label: "Other" },
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number]["id"];

// Mirrors MAX_FLAG_DETAILS_LENGTH in api/src/models/Flag.ts.
export const MAX_FLAG_DETAILS_LENGTH = 1000;

// Reports someone's comment for staff to look at. The climb and author are
// worked out from the comment.
export async function flagComment(commentID: string, reason: FlagReason, details: string): Promise<void> {
  await adminRequest("/flags", { method: "POST", body: JSON.stringify({ commentID, reason, details: details.trim() }) });
}
