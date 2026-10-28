"use client";

import { useMemo } from "react";
import { ClimbCardGrid, ClimbRows, ClimbsError, Placeholder, useActiveClimbs } from "@/components/ClimbCards";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import { type Climb, type ClimbType, LINES } from "@/lib/climbs";

function LineCard({ line, climbs, noun }: { line: number; climbs: Climb[]; noun: string }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 pb-2">
        <h3 className="font-serif text-xl font-bold text-primary">Line {line}</h3>
        <Kicker className="text-neutral-400">
          {climbs.length} {noun}
          {climbs.length === 1 ? "" : "s"}
        </Kicker>
      </div>
      <ClimbRows climbs={climbs} empty="Nothing up on this line right now." />
    </article>
  );
}

// Routes and combos are both set on the six lines.
function LineGrid({ climbs, noun }: { climbs: Climb[]; noun: string }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {LINES.map((line) => (
        <LineCard key={line} line={line} climbs={climbs.filter((climb) => climb.line === line)} noun={noun} />
      ))}
    </div>
  );
}

export default function ClimbsPage() {
  const { climbs, error } = useActiveClimbs();
  const now = useMemo(() => new Date(), []);

  const arranged = useMemo(() => {
    if (!climbs) return null;
    const ofType = (type: ClimbType) => climbs.filter((climb) => climb.type === type);
    return { routes: ofType("route"), boulders: ofType("boulder"), combos: ofType("combo") };
  }, [climbs]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead
          title="The Wall Climbs"
          tagline="Every route, boulder, and combo up on the wall right now."
          now={now}
        />

        {error ? (
          <ClimbsError />
        ) : !arranged ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {LINES.map((line) => (
              <Placeholder key={line} className="h-64" />
            ))}
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-6">
              <SectionRule title="Routes" href="/climbs/routes" />
              <LineGrid climbs={arranged.routes} noun="route" />
            </section>

            <section className="flex flex-col gap-6">
              <SectionRule title="Boulders" href="/climbs/boulders" />
              <ClimbCardGrid climbs={arranged.boulders} empty="No boulders up right now." />
            </section>

            <section className="flex flex-col gap-6">
              <SectionRule title="Combos" href="/climbs/combos" />
              <LineGrid climbs={arranged.combos} noun="combo" />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
