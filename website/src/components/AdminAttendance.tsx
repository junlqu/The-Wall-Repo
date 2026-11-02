"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useCallback, useEffect, useState } from "react";
import { EditNotesDialog, GenerateMonthDialog, type SheetLookup } from "@/components/AdminAttendanceGenerate";
import {
  AttendanceRingChart,
  type AttendanceTable,
  climberSlices,
  DailyAttendanceChart,
  earningSlices,
  HourlyAttendanceChart,
  tableOfDay,
  tablesOfSheet,
  WEEKDAY_OPENING,
  WEEKDAY_SCHEDULES,
} from "@/components/AttendanceCharts";
import { ActionsMenu, DANGER_BUTTON_CLASS, Dialog } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, useRequest } from "@/components/ClimbForm";
import { ChangeMark, ColumnCompare, ComparedCell, HiddenWhileComparing } from "@/components/ColumnCompare";
import CountChart from "@/components/CountChart";
import GroupedCountChart from "@/components/GroupedCountChart";
import RingChart from "@/components/RingChart";
import SlidingTabs from "@/components/SlidingTabs";
import ToggleSwitch from "@/components/ToggleSwitch";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import {
  addDays,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceWeek,
  blockWeekDay,
  countClimbers,
  countLessons,
  countStudents,
  deleteAttendance,
  fetchAttendanceMonthsOf,
  fetchAttendanceWeeksOverlapping,
  fetchAttendanceYears,
  fetchMonthlySheetStarts,
  formatHourRange,
  formatMetric,
  formatMoney,
  formatMonth,
  formatWeekRange,
  hoursOf,
  measure,
  measureBlock,
  measureDay,
  measureDays,
  measureMonth,
  type Metric,
  MONTH_NAMES,
  monthId,
  monthRange,
  monthsBefore,
  priorWeekEnding,
  separatesNonMembers,
  weekId,
  type YearCount,
} from "@/lib/attendance";
import { formatForMonth } from "@/lib/attendanceFormats";
import { formatDate, parseDate, todayDate } from "@/lib/climbs";

// Slugs of the attendance subpages that get a button on the main page.
const ACTIONS = [
  { slug: "new", label: "Fill in attendance" },
  { slug: "all", label: "See all attendance" },
  { slug: "import", label: "Import attendance" },
  { slug: "export", label: "Export attendance" },
];

// Everything sits inside the one Attendance Dashboard card, so its parts are
// set apart by a tint rather than borders of their own - like the Admin
// Dashboard's widgets.
const WIDGET_CLASS = "flex flex-col rounded-lg bg-neutral-50 p-4";
export const FORM_HREF = "/admin/attendance/new";

