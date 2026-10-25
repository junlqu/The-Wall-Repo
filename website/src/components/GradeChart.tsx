import { type ClimbKind, GRADE_SCALES } from "@/lib/grades";

// Single-series column chart: one bar for every grade on the kind's scale,
// including grades with nothing set so gaps in the spread are visible. The
// tallest bar is labelled on its cap and every bar shows its count on
// hover/focus; a screen-reader table carries the same numbers.
//
// `grades` is one entry per climb - pass whichever climbs the page is about
// (active, archived, a single setter's, ...).
export default function GradeChart({ kind, grades }: { kind: ClimbKind; grades: string[] }) {
  const counts = GRADE_SCALES[kind].map((grade) => ({
    grade,
    count: grades.filter((climbGrade) => climbGrade === grade).length,
  }));
  const max = Math.max(...counts.map((entry) => entry.count));
  const noun = (count: number) => `${count} ${kind}${count === 1 ? "" : "s"}`;

  if (max === 0) {
    return <p className="flex h-44 items-center justify-center text-sm text-neutral-500">No {kind}s to show</p>;
  }

  return (
    <figure>
      <div className="overflow-x-auto">
        <div className="flex h-44 w-full min-w-max border-b border-neutral-300 pt-6">
          {counts.map(({ grade, count }) => {
            const height = `${(count / max) * 100}%`;
            return (
              <div
                key={grade}
                tabIndex={0}
                aria-label={`${grade}: ${noun(count)}`}
                className="group relative flex min-w-9 flex-1 items-end justify-center outline-none"
              >
                <div
                  className="w-6 rounded-t bg-primary transition-colors group-hover:bg-secondary group-focus-visible:bg-secondary"
                  style={{ height }}
                />
                <span
                  aria-hidden="true"
                  style={{ bottom: `calc(${height} + 4px)` }}
                  className={`pointer-events-none absolute whitespace-nowrap text-xs font-semibold text-neutral-700 ${
                    count === max ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  }`}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
        <div aria-hidden="true" className="flex w-full min-w-max pt-1.5">
          {counts.map(({ grade }) => (
            <span key={grade} className="min-w-9 flex-1 text-center text-[11px] text-neutral-500">
              {grade}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{kind === "route" ? "Routes" : "Boulders"} per grade</caption>
        <thead>
          <tr>
            <th scope="col">Grade</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {counts.map(({ grade, count }) => (
            <tr key={grade}>
              <td>{grade}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
