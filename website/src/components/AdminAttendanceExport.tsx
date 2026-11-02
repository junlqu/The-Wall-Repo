"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import SlidingTabs from "@/components/SlidingTabs";
import {
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceWeek,
  fetchAttendance,
  fetchAttendanceMonths,
  formatMonth,
  formatWeekRange,
  MONTH_NAMES,
  monthRange,
  priorWeekEnding,
  weekEndingFor,
} from "@/lib/attendance";
import { formatForDate } from "@/lib/attendanceFormats";
import {
  buildMasterWorkbook,
  buildMonthFromDays,
  buildMonthWorkbook,
  buildWeekWorkbook,
  downloadWorkbook,
  masterFileName,
  monthFileName,
  weekFileName,
} from "@/lib/attendanceExport";
import { todayDate } from "@/lib/climbs";

type ExportTab = "weekly" | "monthly" | "master";

const TABS: { id: ExportTab; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "master", label: "Master" },
];

const FIRST_YEAR = 2016;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function daysBetweenDates(weeks: AttendanceWeek[], from: string, to: string) {
  return weeks.flatMap((week) => week.days).filter((day) => day.date >= from && day.date <= to);
}

// The panel every tab shares: its fields, a line saying what the file will
// hold, and the download button.
function ExportPanel({
  fields,
  status,
  ready,
  download,
}: {
  fields: React.ReactNode;
  status: string;
  ready: boolean;
  download: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await download();
    } catch {
      setError("Couldn't build the spreadsheet. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap items-end gap-3">{fields}</div>
      <p role="status" className="text-sm text-neutral-600">
        {status}
      </p>
      <button type="button" disabled={busy || !ready} onClick={run} className={PRIMARY_BUTTON_CLASS}>
        {busy ? "Preparing…" : "Download .xlsx"}
      </button>
      <ErrorMessage message={error} />
    </div>
  );
}

function DateField({ label, value, max, onChange }: { label: string; value: string; max?: string; onChange: (date: string) => void }) {
  return (
    <label className={LABEL_CLASS}>
      {label}
      <input
        type="date"
        value={value}
        max={max}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className={`${FIELD_CLASS} w-auto`}
      />
    </label>
  );
}

function WeeklyTab({ weeks }: { weeks: AttendanceWeek[] }) {
  const today = todayDate();
  const [date, setDate] = useState(() => priorWeekEnding(today));
  const weekEnding = weekEndingFor(date);
  const week = weeks.find((item) => item.weekEnding === weekEnding);

  return (
    <ExportPanel
      fields={<DateField label="Any day in the week" value={date} onChange={setDate} />}
      status={
        week
          ? `${formatWeekRange(weekEnding)}: ${plural(week.days.length, "day")} recorded.`
          : `Nothing is recorded for ${formatWeekRange(weekEnding)}.`
      }
      ready={!!week}
      download={async () => {
        if (week) await downloadWorkbook(await buildWeekWorkbook(week), weekFileName(weekEnding));
      }}
    />
  );
}

function MonthlyTab({ weeks, months }: { weeks: AttendanceWeek[]; months: AttendanceMonth[] }) {
  const today = todayDate();
  // The last whole month.
  const lastMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1);
  const [year, setYear] = useState(lastMonth.getFullYear());
  const [monthIndex, setMonthIndex] = useState(lastMonth.getMonth());
  const { startDay, endDay } = monthRange(`${year}-${String(monthIndex + 1).padStart(2, "0")}-01`);
  const stored = months.find((month) => month.startDay === startDay);
  // A month with no monthly sheet on record is built from its days instead.
  const days: AttendanceDay[] = stored ? [] : daysBetweenDates(weeks, startDay, endDay);
  const years = Array.from({ length: Number(today.slice(0, 4)) - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index).reverse();
  const name = formatMonth(startDay);

  return (
    <ExportPanel
      fields={
        <>
          <label className={LABEL_CLASS}>
            Month
            <select
              value={monthIndex}
              onChange={(event) => setMonthIndex(Number(event.target.value))}
              className={`${FIELD_CLASS} w-auto`}
            >
              {MONTH_NAMES.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Year
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className={`${FIELD_CLASS} w-auto`}>
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      status={
        stored
          ? `${name}: the monthly sheet on record.`
          : days.length > 0
            ? `${name} has no monthly sheet on record, so it's built from its ${plural(days.length, "recorded day")}.`
            : `Nothing is recorded for ${name}.`
      }
      ready={!!stored || days.length > 0}
      download={async () => {
        const workbook = stored ? await buildMonthWorkbook(stored) : await buildMonthFromDays(days, startDay, endDay);
        await downloadWorkbook(workbook, monthFileName(startDay));
      }}
    />
  );
}

function MasterTab({ weeks }: { weeks: AttendanceWeek[] }) {
  const today = todayDate();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const days = from <= to ? daysBetweenDates(weeks, from, to) : [];
  const formats = new Set(days.map((day) => formatForDate(day.date).id)).size;

  return (
    <ExportPanel
      fields={
        <>
          <DateField label="From" value={from} max={to} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </>
      }
      status={
        from > to
          ? "Pick a start date before the end date."
          : days.length === 0
            ? "Nothing is recorded between those dates."
            : `${plural(days.length, "recorded day")}, added up by weekday.${formats > 1 ? ` The sheet's columns changed in this range, so the file gets one tab per format (${formats}).` : ""}`
      }
      ready={days.length > 0}
      download={async () => {
        await downloadWorkbook(await buildMasterWorkbook(days, from, to), masterFileName(from, to));
      }}
    />
  );
}

// /admin/attendance/export: downloads a week, a month or a chosen range as the
// same usage sheet the wall has always kept, in the format those dates used.
export default function AdminAttendanceExport() {
  const [tab, setTab] = useState<ExportTab>("weekly");
  // undefined while loading, null if the API couldn't be reached.
  const [records, setRecords] = useState<{ weeks: AttendanceWeek[]; months: AttendanceMonth[] } | null>();

  useEffect(() => {
    Promise.all([fetchAttendance(), fetchAttendanceMonths()])
      .then(([weeks, months]) => setRecords({ weeks, months }))
      .catch(() => setRecords(null));
  }, []);

  return (
    <div className="flex flex-col items-start gap-5 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <SlidingTabs label="What to export" tabs={TABS} active={tab} onChange={setTab} className="w-64" />
      {records === undefined ? (
        <p role="status" className="text-sm text-neutral-500">
          Loading attendance…
        </p>
      ) : records === null ? (
        <ErrorMessage message="Couldn't load attendance. Refresh to try again." />
      ) : tab === "weekly" ? (
        <WeeklyTab weeks={records.weeks} />
      ) : tab === "monthly" ? (
        <MonthlyTab weeks={records.weeks} months={records.months} />
      ) : (
        <MasterTab weeks={records.weeks} />
      )}
    </div>
  );
}
