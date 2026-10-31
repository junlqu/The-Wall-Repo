"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import ClimbCharts from "@/components/ClimbCharts";
import ClimbActions from "@/components/ClimbActions";
import ClimbColour, { Swatch } from "@/components/ClimbColour";
import TabBar from "@/components/TabBar";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import {
  CLIMB_TYPES,
  type Climb,
  climbColour,
  fetchClimbs,
  formatDate,
  LEADABLE,
  type Leadable,
  LINES,
  parseDate,
} from "@/lib/climbs";
import { BOULDER_GRADES, ROUTE_GRADES } from "@/lib/grades";

// "Routes" covers everything climbed on one colour, boulders included.
const CLIMB_FILTERS = [
  { id: "all" as const, label: "All", includes: () => true },
  { id: "routes" as const, label: "Routes", includes: (climb: Climb) => climb.type !== "combo" },
  { id: "combos" as const, label: "Combos", includes: (climb: Climb) => climb.type === "combo" },
];
type ClimbFilter = (typeof CLIMB_FILTERS)[number]["id"];

const LEADABLE_CLASS: Record<Leadable, string> = {
  Yes: "bg-green-100 text-green-800",
  Sketch: "bg-amber-100 text-amber-800",
  No: "bg-neutral-100 text-neutral-600",
  "?": "bg-neutral-100 text-neutral-400",
};

