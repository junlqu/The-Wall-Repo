// Reads the wall's climb spreadsheet (the layout of local/TPASC Climbing
// Wall Routes.xlsx) and works out what importing it would change. Nothing in
// here writes - the import page previews the result before anything is saved.
//
// The sheet has a route table (Line, Colour, Rating, Date Set, Setter) with a
// "Boulder Problems" table beside it, then a "Defunct Routes" table below for
// routes that have come down. Files from the site's own export (climbExport.ts)
// add a few things the original doesn't have, all optional when reading:
// combos in the route tables with a "Left/Right" colour, a "Date Retired"
// column in the defunct tables, and a defunct "Boulder Problems" table.

import { apiUrl } from "@/lib/api";
import type { Climb, ClimbStatus, ClimbType } from "@/lib/climbs";
import { NEW_GRADE } from "@/lib/grades";

export type ImportedClimb = {
  // Spreadsheet row, as Excel numbers it, so admins can find it in the file.
  row: number;
  type: ClimbType;
  status: ClimbStatus;
  colour: string;
  secondary?: string;
  tape?: string;
  grade: string;
  line?: number;
  setter: string;
  setAt: string;
  // Past climbs only, when the sheet records when it came down.
  removedAt?: string;
  warnings: string[];
};

type EditableField = "grade" | "setter" | "status" | "removedAt";

export type FieldChange = { key: EditableField; label: string; from: string; to: string };

export type ClimbChange =
  | { id: string; kind: "new"; climb: ImportedClimb }
  | { id: string; kind: "edit"; climb: ImportedClimb; existing: Climb; fields: FieldChange[] };

export type SkippedRow = { row: number; reason: string };

export type ImportPreview = {
  changes: ClimbChange[];
  unchanged: number;
  skipped: SkippedRow[];
};

// A problem with the file as a whole, worded for the admin.
export class ClimbImportError extends Error {}

type Cell = string | number | boolean | null;

const LINE_COUNT = 6;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Excel stores dates as days since 1899-12-30.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Spellings in the sheet that mean a colour the site already knows.
const COLOUR_ALIASES: Record<string, string> = {
  "multi-col.": "Multi-Colour",
  "multi-col": "Multi-Colour",
  gray: "Grey",
};

function text(cell: Cell | undefined) {
  return cell === null || cell === undefined ? "" : String(cell).trim();
}

function label(cell: Cell | undefined) {
  return text(cell).toLowerCase();
}

function columnOf(header: Cell[], name: string, from = 0) {
  return header.findIndex((cell, index) => index >= from && label(cell) === name);
}

function isRouteHeader(row: Cell[] | undefined) {
  return !!row && label(row[0]) === "line" && label(row[1]) === "colour";
}

function normaliseColour(colour: string) {
  return COLOUR_ALIASES[colour.toLowerCase()] ?? colour;
}

// Excel turns a typed 5.10 into the number 5.1, so it gets its zero back.
function readRouteGrade(cell: Cell | undefined) {
  if (typeof cell === "number") return cell === 5.1 ? "5.10" : String(cell);
  const grade = text(cell);
  return grade.toLowerCase() === NEW_GRADE.toLowerCase() ? NEW_GRADE : grade;
}

// Dates come in as Excel dates, typed "2020-01-04" text, or month-only
// "Jun-18" text from the oldest records. `missing` is the warning for a blank
// cell, or null when a blank is expected.
function readDate(cell: Cell | undefined, warnings: string[], missing: string | null = "No set date") {
  if (typeof cell === "number") {
    return new Date(EXCEL_EPOCH_MS + Math.round(cell * ONE_DAY_MS)).toISOString().slice(0, 10);
  }

  const value = text(cell);
  if (!value) {
    if (missing) warnings.push(missing);
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const monthOnly = /^([a-z]{3})-(\d{2})$/i.exec(value);
  const month = monthOnly ? MONTHS.indexOf(monthOnly[1].toLowerCase()) : -1;
  if (monthOnly && month !== -1) {
    warnings.push(`Only the month is known (${value}), so the 1st is used`);
    return `20${monthOnly[2]}-${String(month + 1).padStart(2, "0")}-01`;
  }

  warnings.push(`Couldn't read the date "${value}"`);
  return "";
}

// What makes two records the same climb. Nothing else in the sheet is stable
// enough - grades get settled and setters get corrected after the fact.
function climbKey(climb: Pick<Climb, "type" | "line" | "colour" | "tape" | "setAt">) {
  const tape = climb.type === "boulder" ? (climb.tape ?? "") : "";
  return [climb.type, climb.line ?? "", climb.colour, tape, climb.setAt].join("|").toLowerCase();
}

// The first sheet with a Line / Colour header holds the climbs.
export async function readWorkbookRows(file: File): Promise<Cell[][]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheets = workbook.SheetNames.map((name) =>
    XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }),
  );
  return sheets.find((rows) => rows.some(isRouteHeader)) ?? sheets[0] ?? [];
}

