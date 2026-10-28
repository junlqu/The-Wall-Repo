"use client";

import { useMemo } from "react";
import { ClimbRows, ClimbsError, Placeholder, useActiveClimbs } from "@/components/ClimbCards";
import { Masthead, SectionRule } from "@/components/Masthead";
import { LINES } from "@/lib/climbs";

export default function RoutesPage() {
  const { climbs, error } = useActiveClimbs();
  const now = useMemo(() => new Date(), []);
  const routes = useMemo(() => climbs?.filter((climb) => climb.type === "route") ?? null, [climbs]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead title="The Wall Routes" tagline="Every route up on the wall right now, line by line." now={now} />

        {error ? (
          <ClimbsError />
        ) : !routes ? (
          LINES.slice(0, 2).map((line) => <Placeholder key={line} className="h-48" />)
        ) : (
          LINES.map((line) => (
            <section key={line} className="flex flex-col gap-6">
              <SectionRule title={`Line ${line}`} />
              <div className="rounded-xl border border-neutral-200 bg-white px-5 py-2 shadow-sm sm:px-6">
                <ClimbRows
                  climbs={routes.filter((climb) => climb.line === line)}
                  empty="No routes up on this line right now."
                />
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