// A year's weeks and months, newest first, plus the message to show in place of
// them while loading or after a failed load (null once they've loaded). The year
// before's weeks are only there to compare with, so losing them loses just that.
function useAttendance(year: string) {
  // undefined while loading, null if the API couldn't be reached.
  const [attendance, setAttendance] = useState<{
    weeks: AttendanceWeek[];
    months: AttendanceMonth[];
    earlierWeeks: AttendanceWeek[] | null;
  } | null>();

  useEffect(() => {
    Promise.all([
      fetchAttendanceWeeksOverlapping(year),
      fetchAttendanceMonthsOf(year),
      fetchAttendanceWeeksOverlapping(String(Number(year) - 1)).catch(() => null),
    ])
      .then(([weeks, months, earlierWeeks]) => setAttendance({ weeks, months, earlierWeeks }))
      .catch(() => setAttendance(null));
  }, [year]);

  return {
    weeks: attendance?.weeks ?? [],
    months: attendance?.months ?? [],
    earlierWeeks: attendance?.earlierWeeks ?? null,
    loadingText:
      attendance === undefined
        ? "Loading attendance…"
        : attendance === null
          ? "Couldn't load attendance. Refresh to try again."
          : null,
  };
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function turnedAway(days: Pick<AttendanceDay, "turnedAway">[]) {
  return days.reduce((total, day) => total + day.turnedAway, 0);
}

function lastSaved({ updatedAt, updatedBy }: { updatedAt?: string; updatedBy?: string }) {
  if (!updatedAt) return "—";
  const date = new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${date}${updatedBy ? ` by ${updatedBy}` : ""}`;
}

// What a total is measured against, and what to call that.
type ComparedTotal = { days: AttendanceDay[]; label: string };

function Total({
  title,
  period,
  days,
  metric,
  note,
  compared,
}: {
  title: string;
  period: string;
  days: AttendanceDay[];
  metric: Metric;
  note?: string;
  // Null when there's nothing to compare with.
  compared: ComparedTotal | null;
}) {
  const total = measureDays(days, metric);
  return (
    <div className={`${WIDGET_CLASS} flex-1 justify-center gap-1`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
        <span className="text-xs text-neutral-500">{period}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-3xl font-bold text-primary">{formatMetric(total, metric)}</p>
        {compared && <ChangeMark change={total - measureDays(compared.days, metric)} format={(value) => formatMetric(value, metric)} />}
      </div>
      <p className="text-xs text-neutral-500">
        {note ?? plural(measureDays(days, "numbers"), "climber")}
        {compared && ` · vs ${compared.label}`}
      </p>
    </div>
  );
}

function shortDate(date: string) {
  return `${MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3)} ${Number(date.slice(8))}`;
}

// What the week, month and year totals each compare with. A month or year still
// under way goes against the same stretch of the one before, since against all of
// it nearly every total would be down until the last day.
function comparedTotals(anchor: string, weeks: AttendanceWeek[], earlierWeeks: AttendanceWeek[] | null) {
  const allWeeks = [...weeks, ...(earlierWeeks ?? [])];
  // A week crossing New Year comes back with both years.
  const allDays = [...new Map(allWeeks.flatMap((week) => week.days).map((day) => [day.date, day])).values()];
  // A week saved partway through has its later days blank, and those don't count.
  const latestOf = (period: string) =>
    allDays.reduce(
      (latest, day) => (day.date.startsWith(period) && day.date > latest && measureDay(day, "numbers") > 0 ? day.date : latest),
      "",
    );
  const compared = (period: string, through: string, label: string): ComparedTotal | null => {
    const days = allDays.filter(({ date }) => date.startsWith(period) && date <= through);
    return days.length > 0 ? { days, label } : null;
  };

  const anchorWeek = weeks.find((week) => week.weekEnding === anchor);
  const priorWeek = allWeeks.find((week) => week.weekEnding === addDays(anchor, -7));

  const { startDay, endDay } = monthRange(anchor);
  const priorMonthEnd = addDays(startDay, -1);
  const priorMonth = priorMonthEnd.slice(0, 7);
  const priorMonthName = MONTH_NAMES[Number(priorMonth.slice(5)) - 1];
  const monthThrough = latestOf(anchor.slice(0, 7));
  // Past the prior month's last day just means all of it: Oct 31 against September.
  const priorMonthThrough = monthThrough === endDay ? priorMonthEnd : `${priorMonth}-${monthThrough.slice(8)}`;
  const monthKnown = monthThrough !== "" && (earlierWeeks !== null || priorMonth.slice(0, 4) === anchor.slice(0, 4));

  const priorYear = String(Number(anchor.slice(0, 4)) - 1);
  const yearThrough = latestOf(anchor.slice(0, 4));
  const wholeYear = yearThrough.slice(5) === "12-31";

  return {
    week: anchorWeek && priorWeek ? { days: priorWeek.days, label: "the week before" } : null,
    month: monthKnown
      ? compared(
          priorMonth,
          priorMonthThrough,
          priorMonthThrough >= priorMonthEnd ? priorMonthName : `${priorMonthName} 1–${Number(monthThrough.slice(8))}`,
        )
      : null,
    year:
      yearThrough !== "" && earlierWeeks !== null
        ? compared(priorYear, `${priorYear}${yearThrough.slice(4)}`, wholeYear ? priorYear : `${priorYear} to ${shortDate(yearThrough)}`)
        : null,
  };
}

// Totals for the week ending `anchor` and the month and year it ended in, each
// against the one before, the ring beside them, then both charts counting from it.
function AttendanceSummary({
  weeks,
  earlierWeeks,
  months,
  anchor,
  metric,
  loadingText,
}: {
  weeks: AttendanceWeek[];
  earlierWeeks: AttendanceWeek[] | null;
  months: AttendanceMonth[];
  anchor: string;
  metric: Metric;
  loadingText?: string | null;
}) {
  const anchorDate = parseDate(anchor);
  const anchorWeek = weeks.find((week) => week.weekEnding === anchor);
  const allDays = weeks.flatMap((week) => week.days);
  const inYear = allDays.filter((day) => parseDate(day.date).getFullYear() === anchorDate.getFullYear());
  const inMonth = inYear.filter((day) => parseDate(day.date).getMonth() === anchorDate.getMonth());
  const chartProps = { weeks, months, anchor, metric, loadingText, className: WIDGET_CLASS };
  const compared = comparedTotals(anchor, weeks, earlierWeeks);


  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {loadingText ? (
          <p className="flex h-28 items-center justify-center text-sm text-neutral-500">{loadingText}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Total
              title="Last week"
              period={`Ending ${formatDate(anchor)}`}
              days={anchorWeek?.days ?? []}
              metric={metric}
              note={anchorWeek ? undefined : "Not filled in yet"}
              compared={compared.week}
            />
            <Total
              title="Month"
              period={anchorDate.toLocaleDateString(undefined, { month: "long" })}
              days={inMonth}
              metric={metric}
              compared={compared.month}
            />
            <Total title="Year" period={String(anchorDate.getFullYear())} days={inYear} metric={metric} compared={compared.year} />
          </div>
        )}
        <AttendanceRingChart {...chartProps} />
      </div>
      <DailyAttendanceChart {...chartProps} />
      <HourlyAttendanceChart {...chartProps} />
    </>
  );
}

function MetricSwitch({ metric, onChange }: { metric: Metric; onChange: (metric: Metric) => void }) {
  return (
    <ToggleSwitch
      off="Numbers"
      on="Earnings"
      checked={metric === "earnings"}
      onChange={(earnings) => onChange(earnings ? "earnings" : "numbers")}
      label="Show earnings"
    />
  );
}

// Body of /admin/attendance: shortcuts to the attendance tools, then the
// latest week's, month's and year's totals and charts.
export default function AdminAttendance({ section }: { section: AdminSection }) {
  const [metric, setMetric] = useState<Metric>("numbers");
  const anchor = priorWeekEnding(todayDate());
  const { weeks, earlierWeeks, months, loadingText } = useAttendance(anchor.slice(0, 4));
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

      <section
        aria-labelledby="attendance-dashboard-heading"
        className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="attendance-dashboard-heading" className="text-xl font-bold text-primary">
            Attendance Dashboard
          </h2>
          <MetricSwitch metric={metric} onChange={setMetric} />
        </div>
        {/* Everything counts from the end of last week - a month or year only
            takes over once one of its Fridays has passed. */}
        <AttendanceSummary
          weeks={weeks}
          earlierWeeks={earlierWeeks}
          months={months}
          anchor={anchor}
          metric={metric}
          loadingText={loadingText}
        />
      </section>
    </>
  );
}

// One week, opened from its row on the weeks list: its totals and graphs, and
// nothing from around it.
function WeekPanel({ week }: { week: AttendanceWeek }) {
  const [metric, setMetric] = useState<Metric>("numbers");
  const chartProps = { weeks: [week], anchor: week.weekEnding, weekOnly: true, metric, className: WIDGET_CLASS };
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-primary">{formatWeekRange(week.weekEnding)}</h3>
        <MetricSwitch metric={metric} onChange={setMetric} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MonthTotal title="Climbers">{measureDays(week.days, "numbers").toLocaleString()}</MonthTotal>
        <MonthTotal title="Earnings">{formatMoney(measureDays(week.days, "earnings"))}</MonthTotal>
      </div>
      <AttendanceRings tables={week.days.map(tableOfDay)} period={formatWeekRange(week.weekEnding)} />
      <DailyAttendanceChart {...chartProps} />
      <HourlyAttendanceChart {...chartProps} />
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:text-secondary ${open ? "rotate-90" : ""}`}
    >
      <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

