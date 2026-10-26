"use client";

import { useMemo, useState } from "react";
import GradeChart from "@/components/GradeChart";

type OverviewClimb = {
  id: string;
  colour: string;
  swatch: string;
  grade: string;
  setAt: string;
};

type OverviewRoute = OverviewClimb & { line: Line };

const LINES = [1, 2, 3, 4, 5, 6] as const;
type Line = (typeof LINES)[number];

// Placeholder - replace with active (not yet removed) routes from the API.
const ACTIVE_ROUTES: OverviewRoute[] = [
  { id: "r1", colour: "Blue", swatch: "#3b82f6", grade: "5.10a", line: 1, setAt: "2026-04-20" },
  { id: "r2", colour: "Orange", swatch: "#f97316", grade: "5.8", line: 1, setAt: "2026-09-02" },
  { id: "r3", colour: "Purple", swatch: "#a855f7", grade: "5.11b", line: 1, setAt: "2026-10-14" },
  { id: "r4", colour: "Green", swatch: "#22c55e", grade: "5.9", line: 2, setAt: "2026-07-01" },
  { id: "r5", colour: "Red", swatch: "#ef4444", grade: "5.10c", line: 2, setAt: "2026-09-20" },
  { id: "r6", colour: "Yellow", swatch: "#eab308", grade: "5.7", line: 2, setAt: "2026-10-08" },
  { id: "r7", colour: "Yellow", swatch: "#eab308", grade: "5.7", line: 3, setAt: "2026-05-28" },
  { id: "r8", colour: "Pink", swatch: "#ec4899", grade: "5.11a", line: 3, setAt: "2026-08-15" },
  { id: "r9", colour: "Black", swatch: "#171717", grade: "5.12a", line: 3, setAt: "2026-10-01" },
  { id: "r10", colour: "Teal", swatch: "#14b8a6", grade: "5.10b", line: 4, setAt: "2026-07-19" },
  { id: "r11", colour: "White", swatch: "#e5e5e5", grade: "5.9", line: 4, setAt: "2026-10-18" },
  { id: "r12", colour: "Red", swatch: "#ef4444", grade: "5.10a", line: 4, setAt: "2026-08-04" },
  { id: "r13", colour: "Blue", swatch: "#3b82f6", grade: "5.10d", line: 5, setAt: "2026-08-30" },
  { id: "r14", colour: "Green", swatch: "#22c55e", grade: "5.9", line: 5, setAt: "2026-09-25" },
  { id: "r15", colour: "Pink", swatch: "#ec4899", grade: "5.10b", line: 5, setAt: "2026-10-12" },
  { id: "r16", colour: "Green", swatch: "#22c55e", grade: "5.8", line: 6, setAt: "2026-06-30" },
  { id: "r17", colour: "Orange", swatch: "#f97316", grade: "5.11c", line: 6, setAt: "2026-09-11" },
  { id: "r18", colour: "Purple", swatch: "#a855f7", grade: "5.10a", line: 6, setAt: "2026-10-20" },
];

// Placeholder - replace with active boulders from the API.
const ACTIVE_BOULDERS: OverviewClimb[] = [
  { id: "b1", colour: "Red", swatch: "#ef4444", grade: "V2-3", setAt: "2026-06-05" },
  { id: "b2", colour: "Blue", swatch: "#3b82f6", grade: "V4-5", setAt: "2026-07-22" },
  { id: "b3", colour: "Yellow", swatch: "#eab308", grade: "VB", setAt: "2026-08-08" },
  { id: "b4", colour: "Orange", swatch: "#f97316", grade: "V0-1", setAt: "2026-08-21" },
  { id: "b5", colour: "Pink", swatch: "#ec4899", grade: "V2-3", setAt: "2026-09-03" },
  { id: "b6", colour: "Purple", swatch: "#a855f7", grade: "V4-5", setAt: "2026-09-27" },
  { id: "b7", colour: "Teal", swatch: "#14b8a6", grade: "V2-3", setAt: "2026-10-02" },
  { id: "b8", colour: "Green", swatch: "#22c55e", grade: "V0-1", setAt: "2026-10-10" },
  { id: "b9", colour: "White", swatch: "#e5e5e5", grade: "Dyno", setAt: "2026-10-16" },
];

type DashboardMessage = {
  id: string;
  message: string;
  severity: "high" | "medium";
};

// Placeholder - replace with generated alerts (stale routes, missing
// announcements, open maintenance reports, etc.).
const MESSAGES: DashboardMessage[] = [
  { id: "1", message: "Blue 5.10a on line 1 has been up for over 180 days.", severity: "medium" },
  { id: "2", message: "CotW announcement not made yet for upcoming Friday.", severity: "medium" },
];

const SUGGESTED_ROUTE_COUNT = 5;
const SUGGESTED_BOULDER_COUNT = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Widgets sit inside the one Admin Dashboard card, so they're set apart by a
// tint rather than borders of their own.
const WIDGET_CLASS = "flex flex-col rounded-lg bg-neutral-50 p-4";
const WIDGET_TITLE_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

const CLIMB_TYPE_TABS = [
  { id: "routes" as const, label: "Routes" },
  { id: "boulders" as const, label: "Boulders" },
];
type ClimbType = (typeof CLIMB_TYPE_TABS)[number]["id"];

function daysUp(setAt: string, now: Date) {
  // Parse as a local date so "2026-06-12" doesn't shift a day in UTC-minus zones.
  const [year, month, day] = setAt.split("-").map(Number);
  return Math.max(0, Math.floor((now.getTime() - new Date(year, month - 1, day).getTime()) / ONE_DAY_MS));
}

