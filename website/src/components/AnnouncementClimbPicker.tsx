"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/ClimbForm";
import { addDays, type AnnouncementClimb, type ClimbChange, type SetKind } from "@/lib/announcements";
import { type Climb, CLIMB_TYPES, climbColour, fetchClimbs, todayDate } from "@/lib/climbs";
import { NEW_GRADE } from "@/lib/grades";

const MAX_RESULTS = 30;
// How far back a climb set or taken down counts as recent. Climbs taken down
// longer ago can't be picked.
const RECENT_DAYS = 7;
const ROW_CLASS = "grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-3";

// Most climbs picked are on the wall, so a replaced climb starts as put up.
export const DEFAULT_CHANGE: ClimbChange = "up";

// Routes and boulders on the wall, and ones taken down in the last week. Combos
// aren't set, so they're never announced.
function isPickable(climb: Climb, since: string) {
  if (climb.type === "combo") return false;
  return climb.status === "active" || (climb.removedAt !== undefined && climb.removedAt >= since);
}

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

// What a sets announcement is most likely about: ungraded new climbs, and ones
// set or taken down in the last week.
function isRecent(climb: Climb, since: string) {
  return climb.status === "past" || climb.grade === NEW_GRADE || climb.setAt >= since;
}

// Recent climbs at the top. Then climbs on the wall before ones taken down,
// ungraded new climbs first, then by line.
function pickerOrder(since: string) {
  return (a: Climb, b: Climb) => {
    const recentFirst = Number(isRecent(b, since)) - Number(isRecent(a, since));
    const upFirst = Number(b.status === "active") - Number(a.status === "active");
    const newFirst = Number(b.grade === NEW_GRADE) - Number(a.grade === NEW_GRADE);
    return (
      recentFirst ||
      upFirst ||
      newFirst ||
      (a.line ?? 99) - (b.line ?? 99) ||
      climbColour(a).localeCompare(climbColour(b))
    );
  };
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

// Search the climbs on the wall, and the ones taken down in the last week, and pick
// the ones a sets announcement is about. For replaced climbs, each one also says
// whether it went up or came down - climbs already taken down start as down.
export default function AnnouncementClimbPicker({
  kind,
  climbs,
  onChange,
}: {
  kind: SetKind | null;
  climbs: AnnouncementClimb[];
  onChange: (climbs: AnnouncementClimb[]) => void;
}) {
  // The climbs that can be picked. undefined while loading, null if they
  // couldn't be loaded.
  const [all, setAll] = useState<Climb[] | null>();
  // The day a climb set or taken down since counts as recent.
  const [since, setSince] = useState("");
  const [query, setQuery] = useState("");
  const isReplaced = kind === "replaced";

  useEffect(() => {
    fetchClimbs()
      .then((loaded) => {
        const since = addDays(todayDate(), -RECENT_DAYS);
        setSince(since);
        setAll(loaded.filter((climb) => isPickable(climb, since)).sort(pickerOrder(since)));
      })
      .catch(() => setAll(null));
  }, []);

  // Every word typed has to match the climb's line, colour, grade or type, or
  // "down" for climbs taken down.
  const results = useMemo(() => {
    const picked = new Set(climbs.map((climb) => climb.routeID));
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (all ?? [])
      .filter((climb) => {
        if (picked.has(climb.id)) return false;
        const down = climb.status === "past" ? " taken down" : "";
        const text = `${lineLabel(climb.line)} ${climbColour(climb)} ${climb.grade} ${CLIMB_TYPES[climb.type]}${down}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .slice(0, MAX_RESULTS);
  }, [all, climbs, query]);

  // A climb already taken down is always marked down, so it stays down if the
  // kind is switched to replaced later.
  const add = (climb: Climb) => {
    const picked = toPicked(climb);
    const change = climb.status === "past" ? "down" : isReplaced ? DEFAULT_CHANGE : undefined;
    onChange([...climbs, change ? { ...picked, change } : picked]);
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
            results.map((climb, index) => (
              <Fragment key={climb.id}>
                {/* A solid bar under the recent climbs. */}
                {index > 0 && isRecent(results[index - 1], since) && !isRecent(climb, since) && (
                  <li role="separator" className="h-1 bg-neutral-300" />
                )}
                <li>
                  <button
                    type="button"
                    onClick={() => add(climb)}
                    className={`${ROW_CLASS} w-full px-3 py-2 text-left text-neutral-700 transition-colors hover:bg-secondary/10`}
                  >
                    <span>{lineLabel(climb.line)}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <ClimbColour climb={climb} />
                      {climb.status === "past" && (
                        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">
                          Down {climb.removedAt}
                        </span>
                      )}
                    </span>
                    <Grade grade={climb.grade} />
                  </button>
                </li>
              </Fragment>
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
