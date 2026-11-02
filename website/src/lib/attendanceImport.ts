// Reads an attendance sheet, weekly or monthly, in any format it's ever had.
// Which of the two a file is comes from scanning the sheet: a monthly sheet has
// an "All Days" table and names its month in the title, a weekly one has tables
// labelled with their dates. Nothing in this file touches the server.

import {
  addDays,
  type AttendanceBlock,
  type AttendanceCounts,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceWeek,
  dateKey,
  MONTH_NAMES,
  monthRange,
  weekEndingFor,
} from "@/lib/attendance";
import {
  ATTENDANCE_FORMATS,
  type AttendanceFormat,
  columnIndex,
  columnLetter,
  formatForDate,
  formatForMonth,
  sheetColumns,
} from "@/lib/attendanceFormats";
import { parseDate, todayDate } from "@/lib/climbs";

// Thrown when a file isn't an attendance sheet at all. The message is written
// for the admin to read.
export class AttendanceImportError extends Error {}

type Cell = string | number | boolean | null;
export type SheetRows = Cell[][];

export type ParsedAttendance =
  | {
      kind: "weekly";
      week: AttendanceWeek;
      // Weekly sheets never say their year, so it's worked out from the
      // weekdays. Every year this sheet's dates fit, newest first.
      years: number[];
      formats: AttendanceFormat[];
      warnings: string[];
    }
  | { kind: "monthly"; month: AttendanceMonth; formats: AttendanceFormat[]; warnings: string[] };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const OLDEST_YEAR = 2016;

function text(cell: Cell | undefined) {
  return typeof cell === "string" ? cell.replace(/\s+/g, " ").trim() : "";
}

// Reduces a header cell to what matters for telling formats apart. Numbers are
// prices. Footnote stars and "$" come and go between otherwise identical
// sheets, as does how the total column is worded.
function fingerprintCell(cell: string | number) {
  if (typeof cell === "number") return String(cell);
  const tidy = cell.toLowerCase().replace(/[*$\s]/g, "");
  return /^total.*climbers$/.test(tidy) ? "total" : tidy;
}

function formatFingerprint(format: AttendanceFormat) {
  return JSON.stringify(
    format.sheet.header.map((row) => row.map(([column, value]) => `${column}=${fingerprintCell(value)}`)),
  );
}

const FINGERPRINTS = ATTENDANCE_FORMATS.map((format) => ({ format, fingerprint: formatFingerprint(format) }));

function sheetFingerprint(rows: SheetRows, start: number, depth: number) {
  return JSON.stringify(
    Array.from({ length: depth }, (_, offset) => {
      const row = rows[start + offset] ?? [];
      const cells: string[] = [];
      row.forEach((cell, index) => {
        if (index === 0 || cell === null || cell === undefined || cell === "") return;
        if (typeof cell === "string" && cell.trim() === "") return;
        if (typeof cell === "boolean") return;
        cells.push(`${columnLetter(index)}=${fingerprintCell(cell)}`);
      });
      return cells;
    }),
  );
}

function findFormat(rows: SheetRows, start: number) {
  return FINGERPRINTS.find(
    ({ format, fingerprint }) => sheetFingerprint(rows, start, format.sheet.header.length) === fingerprint,
  )?.format;
}

type HourLabel = { hour: number; mark?: string; offHour: boolean };

// The start of an hour row's slot, from "12:00-1:00pm", "11:00am-12:00pm" or
// "*2:00-2:50pm". Null if it's not an hour row.
export function parseHourLabel(label: string): HourLabel | null {
  const match = label.match(/^(\*{0,3})\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—]\s*(\d{1,2})(?::\d{2})?\s*(am|pm)\s*\*{0,3}$/i);
  if (!match) return null;
  const [, stars, startText, minutes, startPeriod, endText, endPeriod] = match;
  const to24 = (hour: number, period: string) => (hour % 12) + (period.toLowerCase() === "pm" ? 12 : 0);
  const end = to24(Number(endText), endPeriod);
  let start = to24(Number(startText), startPeriod ?? endPeriod);
  // "11:00-12:00pm" starts in the morning, though only its end says a period.
  if (!startPeriod && start > end) start -= 12;
  if (start < 0 || start > 23) return null;
  return { hour: start, mark: stars || undefined, offHour: !!minutes && minutes !== "00" };
}

