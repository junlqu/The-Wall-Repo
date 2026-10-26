// Writes every climb out in the layout of local/TPASC Climbing Wall
// Routes.xlsx, the layout climbImport.ts reads, so an export imports back with
// nothing to change. A few things the original sheet has no place for are
// added in ways that import still understands (see climbImport.ts): combos go
// in the route tables as "Left/Right", the defunct tables get a "Date
// Retired" column, and past boulders get a table beside Defunct Routes.

import type { WorkSheet } from "xlsx";
import { type Climb, todayDate } from "@/lib/climbs";
import { NEW_GRADE, ROUTE_GRADES } from "@/lib/grades";

type XlsxModule = typeof import("xlsx");
// A date is kept apart from text so it can be written as a real Excel date.
type ExportCell = string | number | { date: string };

const TITLE = "TPASC Climbing Wall Routes";
const DATE_FORMAT = "m/d/yy";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Excel stores dates as days since 1899-12-30.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

// Column positions, matching the original sheet. Date Retired and the
// defunct boulder table are the export's own additions.
const COLUMN = {
  line: 0,
  colour: 1,
  rating: 2,
  setAt: 3,
  setter: 4,
  retired: 5,
  breakdownGrade: 7,
  breakdownCount: 8,
  boulder: 11,
  difficulty: 12,
  boulderSetAt: 13,
  boulderSetter: 14,
  notes: 15,
  boulderRetired: 16,
};
const COLUMN_WIDTHS = [6, 14, 8, 11, 14, 12, 4, 19, 19, 4, 4, 28, 11, 11, 14, 14, 12];

// New first, then the scale, then grades that aren't on it (older records).
function gradeRank(grade: string) {
  if (grade === NEW_GRADE) return -1;
  const index = ROUTE_GRADES.indexOf(grade);
  return index === -1 ? ROUTE_GRADES.length : index;
}

function byLineThenGrade(a: Climb, b: Climb) {
  return (
    (a.line ?? 0) - (b.line ?? 0) ||
    gradeRank(a.grade) - gradeRank(b.grade) ||
    a.grade.localeCompare(b.grade) ||
    a.setAt.localeCompare(b.setAt) ||
    a.colour.localeCompare(b.colour)
  );
}

function byBoulderGrade(a: Climb, b: Climb) {
  return a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.setAt.localeCompare(b.setAt);
}

function date(value: string | undefined): ExportCell | undefined {
  return value ? { date: value } : undefined;
}

// The sheet as rows of cells, top to bottom. Rows and cells left undefined
// stay blank.
export function buildClimbRows(climbs: Climb[]): (ExportCell | undefined)[][] {
  const rows: (ExportCell | undefined)[][] = [];
  const put = (row: number, column: number, value: ExportCell | undefined) => {
    if (value === undefined || value === "") return;
    (rows[row] ??= [])[column] = value;
  };

  const writeRoute = (row: number, climb: Climb) => {
    put(row, COLUMN.line, climb.line);
    put(row, COLUMN.colour, climb.secondary ? `${climb.colour}/${climb.secondary}` : climb.colour);
    put(row, COLUMN.rating, climb.grade);
    put(row, COLUMN.setAt, date(climb.setAt));
    put(row, COLUMN.setter, climb.setter);
  };
  const writeBoulder = (row: number, climb: Climb) => {
    put(row, COLUMN.boulder, climb.tape ? `${climb.colour}/${climb.tape} Tape` : climb.colour);
    put(row, COLUMN.difficulty, climb.grade);
    put(row, COLUMN.boulderSetAt, date(climb.setAt));
    put(row, COLUMN.boulderSetter, climb.setter);
  };

  const active = climbs.filter((climb) => climb.status === "active");
  const past = climbs.filter((climb) => climb.status === "past");
  const onLines = (list: Climb[]) => list.filter((climb) => climb.type !== "boulder").sort(byLineThenGrade);
  const boulders = (list: Climb[]) => list.filter((climb) => climb.type === "boulder").sort(byBoulderGrade);

  put(0, 0, TITLE);
  const header = 2;
  ["Line", "Colour", "Rating", "Date Set", "Setter"].forEach((title, index) => put(header, index, title));
  put(header, COLUMN.breakdownGrade, "Route Breakdown");
  put(header, COLUMN.breakdownCount, "Number of Routes");
  ["Boulder Problems", "Difficulty", "Date Set", "Setter", "Notes"].forEach((title, index) =>
    put(header, COLUMN.boulder + index, title),
  );

  // Active routes and combos, a blank row between lines.
  let row = header + 1;
  let previousLine: number | undefined;
  for (const climb of onLines(active)) {
    if (previousLine !== undefined && climb.line !== previousLine) row++;
    writeRoute(row++, climb);
    previousLine = climb.line;
  }
  boulders(active).forEach((climb, index) => writeBoulder(header + 1 + index, climb));

  // How many active routes (not combos) are up at each grade.
  const activeRoutes = active.filter((climb) => climb.type === "route");
  [NEW_GRADE, ...ROUTE_GRADES].forEach((grade, index) => {
    put(header + 1 + index, COLUMN.breakdownGrade, grade);
    put(header + 1 + index, COLUMN.breakdownCount, activeRoutes.filter((climb) => climb.grade === grade).length);
  });
  put(header + 2 + ROUTE_GRADES.length, COLUMN.breakdownGrade, "Total Routes");
  put(header + 2 + ROUTE_GRADES.length, COLUMN.breakdownCount, activeRoutes.length);

  // Defunct tables, three blank rows below everything above.
  const defunct = rows.length + 3;
  put(defunct, 0, "Defunct Routes");
  ["Line", "Colour", "Rating", "Date Set", "Setter", "Date Retired"].forEach((title, index) =>
    put(defunct + 1, index, title),
  );
  ["Boulder Problems", "Difficulty", "Date Set", "Setter", "Notes", "Date Retired"].forEach((title, index) =>
    put(defunct + 1, COLUMN.boulder + index, title),
  );
  onLines(past).forEach((climb, index) => {
    writeRoute(defunct + 2 + index, climb);
    put(defunct + 2 + index, COLUMN.retired, date(climb.removedAt));
  });
  boulders(past).forEach((climb, index) => {
    writeBoulder(defunct + 2 + index, climb);
    put(defunct + 2 + index, COLUMN.boulderRetired, date(climb.removedAt));
  });

  return rows;
}

// Turns the rows into a worksheet, with dates as real Excel dates.
export function toWorksheet(XLSX: XlsxModule, rows: (ExportCell | undefined)[][]): WorkSheet {
  const sheet: WorkSheet = {};
  let lastColumn = 0;
  rows.forEach((row, rowIndex) =>
    row.forEach((value, column) => {
      if (value === undefined) return;
      lastColumn = Math.max(lastColumn, column);
      const ref = XLSX.utils.encode_cell({ r: rowIndex, c: column });
      if (typeof value === "object") {
        const [year, month, day] = value.date.split("-").map(Number);
        sheet[ref] = { t: "n", v: (Date.UTC(year, month - 1, day) - EXCEL_EPOCH_MS) / ONE_DAY_MS, z: DATE_FORMAT };
      } else {
        sheet[ref] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: value };
      }
    }),
  );
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: lastColumn } });
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  return sheet;
}

// Builds the workbook and has the browser download it.
export async function downloadClimbWorkbook(climbs: Climb[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, toWorksheet(XLSX, buildClimbRows(climbs)), "Sheet1");
  XLSX.writeFile(workbook, `${TITLE} ${todayDate()}.xlsx`);
}
