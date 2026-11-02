// Writes attendance back out as the sheets it came from: the same tables,
// formulas, merges, borders and fonts as a real weekly or monthly sheet, in the
// format that was in use for the dates covered. attendanceImport.ts reads every
// file written here back to the same numbers.

import type { Borders, Cell, Workbook, Worksheet } from "exceljs";
import {
  addDays,
  type AttendanceCounts,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceWeek,
  formatMonth,
  hoursOf,
  MONTH_NAMES,
  weekDayOf,
} from "@/lib/attendance";
import {
  type AttendanceFormat,
  columnIndex,
  columnLetter,
  formatForDate,
  formatForMonth,
  sheetColumns,
} from "@/lib/attendanceFormats";
import { formatDate, parseDate } from "@/lib/climbs";

const WEEK_TITLE = "TPASC Climbing Wall Usage Report";
const FILE_PREFIX = "TPASC Climbing Wall Usage";

const FONT = "Calibri";
const FONT_SIZE = 14;
const TITLE_SIZE = 16;
const WHOLE_DOLLARS = '"$"#,##0;[Red]\\-"$"#,##0';
const CENTS = '"$"#,##0.00;[Red]\\-"$"#,##0.00';

const ROW_HEIGHT = { title: 21, gap: 21.6, tall: 19.2, medium: 18.6, short: 18 };

// One table of the sheet.
type Table = {
  label: string;
  format: AttendanceFormat;
  hours: { hour: number; mark?: string; counts: AttendanceCounts }[];
  turnedAway: number;
};

// Where a written table's totals ended up, for the All Days table to add up.
type WrittenTable = { perColumnRow: number; overallRow: number; turnedAwayRow: number | null };

type SheetContent = {
  title: string;
  tables: Table[];
  // Monthly and master sheets end with an All Days table, then notes.
  allDays: boolean;
  notes?: string[];
};

function hourPart(hour: number) {
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return { shown, period: hour < 12 ? "am" : "pm" };
}

// "12:00-1:00pm", "11:00am-12:00pm", or "12:00-12:50pm" on the formats that
// stop ten minutes short.
function hourLabel({ hour, mark }: { hour: number; mark?: string }, format: AttendanceFormat) {
  const start = hourPart(hour);
  if (format.sheet.fiftyMinuteHours) return `${mark ?? ""}${start.shown}:00-${start.shown}:50${start.period}`;
  const end = hourPart((hour + 1) % 24);
  const startPeriod = start.period === end.period ? "" : start.period;
  return `${mark ?? ""}${start.shown}:00${startPeriod}-${end.shown}:00${end.period}`;
}

const SHEET_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

// "Saturday, Oct. 10".
function dayLabel(date: string) {
  const parsed = parseDate(date);
  return `${weekDayOf(date).name}, ${SHEET_MONTHS[parsed.getMonth()]} ${parsed.getDate()}`;
}

function hourRows(table: { hours: Record<string, AttendanceCounts>; hourMarks?: Record<string, string> }) {
  return hoursOf(table).map((hour) => ({
    hour,
    mark: table.hourMarks?.[String(hour)],
    counts: table.hours[String(hour)],
  }));
}

function addUp(into: AttendanceCounts, counts: AttendanceCounts) {
  for (const [key, count] of Object.entries(counts) as [keyof AttendanceCounts, number][]) {
    into[key] = (into[key] ?? 0) + count;
  }
}

// Every day of the same weekday added together, as a monthly sheet does.
function tablesFromDays(days: AttendanceDay[], format: AttendanceFormat): Table[] {
  const byOffset = new Map<number, AttendanceDay[]>();
  for (const day of days) {
    const { offset } = weekDayOf(day.date);
    byOffset.set(offset, [...(byOffset.get(offset) ?? []), day]);
  }
  return [...byOffset.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, ofDay]) => {
      const hours: Record<string, AttendanceCounts> = {};
      for (const day of ofDay) {
        for (const [hour, counts] of Object.entries(day.hours)) {
          hours[hour] ??= {};
          addUp(hours[hour], counts);
        }
      }
      return {
        label: `${weekDayOf(ofDay[0].date).name}s`,
        format,
        hours: hourRows({ hours }),
        turnedAway: ofDay.reduce((total, day) => total + day.turnedAway, 0),
      };
    });
}

function rangeOf(range: string) {
  const [from, to = from] = range.split(":");
  return { from: columnIndex(from), to: columnIndex(to) };
}