// Same confirmation as deleting a climb.
function DeleteRecordDialog({
  id,
  name,
  noun,
  onClose,
  onDeleted,
}: {
  id: string;
  name: string;
  noun: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, error, run } = useRequest();

  return (
    <Dialog title={`Delete ${name}?`} busy={busy} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        This removes the {noun}&apos;s attendance for good and can&apos;t be undone.
      </p>
      <ErrorMessage message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await deleteAttendance(id);
              onDeleted();
            })
          }
          className={DANGER_BUTTON_CLASS}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Dialog>
  );
}

// The "..." menu for one week: open it in the form, or delete it.
function WeekActions({ week, onDeleted }: { week: AttendanceWeek; onDeleted: (weekEnding: string) => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <ActionsMenu
        label={`Actions for the week ${formatWeekRange(week.weekEnding)}`}
        items={[
          { label: "Edit", onSelect: () => router.push(`${FORM_HREF}?week=${week.weekEnding}`) },
          { label: "Delete", onSelect: () => setDeleting(true), danger: true },
        ]}
      />
      {deleting && (
        <DeleteRecordDialog
          id={weekId(week.weekEnding)}
          name={`the week ${formatWeekRange(week.weekEnding)}`}
          noun="week"
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onDeleted(week.weekEnding);
          }}
        />
      )}
    </>
  );
}

// A row sits indented under its year, on wider screens with its chevron in line
// with the year's number. The column's title starts where the row's name does,
// past the chevron.
const ROW_NAME_CELL_CLASS = "py-3 pl-6 pr-2 lg:pl-10 lg:pr-4 xl:whitespace-nowrap";
const NAME_TITLE_CLASS = "py-3 pl-[2.875rem] pr-2 lg:pl-[3.875rem] lg:pr-4";

// Columns give way to the screen rather than making the page scroll sideways:
// on small screens only the name and climbers stay, and what the other columns
// hold moves under the name (see RowDetails). Collapsed to no width rather than
// removed, so the rows' colSpans still add up.
const WIDE_SCREEN_CLASS = "max-lg:invisible max-lg:w-0 max-lg:overflow-hidden max-lg:p-0";
const WIDEST_SCREEN_CLASS = "max-xl:invisible max-xl:w-0 max-xl:overflow-hidden max-xl:p-0";
// The last column of numbers before the row's menu keeps room to its right for the
// differences a mouse can bring up: climbers below lg, earnings until Last saved shows.
const COMPARE_ROOM_CLASS = "max-lg:pointer-fine:w-[6.25rem] max-lg:pointer-fine:pr-5";
const CLIMBERS_TITLE_CLASS = `w-[5.5rem] px-2 py-3 text-right lg:w-28 lg:px-4 ${COMPARE_ROOM_CLASS}`;
const CLIMBERS_CELL_CLASS = `px-2 py-3 text-right align-top lg:px-4 lg:align-middle ${COMPARE_ROOM_CLASS}`;
const WIDE_CELL_CLASS = `px-4 py-3 text-right ${WIDE_SCREEN_CLASS}`;
const EARNINGS_CELL_CLASS = `${WIDE_CELL_CLASS} lg:pr-9 xl:pr-4`;
const ACTIONS_TITLE_CLASS = "w-10 px-1 py-3 lg:w-12 lg:px-2";
const ACTIONS_CELL_CLASS = "px-1 py-1 text-right align-top lg:px-2 lg:align-middle";

// What a row's hidden columns hold, under its name: all of it on small screens,
// just when it was saved once the rest fit.
function RowDetails({ stats, saved }: { stats: string[]; saved: string }) {
  return (
    <p className="mt-0.5 pl-[1.375rem] text-xs text-neutral-500 xl:hidden">
      <span className="lg:hidden">{stats.join(" · ")} · </span>
      {saved}
    </p>
  );
}

// The years with records on file, and each year's records once it's been opened.
// Only the year list loads at first, once `enabled`; a year's records load the
// first time it's opened and are kept from then on.
function useYearlyRecords<T>(type: "weekly" | "monthly", fetchYear: (year: string) => Promise<T[]>, enabled = true) {
  // undefined while loading, null if the API couldn't be reached.
  const [years, setYears] = useState<YearCount[] | null>();
  const [openYears, setOpenYears] = useState<Set<string>>(() => new Set());
  // A year's entry is undefined while it loads, and null if it couldn't.
  const [records, setRecords] = useState<Record<string, T[] | null | undefined>>({});

  const load = (year: string) => {
    setRecords((current) => ({ ...current, [year]: undefined }));
    fetchYear(year)
      .then((rows) => setRecords((current) => ({ ...current, [year]: rows })))
      .catch(() => setRecords((current) => ({ ...current, [year]: null })));
  };

  useEffect(() => {
    if (!enabled) return;
    fetchAttendanceYears(type)
      .then(setYears)
      .catch(() => setYears(null));
  }, [type, enabled]);

  return {
    years: years ?? [],
    openYears,
    records,
    load,
    toggle: (year: string) => {
      const opening = !openYears.has(year);
      setOpenYears((current) => {
        const next = new Set(current);
        if (opening) next.add(year);
        else next.delete(year);
        return next;
      });
      if (opening && !(year in records)) load(year);
    },
    // Fetches a year again after a record was saved to it, and opens it to show that.
    reload: (year: string) => {
      fetchAttendanceYears(type)
        .then(setYears)
        .catch(() => setYears(null));
      setOpenYears((current) => new Set(current).add(year));
      load(year);
    },
    // Takes a deleted record out of its year's count and of every year holding it.
    remove: (year: string, isGone: (row: T) => boolean) => {
      setYears((current) =>
        current?.flatMap((entry) => {
          if (entry.year !== year) return [entry];
          return entry.count > 1 ? [{ ...entry, count: entry.count - 1 }] : [];
        }),
      );
      setRecords((current) =>
        Object.fromEntries(Object.entries(current).map(([key, rows]) => [key, rows?.filter((row) => !isGone(row))])),
      );
    },
    loadingText:
      years === undefined
        ? "Loading attendance…"
        : years === null
          ? "Couldn't load attendance. Refresh to try again."
          : null,
  };
}