type SheetBlock = {
  row: number;
  label: string;
  format: AttendanceFormat;
  hours: Record<string, AttendanceCounts>;
  hourMarks: Record<string, string>;
  turnedAway: number;
  // The row after the table's last, where anything beneath it starts.
  end: number;
};

// The tables on the sheet: the rows with a label in column A and "UTSC
// Students" beside it.
function findBlockStarts(rows: SheetRows) {
  return rows.flatMap((row, index) => (text(row?.[1]) === "UTSC Students" && text(row?.[0]) ? [index] : []));
}

function readBlock(rows: SheetRows, start: number, nextStart: number, warnings: string[]): SheetBlock {
  const label = text(rows[start][0]);
  const format = findFormat(rows, start);
  if (!format) {
    throw new AttendanceImportError(`The columns of the "${label}" table don't match any format the sheet has had.`);
  }

  const { climbers, others } = sheetColumns(format);
  const tallies = new Map([...climbers, ...others].map(({ column, letter }) => [columnIndex(letter), column.key]));
  const block: SheetBlock = { row: start, label, format, hours: {}, hourMarks: {}, turnedAway: 0, end: start + 1 };

  for (let index = start + format.sheet.header.length; index < nextStart; index++) {
    const row = rows[index] ?? [];
    const rowLabel = text(row[0]);
    if (/^turned away/i.test(rowLabel)) {
      block.turnedAway = typeof row[1] === "number" ? row[1] : 0;
      block.end = index + 1;
      continue;
    }
    if (/^(total|overall)/i.test(rowLabel)) {
      block.end = index + 1;
      continue;
    }

    const parsed = parseHourLabel(rowLabel);
    if (!parsed) continue;
    block.end = index + 1;
    if (parsed.offHour) warnings.push(`"${label}" has a ${rowLabel} row, recorded under the hour it starts in.`);

    const counts: AttendanceCounts = {};
    const notes: string[] = [];
    row.forEach((cell, column) => {
      if (column === 0 || cell === null || cell === "") return;
      if (typeof cell === "number" && tallies.has(column)) {
        if (Number.isInteger(cell) && cell >= 0) {
          if (cell > 0) counts[tallies.get(column)!] = cell;
        } else {
          warnings.push(`"${label}" ${rowLabel}: ignored ${cell} in column ${columnLetter(column)}.`);
        }
      } else if (typeof cell === "string" && cell.trim()) {
        notes.push(cell.trim());
      }
    });

    // A row holding only words ("X", "No Drop-in Climbing") marks an hour the
    // wall wasn't open for drop-ins.
    if (notes.length > 0 && Object.keys(counts).length === 0) {
      warnings.push(`"${label}" ${rowLabel}: left out as closed ("${notes[0]}").`);
      continue;
    }
    if (notes.length > 0) warnings.push(`"${label}" ${rowLabel}: ignored "${notes.join('", "')}".`);

    const key = String(parsed.hour);
    if (block.hours[key]) warnings.push(`"${label}" has two ${rowLabel} rows, added together.`);
    block.hours[key] = addCounts(block.hours[key], counts);
    if (parsed.mark) block.hourMarks[key] = parsed.mark;
  }
  return block;
}

function addCounts(into: AttendanceCounts | undefined, counts: AttendanceCounts): AttendanceCounts {
  const total: AttendanceCounts = { ...into };
  for (const [key, count] of Object.entries(counts) as [keyof AttendanceCounts, number][]) {
    total[key] = (total[key] ?? 0) + count;
  }
  return total;
}

const MONTH_PATTERN = MONTH_NAMES.join("|");

// "Saturday, Oct. 10" as its weekday, month and day.
function parseDayLabel(label: string) {
  const match = label.match(/^([A-Za-z]+),?\s+([A-Za-z]+)\.?\s+(\d{1,2})$/);
  if (!match) return null;
  const weekday = WEEKDAYS.findIndex((name) => name.startsWith(match[1].slice(0, 3).toLowerCase()));
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase().startsWith(match[2].slice(0, 3).toLowerCase()));
  if (weekday === -1 || month === -1) return null;
  return { weekday, month, day: Number(match[3]) };
}