// The columns a format's totals treat as one, each with an Overall Total. They
// also decide where the thick borders run. The oldest format has one TOTAL row
// and no groups, so it splits by its header instead.
function totalGroups(format: AttendanceFormat) {
  return (format.sheet.overallGroups ?? ["B:D", "E", "F", "G:H"]).map(rangeOf);
}

function letter(index: number) {
  return columnLetter(index);
}

function studentColumnCount(format: AttendanceFormat) {
  const utsc = format.groups[0];
  return "children" in utsc ? utsc.children.length : 1;
}

function makeBorder(left: boolean | null, right: boolean | null, top: boolean | null, bottom: boolean | null) {
  const edge = (thick: boolean | null) =>
    thick === null ? undefined : ({ style: thick ? "thick" : "thin" } as Borders["top"]);
  return { left: edge(left), right: edge(right), top: edge(top), bottom: edge(bottom) } as Partial<Borders>;
}

function paint(cell: Cell, options: { border?: Partial<Borders>; bold?: boolean; size?: number; horizontal?: "center" | "right" | "left"; vertical?: "middle"; numFmt?: string }) {
  // A new object each time: merged cells share their first cell's style until
  // given their own.
  cell.style = {
    font: { name: FONT, size: options.size ?? FONT_SIZE, bold: options.bold },
    border: options.border,
    alignment: options.horizontal || options.vertical ? { horizontal: options.horizontal, vertical: options.vertical } : undefined,
    numFmt: options.numFmt,
  };
}

function setFormula(cell: Cell, formula: string, result: number) {
  cell.value = { formula, result };
}

function sum(counts: AttendanceCounts[], key: keyof AttendanceCounts) {
  return counts.reduce((total, row) => total + (row[key] ?? 0), 0);
}

// The table's outline, column by column: is this column's left and right edge
// thick? `A` and the total and non-climber columns stand alone.
function verticalEdges(format: AttendanceFormat) {
  const { total, others } = sheetColumns(format);
  const last = columnIndex(total) + others.length;
  const edges = new Map<number, { left: boolean; right: boolean }>();
  for (let index = 0; index <= last; index++) edges.set(index, { left: false, right: false });
  const standalone = [0, columnIndex(total), ...others.map((other) => columnIndex(other.letter))];
  for (const index of standalone) edges.set(index, { left: true, right: true });
  for (const group of totalGroups(format)) {
    edges.get(group.from)!.left = true;
    edges.get(group.to)!.right = true;
  }
  // UTSC's columns stay one box even on formats that total them separately.
  const lastStudent = studentColumnCount(format);
  for (let index = 1; index <= lastStudent; index++) {
    edges.get(index)!.left = index === 1;
    edges.get(index)!.right = index === lastStudent;
  }
  return { edges, last };
}

function writeHeader(sheet: Worksheet, table: Pick<Table, "label" | "format">, top: number, totalLabel?: string) {
  const { format } = table;
  const depth = format.sheet.header.length;
  const { total, others } = sheetColumns(format);
  const totalIndex = columnIndex(total);
  const { edges, last } = verticalEdges(format);
  const noBottom = new Set(others.map((other) => columnIndex(other.letter)));

  for (const merge of format.sheet.merges) {
    const [from, to] = merge.split(":");
    const place = (ref: string) => `${ref[0]}${top + Number(ref.slice(1))}`;
    sheet.mergeCells(`${place(from)}:${place(to)}`);
  }

  for (let level = 0; level < depth; level++) {
    const rowNumber = top + level;
    const heights = depth === 4 ? [ROW_HEIGHT.tall, ROW_HEIGHT.medium, ROW_HEIGHT.short, ROW_HEIGHT.medium] : [ROW_HEIGHT.tall, ROW_HEIGHT.medium, ROW_HEIGHT.medium];
    sheet.getRow(rowNumber).height = heights[level];
    const lastLevel = level === depth - 1;
    for (let index = 0; index <= last; index++) {
      const cell = sheet.getCell(rowNumber, index + 1);
      const edge = edges.get(index)!;
      const isTotal = index === totalIndex;
      const standalone = index === 0 || isTotal || noBottom.has(index);
      const border = standalone
        ? makeBorder(true, true, level === 0 ? true : null, lastLevel && !isTotal ? true : null)
        : makeBorder(edge.left, edge.right, level <= 1, lastLevel || level === 0);
      const bold = level < (format.sheet.boldHeaderRows ?? 2) || noBottom.has(index) || index === 0 || isTotal;
      paint(cell, { border, bold, horizontal: "center", vertical: standalone ? "middle" : undefined });
    }
    for (const [column, value] of format.sheet.header[level]) {
      const cell = sheet.getCell(`${column}${rowNumber}`);
      const shown = table.label === "All Days" && column === total && format.sheet.allDaysTotal ? format.sheet.allDaysTotal : value;
      cell.value = totalLabel && column === total ? totalLabel : shown;
      if (typeof value === "number") cell.numFmt = Number.isInteger(value) ? WHOLE_DOLLARS : CENTS;
      // These two are squeezed to fit their narrower columns.
      if (value === "Equipment Only" || value === "Climbing Wall Pass") {
        const pass = value === "Climbing Wall Pass";
        cell.font = { name: FONT, bold: true, size: pass ? 11.5 : 13 };
        if (pass) cell.alignment = { horizontal: "left" };
      }
    }
  }
  sheet.getCell(top, 1).value = table.label;
  return depth;
}

