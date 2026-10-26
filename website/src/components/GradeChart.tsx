import CountChart from "@/components/CountChart";
import { type ClimbKind, GRADE_SCALES } from "@/lib/grades";

// One bar for every grade on the kind's scale, including grades with nothing
// set so gaps in the spread are visible.
//
// `grades` is one entry per climb - pass whichever climbs the page is about
// (active, archived, a single setter's, ...).
export default function GradeChart({ kind, grades }: { kind: ClimbKind; grades: string[] }) {
  const counts = GRADE_SCALES[kind].map((grade) => ({
    label: grade,
    count: grades.filter((climbGrade) => climbGrade === grade).length,
  }));

  return (
    <CountChart
      counts={counts}
      noun={(count) => `${count} ${kind}${count === 1 ? "" : "s"}`}
      caption={`${kind === "route" ? "Routes" : "Boulders"} per grade`}
      categoryHeader="Grade"
      emptyText={`No ${kind}s to show`}
    />
  );
}
