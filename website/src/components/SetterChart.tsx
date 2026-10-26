import CountChart from "@/components/CountChart";
import { type Climb, climbSetters, SETTERS } from "@/lib/climbs";
import type { ClimbKind } from "@/lib/grades";

// One bar per setter, busiest first. Every setter on the list gets a bar, even
// with nothing up, and anyone the climbs name who isn't on the list is added.
// A climb set together counts for each of its setters.
export default function SetterChart({ kind, climbs }: { kind: ClimbKind; climbs: Climb[] }) {
  const counts = new Map<string, number>(SETTERS.map((setter) => [setter, 0]));
  for (const climb of climbs) {
    for (const setter of climbSetters(climb)) counts.set(setter, (counts.get(setter) ?? 0) + 1);
  }
  const sorted = [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return (
    <CountChart
      counts={sorted}
      noun={(count) => `${count} ${kind}${count === 1 ? "" : "s"}`}
      caption={`${kind === "route" ? "Routes" : "Boulders"} per setter`}
      categoryHeader="Setter"
      emptyText={`No ${kind}s with a setter to show`}
      barClassName="min-w-14"
    />
  );
}