export function readClimbSheet(rows: Cell[][]): { climbs: ImportedClimb[]; skipped: SkippedRow[] } {
  const headerIndex = rows.findIndex(isRouteHeader);
  if (headerIndex === -1) {
    throw new ClimbImportError('Couldn\'t find the route table - expected a header row starting "Line", "Colour".');
  }
  const header = rows[headerIndex];
  const defunctIndex = rows.findIndex((row, index) => index > headerIndex && label(row[0]) === "defunct routes");
  const activeEnd = defunctIndex === -1 ? rows.length : defunctIndex;
  const defunctHeader =
    defunctIndex === -1 ? [] : (rows.find((row, index) => index > defunctIndex && isRouteHeader(row)) ?? []);

  // The Defunct Routes table repeats the header but drops "Setter" from it
  // while still filling that column, so both tables use the top header.
  const routeColumns = {
    line: columnOf(header, "line"),
    colour: columnOf(header, "colour"),
    rating: columnOf(header, "rating"),
    date: columnOf(header, "date set"),
    setter: columnOf(header, "setter"),
  };
  if (routeColumns.rating === -1 || routeColumns.date === -1) {
    throw new ClimbImportError('The route table needs "Rating" and "Date Set" columns.');
  }

  const boulderColumnsIn = (row: Cell[]) => {
    const name = columnOf(row, "boulder problems");
    return {
      name,
      difficulty: name === -1 ? -1 : columnOf(row, "difficulty", name),
      date: name === -1 ? -1 : columnOf(row, "date set", name),
      setter: name === -1 ? -1 : columnOf(row, "setter", name),
      retired: name === -1 ? -1 : columnOf(row, "date retired", name),
    };
  };
  const boulderColumns = boulderColumnsIn(header);
  // Only the site's own export has defunct boulders and retirement dates.
  const defunctBoulderColumns = boulderColumnsIn(defunctHeader);
  const firstRetired = columnOf(defunctHeader, "date retired");
  const routeRetiredColumn =
    defunctBoulderColumns.name === -1 || firstRetired < defunctBoulderColumns.name ? firstRetired : -1;

  const climbs: ImportedClimb[] = [];
  const skipped: SkippedRow[] = [];

  const readRoutes = (start: number, end: number, status: ClimbStatus, retiredColumn = -1) => {
    for (let index = start; index < end; index++) {
      const row = rows[index] ?? [];
      const { line: lineColumn, colour: colourColumn, rating, date, setter } = routeColumns;
      // Blank rows, rows that only hold a boulder, and the defunct header.
      if ([lineColumn, colourColumn, rating, date].every((column) => !text(row[column])) || isRouteHeader(row)) {
        continue;
      }

      const line = Number(row[lineColumn]);
      if (!Number.isInteger(line) || line < 1 || line > LINE_COUNT) {
        const value = text(row[lineColumn]);
        skipped.push({ row: index + 1, reason: value ? `Line "${value}" isn't 1-${LINE_COUNT}` : "No line" });
        continue;
      }
      // A combo is written "Left/Right" - a single route's colour never has a "/".
      const [colour, secondary] = text(row[colourColumn])
        .split("/")
        .map((part) => normaliseColour(part.trim()));
      if (!colour) {
        skipped.push({ row: index + 1, reason: "No colour" });
        continue;
      }

      const warnings: string[] = [];
      const grade = readRouteGrade(row[rating]);
      if (!grade) warnings.push("No grade");
      climbs.push({
        row: index + 1,
        type: secondary ? "combo" : "route",
        status,
        colour,
        secondary: secondary || undefined,
        grade,
        line,
        setter: setter === -1 ? "" : text(row[setter]),
        setAt: readDate(row[date], warnings),
        removedAt: retiredColumn === -1 ? undefined : readDate(row[retiredColumn], warnings, null) || undefined,
        warnings,
      });
    }
  };

  const readBoulders = (start: number, end: number, status: ClimbStatus, columns: typeof boulderColumns) => {
    if (columns.name === -1) return;
    for (let index = start; index < end; index++) {
      const row = rows[index] ?? [];
      const name = text(row[columns.name]);
      if (!name || label(row[columns.name]) === "boulder problems") continue;

      // "Blue/Light Brown Tape" is blue holds marked with light brown tape.
      const [holds, ...tapeParts] = name.split("/");
      const tape = tapeParts.join("/").replace(/\s*tape$/i, "").trim();
      const warnings: string[] = [];
      const grade = columns.difficulty === -1 ? "" : text(row[columns.difficulty]);
      if (!grade) warnings.push("No grade");
      climbs.push({
        row: index + 1,
        type: "boulder",
        status,
        colour: normaliseColour(holds.trim()),
        tape: tape || undefined,
        grade,
        setter: columns.setter === -1 ? "" : text(row[columns.setter]),
        setAt: columns.date === -1 ? "" : readDate(row[columns.date], warnings),
        removedAt: columns.retired === -1 ? undefined : readDate(row[columns.retired], warnings, null) || undefined,
        warnings,
      });
    }
  };

  readRoutes(headerIndex + 1, activeEnd, "active");
  readBoulders(headerIndex + 1, activeEnd, "active", boulderColumns);
  if (defunctIndex !== -1) {
    readRoutes(defunctIndex + 1, rows.length, "past", routeRetiredColumn);
    readBoulders(defunctIndex + 1, rows.length, "past", defunctBoulderColumns);
  }

  // A row that repeats an earlier one would otherwise be added twice. Active
  // rows are read first, so a route left in both tables stays active.
  const seen = new Map<string, ImportedClimb>();
  const unique = climbs.filter((climb) => {
    const key = climbKey(climb);
    const first = seen.get(key);
    if (first) {
      const reason =
        first.status === climb.status
          ? `Same climb as row ${first.row}`
          : `Also listed as active on row ${first.row} - kept as active`;
      skipped.push({ row: climb.row, reason });
      return false;
    }
    seen.set(key, climb);
    return true;
  });

  return { climbs: unique, skipped: skipped.sort((a, b) => a.row - b.row) };
}

