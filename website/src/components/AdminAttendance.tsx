"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { DailyAttendanceChart, HourlyAttendanceChart, type Scale } from "@/components/AttendanceCharts";
import { ActionsMenu, DANGER_BUTTON_CLASS, Dialog } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, useRequest } from "@/components/ClimbForm";
import CountChart from "@/components/CountChart";
import SlidingTabs from "@/components/SlidingTabs";
import ToggleSwitch from "@/components/ToggleSwitch";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import {
  type AttendanceBlock,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceWeek,
  countLessons,
  deleteAttendance,
  fetchAttendance,
  fetchAttendanceMonthsOf,
  fetchAttendanceWeeksOverlapping,
  fetchAttendanceYears,
  formatHourRange,
  formatMetric,
  formatMoney,
  formatMonth,
  formatWeekRange,
  hoursOf,
  measure,
  measureBlock,
  measureDays,
  measureMonth,
  type Metric,
  monthId,
  priorWeekEnding,
  weekId,
  type YearCount,
} from "@/lib/attendance";
import { type AttendanceColumnKey, formatForMonth } from "@/lib/attendanceFormats";
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

// Every recorded week, newest first, plus the message to show in place of
// them while loading or after a failed load (null once they've loaded), and
// a way to drop a week that's been deleted.
function useAttendance() {
  // undefined while loading, null if the API couldn't be reached.
  const [weeks, setWeeks] = useState<AttendanceWeek[] | null>();

  useEffect(() => {
    fetchAttendance()
      .then(setWeeks)
      .catch(() => setWeeks(null));
  }, []);

  return {
    weeks: weeks ?? [],
    remove: (weekEnding: string) =>
      setWeeks((current) => current?.filter((week) => week.weekEnding !== weekEnding)),
    loadingText:
      weeks === undefined
        ? "Loading attendance…"
        : weeks === null
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

function Total({
  title,
  period,
  days,
  metric,
  note,
}: {
  title: string;
  period: string;
  days: AttendanceDay[];
  metric: Metric;
  note?: string;
}) {
  return (
    <div className={`${WIDGET_CLASS} gap-1`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
        <span className="text-xs text-neutral-500">{period}</span>
      </div>
      <p className="text-3xl font-bold text-primary">{formatMetric(measureDays(days, metric), metric)}</p>
      <p className="text-xs text-neutral-500">{note ?? plural(measureDays(days, "numbers"), "climber")}</p>
    </div>
  );
}

// Totals for the week ending `anchor` and the month and year it ended in,
// then both charts counting from it. The dashboard anchors on last week; each
// week's panel on the weeks list anchors on that week.
function AttendanceSummary({
  weeks,
  anchor,
  weekTitle,
  defaultScale,
  metric,
  loadingText,
}: {
  weeks: AttendanceWeek[];
  anchor: string;
  weekTitle: string;
  defaultScale?: Scale;
  metric: Metric;
  loadingText?: string | null;
}) {
  const anchorDate = parseDate(anchor);
  const anchorWeek = weeks.find((week) => week.weekEnding === anchor);
  const allDays = weeks.flatMap((week) => week.days);
  const inYear = allDays.filter((day) => parseDate(day.date).getFullYear() === anchorDate.getFullYear());
  const inMonth = inYear.filter((day) => parseDate(day.date).getMonth() === anchorDate.getMonth());
  const chartProps = { weeks, anchor, defaultScale, metric, loadingText, className: WIDGET_CLASS };

  return (
    <>
      {loadingText ? (
        <p className="flex h-28 items-center justify-center text-sm text-neutral-500">{loadingText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Total
            title={weekTitle}
            period={`Ending ${formatDate(anchor)}`}
            days={anchorWeek?.days ?? []}
            metric={metric}
            note={anchorWeek ? undefined : "Not filled in yet"}
          />
          <Total
            title="Month"
            period={anchorDate.toLocaleDateString(undefined, { month: "long" })}
            days={inMonth}
            metric={metric}
          />
          <Total title="Year" period={String(anchorDate.getFullYear())} days={inYear} metric={metric} />
        </div>
      )}
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
  const { weeks, loadingText } = useAttendance();
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
          anchor={priorWeekEnding(todayDate())}
          weekTitle="Last week"
          metric={metric}
          loadingText={loadingText}
        />
      </section>
    </>
  );
}

// The dashboard for one week, opened from its row on the weeks list. The
// charts start on the week itself.
function WeekPanel({ weeks, week }: { weeks: AttendanceWeek[]; week: AttendanceWeek }) {
  const [metric, setMetric] = useState<Metric>("numbers");
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-primary">{formatWeekRange(week.weekEnding)}</h3>
        <MetricSwitch metric={metric} onChange={setMetric} />
      </div>
      <AttendanceSummary weeks={weeks} anchor={week.weekEnding} weekTitle="Week" defaultScale="week" metric={metric} />
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
const CLIMBERS_TITLE_CLASS = "w-[5.5rem] px-2 py-3 text-right lg:w-28 lg:px-4";
const CLIMBERS_CELL_CLASS = "px-2 py-3 text-right align-top lg:px-4 lg:align-middle";
const WIDE_CELL_CLASS = `px-4 py-3 text-right ${WIDE_SCREEN_CLASS}`;
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
// Only the year list and the newest year load at first; the rest load the first
// time they're opened and are kept from then on.
function useYearlyRecords<T>(type: "weekly" | "monthly", fetchYear: (year: string) => Promise<T[]>) {
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
    fetchAttendanceYears(type)
      .then((found) => {
        setYears(found);
        if (found[0]) {
          setOpenYears(new Set([found[0].year]));
          load(found[0].year);
        }
      })
      .catch(() => setYears(null));
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

// A table's rows split into years, newest first. Each year is a drop-down, with
// the newest starting open.
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
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th scope="col" className={`xl:w-[17rem] ${NAME_TITLE_CLASS}`}>Week</th>
                <th scope="col" className={`w-28 ${WIDE_CELL_CLASS}`}>Days open</th>
                <th scope="col" className={CLIMBERS_TITLE_CLASS}>Climbers</th>
                <th scope="col" className={`w-24 ${WIDE_CELL_CLASS}`}>Lessons</th>
                <th scope="col" className={`w-32 ${WIDE_CELL_CLASS}`}>Turned away</th>
                <th scope="col" className={`w-28 ${WIDE_CELL_CLASS}`}>Earnings</th>
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
              renderRow={(week, yearWeeks) => {
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
                      <td className={WIDE_CELL_CLASS}>{week.days.length}</td>
                      <td className={CLIMBERS_CELL_CLASS}>{measureDays(week.days, "numbers").toLocaleString()}</td>
                      <td className={WIDE_CELL_CLASS}>{countLessons(week.days).toLocaleString()}</td>
                      <td className={WIDE_CELL_CLASS}>{turnedAway(week.days)}</td>
                      <td className={WIDE_CELL_CLASS}>{formatMoney(measureDays(week.days, "earnings"))}</td>
                      <td title={lastSaved(week)} className={`truncate px-4 py-3 text-xs text-neutral-500 ${WIDEST_SCREEN_CLASS}`}>
                        {lastSaved(week)}
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
                            <WeekPanel weeks={yearWeeks} week={week} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }}
            />
          </table>
        </div>
      )}
    </div>
  );
}

const STUDENT_KEYS: AttendanceColumnKey[] = ["utscLearnToClimb", "utscDropInGear", "utscDropInNoGear"];

function countStudents(blocks: AttendanceBlock[]) {
  return blocks.reduce(
    (total, block) =>
      total +
      Object.values(block.hours).reduce(
        (blockTotal, counts) => blockTotal + STUDENT_KEYS.reduce((sum, key) => sum + (counts[key] ?? 0), 0),
        0,
      ),
    0,
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
            {month.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MonthActions({ month, onDeleted }: { month: AttendanceMonth; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const name = formatMonth(month.startDay);

  return (
    <>
      <ActionsMenu
        label={`Actions for ${name}`}
        items={[{ label: "Delete", onSelect: () => setDeleting(true), danger: true }]}
      />
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
function MonthToMonth() {
  const yearly = useYearlyRecords<AttendanceMonth>("monthly", fetchAttendanceMonthsOf);
  const { years, loadingText, remove } = yearly;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      {loadingText || years.length === 0 ? (
        <p className="p-6 text-center text-sm text-neutral-500">{loadingText ?? "No monthly attendance has been recorded yet."}</p>
      ) : (
        <div className="relative">
          {/* Fixed columns, so they stay put whichever years are open. */}
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th scope="col" className={`xl:w-48 ${NAME_TITLE_CLASS}`}>Month</th>
                <th scope="col" className={CLIMBERS_TITLE_CLASS}>Climbers</th>
                <th scope="col" className={`w-[6.5rem] ${WIDE_CELL_CLASS}`}>Students</th>
                <th scope="col" className={`w-36 ${WIDE_CELL_CLASS}`}>TPASC &amp; other</th>
                <th scope="col" className={`w-24 ${WIDE_CELL_CLASS}`}>Lessons</th>
                <th scope="col" className={`w-32 ${WIDE_CELL_CLASS}`}>Turned away</th>
                <th scope="col" className={`w-[6.5rem] ${WIDE_CELL_CLASS}`}>Earnings</th>
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
                      <td className={CLIMBERS_CELL_CLASS}>{climbers.toLocaleString()}</td>
                      <td className={WIDE_CELL_CLASS}>{students.toLocaleString()}</td>
                      <td className={WIDE_CELL_CLASS}>{(climbers - students).toLocaleString()}</td>
                      <td className={WIDE_CELL_CLASS}>{countLessons(month.blocks).toLocaleString()}</td>
                      <td className={WIDE_CELL_CLASS}>{turnedAway(month.blocks)}</td>
                      <td className={WIDE_CELL_CLASS}>{formatMoney(measureMonth(month, "earnings"))}</td>
                      <td title={lastSaved(month)} className={`truncate px-4 py-3 text-xs text-neutral-500 ${WIDEST_SCREEN_CLASS}`}>
                        {lastSaved(month)}
                      </td>
                      <td className={ACTIONS_CELL_CLASS}>
                        <MonthActions
                          month={month}
                          onDeleted={(gone) => remove(month.startDay.slice(0, 4), (other) => monthId(other) === gone)}
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
        </div>
      )}
    </div>
  );
}

type AttendanceView = "week" | "month";

const VIEWS: { id: AttendanceView; label: string }[] = [
  { id: "week", label: "Week-to-week" },
  { id: "month", label: "Month-to-month" },
];

// /admin/attendance/all: the recorded weeks or monthly sheets, by a slider.
export function AdminAttendanceAll() {
  const [view, setView] = useState<AttendanceView>("week");
  // Months load the first time they're asked for. Both views then stay mounted,
  // so flipping the slider doesn't fetch anything again.
  const [monthsOpened, setMonthsOpened] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <SlidingTabs
        label="Attendance view"
        tabs={VIEWS}
        active={view}
        onChange={(next) => {
          setView(next);
          if (next === "month") setMonthsOpened(true);
        }}
        className="w-full max-w-72"
      />
      <div hidden={view !== "week"}>
        <WeekToWeek />
      </div>
      {monthsOpened && (
        <div hidden={view !== "month"}>
          <MonthToMonth />
        </div>
      )}
    </div>
  );
}