// The rows under the hours. The oldest format has one TOTAL row; the rest give
// lone columns "N/A" and their own Overall Total, and a run of columns a
// shared one. `addUp` writes one cell of the first row, given its column.
function writeTotals(
  sheet: Worksheet,
  format: AttendanceFormat,
  row: number,
  perColumn: (letter: string, key: keyof AttendanceCounts) => { formula: string; result: number },
  direct: (letter: string, key: keyof AttendanceCounts) => { formula: string; result: number },
): WrittenTable & { nextRow: number; grandTotal: number; counts: Map<string, number> } {
  const { climbers, others, total } = sheetColumns(format);
  const { edges, last } = verticalEdges(format);
  const totalIndex = columnIndex(total);
  const keyAt = new Map([...climbers, ...others].map(({ column, letter: at }) => [at, column.key]));
  const counts = new Map<string, number>();

  const paintRow = (rowNumber: number) => {
    sheet.getRow(rowNumber).height = ROW_HEIGHT.tall;
    for (let index = 0; index <= last; index++) {
      if (index === totalIndex && rowNumber === row && format.sheet.overallGroups) {
        paint(sheet.getCell(rowNumber, index + 1), { border: makeBorder(true, true, null, true), horizontal: "center" });
        continue;
      }
      const edge = edges.get(index)!;
      const whole = index === 0 || index === totalIndex || !format.sheet.overallGroups;
      paint(sheet.getCell(rowNumber, index + 1), {
        border: makeBorder(whole || edge.left, whole || edge.right, true, true),
        horizontal: "center",
      });
    }
  };

  // The oldest format: one row, summing every column.
  if (!format.sheet.overallGroups) {
    paintRow(row);
    sheet.getCell(row, 1).value = format.sheet.totalLabel;
    let grandTotal = 0;
    for (const { column, letter: at } of climbers) {
      const written = perColumn(at, column.key);
      setFormula(sheet.getCell(`${at}${row}`), written.formula, written.result);
      counts.set(at, written.result);
      grandTotal += written.result;
    }
    setFormula(sheet.getCell(`${total}${row}`), `SUM(B${row}:${climbers[climbers.length - 1].letter}${row})`, grandTotal);
    return { perColumnRow: row, overallRow: row, turnedAwayRow: null, nextRow: row + 1, grandTotal, counts };
  }

  const overallRow = row + 1;
  paintRow(row);
  paintRow(overallRow);
  sheet.getCell(row, 1).value = format.sheet.totalLabel;
  sheet.getCell(overallRow, 1).value = "Overall Total";

  let grandTotal = 0;
  for (const group of totalGroups(format)) {
    const from = letter(group.from);
    const to = letter(group.to);
    if (group.from === group.to) {
      sheet.getCell(`${from}${row}`).value = "N/A";
      const written = direct(from, keyAt.get(from)!);
      setFormula(sheet.getCell(`${from}${overallRow}`), written.formula, written.result);
      counts.set(from, written.result);
      grandTotal += written.result;
      continue;
    }
    let groupTotal = 0;
    for (let index = group.from; index <= group.to; index++) {
      const at = letter(index);
      const written = perColumn(at, keyAt.get(at)!);
      setFormula(sheet.getCell(`${at}${row}`), written.formula, written.result);
      counts.set(at, written.result);
      groupTotal += written.result;
    }
    sheet.mergeCells(`${from}${overallRow}:${to}${overallRow}`);
    // Merging resets the cells' styles to the first's, so they're repainted.
    for (let index = group.from; index <= group.to; index++) {
      paint(sheet.getCell(overallRow, index + 1), { border: makeBorder(true, true, true, true), horizontal: "center" });
    }
    setFormula(sheet.getCell(`${from}${overallRow}`), `SUM(${from}${row}:${to}${row})`, groupTotal);
    grandTotal += groupTotal;
  }
  setFormula(sheet.getCell(`${total}${overallRow}`), `SUM(B${overallRow}:${letter(totalIndex - 1)}${overallRow})`, grandTotal);

  for (const { column, letter: at } of others) {
    sheet.getCell(`${at}${row}`).value = "N/A";
    const written = direct(at, column.key);
    setFormula(sheet.getCell(`${at}${overallRow}`), written.formula, written.result);
  }

  return { perColumnRow: row, overallRow, turnedAwayRow: format.sheet.turnedAway ? overallRow + 1 : null, nextRow: overallRow + 1, grandTotal, counts };
}

