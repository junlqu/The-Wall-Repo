import { adminRequest } from "@/lib/api";
import { type ApiRoute, type Climb, type ClimbComment, type ClimbType, toClimb } from "@/lib/climbs";
import { compareGrades, difficultyScale, gradeIndex } from "@/lib/grades";
import { type ApiComment, type DashboardComment, toDashboardComment } from "@/lib/dashboard";

// How many comments proposed `grade` for climb `routeID`. Mirrors GradeTally
// in api/src/functions/moderation.ts.
export type GradeTally = { routeID: string; grade: string; count: number };

// Every climb that's up, or only those of `type`, with the grades their
// comments proposed. Mirrors getGradeReport in
// api/src/functions/moderation.ts.
export type GradeReport = { climbs: Climb[]; tallies: GradeTally[] };

export async function fetchGradeReport(type?: ClimbType): Promise<GradeReport> {
  const { climbs, tallies } = (await adminRequest(`/moderation/grades${type ? `?type=${type}` : ""}`, {})) as {
    climbs: ApiRoute[];
    tallies: GradeTally[];
  };
  return { climbs: climbs.map(toClimb), tallies };
}

// When each comment with text was posted (ISO) and each send happened
// (YYYY-MM-DD, or ISO for older sends) in a year, with a day of slack each
// side, and the earliest day there's anything (null with no comments yet).
// Mirrors getCommentActivity in api/src/functions/moderation.ts.
export type CommentActivity = { earliest: string | null; comments: string[]; sends: string[] };

export async function fetchCommentActivity(year: number): Promise<CommentActivity> {
  return (await adminRequest(`/moderation/activity?year=${year}`, {})) as CommentActivity;
}

// How a climb's proposed grades sit against the grade it's listed at.
// Grades that can't be placed on its scale (a typo, "Dyno") aren't counted.
export type GradeVotes = { easier: number; same: number; harder: number };
export type GradeVerdict = keyof GradeVotes;

// A climb's grade is only questioned once this many comments have graded it.
export const MIN_GRADE_VOTES = 3;

export function gradeVoteTotal(votes: GradeVotes) {
  return votes.easier + votes.same + votes.harder;
}

// Whether `grade` puts the climb under, at or over its listed grade - null
// when either can't be placed on its scale. Combos are graded on the route
// scale.
export function gradeVerdict(climb: Pick<Climb, "type" | "grade">, grade: string): GradeVerdict | null {
  const comparison = compareGrades(climb.type === "boulder" ? "boulder" : "route", grade, climb.grade);
  return comparison === null ? null : comparison === -1 ? "easier" : comparison === 1 ? "harder" : "same";
}

// Each climb's votes, by its ID.
export function tallyGradeVotes(climbs: Climb[], tallies: GradeTally[]): Map<string, GradeVotes> {
  const byID = new Map(climbs.map((climb) => [climb.id, climb]));
  const votes = new Map(climbs.map((climb) => [climb.id, { easier: 0, same: 0, harder: 0 }]));
  for (const { routeID, grade, count } of tallies) {
    const climb = byID.get(routeID);
    const verdict = climb && gradeVerdict(climb, grade);
    if (verdict) votes.get(routeID)![verdict] += count;
  }
  return votes;
}

// Its listed grade might need some work: enough people graded it, and more
// of them put it under its grade, or more put it over, than put it at it.
export function needsGradeReview(votes: GradeVotes | undefined) {
  if (!votes || gradeVoteTotal(votes) < MIN_GRADE_VOTES) return false;
  return votes.easier > votes.same || votes.harder > votes.same;
}

// Where most of its graders put it - its grade when that's tied for most, as
// there's nothing to change, or both sides when they tie above it. Empty
// when nobody's graded it.
export function suggestedVerdicts(votes: GradeVotes): GradeVerdict[] {
  const most = Math.max(votes.easier, votes.same, votes.harder);
  if (most === 0) return [];
  if (votes.same === most) return ["same"];
  return (["easier", "harder"] as const).filter((verdict) => votes[verdict] === most);
}

