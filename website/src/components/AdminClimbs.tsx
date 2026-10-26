"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import TabBar from "@/components/TabBar";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import { BOULDER_GRADES, ROUTE_GRADES } from "@/lib/grades";

const CLIMB_TYPES = { route: "Route", boulder: "Boulder", combo: "Combo" } as const;
type ClimbType = keyof typeof CLIMB_TYPES;

// "Routes" covers everything climbed on one colour, boulders included.
const CLIMB_FILTERS = [
  { id: "all" as const, label: "All", includes: () => true },
  { id: "routes" as const, label: "Routes", includes: (climb: AdminClimb) => climb.type !== "combo" },
  { id: "combos" as const, label: "Combos", includes: (climb: AdminClimb) => climb.type === "combo" },
];
type ClimbFilter = (typeof CLIMB_FILTERS)[number]["id"];

const LEADABLE =["Yes", "Sketch", "No", "?"] as const;
type Leadable = (typeof LEADABLE)[number];

type AdminClimb = {
  id: string;
  type: ClimbType;
  colour: string;
  // Combos only - one colour per hand, so the climb is `colour` / `secondary`.
  secondary?: string;
  tape?: string;
  grade: string;
  // Routes and combos only - boulders aren't on a line.
  line?: number;
  setter: string;
  setAt: string;
  removedAt?: string;
  leadable: Leadable;
};

// Placeholder - replace with routes and boulders from the API, split on
// whether they've been removed.
const ACTIVE_CLIMBS: AdminClimb[] = [
  { id: "r1", type: "route", colour: "Blue", grade: "5.10a", line: 1, setter: "Alex", setAt: "2026-04-20", leadable: "Yes" },
  { id: "r2", type: "route", colour: "Orange", grade: "5.8", line: 1, setter: "Sam", setAt: "2026-09-02", leadable: "Yes" },
  { id: "r3", type: "route", colour: "Purple", grade: "5.11b", line: 1, setter: "Jordan", setAt: "2026-10-14", leadable: "Sketch" },
  { id: "r4", type: "route", colour: "Green", grade: "5.9", line: 2, setter: "Alex", setAt: "2026-07-01", leadable: "Yes" },
  { id: "r5", type: "route", colour: "Red", tape: "Black", grade: "5.10c", line: 2, setter: "Riley", setAt: "2026-09-20", leadable: "No" },
  { id: "r9", type: "route", colour: "Black", grade: "5.12a", line: 3, setter: "Sam", setAt: "2026-10-01", leadable: "?" },
  { id: "r11", type: "route", colour: "White", grade: "5.9", line: 4, setter: "Jordan", setAt: "2026-10-18", leadable: "Yes" },
  { id: "c1", type: "combo", colour: "Blue", secondary: "Orange", grade: "5.11a", line: 1, setter: "Alex", setAt: "2026-08-12", leadable: "Sketch" },
  { id: "c2", type: "combo", colour: "Green", secondary: "Red", grade: "5.10b", line: 2, setter: "Riley", setAt: "2026-09-28", leadable: "?" },
  { id: "b1", type: "boulder", colour: "Red", tape: "Purple", grade: "V2-3", setter: "Riley", setAt: "2026-06-05", leadable: "No" },
  { id: "b2", type: "boulder", colour: "Blue", tape: "Brown", grade: "V4-5", setter: "Alex", setAt: "2026-07-22", leadable: "No" },
  { id: "b8", type: "boulder", colour: "Green", tape: "Yellow", grade: "V0-1", setter: "Sam", setAt: "2026-10-10", leadable: "No" },
];

// Placeholder - replace with removed routes and boulders from the API.
const PAST_CLIMBS: AdminClimb[] = [
  { id: "r20", type: "route", colour: "Yellow", grade: "5.10b", line: 2, setter: "Jordan", setAt: "2026-03-02", removedAt: "2026-07-01", leadable: "Yes" },
  { id: "r21", type: "route", colour: "Pink", grade: "5.11a", line: 5, setter: "Alex", setAt: "2026-02-14", removedAt: "2026-08-30", leadable: "Sketch" },
  { id: "r22", type: "route", colour: "Teal", grade: "5.7", line: 4, setter: "Riley", setAt: "2026-05-10", removedAt: "2026-10-18", leadable: "Yes" },
  { id: "c20", type: "combo", colour: "Orange", secondary: "Purple", grade: "5.10d", line: 3, setter: "Sam", setAt: "2026-04-11", removedAt: "2026-09-01", leadable: "No" },
  { id: "b20", type: "boulder", colour: "Purple", tape: "Red", grade: "V6-7", setter: "Sam", setAt: "2026-04-01", removedAt: "2026-08-21", leadable: "No" },
  { id: "b21", type: "boulder", colour: "Orange", tape: "Blue", grade: "VB", setter: "Jordan", setAt: "2026-05-18", removedAt: "2026-10-02", leadable: "No" },
];