function writeTurnedAway(sheet: Worksheet, row: number, value: { formula?: string; result: number }) {
  sheet.getRow(row).height = ROW_HEIGHT.tall;
  const label = sheet.getCell(row, 1);
  const count = sheet.getCell(row, 2);
  label.value = "Turned Away";
  paint(label, { border: makeBorder(true, true, true, true), horizontal: "center" });
  paint(count, { border: makeBorder(true, true, true, true), horizontal: "center" });
  if (value.formula) setFormula(count, value.formula, value.result);
  else count.value = value.result;
}

function mergeTotalColumn(sheet: Worksheet, format: AttendanceFormat, top: number, lastRow: number) {
  const { total } = sheetColumns(format);
  sheet.mergeCells(`${total}${top}:${total}${lastRow}`);
}

// One table: its header, hour rows and totals. Returns where the totals went.
function writeTable(sheet: Worksheet, table: Table, top: number) {
  const { format } = table;
  const { climbers, others, total } = sheetColumns(format);
  const { edges, last } = verticalEdges(format);
  const totalIndex = columnIndex(total);
  const depth = format.sheet.header.length;
  const firstHour = top + depth;
  const lastHour = firstHour + table.hours.length - 1;
  const tallyAt = new Map([...climbers, ...others].map(({ column, letter: at }) => [at, column.key]));
  // The total column's tall merged cell runs to just above the grand total.
  const mergeEnd = format.sheet.overallGroups ? lastHour + 1 : lastHour;

  mergeTotalColumn(sheet, format, top, mergeEnd);
  writeHeader(sheet, table, top);

  table.hours.forEach((slot, index) => {
    const rowNumber = firstHour + index;
    sheet.getRow(rowNumber).height = index === 0 || index === table.hours.length - 1 ? ROW_HEIGHT.medium : ROW_HEIGHT.short;
    for (let column = 0; column <= last; column++) {
      const cell = sheet.getCell(rowNumber, column + 1);
      const edge = edges.get(column)!;
      if (column === totalIndex) {
        paint(cell, { border: makeBorder(true, true, null, null), horizontal: "center" });
        continue;
      }
      paint(cell, { border: makeBorder(edge.left, edge.right, false, false), horizontal: column === 0 ? "right" : "center" });
      const key = tallyAt.get(letter(column));
      const count = key ? slot.counts[key] : undefined;
      if (count) cell.value = count;
    }
    sheet.getCell(rowNumber, 1).value = hourLabel(slot, format);
  });

  const rows = table.hours.map((slot) => slot.counts);
  const range = (at: string) => (table.hours.length > 0 ? `${at}${firstHour}:${at}${lastHour}` : `${at}${firstHour}:${at}${firstHour}`);
  const sumColumn = (at: string, key: keyof AttendanceCounts) => ({ formula: `SUM(${range(at)})`, result: sum(rows, key) });
  const written = writeTotals(sheet, format, lastHour + 1, sumColumn, sumColumn);

  if (written.turnedAwayRow) writeTurnedAway(sheet, written.turnedAwayRow, { result: table.turnedAway });
  return { ...written, end: written.turnedAwayRow ?? written.nextRow - 1, table };
}

const NOTE_ROW_HEIGHT = ROW_HEIGHT.short;

