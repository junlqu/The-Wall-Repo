"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ActivityScale, bucketsFor, dayOf, describeScale } from "@/components/AdminUsers";
import { byGrade, ChevronIcon, GradeTag, Placeholder } from "@/components/ClimbCards";
import ClimbColour from "@/components/ClimbColour";
import { FIELD_CLASS } from "@/components/ClimbForm";
import GroupedCountChart from "@/components/GroupedCountChart";
import { SectionRule } from "@/components/Masthead";
import SlidingTabs from "@/components/SlidingTabs";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import { type Climb, type ClimbType, climbTypeLabel, LINES, todayDate } from "@/lib/climbs";
import {
  type CommentActivity,
  compareDisagreement,
  fetchCommentActivity,
  fetchGradeReport,
  gradingReportHref,
  type GradeVotes,
  MIN_GRADE_VOTES,
  needsGradeReview,
  tallyGradeVotes,
} from "@/lib/moderation";

// As on the User Dashboard, everything sits inside one card and its parts are
// set apart by a tint rather than borders of their own.
const WIDGET_CLASS = "flex flex-col rounded-lg bg-neutral-50 p-4";
const WIDGET_TITLE_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";
// How many climbs the dashboard's grading updates list before pointing to the
// grading reports for the rest.
const UPDATES_SHOWN = 8;

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

function subpageHref(section: AdminSection, slug: string) {
  const subpage = section.subpages.find((item) => item.slug === slug);
  return subpage ? adminSubpageHref(section, subpage) : `/admin/${section.slug}`;
}

// ---------------------------------------------------------------------------
// Grade votes

type Reports = { climbs: Climb[]; votes: Map<string, GradeVotes> };

// The active climbs - every kind, or only `type` - easiest first, with how
// their comments' proposed grades sit against each one's grade. Undefined
// while loading, or the error. Only loads once `enabled`, so a grading
// reports dropdown waits until it's opened.
function useGradeReports(type?: ClimbType, enabled = true) {
  const [reports, setReports] = useState<Reports | { error: string }>();

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    fetchGradeReport(type)
      .then(({ climbs, tallies }) => {
        const sorted = [...climbs].sort(byGrade);
        if (current) setReports({ climbs: sorted, votes: tallyGradeVotes(sorted, tallies) });
      })
      .catch((error: Error) => current && setReports({ error: error.message }));
    return () => {
      current = false;
    };
  }, [type, enabled]);

  return reports;
}

// Coloured as a commenter's proposed grade is on the climbs pages - green
// for easier, yellow for its grade, red for harder. `legend` names each in
// the grading reports' key; `label` is the fuller wording read out.
export const VOTE_SQUARES = [
  { key: "easier", className: "bg-green-100 text-green-700", label: "easier than its grade", legend: "Easier" },
  {
    key: "same",
    className: "bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-200",
    label: "at its grade",
    legend: "Accurate",
  },
  { key: "harder", className: "bg-red-100 text-red-700", label: "harder than its grade", legend: "Harder" },
] as const;

