export type ClimbKind = "route" | "boulder";

// Easiest to hardest. A grade missing from these lists won't show on the
// grade chart, so extend them if the wall starts setting outside the range.
export const ROUTE_GRADES = [
  "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9",
  "5.10a", "5.10b", "5.10c", "5.10d",
  "5.11a", "5.11b", "5.11c", "5.11d",
  "5.12a", "5.12b", "5.12c", "5.12d",
  "5.13a", "5.13b", "5.13c", "5.13d",
];

// Each V grade with the split between it and the next, e.g. V0, V0/1, V1, up
// to V10 and V10+. Dyno isn't a difficulty, so it sits after the hardest.
export const BOULDER_GRADES = [
  ...Array.from({ length: 10 }, (_, grade) => [`V${grade}`, `V${grade}/${grade + 1}`]).flat(),
  "V10", "V10+", "Dyno",
];

// A climb that's up but not graded yet. It isn't on either scale, so it's
// left off the grade chart and sorts after every real grade.
export const NEW_GRADE = "New";

export const GRADE_SCALES: Record<ClimbKind, string[]> = {
  route: ROUTE_GRADES,
  boulder: BOULDER_GRADES,
};

// A route grade as a number to compare, so "5.10" (no letter, as people
// often write it) sits between 5.10b and 5.10c. Null when it isn't one.
function routeGradeValue(grade: string) {
  const match = /^5\.(\d+)([a-d])?$/i.exec(grade.trim());
  if (!match) return null;
  const letter = match[2] ? "abcd".indexOf(match[2].toLowerCase()) : 1.5;
  return Number(match[1]) + letter / 4;
}

function boulderGradeValue(grade: string) {
  const index = BOULDER_GRADES.indexOf(grade.trim());
  // Dyno isn't a difficulty, so it can't be harder or easier.
  return index === -1 || BOULDER_GRADES[index] === "Dyno" ? null : index;
}

// The grades a climb of `kind` can be at, easiest first - Dyno left off, as
// it isn't a difficulty.
export function difficultyScale(kind: ClimbKind) {
  return kind === "boulder" ? BOULDER_GRADES.filter((grade) => grade !== "Dyno") : ROUTE_GRADES;
}

// Where `grade` sits on its difficultyScale - 5.3 is 0, 5.4 is 1 and so on -
// for averaging grades. A route grade with no letter ("5.10") is halfway
// between b and c, as compareGrades has it. Null when it isn't on the scale.
export function gradeIndex(kind: ClimbKind, grade: string): number | null {
  const scale = difficultyScale(kind);
  const wanted = grade.trim().toLowerCase();
  const exact = scale.findIndex((option) => option.toLowerCase() === wanted);
  if (exact !== -1) return exact;
  const b = kind === "route" ? scale.indexOf(`${wanted}b`) : -1;
  return b === -1 ? null : b + 0.5;
}

// Whether `grade` is harder (1), easier (-1) or the same (0) as `than`, or
// null when either can't be placed on the scale.
export function compareGrades(kind: ClimbKind, grade: string, than: string): -1 | 0 | 1 | null {
  const value = kind === "route" ? routeGradeValue : boulderGradeValue;
  const a = value(grade);
  const b = value(than);
  if (a === null || b === null) return null;
  return a > b ? 1 : a < b ? -1 : 0;
}
