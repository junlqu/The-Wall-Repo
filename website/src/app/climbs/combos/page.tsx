"use client";

import { useMemo, useState } from "react";
import { ClimbRows, ClimbsError, Placeholder, useActiveClimbs } from "@/components/ClimbCards";
import { Masthead, SectionRule } from "@/components/Masthead";
import NewComboPanel from "@/components/NewComboPanel";
import { COMBO_LINE_REACH, LINES } from "@/lib/climbs";
import { useSessionUser } from "@/lib/session";

export default function CombosPage() {
  const { climbs, error, addClimb } = useActiveClimbs();
  const now = useMemo(() => new Date(), []);
  const combos = useMemo(() => climbs?.filter((climb) => climb.type === "combo") ?? null, [climbs]);
  // Anyone logged in can add a combo.
  const canAdd = Boolean(useSessionUser());
  // The line a new combo is being added to, while its panel is open.
  const [newComboLine, setNewComboLine] = useState<number | null>(null);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead title="Combos" tagline="Every combo up on the wall right now, line by line." now={now} />

        {error ? (
          <ClimbsError />
        ) : !combos ? (
          LINES.slice(0, 2).map((line) => <Placeholder key={line} className="h-48" />)
        ) : (
          LINES.map((line) => (
            <section key={line} className="flex flex-col gap-6">
              <SectionRule
                title={`Line ${line}`}
                action={
                  canAdd && (
                    <button
                      type="button"
                      onClick={() => setNewComboLine(line)}
                      aria-label={`New combo on line ${line}`}
                      className="shrink-0 rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      New combo
                    </button>
                  )
                }
              />
              <div className="rounded-xl border border-neutral-200 bg-white px-5 py-2 shadow-sm sm:px-6">
                <ClimbRows
                  climbs={combos.filter((climb) => climb.line === line)}
                  empty="No combos up on this line right now."
                />
              </div>
            </section>
          ))
        )}
      </div>

      {newComboLine !== null && (
        <NewComboPanel
          line={newComboLine}
          routes={(climbs ?? []).filter(
            (climb) =>
              climb.type === "route" && climb.line !== undefined && Math.abs(climb.line - newComboLine) <= COMBO_LINE_REACH,
          )}
          onClose={() => setNewComboLine(null)}
          onAdded={(combo) => {
            addClimb(combo);
            setNewComboLine(null);
          }}
        />
      )}
    </div>
  );
}
