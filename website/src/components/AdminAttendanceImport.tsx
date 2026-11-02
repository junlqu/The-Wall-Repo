"use client";

import Link from "next/link";
import { useState } from "react";
import { FilePicker } from "@/components/AdminClimbImport";
import { ErrorMessage, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import {
  type AttendanceWeek,
  fetchAttendance,
  fetchAttendanceMonths,
  formatMoney,
  formatMonth,
  formatWeekRange,
  hoursOf,
  measureBlock,
  measureDay,
  monthId,
  saveAttendance,
  saveAttendanceMonth,
} from "@/lib/attendance";
import { formatForMonth } from "@/lib/attendanceFormats";
import {
  AttendanceImportError,
  isBlankSheet,
  type ParsedAttendance,
  parseAttendanceSheet,
  readAttendanceRows,
  type SheetRows,
} from "@/lib/attendanceImport";
import { formatDate } from "@/lib/climbs";

// Reading takes a moment at most, and a status that flashes for a few
// milliseconds looks like a glitch, so it stays up at least this long.
const MIN_READING_MS = 600;

const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white";

type Existing = { weeks: AttendanceWeek[]; monthIds: Set<string> };

type Stage =
  | { name: "choose"; error?: string }
  | { name: "reading"; fileName: string }
  | { name: "preview"; fileName: string; rows: SheetRows; parsed: ParsedAttendance; existing: Existing; saving?: boolean; error?: string }
  | { name: "done"; fileName: string; parsed: ParsedAttendance };

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function periodName(parsed: ParsedAttendance) {
  return parsed.kind === "weekly" ? formatWeekRange(parsed.week.weekEnding) : formatMonth(parsed.month.startDay);
}

function isSaved(parsed: ParsedAttendance, existing: Existing) {
  return parsed.kind === "weekly"
    ? existing.weeks.some((week) => week.weekEnding === parsed.week.weekEnding)
    : existing.monthIds.has(monthId(parsed.month));
}

// One row per table the sheet holds: its label or date, then what it adds up to.
function previewRows(parsed: ParsedAttendance) {
  if (parsed.kind === "weekly") {
    return parsed.week.days.map((day) => ({
      key: day.date,
      name: formatDate(day.date),
      hours: hoursOf(day).length,
      climbers: measureDay(day, "numbers"),
      cents: measureDay(day, "earnings"),
      turnedAway: day.turnedAway,
    }));
  }
  const format = formatForMonth(parsed.month.startDay);
  return parsed.month.blocks.map((block) => ({
    key: block.label,
    name: block.label,
    hours: hoursOf(block).length,
    climbers: measureBlock(block, "numbers", format),
    cents: measureBlock(block, "earnings", format),
    turnedAway: block.turnedAway,
  }));
}

function Preview({
  stage,
  onYear,
  onSave,
  onCancel,
}: {
  stage: Extract<Stage, { name: "preview" }>;
  onYear: (year: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { fileName, parsed, existing, saving = false, error } = stage;
  const rows = previewRows(parsed);
  const replaces = isSaved(parsed, existing);
  const notes = parsed.kind === "monthly" ? parsed.month.notes : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Preview of</p>
          <p className="break-all font-semibold text-primary">{fileName}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {periodName(parsed)} · {parsed.formats.map((format) => format.name).join(", ")}
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 text-xs font-semibold">
          <li className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">{parsed.kind === "weekly" ? "Weekly sheet" : "Monthly sheet"}</li>
          <li className={`rounded-full px-3 py-1 ${replaces ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
            {replaces ? "Replaces what's saved" : "New"}
          </li>
        </ul>
      </div>

      {/* Weekly sheets never say their year, so one that fits several can be
          moved to the right one. */}
      {parsed.kind === "weekly" && parsed.years.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 rounded-md border-l-4 border-sky-400 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Weekly sheets don&apos;t name their year, and these dates fit several. Year:
          <select
            value={parsed.week.weekEnding.slice(0, 4)}
            onChange={(event) => onYear(Number(event.target.value))}
            className="rounded border border-sky-300 bg-white px-2 py-1 font-semibold"
          >
            {parsed.years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      )}

      {parsed.warnings.length > 0 && (
        <details className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer font-semibold">{plural(parsed.warnings.length, "thing")} to check</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {parsed.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="px-4 py-3">{parsed.kind === "weekly" ? "Day" : "Table"}</th>
              <th scope="col" className="px-4 py-3 text-right">Hours</th>
              <th scope="col" className="px-4 py-3 text-right">Climbers</th>
              <th scope="col" className="px-4 py-3 text-right">Turned away</th>
              <th scope="col" className="px-4 py-3 text-right">Earnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-700">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">{row.name}</td>
                <td className="px-4 py-3 text-right">{row.hours}</td>
                <td className="px-4 py-3 text-right">{row.climbers.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{row.turnedAway}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600 shadow-sm">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <ErrorMessage message={error} />

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={saving} onClick={onSave} className={PRIMARY_BUTTON_CLASS}>
          {saving ? "Saving…" : replaces ? "Replace what's saved" : "Save"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// /admin/attendance/import: pick a usage sheet, weekly or monthly - the sheet
// itself says which - check what was read from it, then save it.
export default function AdminAttendanceImport() {
  const [stage, setStage] = useState<Stage>({ name: "choose" });

  const readFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setStage({ name: "choose", error: `${file.name} isn't an .xlsx file.` });
      return;
    }

    setStage({ name: "reading", fileName: file.name });
    try {
      const [rows, weeks, months] = await Promise.all([
        readAttendanceRows(file),
        fetchAttendance().catch(() => null),
        fetchAttendanceMonths().catch(() => null),
        new Promise((resolve) => setTimeout(resolve, MIN_READING_MS)),
      ]);
      if (!weeks || !months) {
        setStage({ name: "choose", error: "Couldn't load the attendance already on record to compare against. Try again." });
        return;
      }
      const parsed = parseAttendanceSheet(rows);
      if (isBlankSheet(parsed)) {
        setStage({ name: "choose", error: `${file.name} has no tallies in it, so there's nothing to save.` });
        return;
      }
      const existing = { weeks, monthIds: new Set(months.map(monthId)) };
      setStage({ name: "preview", fileName: file.name, rows, parsed, existing });
    } catch (error) {
      setStage({
        name: "choose",
        error:
          error instanceof AttendanceImportError
            ? `${file.name}: ${error.message}`
            : `Couldn't read ${file.name}. Check that it opens in Excel and try again.`,
      });
    }
  };

  if (stage.name === "choose") {
    return (
      <FilePicker
        error={stage.error}
        hint="Expects a TPASC Climbing Wall Usage sheet, weekly or monthly - it works out which from the file. Nothing is saved until you've checked what was read."
        onFile={readFile}
      />
    );
  }

  if (stage.name === "reading") {
    return (
      <div
        role="status"
        className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-neutral-200 bg-white p-10 text-center"
      >
        <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-secondary" />
        <p className="break-all text-sm font-semibold text-neutral-700">Reading {stage.fileName}…</p>
      </div>
    );
  }

  if (stage.name === "preview") {
    const save = async () => {
      setStage({ ...stage, saving: true, error: undefined });
      const { parsed } = stage;
      try {
        const { failed } =
          parsed.kind === "weekly" ? await saveAttendance([parsed.week]) : await saveAttendanceMonth(parsed.month);
        if (failed > 0) throw new Error("The sheet couldn't be saved. Try again.");
        setStage({ name: "done", fileName: stage.fileName, parsed });
      } catch (error) {
        setStage({ ...stage, saving: false, error: error instanceof Error ? error.message : "Couldn't save the sheet. Try again." });
      }
    };

    return (
      <Preview
        stage={stage}
        onYear={(year) => setStage({ ...stage, parsed: parseAttendanceSheet(stage.rows, { year }) })}
        onSave={save}
        onCancel={() => setStage({ name: "choose" })}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-neutral-200 bg-white p-10 text-center shadow-sm">
      <div>
        <p className="break-all font-semibold text-primary">Imported {stage.fileName}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {periodName(stage.parsed)} is saved as a {stage.parsed.kind === "weekly" ? "weekly" : "monthly"} sheet.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => setStage({ name: "choose" })} className={PRIMARY_BUTTON_CLASS}>
          Import another file
        </button>
        <Link href="/admin/attendance/all" className={SECONDARY_BUTTON_CLASS}>
          See all attendance
        </Link>
      </div>
    </div>
  );
}
