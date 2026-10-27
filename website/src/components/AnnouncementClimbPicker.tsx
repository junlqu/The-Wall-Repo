"use client";

import { useEffect, useMemo, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/ClimbForm";
import type { AnnouncementClimb, ClimbChange, SetKind } from "@/lib/announcements";
import { type Climb, CLIMB_TYPES, climbColour, fetchClimbs } from "@/lib/climbs";
import { NEW_GRADE } from "@/lib/grades";

const MAX_RESULTS = 30;
const ROW_CLASS = "grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-3";

// Only climbs on the wall can be picked, so a replaced climb starts as put up.
export const DEFAULT_CHANGE: ClimbChange = "up";

function toPicked(climb: Climb): AnnouncementClimb {
  return {
    routeID: climb.id,
    type: climb.type,
    line: climb.line,
    colour: climb.colour,
    secondary: climb.secondary,
    grade: climb.grade,
  };
}

export function lineLabel(line?: number) {
  return line === undefined ? "Boulder" : `Line ${line}`;
}

// Ungraded new climbs at the very top, then by line.
function pickerOrder(a: Climb, b: Climb) {
  const newFirst = Number(b.grade === NEW_GRADE) - Number(a.grade === NEW_GRADE);
  return newFirst || (a.line ?? 99) - (b.line ?? 99) || climbColour(a).localeCompare(climbColour(b));
}

// Ungraded new climbs stand out. Shared with the announcement details.
export function Grade({ grade }: { grade: string }) {
  if (grade === NEW_GRADE) {
    return (
      <span className="w-fit rounded bg-secondary/25 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
        New
      </span>
    );
  }
  return <span className="font-semibold text-primary">{grade || "—"}</span>;
}

export function ArrowIcon({ direction }: { direction: ClimbChange }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        d={
          direction === "up"
            ? "M10 3a1 1 0 0 1 .7.3l5 5a1 1 0 0 1-1.4 1.4L11 6.42V16a1 1 0 1 1-2 0V6.41L5.7 9.7a1 1 0 0 1-1.4-1.4l5-5A1 1 0 0 1 10 3z"
            : "M10 17a1 1 0 0 1-.7-.3l-5-5a1 1 0 0 1 1.4-1.4L9 13.58V4a1 1 0 1 1 2 0v9.59l3.3-3.3a1 1 0 0 1 1.4 1.42l-5 5a1 1 0 0 1-.7.29z"
        }
      />
    </svg>
  );
}

const CHANGE_OPTIONS: { id: ClimbChange; label: string; chosen: string; idle: string }[] = [
  { id: "up", label: "Put up", chosen: "bg-green-100 text-green-700 ring-1 ring-green-600/30", idle: "hover:text-green-700" },
  { id: "down", label: "Taken down", chosen: "bg-red-100 text-red-700 ring-1 ring-red-600/30", idle: "hover:text-red-700" },
];

// Search the climbs on the wall and pick the ones a sets announcement is about. For
// replaced climbs, each one also says whether it went up or came down.
export default function AnnouncementClimbPicker({
  kind,
  climbs,
  onChange,
}: {
  kind: SetKind | null;
  climbs: AnnouncementClimb[];
  onChange: (climbs: AnnouncementClimb[]) => void;
}) {
  // The climbs on the wall. undefined while loading, null if they couldn't be
  // loaded.
  const [all, setAll] = useState<Climb[] | null>();
  const [query, setQuery] = useState("");
  const isReplaced = kind === "replaced";

  useEffect(() => {
    fetchClimbs()
      .then((loaded) => setAll(loaded.filter((climb) => climb.status === "active").sort(pickerOrder)))
      .catch(() => setAll(null));
  }, []);

  // Every word typed has to match the climb's line, colour, grade or type.
  const results = useMemo(() => {
    const picked = new Set(climbs.map((climb) => climb.routeID));
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (all ?? [])
      .filter((climb) => {
        if (picked.has(climb.id)) return false;
        const text = `${lineLabel(climb.line)} ${climbColour(climb)} ${climb.grade} ${CLIMB_TYPES[climb.type]}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .slice(0, MAX_RESULTS);
  }, [all, climbs, query]);

  const add = (climb: Climb) => {
    const picked = toPicked(climb);
    onChange([...climbs, isReplaced ? { ...picked, change: DEFAULT_CHANGE } : picked]);
  };
  const setChange = (routeID: string, change: ClimbChange) =>
    onChange(climbs.map((climb) => (climb.routeID === routeID ? { ...climb, change } : climb)));
  const remove = (routeID: string) => onChange(climbs.filter((climb) => climb.routeID !== routeID));

  return (
    <div className={`${LABEL_CLASS} sm:col-span-2`}>
      Climbs
      <div className="overflow-hidden rounded-md border border-neutral-300 bg-white font-normal normal-case tracking-normal">
        <input
          type="search"
          aria-label="Search climbs"
          placeholder="Search by line, colour or grade"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${FIELD_CLASS} rounded-none border-0 border-b border-neutral-200 focus:ring-0`}
        />
        <ul aria-label="Matching climbs" className="max-h-56 divide-y divide-neutral-100 overflow-y-auto text-sm">
          {all === undefined || all === null ? (
            <li className="px-3 py-4 text-center text-neutral-500">
              {all === undefined ? "Loading climbs…" : "Couldn't load climbs. Refresh to try again."}
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-4 text-center text-neutral-500">No climbs match.</li>
          ) : (
            results.map((climb) => (
              <li key={climb.id}>
                <button
                  type="button"
                  onClick={() => add(climb)}
                  className={`${ROW_CLASS} w-full px-3 py-2 text-left text-neutral-700 transition-colors hover:bg-secondary/10`}
                >
                  <span>{lineLabel(climb.line)}</span>
                  <ClimbColour climb={climb} />
                  <Grade grade={climb.grade} />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="overflow-hidden rounded-md border border-neutral-200 font-normal normal-case tracking-normal">
        {climbs.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-neutral-500">No climbs picked yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Line
                </th>
                <th scope="col" className="px-3 py-2">
                  Colour
                </th>
                <th scope="col" className="px-3 py-2">
                  Grade
                </th>
                {isReplaced && (
                  <th scope="col" className="px-3 py-2">
                    Up / down
                  </th>
                )}
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-700">
              {climbs.map((climb) => {
                const change = climb.change ?? DEFAULT_CHANGE;
                return (
                  <tr key={climb.routeID}>
                    <td className="whitespace-nowrap px-3 py-2">{lineLabel(climb.line)}</td>
                    <td className="px-3 py-2">
                      <ClimbColour climb={climb} />
                    </td>
                    <td className="px-3 py-2">
                      <Grade grade={climb.grade} />
                    </td>
                    {isReplaced && (
                      <td className="px-3 py-1.5">
                        <div role="radiogroup" aria-label={`Was ${climbColour(climb)} put up or taken down?`} className="flex gap-1">
                          {CHANGE_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={change === option.id}
                              aria-label={option.label}
                              title={option.label}
                              onClick={() => setChange(climb.routeID, option.id)}
                              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                                change === option.id ? option.chosen : `text-neutral-400 ${option.idle}`
                              }`}
                            >
                              <ArrowIcon direction={option.id} />
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${climbColour(climb)} ${climb.grade}`}
                        onClick={() => remove(climb.routeID)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-neutral-400 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