export function GradeVoteSquares({ votes }: { votes: GradeVotes }) {
  return (
    <span className="flex shrink-0 gap-1">
      {VOTE_SQUARES.map(({ key, className, label }) => (
        <span
          key={key}
          title={`${plural(votes[key], "comment")} graded it ${label}`}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold tabular-nums ${className} ${
            votes[key] === 0 ? "opacity-40" : ""
          }`}
        >
          <span aria-hidden="true">{votes[key]}</span>
          <span className="sr-only">
            {plural(votes[key], "comment")} {label}.
          </span>
        </span>
      ))}
    </span>
  );
}

export function FlagIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`shrink-0 ${className}`}>
      <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.39l1.66-.35a6.45 6.45 0 0 1 4.27.57 7.95 7.95 0 0 0 5.97.53l2.07-.64a.75.75 0 0 0 .53-.72v-8.5a.75.75 0 0 0-.9-.73l-2.38.5a7.25 7.25 0 0 1-4.19-.36l-.5-.2a8.75 8.75 0 0 0-5.05-.44l-1.48.31V2.75z" />
    </svg>
  );
}

// Marks a climb whose listed grade might need some work. Just the flag on
// phones, where the row has no room for the words.
export function ReviewBadge() {
  return (
    <span
      title={`Of its ${MIN_GRADE_VOTES}+ graders, more put it under or over its grade than at it`}
      className="inline-flex shrink-0 items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-800"
    >
      <FlagIcon />
      <span className="max-sm:sr-only">Check grade</span>
    </span>
  );
}

const NO_VOTES: GradeVotes = { easier: 0, same: 0, harder: 0 };

// A climb as a row of the public climbs pages, cut down to its colour and
// grade, with its grade votes on the right. Links to the climb's grading
// report, where its comments are.
function ReportRow({ climb, votes = NO_VOTES, tapeRow }: { climb: Climb; votes?: GradeVotes; tapeRow: boolean }) {
  const flagged = needsGradeReview(votes);
  return (
    <li className="py-1">
      <Link
        href={gradingReportHref(climb.id)}
        className={`relative -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 ${
          tapeRow ? "py-3" : "py-2"
        } text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
          flagged ? "bg-orange-50 ring-1 ring-inset ring-orange-200 hover:bg-orange-100/60" : "hover:bg-neutral-50"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-800">
          <ClimbColour climb={climb} tapeRow={tapeRow} />
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {flagged && <ReviewBadge />}
          <GradeTag grade={climb.grade} />
          <GradeVoteSquares votes={votes} />
        </span>
      </Link>
    </li>
  );
}

function ReportRows({
  climbs,
  votes,
  empty,
  tapeRow = false,
}: {
  climbs: Climb[];
  votes: Map<string, GradeVotes>;
  empty: string;
  tapeRow?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-5 py-2 shadow-sm sm:px-6">
      {climbs.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {climbs.map((climb) => (
            <ReportRow key={climb.id} climb={climb} votes={votes.get(climb.id)} tapeRow={tapeRow} />
          ))}
        </ul>
      )}
    </div>
  );
}

// What the squares and the flag mean.
function VoteLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-600">
      {VOTE_SQUARES.map(({ key, className, legend }) => (
        <span key={key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-3.5 w-3.5 rounded ${className}`} />
          {legend}
        </span>
      ))}
      <span
        title={`${MIN_GRADE_VOTES}+ comments grade it, and more put it easier, or more put it harder, than at its grade`}
        className="flex items-center gap-1.5"
      >
        <span className="text-orange-700">
          <FlagIcon />
        </span>
        Flagged
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard

// The active climbs whose graders most disagree with their grade, worst first.
function GradingUpdates({ reports, href }: { reports: ReturnType<typeof useGradeReports>; href: string }) {
  const loaded = reports && "climbs" in reports ? reports : null;
  const flagged =
    loaded?.climbs
      .filter((climb) => needsGradeReview(loaded.votes.get(climb.id)))
      .sort((a, b) => compareDisagreement(loaded.votes.get(a.id)!, loaded.votes.get(b.id)!)) ?? [];
  const shown = flagged.slice(0, UPDATES_SHOWN);

  return (
    <section aria-labelledby="grading-updates-heading" className={WIDGET_CLASS}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 id="grading-updates-heading" className={WIDGET_TITLE_CLASS}>
            Grading updates
          </h3>
          <p className="text-xs text-neutral-500">Climbs whose comments mostly disagree with their grade</p>
        </div>
        {loaded && <span className="shrink-0 text-xs text-neutral-500">{flagged.length} to check</span>}
      </div>

      <div className="mt-3">
        {reports === undefined ? (
          <p className="py-6 text-center text-sm text-neutral-500">Loading…</p>
        ) : !loaded ? (
          <p className="py-6 text-center text-sm text-neutral-500">Couldn&apos;t load the grading reports</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">Every climb&apos;s grade is holding up</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {shown.map((climb) => (
              <li key={climb.id}>
                <Link
                  href={gradingReportHref(climb.id)}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                      {climbTypeLabel(climb)}
                      {climb.line !== undefined && ` · Line ${climb.line}`}
                    </span>
                    <span className="font-medium text-neutral-800">
                      <ClimbColour climb={climb} />
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <GradeTag grade={climb.grade} />
                    <GradeVoteSquares votes={loaded.votes.get(climb.id)!} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loaded && (
        <Link
          href={href}
          className="group mt-3 inline-flex items-center gap-1 self-end text-xs font-semibold text-primary hover:text-secondary"
        >
          {flagged.length > shown.length ? `See all ${flagged.length} in grading reports` : "See grading reports"}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      )}
    </section>
  );
}

const ACTIVITY_SCALES: { id: ActivityScale; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

const ACTIVITY_SERIES = [
  { name: "Comments", colorClassName: "bg-primary" },
  { name: "Sends", colorClassName: "bg-secondary" },
];

const ARROW_BUTTON_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-600";

// The YYYY-MM `months` either side of `month`.
function addMonths(month: string, months: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + months, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthName(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Every YYYY-MM from `first` to `last`, newest first.
function monthsBetween(first: string, last: string) {
  const months: string[] = [];
  for (let month = last; month >= first; month = addMonths(month, -1)) months.push(month);
  return months;
}

// Comments with text posted per day of a month or per month of a year, with
// the sends beside them. Starts on this month; the arrows and picker go back
// as far as the first comment or send, and no further on than now.
function ActivityChart() {
  const thisMonth = todayDate().slice(0, 7);
  const [scale, setScale] = useState<ActivityScale>("month");
  // The month shown, YYYY-MM - the year view shows the year it's in.
  const [month, setMonth] = useState(thisMonth);
  const year = Number(month.slice(0, 4));
  // Each year's activity once it's loaded, or null if it couldn't be.
  const [years, setYears] = useState<Record<number, CommentActivity | null>>({});
  // Years already asked for, so each is only fetched once.
  const requested = useRef(new Set<number>());

  useEffect(() => {
    if (requested.current.has(year)) return;
    requested.current.add(year);
    fetchCommentActivity(year)
      .then((activity) => setYears((current) => ({ ...current, [year]: activity })))
      .catch(() => {
        // Coming back to the year tries again.
        requested.current.delete(year);
        setYears((current) => ({ ...current, [year]: null }));
      });
  }, [year]);

  const activity = years[year];
  // Every year's answer gives the same earliest day; until one has loaded,
  // the chart can't go back past this month.
  const earliest = Object.values(years).find((loaded) => loaded?.earliest)?.earliest?.slice(0, 7) ?? thisMonth;
  const firstMonth = earliest < thisMonth ? earliest : thisMonth;
  const firstYear = Number(firstMonth.slice(0, 4));
  const thisYear = Number(thisMonth.slice(0, 4));
  const clamp = (next: string) => (next > thisMonth ? thisMonth : next < firstMonth ? firstMonth : next);

  const isMonth = scale === "month";
  const atStart = isMonth ? month <= firstMonth : year <= firstYear;
  const atEnd = isMonth ? month >= thisMonth : year >= thisYear;
  const step = (direction: 1 | -1) => setMonth(clamp(addMonths(month, direction * (isMonth ? 1 : 12))));
  const periodName = isMonth ? monthName(month) : String(year);

  const buckets = bucketsFor(scale, `${month}-01`);
  const keyLength = isMonth ? 10 : 7;
  const countPer = (values: string[]) => {
    const tally = new Map(buckets.map((bucket) => [bucket.key, 0]));
    for (const value of values) {
      const key = dayOf(value).slice(0, keyLength);
      const count = tally.get(key);
      if (count !== undefined) tally.set(key, count + 1);
    }
    return buckets.map((bucket) => tally.get(bucket.key)!);
  };
  const comments = countPer(activity?.comments ?? []);
  const sends = countPer(activity?.sends ?? []);
  const sum = (counts: number[]) => counts.reduce((total, count) => total + count, 0);
  const description = describeScale(scale, buckets);

  return (
    <section aria-label="Comment activity" className={WIDGET_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={WIDGET_TITLE_CLASS}>Comments</h3>
          <p className="text-xs text-neutral-500">
            {description}
            {activity && ` · ${plural(sum(comments), "comment")} · ${plural(sum(sends), "send")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={isMonth ? "Previous month" : "Previous year"}
              disabled={atStart}
              onClick={() => step(-1)}
              className={ARROW_BUTTON_CLASS}
            >
              ←
            </button>
            <label>
              <span className="sr-only">{isMonth ? "Month" : "Year"}</span>
              <select
                value={isMonth ? month : String(year)}
                onChange={(event) =>
                  setMonth(isMonth ? event.target.value : clamp(`${event.target.value}-${month.slice(5)}`))
                }
                className={`${FIELD_CLASS} w-auto py-1 font-semibold text-primary`}
              >
                {isMonth
                  ? monthsBetween(firstMonth, thisMonth).map((option) => (
                      <option key={option} value={option}>
                        {monthName(option)}
                      </option>
                    ))
                  : Array.from({ length: thisYear - firstYear + 1 }, (_, i) => String(thisYear - i)).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
              </select>
            </label>
            <button
              type="button"
              aria-label={isMonth ? "Next month" : "Next year"}
              disabled={atEnd}
              onClick={() => step(1)}
              className={ARROW_BUTTON_CLASS}
            >
              →
            </button>
          </div>
          <SlidingTabs label="Period" tabs={ACTIVITY_SCALES} active={scale} onChange={setScale} className="w-32" />
        </div>
      </div>
      <div className="mt-3">
        {activity === undefined ? (
          <p className="flex h-44 items-center justify-center text-sm text-neutral-500">Loading…</p>
        ) : activity === null ? (
          <p className="flex h-44 items-center justify-center text-sm text-neutral-500">Couldn&apos;t load the activity</p>
        ) : (
          <GroupedCountChart
            series={ACTIVITY_SERIES}
            counts={buckets.map((bucket, index) => ({ label: bucket.label, values: [comments[index], sends[index]] }))}
            noun={(count) => count.toLocaleString()}
            formatCount={(count) => count.toLocaleString()}
            caption={`Comments and sends ${description.toLowerCase()}`}
            categoryHeader={isMonth ? "Day" : "Month"}
            emptyText={`No comments or sends in ${periodName}`}
            barClassName={isMonth ? "min-w-12" : "min-w-14"}
          />
        )}
      </div>
    </section>
  );
}

// Comments people have flagged as inappropriate. Only the frame for now -
// the list is filled from the flags container in a later change.
function FlaggedComments() {
  return (
    <section aria-labelledby="flagged-comments-heading" className={WIDGET_CLASS}>
      <div>
        <h3 id="flagged-comments-heading" className={WIDGET_TITLE_CLASS}>
          Flagged comments
        </h3>
        <p className="text-xs text-neutral-500">Comments people have flagged as inappropriate, newest first</p>
      </div>
      <div className="mt-3 flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center">
        <span className="text-neutral-300">
          <FlagIcon className="h-6 w-6" />
        </span>
        <p className="mt-2 text-sm font-semibold text-neutral-700">No flagged comments</p>
        <p className="mt-1 text-xs text-neutral-500">Comments flagged by the community will show here to review.</p>
      </div>
    </section>
  );
}

// Slugs of the moderation subpages that get a button above the dashboard.
const ACTIONS = [
  { slug: "grading-reports", label: "See grading reports" },
  { slug: "comments", label: "See all comments" },
];

// Body of /admin/moderation: shortcuts to the tools, then the Moderation
// Dashboard - grading updates, comment activity and flagged comments.
export default function AdminModeration({ section }: { section: AdminSection }) {
  const reports = useGradeReports();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {ACTIONS.map((action, index) => (
          <Link
            key={action.slug}
            href={subpageHref(section, action.slug)}
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

      <section
        aria-labelledby="moderation-dashboard-heading"
        className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm"
      >
        <h2 id="moderation-dashboard-heading" className="text-xl font-bold text-primary">
          Moderation Dashboard
        </h2>
        <GradingUpdates reports={reports} href={subpageHref(section, "grading-reports")} />
        <ActivityChart />
        <FlaggedComments />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Grading reports

// One dropdown per kind of climb, laid out as its public page is: routes and
// combos line by line, boulders as one list with their tape.
const REPORT_SECTIONS: { type: ClimbType; title: string; byLine: boolean; noun: string }[] = [
  { type: "route", title: "Routes", byLine: true, noun: "route" },
  { type: "boulder", title: "Boulders", byLine: false, noun: "boulder" },
  { type: "combo", title: "Combos", byLine: true, noun: "combo" },
];

type ReportSection = (typeof REPORT_SECTIONS)[number];

// Where a climb is: its line, or "Bdr" for a boulder.
function PlaceTag({ climb }: { climb: Climb }) {
  const boulder = climb.type === "boulder";
  return (
    <span className="absolute right-2 top-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary ring-1 ring-neutral-200">
      <span aria-hidden="true">{boulder ? "Bdr" : climb.line !== undefined ? `L${climb.line}` : "—"}</span>
      <span className="sr-only">{boulder ? "Boulder" : climb.line !== undefined ? `Line ${climb.line}` : "No line"}</span>
    </span>
  );
}

// Every flagged climb of a dropdown as a card, worst first, with where it is
// in the corner. Each links to the climb's grading report.
function FlaggedCards({ climbs, votes, noun }: { climbs: Climb[]; votes: Map<string, GradeVotes>; noun: string }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionRule
        title="Flagged"
        action={<span className="shrink-0 text-xs text-neutral-500">{climbs.length} to check</span>}
      />
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        {climbs.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">No {noun}s need a grade check right now.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {climbs.map((climb) => (
              <li key={climb.id}>
                <Link
                  href={gradingReportHref(climb.id)}
                  className="relative flex h-full min-h-24 flex-col gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm transition-colors hover:bg-orange-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <PlaceTag climb={climb} />
                  <span className="pr-10 font-medium text-neutral-800">
                    <ClimbColour climb={climb} stacked />
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-2">
                    <GradeTag grade={climb.grade} />
                    <GradeVoteSquares votes={votes.get(climb.id) ?? NO_VOTES} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// One kind of climb. Its climbs and their comments' grades are only read once
// it's first opened, and kept after that, so a dropdown nobody opens costs
// nothing.
function ReportDropdown({
  section,
  opened,
  open,
  onToggle,
}: {
  section: ReportSection;
  // Whether it's ever been opened.
  opened: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const bodyID = `grading-${section.type}`;
  const reports = useGradeReports(section.type, opened);
  const loaded = reports && "climbs" in reports ? reports : null;
  const flagged = useMemo(
    () =>
      loaded
        ? loaded.climbs
            .filter((climb) => needsGradeReview(loaded.votes.get(climb.id)))
            .sort((a, b) => compareDisagreement(loaded.votes.get(a.id)!, loaded.votes.get(b.id)!))
        : [],
    [loaded],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyID}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary sm:px-6"
        >
          <span className="flex items-center gap-2 text-xl font-bold text-primary">
            <ChevronIcon open={open} />
            {section.title}
          </span>
          {loaded && (
            <span className="flex shrink-0 items-center gap-3 text-xs text-neutral-500">
              {plural(loaded.climbs.length, section.noun)}
              {flagged.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-800">
                  <FlagIcon />
                  {flagged.length} to check
                </span>
              )}
            </span>
          )}
        </button>
      </h2>

      {open && (
        <div id={bodyID} className="flex flex-col gap-6 border-t border-neutral-100 bg-neutral-50 p-4 sm:p-6">
          {reports === undefined ? (
            <Placeholder className="h-48" />
          ) : !loaded ? (
            <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
              Couldn&apos;t load the grading reports: {"error" in reports ? reports.error : ""}
            </p>
          ) : (
            <>
              <FlaggedCards climbs={flagged} votes={loaded.votes} noun={section.noun} />
              {section.byLine ? (
                LINES.map((line) => (
                  <div key={line} className="flex flex-col gap-4">
                    <SectionRule title={`Line ${line}`} />
                    <ReportRows
                      climbs={loaded.climbs.filter((climb) => climb.line === line)}
                      votes={loaded.votes}
                      empty={`No ${section.noun}s up on this line right now.`}
                    />
                  </div>
                ))
              ) : (
                <div className="flex flex-col gap-4">
                  <SectionRule title={section.title} />
                  <ReportRows
                    climbs={loaded.climbs}
                    votes={loaded.votes}
                    empty={`No ${section.noun}s up right now.`}
                    tapeRow
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

// /admin/moderation/grading-reports: a dropdown each for routes, boulders and
// combos, each climb showing how many comments graded it easier, at or
// harder than its grade, with the flagged ones first. Nothing loads until a
// dropdown is opened, and each only reads its own kind of climb.
export function AdminGradingReports() {
  const [open, setOpen] = useState<Set<ClimbType>>(new Set());
  // Every dropdown that's been opened, open now or not, so closing one
  // doesn't throw away what it loaded.
  const [opened, setOpened] = useState<Set<ClimbType>>(new Set());

  const toggle = (type: ClimbType) => {
    setOpened((current) => (current.has(type) ? current : new Set(current).add(type)));
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <>
      <VoteLegend />
      {REPORT_SECTIONS.map((section) => (
        <ReportDropdown
          key={section.type}
          section={section}
          opened={opened.has(section.type)}
          open={open.has(section.type)}
          onToggle={() => toggle(section.type)}
        />
      ))}
    </>
  );
}
