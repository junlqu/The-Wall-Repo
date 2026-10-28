"use client";

import { useEffect, useMemo, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import { type Climb, type ClimbType, fetchClimbs, LINES, MAX_STARS } from "@/lib/climbs";
import { BOULDER_GRADES, ROUTE_GRADES } from "@/lib/grades";

// Easiest first. Ungraded climbs and grades off the scale go last.
function gradeRank(climb: Climb) {
  const scale = climb.type === "boulder" ? BOULDER_GRADES : ROUTE_GRADES;
  const index = scale.indexOf(climb.grade);
  return index === -1 ? scale.length : index;
}

function byGrade(a: Climb, b: Climb) {
  return gradeRank(a) - gradeRank(b) || a.grade.localeCompare(b.grade) || a.setAt.localeCompare(b.setAt);
}

// What's up on the wall now, split by type and sorted easiest first.
function arrange(climbs: Climb[]) {
  const active = climbs.filter((climb) => climb.status === "active").sort(byGrade);
  const ofType = (type: ClimbType) => active.filter((climb) => climb.type === type);
  return { routes: ofType("route"), boulders: ofType("boulder"), combos: ofType("combo") };
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M16.7 4.15a.75.75 0 0 1 .15 1.05l-8 10.5a.75.75 0 0 1-1.13.08l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.9 7.47-9.82a.75.75 0 0 1 1.05-.15z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StarRow() {
  return (
    <span className="flex w-max">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <svg key={i} aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path d="M10.87 2.88c-.32-.77-1.42-.77-1.74 0L7.3 7.29l-4.75.38c-.83.07-1.17 1.1-.54 1.65l3.62 3.1-1.1 4.64c-.2.81.69 1.46 1.4 1.02L10 15.59l4.07 2.49c.71.44 1.6-.21 1.4-1.02l-1.1-4.64 3.62-3.1c.63-.55.3-1.58-.54-1.65l-4.75-.38-1.83-4.41z" />
        </svg>
      ))}
    </span>
  );
}

// Stands in for the stars until somebody rates the climb.
function UnratedRow() {
  return (
    <span className="flex w-max">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <svg key={i} aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM8.94 6.94a.75.75 0 1 1-1.06-1.06 3 3 0 1 1 2.87 5.01.75.75 0 0 0-.5.71v.4a.75.75 0 0 1-1.5 0v-.4c0-.97.63-1.82 1.53-2.13a1.5 1.5 0 1 0-1.34-2.53zM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
            clipRule="evenodd"
          />
        </svg>
      ))}
    </span>
  );
}

// Stars filled to the climb's average, to the tenth - or question marks
// until somebody rates it - then how many ratings that's from.
function Stars({ climb }: { climb: Climb }) {
  const { stars, ratings } = climb;
  const count = (
    <>
      <span aria-hidden="true">({ratings})</span>
      <span className="sr-only">
        from {ratings} rating{ratings === 1 ? "" : "s"}
      </span>
    </>
  );

  if (stars === null) {
    return (
      <span className="flex items-center gap-1" title="No ratings yet">
        <span aria-hidden="true" className="text-neutral-300">
          <UnratedRow />
        </span>
        <span className="sr-only">No ratings yet</span>
        <span aria-hidden="true">({ratings})</span>
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1"
      title={`${stars.toFixed(1)} out of ${MAX_STARS} stars from ${ratings} rating${ratings === 1 ? "" : "s"}`}
    >
      <span aria-hidden="true" className="relative text-neutral-300">
        <StarRow />
        <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-400" style={{ width: `${(stars / MAX_STARS) * 100}%` }}>
          <StarRow />
        </span>
      </span>
      {stars.toFixed(1)}
      <span className="sr-only">out of {MAX_STARS} stars</span>
      {count}
    </span>
  );
}

function GradeTag({ grade }: { grade: string }) {
  return (
    <span className="shrink-0 rounded bg-secondary/20 px-1.5 py-0.5 text-xs font-bold text-primary tabular-nums">
      {grade || "—"}
    </span>
  );
}

function Sends({ climb }: { climb: Climb }) {
  return (
    <span className="flex items-center gap-1" title="Sends">
      <SendIcon />
      {climb.sends}
      <span className="sr-only">sends</span>
    </span>
  );
}

function Counts({ climb }: { climb: Climb }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-neutral-500 tabular-nums">
      <Sends climb={climb} />
      <Stars climb={climb} />
    </span>
  );
}

// One climb on a line.
function LineClimb({ climb }: { climb: Climb }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 text-sm">
      <span className="min-w-0 font-medium text-neutral-800">
        <ClimbColour climb={climb} />
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <GradeTag grade={climb.grade} />
        <Counts climb={climb} />
      </span>
    </li>
  );
}

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
      {climbs.length > 0 ? (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {climbs.map((climb) => (
            <LineClimb key={climb.id} climb={climb} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-neutral-500">Nothing up on this line right now.</p>
      )}
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

function BoulderCard({ climb }: { climb: Climb }) {
  return (
    <article className="flex min-h-24 flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium text-neutral-800">
          <ClimbColour climb={climb} stacked />
        </span>
        <GradeTag grade={climb.grade} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-neutral-500 tabular-nums">
        <Sends climb={climb} />
        <Stars climb={climb} />
      </div>
    </article>
  );
}

function Placeholder({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200/70 ${className}`} />;
}

export default function ClimbsPage() {
  const [climbs, setClimbs] = useState<Climb[] | null>(null);
  const [error, setError] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    fetchClimbs()
      .then(setClimbs)
      .catch(() => setError(true));
  }, []);

  const arranged = useMemo(() => (climbs ? arrange(climbs) : null), [climbs]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead
          title="The Wall Climbs"
          tagline="Every route, boulder, and combo up on the wall right now."
          now={now}
        />

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
            The climbs couldn&apos;t be loaded. Try refreshing the page.
          </p>
        ) : !arranged ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {LINES.map((line) => (
              <Placeholder key={line} className="h-64" />
            ))}
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-6">
              <SectionRule title="Routes" />
              <LineGrid climbs={arranged.routes} noun="route" />
            </section>

            <section className="flex flex-col gap-6">
              <SectionRule title="Boulders" />
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                {arranged.boulders.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                    {arranged.boulders.map((climb) => (
                      <BoulderCard key={climb.id} climb={climb} />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-neutral-500">No boulders up right now.</p>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-6">
              <SectionRule title="Combos" />
              <LineGrid climbs={arranged.combos} noun="combo" />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
