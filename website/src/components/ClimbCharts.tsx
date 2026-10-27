"use client";

import { useState } from "react";
import GradeChart from "@/components/GradeChart";
import SetterChart from "@/components/SetterChart";
import TabBar from "@/components/TabBar";
import type { Climb } from "@/lib/climbs";

const VIEW_TABS = [
  { id: "grades" as const, label: "Grades", describe: (subject: string) => `${subject} at each grade` },
  { id: "setters" as const, label: "Setters", describe: (subject: string) => `${subject} by setter` },
];
type View = (typeof VIEW_TABS)[number]["id"];

const KIND_TABS = [
  { id: "route" as const, label: "Routes" },
  { id: "boulder" as const, label: "Boulders" },
];
type Kind = (typeof KIND_TABS)[number]["id"];

// Charts of the climbs passed in - their grade spread or how many each setter
// has - for routes or boulders. Combos aren't charted. The caller supplies
// the frame's classes so it can sit as a card on its own or as a widget
// inside another card.
export default function ClimbCharts({
  climbs,
  subject,
  loadingText,
  className,
}: {
  climbs: Climb[];
  // What the climbs are, for the chart's description - "Active climbs".
  subject: string;
  // Shown instead of the chart while the climbs are loading or failed to.
  loadingText?: string | null;
  className: string;
}) {
  const [view, setView] = useState<View>("grades");
  const [kind, setKind] = useState<Kind>("route");
  const { label, describe } = VIEW_TABS.find((tab) => tab.id === view)!;
  const ofKind = climbs.filter((climb) => climb.type === kind);

  return (
    <section aria-label={label} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{label}</h2>
          <p className="text-xs text-neutral-500">{describe(subject)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="w-44">
            <TabBar label="Chart" tabs={VIEW_TABS} active={view} onChange={setView} />
          </div>
          <div className="w-44">
            <TabBar label="Climb type" tabs={KIND_TABS} active={kind} onChange={setKind} />
          </div>
        </div>
      </div>
      <div className="mt-3">
        {loadingText ? (
          <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{loadingText}</p>
        ) : view === "grades" ? (
          <GradeChart kind={kind} grades={ofKind.map((climb) => climb.grade)} />
        ) : (
          <SetterChart kind={kind} climbs={ofKind} />
        )}
      </div>
    </section>
  );
}