// A table's rows split into years, newest first. Each year is a drop-down, all
// starting closed.
function YearGroups<T>({
  yearly,
  columns,
  noun,
  filedIn,
  renderRow,
}: {
  yearly: ReturnType<typeof useYearlyRecords<T>>;
  columns: number;
  noun: string;
  // A year's records can include one filed under the next year.
  filedIn: (row: T, year: string) => boolean;
  renderRow: (row: T, yearRecords: T[]) => ReactNode;
}) {
  return yearly.years.map(({ year, count }) => {
    const isOpen = yearly.openYears.has(year);
    const rows = yearly.records[year];
    return (
      <tbody key={year} className="divide-y divide-neutral-100 border-t border-neutral-200 text-neutral-700">
        <tr>
          <th scope="rowgroup" colSpan={columns} className="p-0 text-left font-normal">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => yearly.toggle(year)}
              className="group flex w-full items-center gap-2 bg-neutral-50 px-4 py-2.5 transition-colors hover:bg-secondary/5"
            >
              <ChevronIcon open={isOpen} />
              <span className="text-base font-bold text-primary">{year}</span>
              <span className="text-xs text-neutral-500">{plural(count, noun)}</span>
            </button>
          </th>
        </tr>
        {isOpen && rows === undefined && (
          <tr>
            <td role="status" colSpan={columns} className="px-4 py-3 text-center text-sm text-neutral-500">
              Loading {year}…
            </td>
          </tr>
        )}
        {isOpen && rows === null && (
          <tr>
            <td colSpan={columns} className="px-4 py-3 text-center text-sm text-neutral-500">
              Couldn&apos;t load {year}.{" "}
              <button type="button" onClick={() => yearly.load(year)} className="font-semibold text-primary underline">
                Try again
              </button>
            </td>
          </tr>
        )}
        {isOpen && rows?.filter((row) => filedIn(row, year)).map((row) => renderRow(row, rows))}
      </tbody>
    );
  });
}

// Every recorded week, by year, newest first. Clicking a week opens its
// dashboard under the row; its menu edits it in the form or deletes it.
function WeekToWeek() {
  const yearly = useYearlyRecords<AttendanceWeek>("weekly", fetchAttendanceWeeksOverlapping);
  const { years, loadingText, remove } = yearly;
  // One week's panel is open at a time.
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      {loadingText || years.length === 0 ? (
        <p className="p-6 text-center text-sm text-neutral-500">{loadingText ?? "No attendance has been recorded yet."}</p>
      ) : (
        // `relative` so the screen-reader "Actions" label is positioned
        // within the table.
        <div className="relative">
          {/* Fixed columns, so they stay put whichever years are open. */}
          <ColumnCompare>
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th scope="col" className={`xl:w-[17rem] ${NAME_TITLE_CLASS}`}>Week</th>
                  <th scope="col" className={`w-28 ${WIDE_CELL_CLASS}`}>Days open</th>
                  <th scope="col" className={CLIMBERS_TITLE_CLASS}>Climbers</th>
                  <th scope="col" className={`w-24 ${WIDE_CELL_CLASS}`}>Lessons</th>
                  <th scope="col" className={`w-32 ${WIDE_CELL_CLASS}`}>Turned away</th>
                  <th scope="col" className={`w-28 lg:w-[8.25rem] xl:w-28 ${EARNINGS_CELL_CLASS}`}>Earnings</th>
                  <th scope="col" className={`px-4 py-3 ${WIDEST_SCREEN_CLASS}`}>Last saved</th>
                  <th scope="col" className={ACTIONS_TITLE_CLASS}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <YearGroups
                yearly={yearly}
                columns={8}
                noun="week"
                // A week crossing New Year is filed under the year it ends in.
                filedIn={(week, year) => week.weekEnding.startsWith(year)}
                renderRow={(week) => {
                  const isOpen = open === week.weekEnding;
                  const panelId = `week-${week.weekEnding}`;
                  return (
                    <Fragment key={week.weekEnding}>
                      <tr className={isOpen ? "bg-secondary/5" : "hover:bg-secondary/5"}>
                        <td className={ROW_NAME_CELL_CLASS}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => setOpen(isOpen ? null : week.weekEnding)}
                            className="group flex items-center gap-1.5 text-left font-semibold text-primary transition-colors hover:text-secondary"
                          >
                            <ChevronIcon open={isOpen} />
                            {formatWeekRange(week.weekEnding)}
                          </button>
                          <RowDetails
                            stats={[
                              plural(week.days.length, "day"),
                              plural(countLessons(week.days), "lesson"),
                              `${turnedAway(week.days)} turned away`,
                              formatMoney(measureDays(week.days, "earnings")),
                            ]}
                            saved={lastSaved(week)}
                          />
                        </td>
                        <ComparedCell column="days" value={week.days.length} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="climbers" value={measureDays(week.days, "numbers")} className={CLIMBERS_CELL_CLASS} />
                        <ComparedCell column="lessons" value={countLessons(week.days)} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="turnedAway" value={turnedAway(week.days)} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="earnings" value={measureDays(week.days, "earnings")} format={formatMoney} className={EARNINGS_CELL_CLASS} />
                        <td title={lastSaved(week)} className={`truncate px-4 py-3 text-xs text-neutral-500 ${WIDEST_SCREEN_CLASS}`}>
                          <HiddenWhileComparing column="earnings">{lastSaved(week)}</HiddenWhileComparing>
                        </td>
                        <td className={ACTIONS_CELL_CLASS}>
                          <WeekActions
                            week={week}
                            onDeleted={(weekEnding) =>
                              remove(weekEnding.slice(0, 4), (other) => other.weekEnding === weekEnding)
                            }
                          />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr id={panelId}>
                          <td colSpan={8} className="border-l-4 border-secondary bg-white p-0">
                            {/* Zero width, stretched to the cell's, so the charts
                                fit the table instead of widening it. */}
                            <div className="w-0 min-w-full">
                              <WeekPanel week={week} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }}
              />
            </table>
          </ColumnCompare>
        </div>
      )}
    </div>
  );
}