// Only these can change on an existing climb - the rest is what identifies it.
const FIELDS: { key: EditableField; label: string; value: (climb: Pick<Climb, EditableField>) => string }[] = [
  { key: "grade", label: "Grade", value: (climb) => climb.grade },
  { key: "setter", label: "Setter", value: (climb) => climb.setter },
  { key: "status", label: "Status", value: (climb) => (climb.status === "active" ? "Active" : "Past") },
  { key: "removedAt", label: "Retired", value: (climb) => climb.removedAt ?? "" },
];

export function previewClimbImport(rows: Cell[][], existing: Climb[]): ImportPreview {
  const { climbs, skipped } = readClimbSheet(rows);
  const existingByKey = new Map(existing.map((climb) => [climbKey(climb), climb]));

  const edits: ClimbChange[] = [];
  const additions: ClimbChange[] = [];
  let unchanged = 0;

  for (const climb of climbs) {
    // A row can hold both a route and a boulder, so the type is part of the id.
    const id = `${climb.row}-${climb.type}`;
    const match = existingByKey.get(climbKey(climb));
    if (!match) {
      additions.push({ id, kind: "new", climb });
      continue;
    }

    // A blank cell in the sheet means "not recorded", not "clear it".
    const fields = FIELDS.map(({ key, label: fieldLabel, value }) => ({
      key,
      label: fieldLabel,
      from: value(match),
      to: value(climb),
    })).filter((field) => field.to !== "" && field.to !== field.from);

    if (fields.length === 0) unchanged++;
    else edits.push({ id, kind: "edit", climb, existing: match, fields });
  }

  return { changes: [...edits, ...additions], unchanged, skipped };
}

export type ImportResult = { added: number; updated: number; failed: number };

// Sends the chosen changes to the API. Edits only carry the fields that
// changed, so anything else on the climb is left as it is.
export async function saveClimbImport(changes: ClimbChange[]): Promise<ImportResult> {
  const add = changes
    .filter((change) => change.kind === "new")
    .map(({ climb }) => ({
      type: climb.type,
      status: climb.status,
      colour: climb.colour,
      secondary: climb.secondary,
      tape: climb.tape,
      line: climb.line,
      grade: climb.grade,
      setter: climb.setter,
      setAt: climb.setAt,
      removedAt: climb.removedAt,
    }));
  const update = changes.flatMap((change) =>
    change.kind === "edit"
      ? [
          {
            routeID: change.existing.id,
            ...Object.fromEntries(change.fields.map((field) => [field.key, change.climb[field.key]])),
          },
        ]
      : [],
  );

  const res = await fetch(apiUrl("/routes/import"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add, update }),
  }).catch(() => {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Couldn't save the import. Try again.");
  return body as ImportResult;
}