// Slugs of the climbs subpages that get a button above the tables.
const ACTIONS = [
  { slug: "new", label: "Add climb" },
  { slug: "import", label: "Import climbs" },
  { slug: "export", label: "Export climbs" },
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PAST_PAGE_SIZE = 20;

// Past climbs count the days they were up, not the days since they were set.
// Unknown when either end wasn't recorded.
function daysUp(climb: Climb, now: Date) {
  const end = climb.status === "active" ? now : climb.removedAt && parseDate(climb.removedAt);
  if (!end || !climb.setAt) return null;
  return Math.max(0, Math.floor((end.getTime() - parseDate(climb.setAt).getTime()) / ONE_DAY_MS));
}

function formatDaysUp(days: number | null) {
  return days === null ? "—" : `${days}d`;
}

// Combos use route grades. Routes and boulders are on separate scales, so a
// grade sort puts every route grade before every boulder grade.
function gradeRank(climb: Climb) {
  const scale = climb.type === "boulder" ? BOULDER_GRADES : ROUTE_GRADES;
  const index = scale.indexOf(climb.grade);
  if (index === -1) return null;
  return (climb.type === "boulder" ? 1000 : 0) + index;
}

type SortKey = "line" | "grade" | "colour" | "type" | "setter" | "setAt" | "daysUp" | "removedAt" | "leadable";
type SortValue = number | string | null;

type Column = {
  key: SortKey;
  label: string;
  value: (climb: Climb, now: Date) => SortValue;
  cell: (climb: Climb, now: Date) => ReactNode;
  cellClassName?: string;
};

const COLUMNS: Column[] = [
  {
    key: "line",
    label: "Line",
    value: (climb) => climb.line ?? null,
    cell: (climb) => climb.line ?? <span className="text-neutral-400">—</span>,
  },
  { key: "grade", label: "Grade", value: gradeRank, cell: (climb) => climb.grade, cellClassName: "font-semibold text-primary" },
  { key: "colour", label: "Colour", value: climbColour, cell: (climb) => <ClimbColour climb={climb} /> },
  {
    key: "type",
    label: "Type",
    value: (climb) => Object.keys(CLIMB_TYPES).indexOf(climb.type),
    cell: (climb) => CLIMB_TYPES[climb.type],
  },
  { key: "setter", label: "Setter", value: (climb) => climb.setter, cell: (climb) => climb.setter },
  {
    key: "setAt",
    label: "Set date",
    value: (climb) => climb.setAt,
    cell: (climb) => formatDate(climb.setAt),
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "daysUp",
    label: "Days up",
    value: daysUp,
    cell: (climb, now) => formatDaysUp(daysUp(climb, now)),
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "removedAt",
    label: "Retired",
    // Most imported past climbs never had a removal date recorded.
    value: (climb) => climb.removedAt ?? null,
    cell: (climb) => formatDate(climb.removedAt ?? ""),
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "leadable",
    label: "Leadable",
    value: (climb) => LEADABLE.indexOf(climb.leadable),
    cell: (climb) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEADABLE_CLASS[climb.leadable]}`}>
        {climb.leadable}
      </span>
    ),
  },
];

// Which columns each table shows, and the order it falls back to when no
// column has been clicked. Past climbs mostly lack removal dates, so days up
// isn't shown, and they're kept in the order they went up.
const ACTIVE_TABLE = {
  columns: COLUMNS.filter((column) => column.key !== "removedAt"),
  defaultOrder: ["type", "line", "grade"] as SortKey[],
};
const PAST_TABLE = {
  columns: COLUMNS.filter((column) => column.key !== "daysUp"),
  defaultOrder: ["type", "line", "setAt", "grade"] as SortKey[],
};

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
function sortClimbs(climbs: Climb[], sort: Sort | null, defaultOrder: SortKey[], now: Date) {
  const keys: Sort[] = [
    ...(sort ? [sort] : []),
    ...defaultOrder.filter((key) => key !== sort?.key).map((key) => ({ key, ascending: true })),
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

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// "40 routes · 7 boulders" - combos are added only when there are some, so
// the parts always add up to the total.
function typeBreakdown(climbs: Climb[]) {
  const count = (type: Climb["type"]) => climbs.filter((climb) => climb.type === type).length;
  const combos = count("combo");
  return [
    plural(count("route"), "route"),
    plural(count("boulder"), "boulder"),
    ...(combos > 0 ? [plural(combos, "combo")] : []),
  ].join(" · ");
}

// The active climbs as the wall reads them: a card per line, then every
// boulder as a small card of its own.
function CompactClimbs({ climbs, now, showBoulders }: { climbs: Climb[]; now: Date; showBoulders: boolean }) {
  const boulders = climbs.filter((climb) => climb.type === "boulder");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINES.map((line) => {
          const onLine = climbs.filter((climb) => climb.line === line);
          return (
            <section
              key={line}
              aria-label={`Line ${line}`}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
                <h3 className="font-bold text-primary">Line {line}</h3>
                <span className="text-xs text-neutral-500">{plural(onLine.length, "climb")}</span>
              </div>
              {onLine.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">Nothing up</p>
              ) : (
                <ul className="divide-y divide-neutral-100 text-sm text-neutral-700">
                  {onLine.map((climb) => (
                    <li key={climb.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-12 shrink-0 font-semibold text-primary">{climb.grade || "—"}</span>
                      <span className="min-w-0 flex-1">
                        <ClimbColour climb={climb} />
                      </span>
                      {climb.type === "combo" && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Combo</span>
                      )}
                      <span className="shrink-0 text-xs text-neutral-500">{formatDaysUp(daysUp(climb, now))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {showBoulders && (
        <section aria-label="Boulders" className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
            <h3 className="font-bold text-primary">Boulders</h3>
            <span className="text-xs text-neutral-500">{plural(boulders.length, "boulder")}</span>
          </div>
          {boulders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">Nothing up</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
              {boulders.map((boulder) => (
                // Every card has the same four lines, cut short rather than
                // wrapped, so the cards all come out the same size.
                <li
                  key={boulder.id}
                  className="flex min-w-0 flex-col gap-1 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                >
                  <span className="truncate font-semibold text-primary">{boulder.grade || "—"}</span>
                  <span className="flex min-w-0 items-center gap-2" title={boulder.colour}>
                    <Swatch colour={boulder.colour} />
                    <span className="truncate">{boulder.colour}</span>
                  </span>
                  {boulder.tape ? (
                    <span className="flex min-w-0 items-center gap-2 text-xs text-neutral-500" title={`${boulder.tape} tape`}>
                      <Swatch colour={boulder.tape} tape />
                      <span className="truncate">{boulder.tape} tape</span>
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">No tape</span>
                  )}
                  <span className="truncate text-xs text-neutral-500" title={boulder.setter}>
                    {boulder.setter || "No setter"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ClimbTable({
  title,
  href,
  climbs,
  now,
  emptyText,
  table,
  pageSize,
  allowCompact = false,
  actions,
}: {
  // Shown as a heading linking to `href`; without `href` the page's own
  // heading covers it and this only labels the controls.
  title: string;
  href?: string;
  climbs: Climb[];
  now: Date;
  emptyText: string;
  table: typeof ACTIVE_TABLE;
  // Rows shown at first and added by each "Load more". Unset shows everything.
  pageSize?: number;
  // Offers a switch to the per-line card layout instead of the table.
  allowCompact?: boolean;
  // Adds a "..." menu to each row to edit, archive or delete the climb.
  actions?: ClimbListUpdates;
}) {
  const [filter, setFilter] = useState<ClimbFilter>("all");
  const [sort, setSort] = useState<Sort | null>(null);
  const [limit, setLimit] = useState(pageSize ?? Infinity);
  const [compact, setCompact] = useState(false);
  const shown = useMemo(() => {
    const { includes } = CLIMB_FILTERS.find((item) => item.id === filter)!;
    return sortClimbs(climbs.filter(includes), sort, table.defaultOrder, now);
  }, [climbs, filter, sort, table, now]);
  // Sorting covers every climb, not just the loaded ones - the page only
  // limits how many rows are drawn. Compact mode always shows everything.
  const visible = compact ? shown : shown.slice(0, limit);

  // A different filter is a different list, so it starts from the first page.
  const changeFilter = (id: ClimbFilter) => {
    setFilter(id);
    setLimit(pageSize ?? Infinity);
  };

  // Each header cycles ascending, descending, then back to the default order.
  const toggleSort = (key: SortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, ascending: true };
      return current.ascending ? { key, ascending: false } : null;
    });
  };

  return (
    <section aria-label={href ? undefined : title} className="flex flex-col gap-3">
      {href && (
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
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-56">
          <TabBar label={`${title} type`} tabs={CLIMB_FILTERS} active={filter} onChange={changeFilter} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          {sort && (
            <button type="button" onClick={() => setSort(null)} className="font-semibold hover:text-primary">
              Reset order
            </button>
          )}
          <span className="text-right leading-snug">
            {visible.length < shown.length && `${visible.length} of `}
            {shown.length} climb{shown.length === 1 ? "" : "s"}
            <br />
            {typeBreakdown(shown)}
          </span>
          {allowCompact && (
            <button
              type="button"
              role="switch"
              aria-checked={compact}
              onClick={() => setCompact((current) => !current)}
              className="inline-flex items-center gap-2 font-semibold text-neutral-600 hover:text-primary"
            >
              <span
                aria-hidden="true"
                className={`relative h-5 w-9 rounded-full transition-colors ${compact ? "bg-primary" : "bg-neutral-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                    compact ? "left-[1.125rem]" : "left-0.5"
                  }`}
                />
              </span>
              Compact
            </button>
          )}
        </div>
      </div>

      {compact && climbs.length > 0 ? (
        // An empty filter still gets its six line cards so the wall's layout
        // stays put - only loading, a failed load or no climbs at all don't.
        <CompactClimbs climbs={shown} now={now} showBoulders={filter !== "combos"} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          {shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-500">
              {climbs.length === 0 ? emptyText : `No ${filter} to show.`}
            </p>
          ) : (
            // `relative` so absolutely positioned bits in the cells (the
            // screen-reader "Actions" label) scroll with the table instead of
            // widening the page.
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    {table.columns.map((column) => {
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
                    {actions && (
                      <th scope="col" className="w-12 px-2 py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                  {visible.map((climb) => (
                    <tr key={climb.id} className="hover:bg-secondary/5">
                      {table.columns.map((column) => (
                        <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ""}`}>
                          {column.cell(climb, now)}
                        </td>
                      ))}
                      {actions && (
                        <td className="px-2 py-1 text-right">
                          <ClimbActions climb={climb} onChanged={actions.update} onDeleted={actions.remove} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pageSize && visible.length < shown.length && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + pageSize)}
          className="self-center rounded-full border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
        >
          Load more
        </button>
      )}
    </section>
  );
}