// The average of the grades its comments proposed, rounded up to a grade on
// its scale, and how many it's the average of. Grades that aren't on the
// scale are left out; null when none are.
export function suggestedGrade(climb: Pick<Climb, "type">, grades: string[]): { grade: string; from: number } | null {
  const kind = climb.type === "boulder" ? "boulder" : "route";
  const indexes = grades.map((grade) => gradeIndex(kind, grade)).filter((index) => index !== null);
  if (indexes.length === 0) return null;
  const average = indexes.reduce((total, index) => total + index, 0) / indexes.length;
  const scale = difficultyScale(kind);
  // A hair off before rounding up, so an average that's whole but for
  // floating point doesn't go up a grade.
  const index = Math.min(scale.length - 1, Math.ceil(average - 1e-9));
  return { grade: scale[index], from: indexes.length };
}

// How far a climb's graders lean away from its grade, for putting the worst
// first: the share of them on its busier side, then how many there are.
export function compareDisagreement(a: GradeVotes, b: GradeVotes) {
  const share = (votes: GradeVotes) => Math.max(votes.easier, votes.harder) / Math.max(1, gradeVoteTotal(votes));
  return share(b) - share(a) || gradeVoteTotal(b) - gradeVoteTotal(a);
}

// Every comment on a climb that proposed a grade, newest first. Mirrors
// getClimbGradeComments in api/src/functions/moderation.ts.
export async function fetchClimbGradeComments(id: string): Promise<ClimbComment[]> {
  return ((await adminRequest(`/moderation/climbs/${encodeURIComponent(id)}/grades`, {})) as { comments: ClimbComment[] })
    .comments;
}

// A climb's grading report. The site is a static export, so the ID goes in
// the query rather than the path.
export function gradingReportHref(id: string) {
  return `/admin/moderation/grading-reports/climb?id=${encodeURIComponent(id)}`;
}

// Mirrors PAGE_SIZES in api/src/functions/moderationComments.ts.
export const MODERATION_PAGE_SIZES = [10, 25, 50] as const;
export type ModerationPageSize = (typeof MODERATION_PAGE_SIZES)[number];

// What the comments can be narrowed to: people whose username contains
// `user`, and climbs on `line`, in `colour` and at `grade`. Blank (or null)
// ones don't narrow anything.
export type CommentFilters = { user: string; line: number | null; colour: string; grade: string };

// A comment with text, its climb, and its author's userID - there even once
// their account is deleted, so it can still be opened.
export type ModerationComment = DashboardComment & { userID: string };

// One page of every comment with text that matches `filters`, newest first,
// and how many match in all.
export async function fetchModerationComments(
  filters: CommentFilters,
  page: number,
  pageSize: ModerationPageSize,
): Promise<{ comments: ModerationComment[]; total: number }> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.user) query.set("user", filters.user);
  if (filters.line !== null) query.set("line", String(filters.line));
  if (filters.colour) query.set("colour", filters.colour);
  if (filters.grade) query.set("grade", filters.grade);
  const body = (await adminRequest(`/moderation/comments?${query}`, {})) as {
    comments: (ApiComment & { userID: string })[];
    total: number;
  };
  return {
    comments: body.comments.map((item) => ({ ...toDashboardComment(item), userID: item.userID })),
    total: body.total,
  };
}

function moderationCommentPath(commentID: string) {
  return `/moderation/comments/${encodeURIComponent(commentID)}`;
}

// Changes what a comment says, keeping its send, grade and rating.
export async function editModerationComment(commentID: string, text: string): Promise<ClimbComment> {
  const body = (await adminRequest(moderationCommentPath(commentID), {
    method: "PUT",
    body: JSON.stringify({ comment: text }),
  })) as { comment: ClimbComment };
  return body.comment;
}

// Deletes a comment, with the send, grade and rating that came with it.
export async function deleteModerationComment(commentID: string): Promise<void> {
  await adminRequest(moderationCommentPath(commentID), { method: "DELETE" });
}
