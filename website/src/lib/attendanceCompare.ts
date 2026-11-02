// Compares a monthly sheet on record with the one its weekly sheets add up to, and
// builds the sheet that results from taking some of the generated values. Sheets
// are compared by day of the week, since one can split a day into several tables
// ("Mondays (excl. 9)" and "Monday, Oct. 9") where a generated one never does.

import {
  type AttendanceBlock,
  type AttendanceCounts,
  type AttendanceMonth,
  blockWeekDay,
  formatHourRange,
  type WeekDay,
} from "@/lib/attendance";
import { type AttendanceColumnKey, columnName, formatForMonth } from "@/lib/attendanceFormats";

export type SheetDifference = {
  id: string;
  // What it's filed under: "Saturdays", or "Whole sheet".
  group: string;
  // "4–5 PM, UTSC, Drop-ins (Gear)".
  what: string;
  original: string;
  generated: string;
  // False for a column the weeks have but this month's sheet doesn't, which an
  // export of the sheet couldn't write.
  canUseGenerated: boolean;
  apply: (draft: AttendanceMonth) => void;
};

const AS_OF = /^As of /i;

type DayTotals = { day: WeekDay; hours: Record<string, AttendanceCounts>; turnedAway: number };

function totalsByDay(month: AttendanceMonth) {
  const days = new Map<number, DayTotals>();
  for (const block of month.blocks) {
    const day = blockWeekDay(block.label);
    if (!day) continue;
    const totals = days.get(day.offset) ?? { day, hours: {}, turnedAway: 0 };
    totals.turnedAway += block.turnedAway;
    for (const [hour, counts] of Object.entries(block.hours)) {
      totals.hours[hour] ??= {};
      for (const [key, count] of Object.entries(counts) as [AttendanceColumnKey, number][]) {
        totals.hours[hour][key] = (totals.hours[hour][key] ?? 0) + count;
      }
    }
    days.set(day.offset, totals);
  }
  return days;
}

// The tables holding a day of the week, adding one if the sheet has none.
function blocksOf(draft: AttendanceMonth, day: WeekDay) {
  const blocks = draft.blocks.filter((block) => blockWeekDay(block.label)?.offset === day.offset);
  if (blocks.length > 0) return blocks;
  const block: AttendanceBlock = { label: `${day.name}s`, hours: {}, turnedAway: 0 };
  draft.blocks.push(block);
  return [block];
}

// Moves a total by `change` across a day's tables, none going below zero. The
// first table takes as much as it can.
function spread<T>(items: T[], change: number, read: (item: T) => number, write: (item: T, value: number) => void) {
  let left = change;
  for (const item of items) {
    const before = read(item);
    const after = Math.max(0, before + left);
    write(item, after);
    left -= after - before;
    if (left === 0) break;
  }
}

function changeCell(draft: AttendanceMonth, day: WeekDay, hour: string, key: AttendanceColumnKey, change: number) {
  const blocks = blocksOf(draft, day);
  const withHour = blocks.filter((block) => block.hours[hour]);
  if (withHour.length === 0) {
    blocks[0].hours[hour] = {};
    withHour.push(blocks[0]);
  }
  spread(
    withHour,
    change,
    (block) => block.hours[hour][key] ?? 0,
    (block, value) => {
      if (value > 0) block.hours[hour][key] = value;
      else delete block.hours[hour][key];
    },
  );
}

// Every value that differs, in the order the sheet runs.
export function compareMonth(original: AttendanceMonth, generated: AttendanceMonth): SheetDifference[] {
  const format = formatForMonth(original.startDay);
  const inSheet = format.columns.map((column) => column.key);
  const theirs = totalsByDay(original);
  const ours = totalsByDay(generated);
  const differences: SheetDifference[] = [];

  const offsets = [...new Set([...theirs.keys(), ...ours.keys()])].sort((a, b) => a - b);
  for (const offset of offsets) {
    const day = (theirs.get(offset) ?? ours.get(offset))!.day;
    const group = `${day.name}s`;
    const left = theirs.get(offset)?.hours ?? {};
    const right = ours.get(offset)?.hours ?? {};

    const hours = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) => Number(a) - Number(b));
    for (const hour of hours) {
      const keys = new Set([...Object.keys(left[hour] ?? {}), ...Object.keys(right[hour] ?? {})]) as Set<AttendanceColumnKey>;
      const ordered = [...inSheet.filter((key) => keys.has(key)), ...[...keys].filter((key) => !inSheet.includes(key))];
      for (const key of ordered) {
        const before = left[hour]?.[key] ?? 0;
        const after = right[hour]?.[key] ?? 0;
        if (before === after) continue;
        differences.push({
          id: `${offset}/${hour}/${key}`,
          group,
          what: `${formatHourRange(Number(hour))}, ${columnName(format, key)}`,
          original: before.toLocaleString(),
          generated: after.toLocaleString(),
          canUseGenerated: after === 0 || inSheet.includes(key),
          apply: (draft) => changeCell(draft, day, hour, key, after - before),
        });
      }
    }

    const awayBefore = theirs.get(offset)?.turnedAway ?? 0;
    const awayAfter = ours.get(offset)?.turnedAway ?? 0;
    if (awayBefore !== awayAfter) {
      differences.push({
        id: `${offset}/turnedAway`,
        group,
        what: "Turned away",
        original: awayBefore.toLocaleString(),
        generated: awayAfter.toLocaleString(),
        canUseGenerated: true,
        apply: (draft) =>
          spread(
            blocksOf(draft, day),
            awayAfter - awayBefore,
            (block) => block.turnedAway,
            (block, value) => {
              block.turnedAway = value;
            },
          ),
      });
    }
  }

  // A sheet filled in partway says how far it got, which the dashboard goes by, so
  // taking newer numbers can mean saying it covers more.
  const asOfBefore = original.notes.find((note) => AS_OF.test(note));
  const asOfAfter = generated.notes.find((note) => AS_OF.test(note));
  if (asOfBefore !== asOfAfter) {
    differences.push({
      id: "coverage",
      group: "Whole sheet",
      what: "How far it covers",
      original: asOfBefore ?? "Whole month",
      generated: asOfAfter ?? "Whole month",
      canUseGenerated: true,
      apply: (draft) => {
        draft.notes = [...(asOfAfter ? [asOfAfter] : []), ...draft.notes.filter((note) => !AS_OF.test(note))];
      },
    });
  }
  return differences;
}

// The original with the chosen differences taken from the generated sheet. Its
// tables' names and its notes stay as they are.
export function resolveMonth(original: AttendanceMonth, differences: SheetDifference[], useGenerated: Set<string>) {
  const draft = structuredClone(original);
  for (const difference of differences) {
    if (useGenerated.has(difference.id)) difference.apply(draft);
  }
  return draft;
}