// Who climbed and which days earned what, for a week, month or year's panel.
function AttendanceRings({ tables, period }: { tables: AttendanceTable[]; period: string }) {
  const unsplit = tables.some(({ format }) => !separatesNonMembers(format));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-label="Climbers split by group" className={WIDGET_CLASS}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Climbers split by group</h4>
        <div className="mt-3">
          <RingChart
            slices={climberSlices(tables)}
            formatValue={(value) => value.toLocaleString()}
            caption={`Climbers by group, ${period}`}
            emptyText="No climbers recorded"
          />
        </div>
        {unsplit && (
          <p className="mt-2 text-xs text-neutral-500">
            Sheets before May 2018 don&apos;t separate non-members, so they count as TPASC &amp; members.
          </p>
        )}
      </section>
      <section aria-label="Earnings split by day" className={WIDGET_CLASS}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Earnings split by day</h4>
        <div className="mt-3">
          <RingChart
            slices={earningSlices(tables)}
            formatValue={formatMoney}
            caption={`Earnings by day of the week, ${period}`}
            emptyText="No earnings recorded"
          />
        </div>
      </section>
    </div>
  );
}

function MonthTotal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${WIDGET_CLASS} gap-1`}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h4>
      <p className="text-2xl font-bold text-primary">{children}</p>
    </div>
  );
}

// A monthly sheet's numbers: its totals, its tables side by side, the month's
// hours added up, and the sheet's notes.
function MonthPanel({ month }: { month: AttendanceMonth }) {
  const [metric, setMetric] = useState<Metric>("numbers");
  const format = formatForMonth(month.startDay);
  const climbers = measureMonth(month, "numbers");
  const students = countStudents(month.blocks);
  const hours = [...new Set(month.blocks.flatMap(hoursOf))].sort((a, b) => a - b);
  const formatCount = (count: number) => formatMetric(count, metric);
  const what = metric === "numbers" ? "Climbers" : "Earnings";
  const noun = (count: number) => (metric === "numbers" ? `${formatCount(count)} climbers` : formatCount(count));

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-primary">{formatMonth(month.startDay)}</h3>
        <MetricSwitch metric={metric} onChange={setMetric} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MonthTotal title="Students">{students.toLocaleString()}</MonthTotal>
        <MonthTotal title="TPASC & other">{(climbers - students).toLocaleString()}</MonthTotal>
        <MonthTotal title="Earnings">{formatMoney(measureMonth(month, "earnings"))}</MonthTotal>
        <MonthTotal title="Turned away">{turnedAway(month.blocks)}</MonthTotal>
      </div>

      <AttendanceRings tables={tablesOfSheet(month)} period={formatMonth(month.startDay)} />

      <section aria-label={`${what} by day`} className={WIDGET_CLASS}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{what} by day</h4>
        <div className="mt-3">
          <CountChart
            counts={month.blocks.map((block) => ({ label: block.label, count: measureBlock(block, metric, format) }))}
            noun={noun}
            formatCount={formatCount}
            caption={`${what} by day, ${formatMonth(month.startDay)}`}
            categoryHeader="Day"
            countHeader={what}
            emptyText="Nothing recorded for this month"
            barClassName="min-w-20"
          />
        </div>
      </section>

      <section aria-label={`${what} by hour`} className={WIDGET_CLASS}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{what} by hour</h4>
        <div className="mt-3">
          <CountChart
            counts={hours.map((hour) => ({
              label: formatHourRange(hour),
              count: month.blocks.reduce((total, block) => total + measure(block.hours[String(hour)] ?? {}, metric, format), 0),
            }))}
            noun={noun}
            formatCount={formatCount}
            caption={`${what} by hour, ${formatMonth(month.startDay)}`}
            categoryHeader="Hour"
            countHeader={what}
            emptyText="Nothing recorded for this month"
            barClassName="min-w-16"
          />
        </div>
      </section>

      {month.notes.length > 0 && (
        <section aria-label="Notes" className={WIDGET_CLASS}>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Notes</h4>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-700">
            {month.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MonthActions({
  month,
  onCompare,
  onNotesSaved,
  onDeleted,
}: {
  month: AttendanceMonth;
  onCompare: () => void;
  onNotesSaved: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const name = formatMonth(month.startDay);

  return (
    <>
      <ActionsMenu
        label={`Actions for ${name}`}
        items={[
          { label: "Edit notes", onSelect: () => setEditingNotes(true) },
          { label: "Compare with weeks", onSelect: onCompare },
          { label: "Delete", onSelect: () => setDeleting(true), danger: true },
        ]}
      />
      {editingNotes && (
        <EditNotesDialog
          month={month}
          onClose={() => setEditingNotes(false)}
          onSaved={() => {
            setEditingNotes(false);
            onNotesSaved();
          }}
        />
      )}
      {deleting && (
        <DeleteRecordDialog
          id={monthId(month)}
          name={name}
          noun="month"
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onDeleted(monthId(month));
          }}
        />
      )}
    </>
  );
}

// Every recorded monthly sheet, by year, newest first. Months add their weekdays
// up, so each row splits students from everyone else, and clicking one opens
// its tables and notes.
function MonthToMonth({
  yearly,
  onCompare,
  onDeleted,
}: {
  yearly: ReturnType<typeof useYearlyRecords<AttendanceMonth>>;
  onCompare: (startDay: string) => void;
  onDeleted: () => void;
}) {
  const { years, loadingText, remove } = yearly;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      {loadingText || years.length === 0 ? (
        <p className="p-6 text-center text-sm text-neutral-500">{loadingText ?? "No monthly attendance has been recorded yet."}</p>
      ) : (
        <div className="relative">
          {/* Fixed columns, so they stay put whichever years are open. */}
          <ColumnCompare>
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th scope="col" className={`xl:w-48 ${NAME_TITLE_CLASS}`}>Month</th>
                  <th scope="col" className={CLIMBERS_TITLE_CLASS}>Climbers</th>
                  <th scope="col" className={`w-[6.5rem] ${WIDE_CELL_CLASS}`}>Students</th>
                  <th scope="col" className={`w-[8.5rem] ${WIDE_CELL_CLASS}`}>TPASC &amp; other</th>
                  <th scope="col" className={`w-24 ${WIDE_CELL_CLASS}`}>Lessons</th>
                  <th scope="col" className={`w-32 ${WIDE_CELL_CLASS}`}>Turned away</th>
                  <th scope="col" className={`w-28 lg:w-[8.25rem] xl:w-28 ${EARNINGS_CELL_CLASS}`}>Earnings</th>
                  <th scope="col" className={`px-4 py-3 ${WIDEST_SCREEN_CLASS}`}>Last saved</th>
                  <th scope="col" className={ACTIONS_TITLE_CLASS}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <YearGroups
                yearly={yearly}
                columns={9}
                noun="month"
                filedIn={(month, year) => month.startDay.startsWith(year)}
                renderRow={(month) => {
                  const id = monthId(month);
                  const isOpen = open === id;
                  const panelId = `month-${id}`;
                  const climbers = measureMonth(month, "numbers");
                  const students = countStudents(month.blocks);
                  return (
                    <Fragment key={id}>
                      <tr className={isOpen ? "bg-secondary/5" : "hover:bg-secondary/5"}>
                        <td className={ROW_NAME_CELL_CLASS}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => setOpen(isOpen ? null : id)}
                            className="group flex items-center gap-1.5 text-left font-semibold text-primary transition-colors hover:text-secondary"
                          >
                            <ChevronIcon open={isOpen} />
                            {formatMonth(month.startDay)}
                          </button>
                          <RowDetails
                            stats={[
                              `${students.toLocaleString()} students`,
                              `${(climbers - students).toLocaleString()} TPASC & other`,
                              plural(countLessons(month.blocks), "lesson"),
                              `${turnedAway(month.blocks)} turned away`,
                              formatMoney(measureMonth(month, "earnings")),
                            ]}
                            saved={lastSaved(month)}
                          />
                        </td>
                        <ComparedCell column="climbers" value={climbers} className={CLIMBERS_CELL_CLASS} />
                        <ComparedCell column="students" value={students} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="others" value={climbers - students} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="lessons" value={countLessons(month.blocks)} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="turnedAway" value={turnedAway(month.blocks)} className={WIDE_CELL_CLASS} />
                        <ComparedCell column="earnings" value={measureMonth(month, "earnings")} format={formatMoney} className={EARNINGS_CELL_CLASS} />
                        <td title={lastSaved(month)} className={`truncate px-4 py-3 text-xs text-neutral-500 ${WIDEST_SCREEN_CLASS}`}>
                          <HiddenWhileComparing column="earnings">{lastSaved(month)}</HiddenWhileComparing>
                        </td>
                        <td className={ACTIONS_CELL_CLASS}>
                          <MonthActions
                            month={month}
                            onCompare={() => onCompare(month.startDay)}
                            onNotesSaved={() => yearly.reload(month.startDay.slice(0, 4))}
                            onDeleted={(gone) => {
                              remove(month.startDay.slice(0, 4), (other) => monthId(other) === gone);
                              onDeleted();
                            }}
                          />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr id={panelId}>
                          <td colSpan={9} className="border-l-4 border-secondary bg-white p-0">
                            <div className="w-0 min-w-full">
                              <MonthPanel month={month} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }}
              />
            </table>
          </ColumnCompare>
        </div>
      )}
    </div>
  );
}

// A monthly sheet can't say which days of a month opened early, but the share of
// its weekday climbers before the regular opening gives it away: at least 11% in
// every summer month since 2017, and under 10% in every other since 2021, when a
// holiday or two can open a regular month early.
const SUMMER_EARLY_SHARE = 0.1;

function isSummerSheet(month: AttendanceMonth) {
  let early = 0;
  let total = 0;
  for (const block of month.blocks) {
    if (blockWeekDay(block.label)?.weekend !== false) continue;
    for (const [hour, counts] of Object.entries(block.hours)) {
      total += countClimbers(counts);
      if (Number(hour) < WEEKDAY_OPENING) early += countClimbers(counts);
    }
  }
  return total > 0 && early / total >= SUMMER_EARLY_SHARE;
}

function YearChart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={WIDGET_CLASS}>
      {children}
    </section>
  );
}

// A year's totals and graphs, all added up from its monthly sheets. Those don't
// say how many days a month was open, so every graph shows totals rather than
// averages.
function YearPanel({ year, months }: { year: string; months: AttendanceMonth[] }) {
  const [metric, setMetric] = useState<Metric>("numbers");
  const [weekdays, setWeekdays] = useState(false);
  const inOrder = [...months].sort((a, b) => a.startDay.localeCompare(b.startDay));
  const summerMonths = inOrder.filter(isSummerSheet);
  const climbers = months.reduce((total, month) => total + measureMonth(month, "numbers"), 0);
  const earnings = months.reduce((total, month) => total + measureMonth(month, "earnings"), 0);
  const blocks = months.flatMap((month) => month.blocks);
  const students = countStudents(blocks);

  const formatCount = (count: number) => formatMetric(count, metric);
  const noun = (count: number) => (metric === "numbers" ? `${formatCount(count)} climbers` : formatCount(count));
  const what = metric === "numbers" ? "Climbers" : "Earnings";

  // Every hour of every table, in what it comes to.
  const slots = months.flatMap((month) => {
    const format = formatForMonth(month.startDay);
    const summer = isSummerSheet(month);
    return month.blocks.flatMap((block) => {
      const day = blockWeekDay(block.label);
      if (!day) return [];
      return Object.entries(block.hours).map(([hour, counts]) => ({
        day,
        hour: Number(hour),
        summer,
        count: measure(counts, metric, format),
      }));
    });
  });
  const addUp = (list: typeof slots) => list.reduce((total, slot) => total + slot.count, 0);

  const days = [...new Map(slots.map((slot) => [slot.day.offset, slot.day])).values()].sort((a, b) => a.offset - b.offset);
  const ofGroup = slots.filter((slot) => slot.day.weekend === !weekdays);
  const hours = [...new Set(ofGroup.map((slot) => slot.hour))].sort((a, b) => a - b);

  // As on the dashboard, a weekday hour before the regular opening can only have
  // been on summer hours, even in a month that mostly wasn't. A year with no summer
  // month has no summer hours to speak of.
  const onSummerHours = (slot: (typeof slots)[number]) =>
    summerMonths.length > 0 && (slot.summer || slot.hour < WEEKDAY_OPENING);
  const schedules = WEEKDAY_SCHEDULES.flatMap(({ summer, name, colorClassName }) => {
    const slotsOf = (hour: number) => ofGroup.filter((slot) => slot.hour === hour && onSummerHours(slot) === summer);
    const open = hours.filter((hour) => slotsOf(hour).length > 0);
    if (open.length === 0) return [];
    return [{ name: `${name}, ${formatHourRange(open[0], open[open.length - 1])}`, colorClassName, slotsOf }];
  });
  const summerNames = summerMonths.map((month) => MONTH_NAMES[Number(month.startDay.slice(5, 7)) - 1]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-primary">{year}</h3>
          <p className="text-xs text-neutral-500">
            From {plural(months.length, "monthly sheet")}
          </p>
        </div>
        <MetricSwitch metric={metric} onChange={setMetric} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MonthTotal title="Climbers">{climbers.toLocaleString()}</MonthTotal>
        <MonthTotal title="Students">{students.toLocaleString()}</MonthTotal>
        <MonthTotal title="TPASC & other">{(climbers - students).toLocaleString()}</MonthTotal>
        <MonthTotal title="Lessons">{countLessons(blocks).toLocaleString()}</MonthTotal>
        <MonthTotal title="Turned away">{turnedAway(blocks).toLocaleString()}</MonthTotal>
        <MonthTotal title="Earnings">{formatMoney(earnings)}</MonthTotal>
      </div>

      <AttendanceRings tables={months.flatMap(tablesOfSheet)} period={year} />

      <YearChart title={`${what} by month`}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{what} by month</h4>
        <div className="mt-3">
          <CountChart
            counts={MONTH_NAMES.map((name, index) => {
              const sheet = months.find((month) => Number(month.startDay.slice(5, 7)) === index + 1);
              return { label: name.slice(0, 3), count: sheet ? measureMonth(sheet, metric) : 0 };
            })}
            noun={noun}
            formatCount={formatCount}
            caption={`${what} by month, ${year}`}
            categoryHeader="Month"
            countHeader={what}
            emptyText="Nothing recorded for this year"
          />
        </div>
      </YearChart>

      <YearChart title={`${what} by day`}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{what} by day</h4>
        <div className="mt-3">
          <CountChart
            counts={days.map((day) => ({ label: day.short, count: addUp(slots.filter((slot) => slot.day.offset === day.offset)) }))}
            noun={noun}
            formatCount={formatCount}
            caption={`${what} by day of the week, ${year}`}
            categoryHeader="Day"
            countHeader={what}
            emptyText="Nothing recorded for this year"
          />
        </div>
      </YearChart>

      <YearChart title={`${what} by hour`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{what} by hour</h4>
            <p className="text-xs text-neutral-500">
              {weekdays ? "Weekdays" : "Weekends"} · {year}
              {weekdays && summerNames.length > 0 ? ` · summer hours in ${summerNames.join(", ")}` : ""}
            </p>
          </div>
          <ToggleSwitch off="Weekends" on="Weekdays" checked={weekdays} onChange={setWeekdays} label="Show weekdays" />
        </div>
        <div className="mt-3">
          {weekdays ? (
            <GroupedCountChart
              series={schedules}
              counts={hours.map((hour) => ({
                label: formatHourRange(hour),
                values: schedules.map(({ slotsOf }) => (slotsOf(hour).length > 0 ? addUp(slotsOf(hour)) : null)),
              }))}
              noun={noun}
              formatCount={formatCount}
              caption={`${what} by hour on weekdays, ${year}`}
              categoryHeader="Hour"
              emptyText="No weekdays recorded for this year"
              barClassName="min-w-16"
            />
          ) : (
            <CountChart
              counts={hours.map((hour) => ({ label: formatHourRange(hour), count: addUp(ofGroup.filter((slot) => slot.hour === hour)) }))}
              noun={noun}
              formatCount={formatCount}
              caption={`${what} by hour on weekends, ${year}`}
              categoryHeader="Hour"
              countHeader={what}
              emptyText="No weekends recorded for this year"
              barClassName="min-w-16"
            />
          )}
        </div>
      </YearChart>
    </div>
  );
}

// Every year with monthly sheets, newest first. A year's sheets load the first
// time it's opened, shared with Month-to-month, so neither fetches them twice.
function YearToDate({ yearly }: { yearly: ReturnType<typeof useYearlyRecords<AttendanceMonth>> }) {
  const { years, loadingText, records, load } = yearly;
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  if (loadingText || years.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <p className="p-6 text-center text-sm text-neutral-500">{loadingText ?? "No monthly attendance has been recorded yet."}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      {years.map(({ year, count }) => {
        const isOpen = open.has(year);
        const rows = records[year];
        const panelId = `year-${year}`;
        return (
          <li key={year}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => {
                setOpen((current) => {
                  const next = new Set(current);
                  if (isOpen) next.delete(year);
                  else next.add(year);
                  return next;
                });
                if (!isOpen && !(year in records)) load(year);
              }}
              className="group flex w-full items-center gap-2 bg-neutral-50 px-4 py-2.5 transition-colors hover:bg-secondary/5"
            >
              <ChevronIcon open={isOpen} />
              <span className="text-base font-bold text-primary">{year}</span>
              <span className="text-xs text-neutral-500">{plural(count, "month")}</span>
            </button>
            {isOpen && (
              <div id={panelId} className="border-l-4 border-secondary bg-white">
                {rows === undefined && (
                  <p role="status" className="px-4 py-3 text-center text-sm text-neutral-500">
                    Loading {year}…
                  </p>
                )}
                {rows === null && (
                  <p className="px-4 py-3 text-center text-sm text-neutral-500">
                    Couldn&apos;t load {year}.{" "}
                    <button type="button" onClick={() => load(year)} className="font-semibold text-primary underline">
                      Try again
                    </button>
                  </p>
                )}
                {rows && <YearPanel year={year} months={rows.filter((month) => month.startDay.startsWith(year))} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type AttendanceView = "week" | "month" | "year";

const VIEWS: { id: AttendanceView; label: string; short: string }[] = [
  { id: "week", label: "Week-to-week", short: "Week" },
  { id: "month", label: "Month-to-month", short: "Month" },
  { id: "year", label: "YTD", short: "YTD" },
];

// Which months from `from` on have a monthly sheet: their first days, undefined
// until that's known, null if it couldn't be.
function useMonthlySheetStarts(from: string) {
  const [starts, setStarts] = useState<string[] | null>();
  const refresh = useCallback(() => {
    fetchMonthlySheetStarts(from)
      .then(setStarts)
      .catch(() => setStarts(null));
  }, [from]);
  useEffect(refresh, [refresh]);
  return { starts, refresh };
}

// How far back the reminder looks for a month with no monthly sheet.
const MONTHS_TO_CHECK = 6;

// /admin/attendance/all: the recorded weeks, months or years, by a slider. Nothing
// but the year lists and which months have sheets loads until a year is opened.
// Views stay mounted once visited, so flipping the slider fetches nothing again.
export function AdminAttendanceAll() {
  const [view, setView] = useState<AttendanceView>("week");
  // The month the generate dialog opened on, while it's open.
  const [generating, setGenerating] = useState<string | null>(null);
  // Month-to-month and YTD share their sheets, and neither asks until visited.
  const [monthsOpened, setMonthsOpened] = useState(false);
  const months = useYearlyRecords<AttendanceMonth>("monthly", fetchAttendanceMonthsOf, monthsOpened);
  const today = todayDate();
  const thisMonth = `${today.slice(0, 7)}-01`;
  const recent = monthsBefore(today, MONTHS_TO_CHECK);
  const { starts, refresh: refreshStarts } = useMonthlySheetStarts(recent[recent.length - 1]);

  const sheetOn: SheetLookup = (startDay) => {
    if (months.loadingText) return undefined;
    const year = startDay.slice(0, 4);
    if (!months.years.some((entry) => entry.year === year)) return null;
    const rows = months.records[year];
    if (!rows) return undefined;
    return rows.find((month) => month.startDay === startDay) ?? null;
  };
  // A month still going isn't due yet, so these start from last month.
  const missing = starts ? recent.filter((startDay) => !starts.includes(startDay)) : [];
  const defaultMonth = missing[0] ?? recent[0];

  // The generate dialog needs the sheets it offers, which can reach back into a
  // year nobody has opened.
  const choices = generating ? [...new Set([thisMonth, ...recent, generating])].sort().reverse() : [];
  const yearsToCheck = [...new Set(choices.map((startDay) => startDay.slice(0, 4)))].join();
  useEffect(() => {
    if (!yearsToCheck) return;
    for (const year of yearsToCheck.split(",")) {
      if (months.years.some((entry) => entry.year === year) && !(year in months.records)) months.load(year);
    }
    // `load` is remade on every render; what matters is what's known so far.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsToCheck, months.years, months.records]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <SlidingTabs
            label="Attendance view"
            tabs={VIEWS}
            active={view}
            onChange={(next) => {
              setView(next);
              if (next !== "week") setMonthsOpened(true);
            }}
            className="w-full min-w-0 max-w-[26rem]"
          />
          {view === "month" && (
            <button
              type="button"
              onClick={() => setGenerating(defaultMonth)}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80"
            >
              Generate
            </button>
          )}
        </div>
        {missing.length > 0 && (
          <p className="w-fit rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            No monthly sheet yet for {[...missing].reverse().map(formatMonth).join(", ")}.
          </p>
        )}
      </div>
      <div hidden={view !== "week"}>
        <WeekToWeek />
      </div>
      {monthsOpened && (
        <>
          <div hidden={view !== "month"}>
            <MonthToMonth yearly={months} onCompare={setGenerating} onDeleted={refreshStarts} />
          </div>
          <div hidden={view !== "year"}>
            <YearToDate yearly={months} />
          </div>
        </>
      )}
      {generating && (
        <GenerateMonthDialog
          // An older month opened from its row joins the usual ones, in order.
          choices={choices}
          initial={generating}
          sheetOn={sheetOn}
          onClose={() => setGenerating(null)}
          onGenerated={(year) => {
            setGenerating(null);
            months.reload(year);
            refreshStarts();
          }}
        />
      )}
    </div>
  );
}