// How well a week starting on this Friday's Saturday fits the labels.
function weekCandidates(labels: { weekday: number; month: number; day: number }[], year: number) {
  const scores = new Map<string, number>();
  for (const { weekday, month, day } of labels) {
    // A week can run across New Year, so each label may belong to `year` or
    // the one after - weeks are filed under the year they end in.
    for (const y of [year, year - 1]) {
      const date = new Date(y, month, day);
      if (date.getDate() !== day || date.getDay() !== weekday) continue;
      const friday = weekEndingFor(dateKey(date));
      if (Number(friday.slice(0, 4)) !== year) continue;
      scores.set(friday, (scores.get(friday) ?? 0) + 1);
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

// Every year this sheet's week could be in, newest first, each with the Friday
// it would end on. A date or two can be mistyped ("Friday, May 5" in a June
// week), so the labels vote.
function weekFits(labels: ReturnType<typeof parseDayLabel>[], today: string) {
  const known = labels.filter((label) => label !== null);
  const latest = weekEndingFor(today);
  const scored: { year: number; friday: string; score: number }[] = [];
  for (let y = Number(latest.slice(0, 4)) + 1; y >= OLDEST_YEAR; y--) {
    const [best] = weekCandidates(known, y);
    if (best && best[0] <= addDays(latest, 42)) scored.push({ year: y, friday: best[0], score: best[1] });
  }
  const top = Math.max(0, ...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score === top);
}

// The date a table falls on, in the week ending on `friday`. The weekday places
// it; the date beside it is only checked, since that's what gets mistyped.
function dateInWeek(friday: string, label: NonNullable<ReturnType<typeof parseDayLabel>>) {
  return addDays(friday, ((label.weekday + 1) % 7) - 6);
}

function parseWeekly(rows: SheetRows, blocks: SheetBlock[], options: ParseOptions, warnings: string[]): ParsedAttendance {
  const labels = blocks.map((block) => parseDayLabel(block.label));
  const today = options.today ?? todayDate();
  const fits = weekFits(labels, today);
  if (fits.length === 0) {
    throw new AttendanceImportError(`Couldn't work out which week this is from its tables, like "${blocks[0].label}".`);
  }

  // The same dates recur every few years, but the columns only ever match the
  // years that used them, which usually settles it. Failing that, a sheet from
  // the past is likelier than one from the future.
  const matching = fits.filter((fit) =>
    blocks.every((block, index) => {
      const label = labels[index];
      return !label || formatForDate(dateInWeek(fit.friday, label)).id === block.format.id;
    }),
  );
  const candidates = matching.length > 0 ? matching : fits;
  const latest = weekEndingFor(today);
  const { friday } =
    candidates.find((fit) => fit.year === options.year) ?? candidates.find((fit) => fit.friday <= latest) ?? candidates[0];

  const days = new Map<string, AttendanceDay>();
  blocks.forEach((block, index) => {
    const label = labels[index];
    if (!label) {
      warnings.push(`Skipped a table labelled "${block.label}" - it doesn't name a date.`);
      return;
    }
    const date = dateInWeek(friday, label);
    const written = dateKey(new Date(parseDate(date).getFullYear(), label.month, label.day));
    if (written !== date) warnings.push(`"${block.label}" isn't in this week - treated as ${date}.`);

    const expected = formatForDate(date);
    if (expected.id !== block.format.id) {
      throw new AttendanceImportError(
        `The columns of "${block.label}" are from the "${block.format.name}" format, but ${date} uses "${expected.name}".`,
      );
    }
    const existing = days.get(date);
    days.set(date, {
      date,
      hours: existing ? { ...existing.hours, ...block.hours } : block.hours,
      turnedAway: (existing?.turnedAway ?? 0) + block.turnedAway,
    });
  });

  const week: AttendanceWeek = {
    weekEnding: friday,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
  return { kind: "weekly", week, years: candidates.map((fit) => fit.year), formats: uniqueFormats(blocks), warnings };
}

function uniqueFormats(blocks: SheetBlock[]) {
  return [...new Map(blocks.map((block) => [block.format.id, block.format])).values()];
}

// The notes under a monthly sheet's All Days table: everything below its
// student and other-climber counts.
function readNotes(rows: SheetRows, from: number) {
  const notes: string[] = [];
  for (let index = from; index < rows.length; index++) {
    const label = text(rows[index]?.[0]);
    if (!label || /^(student climbers|tpasc & other climbers)/i.test(label)) continue;
    notes.push(label);
  }
  return notes;
}

function parseMonthly(rows: SheetRows, blocks: SheetBlock[], title: string, warnings: string[]): ParsedAttendance {
  const named = title.match(new RegExp(`(${MONTH_PATTERN})\\s+(\\d{4})`, "i"));
  if (!named) {
    throw new AttendanceImportError(`This looks like a monthly sheet, but its title doesn't name a month: "${title}".`);
  }
  const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === named[1].toLowerCase());
  const { startDay, endDay } = monthRange(`${named[2]}-${String(monthIndex + 1).padStart(2, "0")}-01`);

  const expected = formatForMonth(startDay);
  const tables = blocks.filter((block) => !/^all days/i.test(block.label));
  const allDays = blocks.find((block) => /^all days/i.test(block.label));

  const byLabel = new Map<string, AttendanceBlock>();
  for (const block of tables) {
    if (block.format.id !== expected.id) {
      throw new AttendanceImportError(
        `The columns of "${block.label}" are from the "${block.format.name}" format, but ${named[1]} ${named[2]} uses "${expected.name}".`,
      );
    }
    const hourMarks = Object.keys(block.hourMarks).length > 0 ? block.hourMarks : undefined;
    const existing = byLabel.get(block.label);
    if (existing) {
      warnings.push(`There are two "${block.label}" tables, added together.`);
      for (const [hour, counts] of Object.entries(block.hours)) {
        existing.hours[hour] = addCounts(existing.hours[hour], counts);
      }
      existing.turnedAway += block.turnedAway;
      continue;
    }
    byLabel.set(block.label, { label: block.label, hours: block.hours, turnedAway: block.turnedAway, hourMarks });
  }

  const lastTable = blocks[blocks.length - 1];
  const notes = allDays ? readNotes(rows, allDays.end) : readNotes(rows, lastTable.end);
  // A sheet still being filled in says so under its title - "As of October 30".
  const subtitle = text(rows[1]?.[0]);
  if (subtitle) notes.unshift(subtitle);
  const month: AttendanceMonth = { startDay, endDay, blocks: [...byLabel.values()], notes };
  return { kind: "monthly", month, formats: uniqueFormats(tables), warnings };
}

type ParseOptions = {
  // The year of a weekly sheet, when the newest one its dates fit is wrong.
  year?: number;
  // Defaults to today. Fixed by whoever reads old sheets in bulk.
  today?: string;
};

export function parseAttendanceSheet(rows: SheetRows, options: ParseOptions = {}): ParsedAttendance {
  const starts = findBlockStarts(rows);
  if (starts.length === 0) {
    throw new AttendanceImportError("This doesn't look like an attendance sheet - it has no \"UTSC Students\" tables.");
  }

  const warnings: string[] = [];
  const blocks = starts.map((start, index) => readBlock(rows, start, starts[index + 1] ?? rows.length, warnings));
  const title = text(rows[0]?.[0]);

  const monthly = blocks.some((block) => /^all days/i.test(block.label)) || new RegExp(`(${MONTH_PATTERN})\\s+\\d{4}`, "i").test(title);
  return monthly ? parseMonthly(rows, blocks, title, warnings) : parseWeekly(rows, blocks, options, warnings);
}

// The first sheet's cells, top to bottom, in the shape the parser reads.
export async function readAttendanceRows(file: Blob): Promise<SheetRows> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer());
  return XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}

// True when a parsed sheet has no tallies at all, like a blank template.
export function isBlankSheet(parsed: ParsedAttendance) {
  const tables = parsed.kind === "weekly" ? parsed.week.days : parsed.month.blocks;
  return tables.every((table) => Object.values(table.hours).every((counts) => Object.keys(counts).length === 0));
}
