"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ClimbActions";
import {
  CANCEL_BUTTON_CLASS,
  ErrorMessage,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  useRequest,
} from "@/components/ClimbForm";
import {
  type AttendanceMonth,
  type AttendanceWeek,
  fetchAttendanceWeeksOverlapping,
  formatMoney,
  formatMonth,
  formatWeekRange,
  measureMonth,
  monthRange,
  saveAttendanceMonth,
  unrecordedWeeks,
} from "@/lib/attendance";
import { compareMonth, resolveMonth, type SheetDifference } from "@/lib/attendanceCompare";
import { monthFromDays } from "@/lib/attendanceExport";

// What's on record for a month: its sheet, null if it has none, or undefined if
// that isn't known, because the sheets haven't loaded or couldn't be.
export type SheetLookup = (startDay: string) => AttendanceMonth | null | undefined;

function Stat({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-neutral-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</dt>
      <dd className="text-lg font-bold text-primary">{children}</dd>
    </div>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const CHOICE_CLASS = "flex items-center gap-1.5 text-sm tabular-nums text-neutral-800";
const COMPARE_COLUMNS_CLASS = "grid grid-cols-[1fr_4.75rem_4.75rem] items-center gap-x-2";
const BULK_BUTTON_CLASS =
  "rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 transition-colors hover:border-primary hover:text-primary";

function DifferenceRow({
  difference,
  useGenerated,
  onChange,
}: {
  difference: SheetDifference;
  useGenerated: boolean;
  onChange: (useGenerated: boolean) => void;
}) {
  const { id, group, what, original, generated, canUseGenerated } = difference;
  const name = `difference-${id}`;
  return (
    <div role="radiogroup" aria-label={`${group}, ${what}`} className={`${COMPARE_COLUMNS_CLASS} py-1.5`}>
      <div className="min-w-0 text-sm text-neutral-700">
        {what}
        {!canUseGenerated && <p className="text-xs text-neutral-500">Not a column on this month&apos;s sheet</p>}
      </div>
      <label className={CHOICE_CLASS}>
        <input type="radio" name={name} checked={!useGenerated} onChange={() => onChange(false)} aria-label={`Original: ${original}`} />
        {original}
      </label>
      <label className={`${CHOICE_CLASS} ${canUseGenerated ? "" : "text-neutral-400"}`}>
        <input
          type="radio"
          name={name}
          checked={useGenerated}
          disabled={!canUseGenerated}
          onChange={() => onChange(true)}
          aria-label={`Generated: ${generated}`}
        />
        {generated}
      </label>
    </div>
  );
}

// A month that already has a sheet is never overwritten as it stands: what its
// weekly sheets add up to is compared with it, and only the differences picked
// here change it.
function CompareSheets({
  original,
  generated,
  busy,
  onCancel,
  onSave,
}: {
  original: AttendanceMonth;
  generated: AttendanceMonth;
  busy: boolean;
  onCancel: () => void;
  onSave: (resolved: AttendanceMonth) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const differences = compareMonth(original, generated);
  const usable = differences.filter((difference) => difference.canUseGenerated);
  const resolved = resolveMonth(original, differences, picked);
  const name = formatMonth(original.startDay);
  const groups = [...new Set(differences.map((difference) => difference.group))];

  if (differences.length === 0) {
    return (
      <>
        <p role="status" className="rounded-md border-l-4 border-green-500 bg-green-50 px-3 py-2 text-sm text-green-900">
          No changes required. {name}&apos;s sheet matches its weekly sheets exactly.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onCancel} className={CANCEL_BUTTON_CLASS}>
            Close
          </button>
        </div>
      </>
    );
  }

  const totals = [
    { title: "Climbers", of: (month: AttendanceMonth) => measureMonth(month, "numbers").toLocaleString() },
    { title: "Earnings", of: (month: AttendanceMonth) => formatMoney(measureMonth(month, "earnings")) },
  ];

  return (
    <>
      <p className="text-sm text-neutral-600">
        {name}&apos;s sheet differs from its weekly sheets in {plural(differences.length, "place")}. Pick which value to keep for each.
      </p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <tr>
            <th scope="col" className="py-1 font-semibold">
              <span className="sr-only">Total</span>
            </th>
            <th scope="col" className="py-1 text-right font-semibold">Original</th>
            <th scope="col" className="py-1 text-right font-semibold">Generated</th>
            <th scope="col" className="py-1 text-right font-semibold">If saved</th>
          </tr>
        </thead>
        <tbody className="tabular-nums text-neutral-800">
          {totals.map(({ title, of }) => (
            <tr key={title} className="border-t border-neutral-100">
              <th scope="row" className="py-1 font-semibold text-neutral-600">{title}</th>
              <td className="py-1 text-right">{of(original)}</td>
              <td className="py-1 text-right">{of(generated)}</td>
              <td className="py-1 text-right font-bold text-primary">{of(resolved)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => setPicked(new Set())} className={BULK_BUTTON_CLASS}>
          Use all original
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPicked(new Set(usable.map((difference) => difference.id)))}
          className={BULK_BUTTON_CLASS}
        >
          Use all generated
        </button>
      </div>

      <div className="max-h-[38vh] overflow-y-auto rounded-md border border-neutral-200 px-3">
        <div className={`${COMPARE_COLUMNS_CLASS} sticky top-0 z-10 border-b border-neutral-200 bg-white py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500`}>
          <span>Difference</span>
          <span>Original</span>
          <span>Generated</span>
        </div>
        {groups.map((group) => (
          <section key={group} aria-label={group} className="border-b border-neutral-100 py-1.5 last:border-b-0">
            <h4 className="text-xs font-bold text-primary">{group}</h4>
            {differences
              .filter((difference) => difference.group === group)
              .map((difference) => (
                <DifferenceRow
                  key={difference.id}
                  difference={difference}
                  useGenerated={picked.has(difference.id)}
                  onChange={(useGenerated) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (useGenerated) next.add(difference.id);
                      else next.delete(difference.id);
                      return next;
                    })
                  }
                />
              ))}
          </section>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || picked.size === 0}
          onClick={() => onSave(resolved)}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? "Saving…" : picked.size === 0 ? "Nothing to change" : `Save ${plural(picked.size, "change")}`}
        </button>
      </div>
    </>
  );
}

// Builds a month's sheet from its weekly sheets. A month with no sheet gets this
// one once it's been looked over; one that has a sheet is compared against it.
export function GenerateMonthDialog({
  choices,
  initial,
  sheetOn,
  onClose,
  onGenerated,
}: {
  // The first days of the months to offer.
  choices: string[];
  initial: string;
  sheetOn: SheetLookup;
  onClose: () => void;
  onGenerated: (year: string) => void;
}) {
  const [startDay, setStartDay] = useState(initial);
  const year = startDay.slice(0, 4);
  // A year's entry is undefined while it loads, and null if it couldn't.
  const [weeksOf, setWeeksOf] = useState<Record<string, AttendanceWeek[] | null | undefined>>({});
  const { busy, error, run } = useRequest();

  useEffect(() => {
    if (year in weeksOf) return;
    fetchAttendanceWeeksOverlapping(year)
      .then((weeks) => setWeeksOf((current) => ({ ...current, [year]: weeks })))
      .catch(() => setWeeksOf((current) => ({ ...current, [year]: null })));
  }, [year, weeksOf]);

  const { endDay } = monthRange(startDay);
  const weeks = weeksOf[year];
  const existing = sheetOn(startDay);
  const name = formatMonth(startDay);
  const days = (weeks ?? []).flatMap((week) => week.days).filter((day) => day.date >= startDay && day.date <= endDay);
  const generated = monthFromDays(days, startDay, endDay);
  const asOf = generated.notes.find((note) => note.startsWith("As of"));
  const ready = !!weeks && existing !== undefined && generated.blocks.length > 0;
  const save = (month: AttendanceMonth) =>
    run(async () => {
      const { failed } = await saveAttendanceMonth(month);
      if (failed > 0) throw new Error(`Couldn't save ${name}. Try again.`);
      onGenerated(year);
    });

  return (
    <Dialog title="Generate a monthly sheet" busy={busy} onClose={onClose}>
      <label className={LABEL_CLASS}>
        Month
        <select
          value={startDay}
          disabled={busy}
          onChange={(event) => setStartDay(event.target.value)}
          className={FIELD_CLASS}
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {formatMonth(choice)}
              {sheetOn(choice) === null ? " (no sheet yet)" : ""}
            </option>
          ))}
        </select>
      </label>

      {weeks === undefined && (
        <p role="status" className="text-sm text-neutral-500">
          Loading {name}&apos;s weekly sheets…
        </p>
      )}
      {weeks === null && <ErrorMessage message="Couldn't load the weekly sheets. Close this and try again." />}
      {existing === undefined && (
        <p role="status" className="text-sm text-neutral-500">
          Can&apos;t tell yet whether {name} has a sheet.
        </p>
      )}

      {weeks && existing !== undefined && generated.blocks.length === 0 && (
        <p className="text-sm text-neutral-600">
          No weekly sheet has climbers in {name}, so there&apos;s nothing to {existing ? "compare its sheet with" : "generate"}.
        </p>
      )}

      {ready && (
        <>
          {!existing && (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <Stat title="Climbers">{measureMonth(generated, "numbers").toLocaleString()}</Stat>
                <Stat title="Earnings">{formatMoney(measureMonth(generated, "earnings"))}</Stat>
              </dl>
              {generated.notes.map((note) => (
                <p key={note} className="text-sm text-neutral-600">
                  {note}
                </p>
              ))}
            </>
          )}
          {(asOf || unrecordedWeeks(weeks, startDay, endDay).length > 0) && (
            <ul className="flex flex-col gap-1 rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {asOf && <li>{name} isn&apos;t over yet, so this only counts what&apos;s been entered so far.</li>}
              {unrecordedWeeks(weeks, startDay, endDay).map((weekEnding) => (
                <li key={weekEnding}>No weekly sheet for {formatWeekRange(weekEnding)}, so its days in {name} aren&apos;t counted.</li>
              ))}
            </ul>
          )}
        </>
      )}

      <ErrorMessage message={error} />
      {ready && existing ? (
        <CompareSheets key={startDay} original={existing} generated={generated} busy={busy} onCancel={onClose} onSave={save} />
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => save(generated)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy ? "Saving…" : "Generate"}
          </button>
        </div>
      )}
    </Dialog>
  );
}
