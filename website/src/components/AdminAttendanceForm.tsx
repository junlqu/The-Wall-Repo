"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorMessage, FIELD_CLASS } from "@/components/ClimbForm";
import {
  addDays,
  ATTENDANCE_COLUMN_GROUPS,
  ATTENDANCE_COLUMNS,
  type AttendanceColumnKey,
  type AttendanceColumnNode,
  type AttendanceCounts,
  type AttendanceWeek,
  countCents,
  countClimbers,
  fetchAttendance,
  formatHourRange,
  formatMoney,
  formatPrice,
  hoursOf,
  isColumnGroup,
  openDatesOf,
  saveAttendance,
  type WeekDay,
  weekEndingFor,
} from "@/lib/attendance";
import { formatDate, todayDate } from "@/lib/climbs";

// Far more than fit on the wall in an hour - matches the API's limit.
const MAX_DIGITS = 3;

type HeaderCell = { label: string; colSpan: number; rowSpan: number; muted: boolean };

function leafCount(node: AttendanceColumnNode): number {
  return isColumnGroup(node) ? node.children.reduce((total, child) => total + leafCount(child), 0) : 1;
}

function depthOf(node: AttendanceColumnNode): number {
  return isColumnGroup(node) ? 1 + Math.max(...node.children.map(depthOf)) : 1;
}

const HEADER_DEPTH = Math.max(...ATTENDANCE_COLUMN_GROUPS.map(depthOf));

// The column tree as header rows: a group spans its columns, and a column
// with no sub-columns stretches down to the bottom header row.
const HEADER_ROWS: HeaderCell[][] = (() => {
  const rows: HeaderCell[][] = Array.from({ length: HEADER_DEPTH }, () => []);
  const visit = (node: AttendanceColumnNode, level: number) => {
    rows[level].push({
      label: node.label,
      colSpan: leafCount(node),
      rowSpan: isColumnGroup(node) ? 1 : HEADER_DEPTH - level,
      muted: !isColumnGroup(node) && node.cents === null,
    });
    if (isColumnGroup(node)) node.children.forEach((child) => visit(child, level + 1));
  };
  ATTENDANCE_COLUMN_GROUPS.forEach((node) => visit(node, 0));
  return rows;
})();

// Each column's full name for screen readers - "UTSC, Drop-ins (Gear)".
const COLUMN_NAMES = (() => {
  const names = {} as Record<AttendanceColumnKey, string>;
  const visit = (node: AttendanceColumnNode, path: string[]) => {
    if (isColumnGroup(node)) node.children.forEach((child) => visit(child, [...path, node.label]));
    else names[node.key] = [...path, node.label].join(", ");
  };
  ATTENDANCE_COLUMN_GROUPS.forEach((node) => visit(node, []));
  return names;
})();

const CELL_CLASS = "border border-neutral-200";
const COUNT_INPUT_CLASS =
  "w-11 rounded border border-transparent bg-transparent px-1 py-1 text-center text-sm text-neutral-800 placeholder:text-neutral-300 hover:border-neutral-300 focus:border-secondary focus:bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30";

// One open day as the form holds it. A closed day (a holiday, say) is left
// out when the week is saved.
type DayDraft = { closed: boolean; hours: Record<string, AttendanceCounts>; turnedAway: number };
type WeekDraft = Record<string, DayDraft>;

// The week's open days with the schedule's hours, filled in from what was
// saved. A saved week that's missing an open day had it closed.
function draftFor(weekEnding: string, saved: AttendanceWeek | undefined): WeekDraft {
  return Object.fromEntries(
    openDatesOf(weekEnding).map(({ day, date }) => {
      const savedDay = saved?.days.find((item) => item.date === date);
      const hours = [...new Set([...day.hours, ...(savedDay ? hoursOf(savedDay) : [])])].sort((a, b) => a - b);
      return [
        date,
        {
          closed: !!saved && !savedDay,
          hours: Object.fromEntries(hours.map((hour) => [String(hour), { ...savedDay?.hours[String(hour)] }])),
          turnedAway: savedDay?.turnedAway ?? 0,
        },
      ];
    }),
  );
}

