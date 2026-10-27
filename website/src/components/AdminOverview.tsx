"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ClimbCharts from "@/components/ClimbCharts";
import TabBar from "@/components/TabBar";
import { type Announcement, fetchAnnouncements, formatShortDate, localDate, upcomingFriday } from "@/lib/announcements";
import { type Climb, fetchClimbs, LINES, parseDate, swatchFor } from "@/lib/climbs";

type Line = (typeof LINES)[number];

type DashboardMessage = {
  id: string;
  message: string;
  severity: "high" | "medium";
  // Where to go to sort it out.
  action?: { label: string; href: string };
};

const TUESDAY = 2;
const THURSDAY = 4;
const FRIDAY = 5;

// A reminder when this week's Friday has no CotW yet: a heads up from
// Tuesday, urgent from Thursday. Nothing from Saturday to Monday, or while
// announcements haven't loaded.
function cotwMessages(announcements: Announcement[] | null | undefined, now: Date): DashboardMessage[] {
  const day = now.getDay();
  if (!announcements || day < TUESDAY || day > FRIDAY) return [];
  const friday = upcomingFriday(localDate(now));
  if (announcements.some((item) => item.type === "cotw" && item.targetDate === friday)) return [];
  return [
    {
      id: "cotw",
      message: `CotW for Friday, ${formatShortDate(parseDate(friday))} hasn't been announced yet.`,
      severity: day >= THURSDAY ? "high" : "medium",
      action: { label: "Post it", href: "/admin/announcements/new" },
    },
  ];
}

// How long a climb can stay up before the dashboard reminds admins to reset it.
const STALE_AFTER_DAYS: Partial<Record<Climb["type"], number>> = { route: 180, boulder: 120 };
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
type ClimbTypeTab = (typeof CLIMB_TYPE_TABS)[number]["id"];

// null when the set date was never recorded.
function daysUp(setAt: string, now: Date) {
  if (!setAt) return null;
  return Math.max(0, Math.floor((now.getTime() - parseDate(setAt).getTime()) / ONE_DAY_MS));
}

// Climbs with no set date can't be ranked, so they're left out.
function longestStanding(climbs: Climb[], count: number) {
  return climbs
    .filter((climb) => climb.setAt)
    .sort((a, b) => a.setAt.localeCompare(b.setAt))
    .slice(0, count);
}

function climbLabel(climb: Climb) {
  const tape = climb.tape ? ` / ${climb.tape} tape` : "";
  return `${climb.colour}${tape} ${climb.grade}`;
}

// One reminder per route or boulder that's been up past its limit, oldest first.
function staleMessages(climbs: Climb[], now: Date): DashboardMessage[] {
  return longestStanding(climbs, climbs.length).flatMap((climb) => {
    const limit = STALE_AFTER_DAYS[climb.type];
    const days = daysUp(climb.setAt, now);
    if (limit === undefined || days === null || days <= limit) return [];
    const where = climb.line === undefined ? "" : ` on line ${climb.line}`;
    return [
      {
        id: climb.id,
        message: `${climbLabel(climb)}${where} has been up for ${days} days - past the ${limit}-day ${climb.type} limit.`,
        severity: "medium",
      },
    ];
  });
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Scrolls on its own so a long list never stretches the widget.
function ClimbList({
  climbs,
  now,
  ranked = false,
  showLine = false,
  emptyText,
}: {
  climbs: Climb[];
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
      {climbs.map((climb, i) => {
        const days = daysUp(climb.setAt, now);
        return (
          <li key={climb.id} className="flex items-center gap-2.5 py-1.5">
            {ranked && <span className="w-3 text-xs font-semibold text-neutral-400">{i + 1}</span>}
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ background: swatchFor(climb.colour) }}
            />
            <span className="min-w-0 flex-1 truncate text-neutral-700">
              {climbLabel(climb)}
              {showLine && climb.line !== undefined && <span className="text-neutral-500"> · Line {climb.line}</span>}
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary">{days === null ? "—" : `${days}d`}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function AdminOverview() {
  const now = useMemo(() => new Date(), []);
  const [line, setLine] = useState<Line>(1);
  const [suggestedTab, setSuggestedTab] = useState<ClimbTypeTab>("routes");
  // undefined while loading, null if the API couldn't be reached.
  const [climbs, setClimbs] = useState<Climb[] | null>();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>();

  useEffect(() => {
    fetchClimbs()
      .then(setClimbs)
      .catch(() => setClimbs(null));
    fetchAnnouncements()
      .then(setAnnouncements)
      .catch(() => setAnnouncements(null));
  }, []);

  // Combos aren't counted here - the dashboard covers routes and boulders.
  const active = climbs?.filter((climb) => climb.status === "active") ?? [];
  const activeRoutes = active.filter((climb) => climb.type === "route");
  const activeBoulders = active.filter((climb) => climb.type === "boulder");
  const lineRoutes = activeRoutes.filter((route) => route.line === line);
  // Urgent ones first.
  const messages = [...cotwMessages(announcements, now), ...staleMessages([...activeRoutes, ...activeBoulders], now)].sort(
    (a, b) => Number(b.severity === "high") - Number(a.severity === "high"),
  );
  const loadingText =
    climbs === undefined ? "Loading climbs…" : climbs === null ? "Couldn't load climbs" : null;

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
          <span className="text-xs text-neutral-500">{plural(messages.length, "message")}</span>
        </div>
        {messages.length > 0 ? (
          <ul className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto">
            {messages.map((item) => (
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
                {item.action && (
                  <Link href={item.action.href} className="font-semibold underline hover:no-underline">
                    {item.action.label}
                  </Link>
                )}
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
            <span className="text-xs text-neutral-500">{plural(activeRoutes.length, "active route")}</span>
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
          <ClimbList climbs={lineRoutes} now={now} emptyText={loadingText ?? "No routes up on this line"} />
        </div>

        <div className={WIDGET_CLASS}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={WIDGET_TITLE_CLASS}>Boulders</h2>
            <span className="text-xs text-neutral-500">{plural(activeBoulders.length, "active boulder")}</span>
          </div>
          <div className="mt-3">
            <ClimbList climbs={activeBoulders} now={now} emptyText={loadingText ?? "No boulders up"} />
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
              climbs={longestStanding(activeRoutes, SUGGESTED_ROUTE_COUNT)}
              now={now}
              ranked
              showLine
              emptyText={loadingText ?? "No routes up"}
            />
          ) : (
            <ClimbList
              climbs={longestStanding(activeBoulders, SUGGESTED_BOULDER_COUNT)}
              now={now}
              ranked
              emptyText={loadingText ?? "No boulders up"}
            />
          )}
        </div>
      </div>

      <ClimbCharts climbs={active} subject="Active climbs" loadingText={loadingText} className={WIDGET_CLASS} />
    </section>
  );
}
