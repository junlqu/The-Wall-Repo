"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { DailyAttendanceChart, HourlyAttendanceChart, type Scale } from "@/components/AttendanceCharts";
import { ActionsMenu, DANGER_BUTTON_CLASS, Dialog } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, useRequest } from "@/components/ClimbForm";
import ToggleSwitch from "@/components/ToggleSwitch";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import {
  type AttendanceDay,
  type AttendanceWeek,
  countLessons,
  deleteAttendance,
  fetchAttendance,
  formatMetric,
  formatMoney,
  formatWeekRange,
  measureDays,
  type Metric,
  OPEN_DAYS,
  priorWeekEnding,
} from "@/lib/attendance";
import { formatDate, parseDate, todayDate } from "@/lib/climbs";

// Slugs of the attendance subpages that get a button on the main page.
const ACTIONS = [
  { slug: "new", label: "Fill in attendance" },
  { slug: "all", label: "See all attendance" },
  { slug: "import", label: "Import attendance" },
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

function turnedAway(days: AttendanceDay[]) {
  return days.reduce((total, day) => total + day.turnedAway, 0);
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
function DeleteWeekDialog({
  week,
  onClose,
  onDeleted,
}: {
  week: AttendanceWeek;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, error, run } = useRequest();

  return (
    <Dialog title={`Delete the week ${formatWeekRange(week.weekEnding)}?`} busy={busy} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        This removes the week&apos;s attendance for good and can&apos;t be undone.
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
              await deleteAttendance(week.weekEnding);
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
        <DeleteWeekDialog
          week={week}
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

// /admin/attendance/all: every recorded week, newest first. Clicking a week
// opens its dashboard under the row; its menu edits it in the form or
// deletes it.
export function AdminAttendanceWeeks() {
  const { weeks, loadingText, remove } = useAttendance();
  // One week's panel is open at a time.
  const [open, setOpen] = useState<string | null>(null);

  return (
    // Grows to fit the table rather than scrolling inside itself - the page
    // scrolls instead.
    <div className="min-w-fit overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      {loadingText || weeks.length === 0 ? (
        <p className="p-6 text-center text-sm text-neutral-500">{loadingText ?? "No attendance has been recorded yet."}</p>
      ) : (
        // `relative` so the screen-reader "Actions" label is positioned
        // within the table.
        <div className="relative">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th scope="col" className="px-4 py-3">Week</th>
                <th scope="col" className="px-4 py-3">Days open</th>
                <th scope="col" className="px-4 py-3 text-right">Climbers</th>
                <th scope="col" className="px-4 py-3 text-right">Lessons</th>
                <th scope="col" className="px-4 py-3 text-right">Turned away</th>
                <th scope="col" className="px-4 py-3 text-right">Earnings</th>
                <th scope="col" className="px-4 py-3">Last saved</th>
                <th scope="col" className="w-12 px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-700">
              {weeks.map((week) => {
                const isOpen = open === week.weekEnding;
                const panelId = `week-${week.weekEnding}`;
                return (
                  <Fragment key={week.weekEnding}>
                    <tr className={isOpen ? "bg-secondary/5" : "hover:bg-secondary/5"}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => setOpen(isOpen ? null : week.weekEnding)}
                          className="group inline-flex items-center gap-1.5 font-semibold text-primary transition-colors hover:text-secondary"
                        >
                          <ChevronIcon open={isOpen} />
                          {formatWeekRange(week.weekEnding)}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {week.days.length} of {OPEN_DAYS.length}
                      </td>
                      <td className="px-4 py-3 text-right">{measureDays(week.days, "numbers").toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{countLessons(week.days).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{turnedAway(week.days)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(measureDays(week.days, "earnings"))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
                        {week.updatedAt
                          ? `${new Date(week.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${week.updatedBy ? ` by ${week.updatedBy}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <WeekActions week={week} onDeleted={remove} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={panelId}>
                        <td colSpan={8} className="border-l-4 border-secondary bg-white p-0">
                          {/* Zero width, stretched to the cell's, so the charts
                              fit the table instead of widening it. */}
                          <div className="w-0 min-w-full">
                            <WeekPanel weeks={weeks} week={week} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