function toWeek(weekEnding: string, draft: WeekDraft): AttendanceWeek {
  const days = Object.entries(draft)
    .filter(([, day]) => !day.closed)
    .map(([date, day]) => ({
      date,
      // Zeros are left out - a blank column means nobody.
      hours: Object.fromEntries(
        Object.entries(day.hours).map(([hour, counts]) => [
          hour,
          Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0)),
        ]),
      ),
      turnedAway: day.turnedAway,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { weekEnding, days };
}

function readCount(value: string) {
  return Number(value.replace(/\D/g, "").slice(0, MAX_DIGITS));
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function sumHours(day: DayDraft, count: (counts: AttendanceCounts) => number) {
  return Object.values(day.hours).reduce((total, counts) => total + count(counts), 0);
}

function DayTable({
  day,
  date,
  draft,
  onChange,
}: {
  day: WeekDay;
  date: string;
  draft: DayDraft;
  onChange: (draft: DayDraft) => void;
}) {
  const hours = hoursOf(draft);
  const setCount = (hour: number, key: AttendanceColumnKey, count: number) =>
    onChange({ ...draft, hours: { ...draft.hours, [hour]: { ...draft.hours[hour], [key]: count } } });

  return (
    <section
      aria-label={`${day.name} ${formatDate(date)}`}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <h2 className="font-bold text-primary">
          {day.name} <span className="font-normal text-neutral-500">· {formatDate(date)}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          {!draft.closed && (
            <span>
              {plural(sumHours(draft, countClimbers), "climber")} · {formatMoney(sumHours(draft, countCents))}
            </span>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-neutral-600">
            <input
              type="checkbox"
              checked={draft.closed}
              onChange={(event) => onChange({ ...draft, closed: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            Closed
          </label>
        </div>
      </div>

      {draft.closed ? (
        <p className="px-4 py-6 text-center text-sm text-neutral-500">
          Closed this day - nothing is recorded for it. Untick Closed to fill it in.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-center text-sm">
            <thead className="bg-neutral-50 text-[11px] font-semibold leading-tight text-neutral-600">
              {HEADER_ROWS.map((row, level) => (
                <tr key={level}>
                  {level === 0 && (
                    <th scope="col" rowSpan={HEADER_DEPTH} className={`${CELL_CLASS} px-3 py-2 text-left`}>
                      Hour
                    </th>
                  )}
                  {row.map((cell, index) => (
                    <th
                      key={index}
                      scope={cell.colSpan > 1 ? "colgroup" : "col"}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={`${CELL_CLASS} px-2 py-1.5 ${level === 0 && cell.colSpan > 1 ? "uppercase tracking-wide text-primary" : ""} ${cell.muted ? "text-neutral-400" : ""}`}
                    >
                      {cell.label}
                    </th>
                  ))}
                  {level === 0 && (
                    <th scope="col" rowSpan={HEADER_DEPTH} className={`${CELL_CLASS} px-3 py-2`}>
                      Climbers
                    </th>
                  )}
                </tr>
              ))}
              <tr className="font-normal text-neutral-500">
                <th scope="row" className={`${CELL_CLASS} px-3 py-1 text-left font-semibold`}>
                  Price
                </th>
                {ATTENDANCE_COLUMNS.map((column) => (
                  <td key={column.key} className={`${CELL_CLASS} px-2 py-1`}>
                    {formatPrice(column.cents)}
                  </td>
                ))}
                <td className={CELL_CLASS} />
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {hours.map((hour) => {
                const counts = draft.hours[hour];
                return (
                  <tr key={hour} className="hover:bg-secondary/5">
                    <th scope="row" className={`${CELL_CLASS} whitespace-nowrap px-3 py-1 text-left font-semibold text-primary`}>
                      {formatHourRange(hour)}
                    </th>
                    {ATTENDANCE_COLUMNS.map((column) => (
                      <td key={column.key} className={`${CELL_CLASS} p-0.5 ${column.cents === null ? "bg-neutral-50" : ""}`}>
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          aria-label={`${formatHourRange(hour)}, ${COLUMN_NAMES[column.key]}`}
                          value={counts[column.key] || ""}
                          placeholder="0"
                          onChange={(event) => setCount(hour, column.key, readCount(event.target.value))}
                          onFocus={(event) => event.target.select()}
                          className={COUNT_INPUT_CLASS}
                        />
                      </td>
                    ))}
                    <td className={`${CELL_CLASS} px-3 py-1 font-semibold`}>{countClimbers(counts)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 font-semibold text-neutral-700">
              <tr>
                <th scope="row" className={`${CELL_CLASS} px-3 py-1.5 text-left`}>
                  Total
                </th>
                {ATTENDANCE_COLUMNS.map((column) => (
                  <td key={column.key} className={`${CELL_CLASS} px-2 py-1.5`}>
                    {sumHours(draft, (counts) => counts[column.key] ?? 0)}
                  </td>
                ))}
                <td className={`${CELL_CLASS} px-3 py-1.5 text-primary`}>{sumHours(draft, countClimbers)}</td>
              </tr>
              <tr>
                <th scope="row" className={`${CELL_CLASS} whitespace-nowrap px-3 py-1.5 text-left`}>
                  <label htmlFor={`turned-away-${date}`}>Turned away</label>
                </th>
                <td colSpan={ATTENDANCE_COLUMNS.length + 1} className={`${CELL_CLASS} px-2 py-1.5 text-left`}>
                  <input
                    id={`turned-away-${date}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.turnedAway || ""}
                    placeholder="0"
                    onChange={(event) => onChange({ ...draft, turnedAway: readCount(event.target.value) })}
                    onFocus={(event) => event.target.select()}
                    className="w-16 rounded border border-neutral-300 bg-white px-2 py-1 text-center text-sm font-normal text-neutral-800 placeholder:text-neutral-300 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// The site's primary button, a size up and lifted off the page, since it
// floats over the tables.
const SAVE_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-secondary px-7 py-3 text-sm font-semibold text-primary shadow-lg transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-md";

const ARROW_BUTTON_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-600";

// The week that's just finished - the Friday on or before today.
function lastFinishedWeek(today: string) {
  const weekEnding = weekEndingFor(today);
  return weekEnding === today ? today : addDays(weekEnding, -7);
}

function AttendanceForm() {
  const searchParams = useSearchParams();
  const today = todayDate();
  const latestWeek = weekEndingFor(today);
  const [weekEnding, setWeekEnding] = useState(() => {
    const asked = searchParams.get("week");
    const week = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? weekEndingFor(asked) : lastFinishedWeek(today);
    return week > latestWeek ? latestWeek : week;
  });
  // undefined while loading, null if the API couldn't be reached.
  const [weeks, setWeeks] = useState<AttendanceWeek[] | null>();
  const [draft, setDraft] = useState<WeekDraft>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [justSaved, setJustSaved] = useState(false);

  // A fresh draft of `week`, from its saved copy in `list` if it has one.
  const openWeek = (week: string, list: AttendanceWeek[]) => {
    setWeekEnding(week);
    setDraft(draftFor(week, list.find((item) => item.weekEnding === week)));
    setDirty(false);
  };

  useEffect(() => {
    fetchAttendance()
      .then((loaded) => {
        setWeeks(loaded);
        openWeek(weekEnding, loaded);
      })
      .catch(() => setWeeks(null));
    // Only on mount - the week can't change until the weeks have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saved = weeks?.find((week) => week.weekEnding === weekEnding);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const goToWeek = (week: string) => {
    const next = weekEndingFor(week);
    if (next === weekEnding || next > latestWeek) return;
    if (dirty && !window.confirm(`Discard your changes to the week ending ${formatDate(weekEnding)}?`)) return;
    setError(undefined);
    setJustSaved(false);
    openWeek(next, weeks ?? []);
  };

  const updateDay = (date: string, day: DayDraft) => {
    setDraft((current) => ({ ...current, [date]: day }));
    setDirty(true);
    setJustSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    const week = toWeek(weekEnding, draft);
    try {
      const { failed } = await saveAttendance([week]);
      if (failed > 0) throw new Error("The week couldn't be saved. Try again.");
      const savedWeek = { ...week, updatedAt: new Date().toISOString() };
      // The draft stays as typed - it's exactly what was saved.
      setWeeks((current) => [savedWeek, ...(current ?? []).filter((item) => item.weekEnding !== weekEnding)]);
      setDirty(false);
      setJustSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save the week. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (weeks === undefined) {
    return (
      <div role="status" className="flex min-h-64 items-center justify-center rounded-lg border border-neutral-200 bg-white p-10">
        <p className="text-sm text-neutral-500">Loading attendance…</p>
      </div>
    );
  }
  if (weeks === null) {
    return <ErrorMessage message="Couldn't load the attendance already on record, so this week can't be filled in safely. Refresh to try again." />;
  }

  return (
    // Room at the bottom so the pinned Save button never covers the last
    // day's Turned away field.
    <div className="flex flex-col gap-4 pb-20">
      {/* Any date picks the week it falls in. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => goToWeek(addDays(weekEnding, -7))}
          className={ARROW_BUTTON_CLASS}
        >
          ←
        </button>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Week ending
          <input
            type="date"
            value={weekEnding}
            max={latestWeek}
            onChange={(event) => event.target.value && goToWeek(event.target.value)}
            className={`${FIELD_CLASS} w-auto py-1.5 font-semibold normal-case tracking-normal text-primary`}
          />
        </label>
        <button
          type="button"
          aria-label="Next week"
          disabled={weekEnding >= latestWeek}
          onClick={() => goToWeek(addDays(weekEnding, 7))}
          className={ARROW_BUTTON_CLASS}
        >
          →
        </button>
      </div>

      {openDatesOf(weekEnding).map(({ day, date }) =>
        draft[date] ? (
          <DayTable key={date} day={day} date={date} draft={draft[date]} onChange={(next) => updateDay(date, next)} />
        ) : null,
      )}

      {/* Pinned to the corner so it's in reach from any of the day's tables.
          A failed save shows above it, where it'll be seen. */}
      <div className="fixed bottom-6 right-6 z-30 flex max-w-[calc(100vw-3rem)] flex-col items-end gap-2">
        <ErrorMessage message={error} />
        <div className="flex items-center gap-3">
          {justSaved && (
            <span role="status" className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-green-700 shadow-sm">
              Saved
            </span>
          )}
          <button
            type="button"
            disabled={saving || (!!saved && !dirty)}
            onClick={save}
            className={SAVE_BUTTON_CLASS}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// /admin/attendance/new: a week's tally sheets, one per open day, to type in
// at the end of the week. ?week=YYYY-MM-DD opens the week holding that date.
export default function AdminAttendanceForm() {
  // Reading the query needs a boundary in a static export.
  return (
    <Suspense>
      <AttendanceForm />
    </Suspense>
  );
}