// Placeholder - swap for the wall's real hold and tape colours.
const SWATCHES: Record<string, string> = {
  Red: "#ef4444",
  Orange: "#f97316",
  Yellow: "#eab308",
  Green: "#22c55e",
  Teal: "#14b8a6",
  Blue: "#3b82f6",
  Purple: "#a855f7",
  Pink: "#ec4899",
  Brown: "#92400e",
  Black: "#171717",
  White: "#e5e5e5",
};

const LEADABLE_CLASS: Record<Leadable, string> = {
  Yes: "bg-green-100 text-green-800",
  Sketch: "bg-amber-100 text-amber-800",
  No: "bg-neutral-100 text-neutral-600",
  "?": "bg-neutral-100 text-neutral-400",
};

// Slugs of the climbs subpages that get a button above the tables.
const ACTIONS = [
  { slug: "new", label: "Add climb" },
  { slug: "archive", label: "Archive climb" },
  { slug: "import", label: "Import climbs" },
  { slug: "export", label: "Export climbs" },
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Parse as a local date so "2026-06-12" doesn't shift a day in UTC-minus zones.
function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: string) {
  return parseDate(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Past climbs count the days they were up, not the days since they were set.
function daysUp(climb: AdminClimb, now: Date) {
  const end = climb.removedAt ? parseDate(climb.removedAt) : now;
  return Math.max(0, Math.floor((end.getTime() - parseDate(climb.setAt).getTime()) / ONE_DAY_MS));
}

// Combos use route grades. Routes and boulders are on separate scales, so a
// grade sort puts every route grade before every boulder grade.
function gradeRank(climb: AdminClimb) {
  const scale = climb.type === "boulder" ? BOULDER_GRADES : ROUTE_GRADES;
  const index = scale.indexOf(climb.grade);
  if (index === -1) return null;
  return (climb.type === "boulder" ? 1000 : 0) + index;
}

function climbColour(climb: AdminClimb) {
  return climb.secondary ? `${climb.colour} / ${climb.secondary}` : climb.colour;
}

type SortKey ="line" | "grade" | "colour" | "type" | "setter" | "setAt" | "daysUp" | "leadable";
type SortValue = number | string | null;

const COLUMNS: { key: SortKey; label: string; value: (climb: AdminClimb, now: Date) => SortValue }[] = [
  { key: "line", label: "Line", value: (climb) => climb.line ?? null },
  { key: "grade", label: "Grade", value: gradeRank },
  { key: "colour", label: "Colour", value: climbColour },
  { key: "type", label: "Type", value: (climb) => Object.keys(CLIMB_TYPES).indexOf(climb.type) },
  { key: "setter", label: "Setter", value: (climb) => climb.setter },
  { key: "setAt", label: "Set date", value: (climb) => climb.setAt },
  { key: "daysUp", label: "Days up", value: daysUp },
  { key: "leadable", label: "Leadable", value: (climb) => LEADABLE.indexOf(climb.leadable) },
];

const DEFAULT_ORDER: SortKey[] = ["type", "line", "grade"];

type Sort = { key: SortKey; ascending: boolean };

// Blanks (a boulder's line, an unknown grade) sink to the bottom whichever
// way the column is sorted.
function compareValues(a: SortValue, b: SortValue, ascending: boolean) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return ascending ? order : -order;
}

// The chosen column decides first, then the default order breaks ties.
function sortClimbs(climbs: AdminClimb[], sort: Sort | null, now: Date) {
  const keys: Sort[] = [
    ...(sort ? [sort] : []),
    ...DEFAULT_ORDER.filter((key) => key !== sort?.key).map((key) => ({ key, ascending: true })),
  ];
  const columns = keys.map(({ key, ascending }) => ({
    value: COLUMNS.find((column) => column.key === key)!.value,
    ascending,
  }));

  return [...climbs].sort((a, b) => {
    for (const { value, ascending } of columns) {
      const order = compareValues(value(a, now), value(b, now), ascending);
      if (order !== 0) return order;
    }
    return 0;
  });
}

function Swatch({ colour, tape = false }: { colour: string; tape?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 ring-1 ring-black/10 ${tape ? "h-1.5 w-3 rounded-sm" : "h-2.5 w-2.5 rounded-full"}`}
      style={{ backgroundColor: SWATCHES[colour] ?? "#a3a3a3" }}
    />
  );
}

function ClimbTable({
  title,
  href,
  climbs,
  now,
  emptyText,
}: {
  title: string;
  href: string;
  climbs: AdminClimb[];
  now: Date;
  emptyText: string;
}) {
  const [filter, setFilter] = useState<ClimbFilter>("all");
  const [sort, setSort] = useState<Sort | null>(null);
  const shown = useMemo(() => {
    const { includes } = CLIMB_FILTERS.find((item) => item.id === filter)!;
    return sortClimbs(climbs.filter(includes), sort, now);
  }, [climbs, filter, sort, now]);

  // Each header cycles ascending, descending, then back to the default order.
  const toggleSort = (key: SortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, ascending: true };
      return current.ascending ? { key, ascending: false } : null;
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={href} className="group flex items-center gap-2">
          <h2 className="text-xl font-bold text-primary transition-colors group-hover:text-secondary">{title}</h2>
          <span
            aria-hidden="true"
            className="text-lg text-neutral-400 transition-all group-hover:translate-x-1 group-hover:text-secondary"
          >
            →
          </span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-56">
          <TabBar label={`${title} type`} tabs={CLIMB_FILTERS} active={filter} onChange={setFilter} />
        </div>
        <div className="flex items-baseline gap-3 text-xs text-neutral-500">
          {sort && (
            <button type="button" onClick={() => setSort(null)} className="font-semibold hover:text-primary">
              Reset order
            </button>
          )}
          <span>
            {shown.length} climb{shown.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">
            {climbs.length === 0 ? emptyText : `No ${filter} to show.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  {COLUMNS.map((column) => {
                    const isSorted = sort?.key === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={isSorted ? (sort.ascending ? "ascending" : "descending") : undefined}
                        className="px-4 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={`group inline-flex items-center gap-1 whitespace-nowrap py-1 uppercase tracking-wide transition-colors hover:text-primary ${
                            isSorted ? "text-primary" : ""
                          }`}
                        >
                          {column.label}
                          <span
                            aria-hidden="true"
                            className={isSorted ? "" : "text-neutral-300 group-hover:text-neutral-400"}
                          >
                            {isSorted ? (sort.ascending ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {shown.map((climb) => (
                  <tr key={climb.id} className="hover:bg-secondary/5">
                    <td className="px-4 py-3">{climb.line ?? <span className="text-neutral-400">—</span>}</td>
                    <td className="px-4 py-3 font-semibold text-primary">{climb.grade}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-0.5">
                            <Swatch colour={climb.colour} />
                            {climb.secondary && <Swatch colour={climb.secondary} />}
                          </span>
                          {climbColour(climb)}
                        </span>
                        {climb.tape && (
                          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                            <Swatch colour={climb.tape} tape />
                            {climb.tape} tape
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">{CLIMB_TYPES[climb.type]}</td>
                    <td className="px-4 py-3">{climb.setter}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(climb.setAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{daysUp(climb, now)}d</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEADABLE_CLASS[climb.leadable]}`}>
                        {climb.leadable}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// Body of /admin/climbs: shortcuts to the climb tools, then every climb
// split into what's up now and what's come down.
export default function AdminClimbs({ section }: { section: AdminSection }) {
  const now = useMemo(() => new Date(), []);
  const subpageHref = (slug: string) => {
    const subpage = section.subpages.find((item) => item.slug === slug);
    return subpage ? adminSubpageHref(section, subpage) : `/admin/${section.slug}`;
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {ACTIONS.map((action, index) => (
          <Link
            key={action.slug}
            href={subpageHref(action.slug)}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors ${
              index === 0
                ? "bg-secondary hover:bg-secondary/80"
                : "border border-primary bg-white hover:bg-primary hover:text-white"
            }`}
          >
            {action.label}
          </Link>
        ))}
      </div>

      <ClimbTable
        title="Active climbs"
        href={subpageHref("active")}
        climbs={ACTIVE_CLIMBS}
        now={now}
        emptyText="No climbs up right now."
      />
      <ClimbTable
        title="Past climbs"
        href={subpageHref("archived")}
        climbs={PAST_CLIMBS}
        now={now}
        emptyText="No climbs have been archived yet."
      />
    </>
  );
}
