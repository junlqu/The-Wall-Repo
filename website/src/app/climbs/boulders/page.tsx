"use client";

import { useMemo } from "react";
import { ClimbRows, ClimbsError, Placeholder, useActiveClimbs } from "@/components/ClimbCards";
import { Masthead, SectionRule } from "@/components/Masthead";

export default function BouldersPage() {
  const { climbs, error } = useActiveClimbs();
  const now = useMemo(() => new Date(), []);
  const boulders = useMemo(() => climbs?.filter((climb) => climb.type === "boulder") ?? null, [climbs]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead title="Boulders" tagline="Every boulder up on the wall right now." now={now} />

        {error ? (
          <ClimbsError />
        ) : !boulders ? (
          <Placeholder className="h-64" />
        ) : (
          // Boulders aren't on a line, so they're one list.
          <section className="flex flex-col gap-6">
            <SectionRule title="Boulders" />
            <div className="rounded-xl border border-neutral-200 bg-white px-5 py-2 shadow-sm sm:px-6">
              <ClimbRows climbs={boulders} empty="No boulders up right now." tapeRow />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
