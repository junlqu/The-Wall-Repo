import { adminRequest } from "@/lib/api";
import { type ApiRoute, type Climb, type ClimbType, toClimb } from "@/lib/climbs";
import { compareGrades } from "@/lib/grades";

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

// A climb's grade is only questioned once this many comments have graded it.
export const MIN_GRADE_VOTES = 3;

export function gradeVoteTotal(votes: GradeVotes) {
  return votes.easier + votes.same + votes.harder;
}

// Each climb's votes, by its ID. Combos are graded on the route scale.
export function tallyGradeVotes(climbs: Climb[], tallies: GradeTally[]): Map<string, GradeVotes> {
  const byID = new Map(climbs.map((climb) => [climb.id, climb]));
  const votes = new Map(climbs.map((climb) => [climb.id, { easier: 0, same: 0, harder: 0 }]));
  for (const { routeID, grade, count } of tallies) {
    const climb = byID.get(routeID);
    if (!climb) continue;
    const comparison = compareGrades(climb.type === "boulder" ? "boulder" : "route", grade, climb.grade);
    if (comparison === null) continue;
    const tally = votes.get(routeID)!;
    if (comparison === -1) tally.easier += count;
    else if (comparison === 1) tally.harder += count;
    else tally.same += count;
  }
  return votes;
}

// Its listed grade might need some work: enough people graded it, and more
// of them put it off its grade than on it.
export function needsGradeReview(votes: GradeVotes | undefined) {
  if (!votes || gradeVoteTotal(votes) < MIN_GRADE_VOTES) return false;
  return votes.easier + votes.harder > votes.same;
}

// How far a climb's graders lean away from its grade, for putting the
// worst first: the share of them off its grade, then how many there are.
export function compareDisagreement(a: GradeVotes, b: GradeVotes) {
  const share = (votes: GradeVotes) => (votes.easier + votes.harder) / Math.max(1, gradeVoteTotal(votes));
  return share(b) - share(a) || gradeVoteTotal(b) - gradeVoteTotal(a);
}