// The All Days table: a header and totals that add up every other table, then
// the split between student and other climbers, then any notes.
function writeAllDays(sheet: Worksheet, format: AttendanceFormat, tables: ReturnType<typeof writeTable>[], top: number, notes: string[]) {
  const depth = format.sheet.header.length;
  const totalsRow = top + depth;
  mergeTotalColumn(sheet, format, top, format.sheet.overallGroups ? totalsRow : totalsRow - 1);
  writeHeader(sheet, { label: "All Days", format }, top);

  const addUpColumn = (rowOf: (table: (typeof tables)[number]) => number) => (at: string, key: keyof AttendanceCounts) => ({
    formula: tables.map((table) => `${at}${rowOf(table)}`).join("+"),
    result: tables.reduce((total, written) => total + sum(written.table.hours.map((slot) => slot.counts), key), 0),
  });
  const written = writeTotals(sheet, format, totalsRow, addUpColumn((table) => table.perColumnRow), addUpColumn((table) => table.overallRow));

  let row = written.nextRow;
  if (written.turnedAwayRow) {
    writeTurnedAway(sheet, written.turnedAwayRow, {
      formula: tables.map((table) => `B${table.turnedAwayRow}`).join("+"),
      result: tables.reduce((total, table) => total + table.table.turnedAway, 0),
    });
    row = written.turnedAwayRow + 1;
  }

  const { climbers } = sheetColumns(format);
  const studentCount = studentColumnCount(format);
  const lastStudent = climbers[studentCount - 1].letter;
  const firstOther = climbers[studentCount].letter;
  const lastOther = climbers[climbers.length - 1].letter;
  const studentTotal = climbers.slice(0, studentCount).reduce((total, { letter: at }) => total + (written.counts.get(at) ?? 0), 0);
  const overall = written.overallRow;

  // The oldest format leaves one more blank row here.
  row += format.sheet.overallGroups ? 1 : 2;
  // Students share one merged Overall Total on most formats.
  const sharedTotal = !!format.sheet.overallGroups && totalGroups(format)[0].to === columnIndex(lastStudent);
  const splits: [string, string, number][] = [
    ["Student Climbers", sharedTotal ? `B${overall}` : `SUM(B${overall}:${lastStudent}${overall})`, studentTotal],
    ["TPASC & Other Climbers", `SUM(${firstOther}${overall}:${lastOther}${overall})`, written.grandTotal - studentTotal],
  ];
  for (const [label, formula, result] of splits) {
    sheet.getRow(row).height = ROW_HEIGHT.tall;
    const name = sheet.getCell(row, 1);
    const value = sheet.getCell(row, 2);
    name.value = label;
    paint(name, { border: makeBorder(true, false, true, true), bold: true, horizontal: label.startsWith("TPASC") ? "center" : undefined, size: label.startsWith("TPASC") ? 13 : FONT_SIZE });
    paint(value, { border: makeBorder(false, true, true, true), horizontal: "center" });
    setFormula(value, formula, result);
    row += 1;
  }

  sheet.getRow(row).height = ROW_HEIGHT.medium;
  row += 1;
  for (const note of notes) {
    sheet.getRow(row).height = NOTE_ROW_HEIGHT;
    const cell = sheet.getCell(row, 1);
    cell.value = note;
    paint(cell, {});
    row += 1;
  }
}

// Fills one worksheet with a title, its tables and, for months, All Days.
function writeSheet(sheet: Worksheet, content: SheetContent) {
  const { title, tables, allDays, notes = [] } = content;
  const format = tables[0].format;

  sheet.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.7086614173228347, right: 0.7086614173228347, top: 0.7480314960629921, bottom: 0.7480314960629921, header: 0.31496062992125984, footer: 0.31496062992125984 },
  };
  for (const [from, to, width] of format.sheet.widths) {
    for (let index = columnIndex(from); index <= columnIndex(to); index++) sheet.getColumn(index + 1).width = width;
  }

  sheet.getRow(1).height = ROW_HEIGHT.title;
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  paint(titleCell, { bold: true, size: TITLE_SIZE });
  sheet.getRow(2).height = ROW_HEIGHT.gap;
  if (format.sheet.spacerRow) {
    const spacer = sheet.getCell(2, 1);
    spacer.value = " ";
    paint(spacer, { bold: true, size: TITLE_SIZE });
  }

  let top = 3;
  const written: ReturnType<typeof writeTable>[] = [];
  for (const table of tables) {
    const done = writeTable(sheet, table, top);
    written.push(done);
    // Two blank rows between tables.
    sheet.getRow(done.end + 1).height = ROW_HEIGHT.gap;
    sheet.getRow(done.end + 2).height = ROW_HEIGHT.gap;
    top = done.end + 3;
  }
  if (allDays) writeAllDays(sheet, format, written, top, notes);
}