// Keeps the page's list in step with a change that's already been saved.
type ClimbListUpdates = {
  update: (climb: Climb) => void;
  remove: (id: string) => void;
};

// Every climb from the API, split by status, plus the message to show in place
// of them while loading or after a failed load (null once they've loaded).
function useClimbs() {
  // undefined while loading, null if the API couldn't be reached.
  const [climbs, setClimbs] = useState<Climb[] | null>();

  useEffect(() => {
    fetchClimbs()
      .then(setClimbs)
      .catch(() => setClimbs(null));
  }, []);

  // A route's combos change with it, so they're picked up too. If this fails, the
  // route's own change still shows.
  const reload = () => {
    fetchClimbs()
      .then(setClimbs)
      .catch(() => {});
  };

  const updates: ClimbListUpdates = {
    update: (climb) => {
      setClimbs((current) => current?.map((item) => (item.id === climb.id ? climb : item)));
      if (climb.type === "route") reload();
    },
    remove: (id) => {
      setClimbs((current) => current?.filter((item) => item.id !== id));
      reload();
    },
  };

  return {
    all: climbs ?? [],
    active: climbs?.filter((climb) => climb.status === "active") ?? [],
    past: climbs?.filter((climb) => climb.status === "past") ?? [],
    loadingText:
      climbs === undefined ? "Loading climbs…" : climbs === null ? "Couldn't load climbs. Refresh to try again." : null,
    updates,
  };
}