function longestStanding<T extends OverviewClimb>(climbs: T[], count: number) {
  return [...climbs].sort((a, b) => a.setAt.localeCompare(b.setAt)).slice(0, count);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function TabBar<T extends string | number>({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: string; ariaLabel?: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-md bg-neutral-200/70 p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-label={tab.ariaLabel}
          onClick={() => onChange(tab.id)}
          className={`min-w-7 flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
            tab.id === active ? "bg-white text-primary shadow-sm" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Scrolls on its own so a long list never stretches the widget.
function ClimbList({
  climbs,
  now,
  ranked = false,
  showLine = false,
  emptyText,
}: {
  climbs: (OverviewClimb & { line?: number })[];
  now: Date;
  ranked?: boolean;
  showLine?: boolean;
  emptyText: string;
}) {
  if (climbs.length === 0) {
    return <p className="flex h-64 items-center justify-center text-sm text-neutral-500">{emptyText}</p>;
  }

  return (
    <ol className="h-64 divide-y divide-neutral-200/70 overflow-y-auto text-sm">
      {climbs.map((climb, i) => (
        <li key={climb.id} className="flex items-center gap-2.5 py-1.5">
          {ranked && <span className="w-3 text-xs font-semibold text-neutral-400">{i + 1}</span>}
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: climb.swatch }}
          />
          <span className="min-w-0 flex-1 truncate text-neutral-700">
            {climb.colour} {climb.grade}
            {showLine && climb.line !== undefined && <span className="text-neutral-500"> · Line {climb.line}</span>}
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary">{daysUp(climb.setAt, now)}d</span>
        </li>
      ))}
    </ol>
  );
}

export default function AdminOverview() {
  const now = useMemo(() => new Date(), []);
  const [line, setLine] = useState<Line>(1);
  const [suggestedTab, setSuggestedTab] = useState<ClimbType>("routes");
  const [gradeTab, setGradeTab] = useState<ClimbType>("routes");

  const lineRoutes = ACTIVE_ROUTES.filter((route) => route.line === line);

  return (
    <section
      aria-labelledby="admin-dashboard-heading"
      className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm"
    >
      <h1 id="admin-dashboard-heading" className="text-xl font-bold text-primary">
        Admin Dashboard
      </h1>

      <div className={WIDGET_CLASS}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={WIDGET_TITLE_CLASS}>Messages</h2>
          <span className="text-xs text-neutral-500">{plural(MESSAGES.length, "message")}</span>
        </div>
        {MESSAGES.length > 0 ? (
          <ul className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto">
            {MESSAGES.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-baseline gap-x-2 rounded-md border-l-4 px-3 py-2 text-sm ${
                  item.severity === "high"
                    ? "border-red-500 bg-red-50 text-red-900"
                    : "border-amber-400 bg-amber-50 text-amber-900"
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide">
                  {item.severity === "high" ? "Urgent" : "Heads up"}
                </span>
                {item.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Nothing needs attention right now.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className={WIDGET_CLASS}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={WIDGET_TITLE_CLASS}>Routes</h2>
            <span className="text-xs text-neutral-500">{plural(ACTIVE_ROUTES.length, "active route")}</span>
          </div>
          <div className="mt-3">
            <TabBar
              label="Line"
              tabs={LINES.map((id) => ({ id, label: `${id}`, ariaLabel: `Line ${id}` }))}
              active={line}
              onChange={setLine}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Line {line} · {plural(lineRoutes.length, "route")}
          </p>
          <ClimbList climbs={lineRoutes} now={now} emptyText="No routes up on this line" />
        </div>

        <div className={WIDGET_CLASS}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={WIDGET_TITLE_CLASS}>Boulders</h2>
            <span className="text-xs text-neutral-500">{plural(ACTIVE_BOULDERS.length, "active boulder")}</span>
          </div>
          <div className="mt-3">
            <ClimbList climbs={ACTIVE_BOULDERS} now={now} emptyText="No boulders up" />
          </div>
        </div>

        <div className={WIDGET_CLASS}>
          <h2 className={WIDGET_TITLE_CLASS}>Suggested setting</h2>
          <div className="mt-3">
            <TabBar label="Climb type" tabs={CLIMB_TYPE_TABS} active={suggestedTab} onChange={setSuggestedTab} />
          </div>
          <p className="mt-2 text-xs text-neutral-500">Up the longest</p>
          {suggestedTab === "routes" ? (
            <ClimbList
              climbs={longestStanding(ACTIVE_ROUTES, SUGGESTED_ROUTE_COUNT)}
              now={now}
              ranked
              showLine
              emptyText="No routes up"
            />
          ) : (
            <ClimbList
              climbs={longestStanding(ACTIVE_BOULDERS, SUGGESTED_BOULDER_COUNT)}
              now={now}
              ranked
              emptyText="No boulders up"
            />
          )}
        </div>
      </div>

      <div className={WIDGET_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className={WIDGET_TITLE_CLASS}>Grades</h2>
            <p className="text-xs text-neutral-500">Active climbs at each grade</p>
          </div>
          <div className="w-44">
            <TabBar label="Climb type" tabs={CLIMB_TYPE_TABS} active={gradeTab} onChange={setGradeTab} />
          </div>
        </div>
        <div className="mt-3">
          {gradeTab === "routes" ? (
            <GradeChart kind="route" grades={ACTIVE_ROUTES.map((route) => route.grade)} />
          ) : (
            <GradeChart kind="boulder" grades={ACTIVE_BOULDERS.map((boulder) => boulder.grade)} />
          )}
        </div>
      </div>
    </section>
  );
}