async function newWorkbook(): Promise<Workbook> {
  const ExcelJS = await import("exceljs");
  // The browser bundle puts everything on `default`.
  return new (ExcelJS.default?.Workbook ?? ExcelJS.Workbook)();
}

// The real sheets all carry two empty extra tabs, so these do too.
function addEmptyTabs(workbook: Workbook) {
  workbook.addWorksheet("Sheet2");
  workbook.addWorksheet("Sheet3");
}

export async function buildWeekWorkbook(week: AttendanceWeek) {
  const workbook = await newWorkbook();
  writeSheet(workbook.addWorksheet("Sheet1"), {
    title: WEEK_TITLE,
    allDays: false,
    tables: week.days.map((day) => ({
      label: dayLabel(day.date),
      format: formatForDate(day.date),
      hours: hourRows(day),
      turnedAway: day.turnedAway,
    })),
  });
  addEmptyTabs(workbook);
  return workbook;
}

export async function buildMonthWorkbook(month: AttendanceMonth) {
  const workbook = await newWorkbook();
  const format = formatForMonth(month.startDay);
  writeSheet(workbook.addWorksheet("Sheet1"), {
    title: `${format.sheet.monthlyTitle}: ${formatMonth(month.startDay)}`,
    allDays: true,
    notes: month.notes,
    tables: month.blocks.map((block) => ({ label: block.label, format, hours: hourRows(block), turnedAway: block.turnedAway })),
  });
  addEmptyTabs(workbook);
  return workbook;
}

// A sheet can only have one set of columns, so a range that crosses a format
// change gets a tab per format.
function splitByFormat(days: AttendanceDay[], formatOf: (date: string) => AttendanceFormat) {
  const groups: { format: AttendanceFormat; days: AttendanceDay[] }[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const format = formatOf(day.date);
    const group = groups[groups.length - 1];
    if (group?.format.id === format.id) group.days.push(day);
    else groups.push({ format, days: [day] });
  }
  return groups;
}

// A month with no monthly sheet on record, built up from its days.
export async function buildMonthFromDays(days: AttendanceDay[], startDay: string, endDay: string) {
  return buildMonthWorkbook({ startDay, endDay, blocks: tablesFromDays(days, formatForMonth(startDay)).map((table) => blockFromTable(table)), notes: [] });
}

function blockFromTable(table: Table) {
  return {
    label: table.label,
    hours: Object.fromEntries(table.hours.map((slot) => [String(slot.hour), slot.counts])),
    turnedAway: table.turnedAway,
  };
}

// The master sheet: every recorded day between two dates, added up by weekday.
export async function buildMasterWorkbook(days: AttendanceDay[], from: string, to: string) {
  const workbook = await newWorkbook();
  const groups = splitByFormat(days, formatForDate);
  for (const [index, group] of groups.entries()) {
    const first = group.days[0].date;
    const last = group.days[group.days.length - 1].date;
    const start = index === 0 ? from : first;
    const end = index === groups.length - 1 ? to : last;
    const name = groups.length === 1 ? "Sheet1" : `${start} to ${end}`;
    writeSheet(workbook.addWorksheet(name), {
      title: `${WEEK_TITLE}: ${formatDate(start)} - ${formatDate(end)}`,
      allDays: true,
      tables: tablesFromDays(group.days, group.format),
    });
  }
  if (groups.length === 1) addEmptyTabs(workbook);
  return workbook;
}

// "October 10-16", or "April 25-May 1" across a month.
export function weekFileName(weekEnding: string) {
  const start = parseDate(addDays(weekEnding, -6));
  const end = parseDate(weekEnding);
  const startMonth = MONTH_NAMES[start.getMonth()];
  const endMonth = MONTH_NAMES[end.getMonth()];
  const range =
    startMonth === endMonth
      ? `${startMonth} ${start.getDate()}-${end.getDate()}`
      : `${startMonth} ${start.getDate()}-${endMonth} ${end.getDate()}`;
  return `${FILE_PREFIX} - ${range}.xlsx`;
}

export function monthFileName(startDay: string) {
  return `${FILE_PREFIX} - ${formatMonth(startDay)}.xlsx`;
}

export function masterFileName(from: string, to: string) {
  return `${FILE_PREFIX} - Master ${from} to ${to}.xlsx`;
}

export async function downloadWorkbook(workbook: Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