const CHART_CARD_CLASS = "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm";
const ACTIVE_EMPTY_TEXT = "No climbs up right now.";
const PAST_EMPTY_TEXT = "No climbs have been archived yet.";

// Body of /admin/climbs: shortcuts to the climb tools, then every climb
// split into what's up now and what's come down.
export default function AdminClimbs({ section }: { section: AdminSection }) {
  const now = useMemo(() => new Date(), []);
  const { all, active, past, loadingText } = useClimbs();
  const subpageHref = (slug: string) => {
    const subpage = section.subpages.find((item) => item.slug === slug);
    return subpage ? adminSubpageHref(section, subpage) : `/admin/${section.slug}`;
  };

  return (
    <>
      <ClimbCharts climbs={all} subject="All recorded climbs" loadingText={loadingText} className={CHART_CARD_CLASS} />

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
        climbs={active}
        now={now}
        emptyText={loadingText ?? ACTIVE_EMPTY_TEXT}
        table={ACTIVE_TABLE}
      />
      <ClimbTable
        title="Past climbs"
        href={subpageHref("archived")}
        climbs={past}
        now={now}
        emptyText={loadingText ?? PAST_EMPTY_TEXT}
        table={PAST_TABLE}
        pageSize={PAST_PAGE_SIZE}
      />
    </>
  );
}

// /admin/climbs/active: charts of the active climbs, then their table with
// compact mode and a menu on each row to edit, archive or delete.
export function AdminActiveClimbs() {
  const now = useMemo(() => new Date(), []);
  const { active, loadingText, updates } = useClimbs();
  return (
    <>
      <ClimbCharts climbs={active} subject="Active climbs" loadingText={loadingText} className={CHART_CARD_CLASS} />
      <ClimbTable
        title="Active climbs"
        climbs={active}
        now={now}
        emptyText={loadingText ?? ACTIVE_EMPTY_TEXT}
        table={ACTIVE_TABLE}
        allowCompact
        actions={updates}
      />
    </>
  );
}

// /admin/climbs/archived: charts of the past climbs, then their table with a
// menu on each row to edit, restore or delete.
export function AdminPastClimbs() {
  const now = useMemo(() => new Date(), []);
  const { past, loadingText, updates } = useClimbs();
  return (
    <>
      <ClimbCharts climbs={past} subject="Past climbs" loadingText={loadingText} className={CHART_CARD_CLASS} />
      <ClimbTable
        title="Past climbs"
        climbs={past}
        now={now}
        emptyText={loadingText ?? PAST_EMPTY_TEXT}
        table={PAST_TABLE}
        pageSize={PAST_PAGE_SIZE}
        actions={updates}
      />
    </>
  );
}
