"use client";

import { type FormEvent, useState } from "react";
import { SidePanel } from "@/components/ClimbActions";
import ClimbColour from "@/components/ClimbColour";
import {
  CANCEL_BUTTON_CLASS,
  ErrorMessage,
  FIELD_CLASS,
  LABEL_CLASS,
  ListSelect,
  PRIMARY_BUTTON_CLASS,
  useRequest,
} from "@/components/ClimbForm";
import { RatingPicker } from "@/components/CommentForm";
import { type Climb, createClimb, LEADABLE, type Leadable, todayDate } from "@/lib/climbs";
import { ROUTE_GRADES } from "@/lib/grades";

// The routes one hand can take, by the line they're on.
function RouteOptions({ routes }: { routes: Climb[] }) {
  const lines = [...new Set(routes.map((route) => route.line))].sort();
  return lines.map((line) => (
    <optgroup key={line} label={`Line ${line}`}>
      {routes
        .filter((route) => route.line === line)
        .map((route) => (
          <option key={route.id} value={route.id}>
            {route.colour} {route.grade}
          </option>
        ))}
    </optgroup>
  ));
}

// Adds a combo to one line, built from two of the routes in reach of it. Combos
// aren't set, so whoever made the first ascent and when are written in instead,
// and it starts with a rating.
export default function NewComboPanel({
  line,
  routes,
  onClose,
  onAdded,
}: {
  line: number;
  // The routes up on this line and the ones either side.
  routes: Climb[];
  onClose: () => void;
  onAdded: (combo: Climb) => void;
}) {
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [grade, setGrade] = useState("");
  const [leadable, setLeadable] = useState<Leadable>("?");
  const [firstAscent, setFirstAscent] = useState("");
  const [firstAscentDate, setFirstAscentDate] = useState(todayDate);
  const [rating, setRating] = useState<number>();
  const [triedWithoutRating, setTriedWithoutRating] = useState(false);
  const { busy, error, run } = useRequest();

  const left = routes.find((route) => route.id === leftId);
  const right = routes.find((route) => route.id === rightId);
  // The hands can share a colour, but not a route.
  const leftOptions = routes.filter((route) => route.id !== rightId);
  const rightOptions = routes.filter((route) => route.id !== leftId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rating === undefined) {
      setTriedWithoutRating(true);
      return;
    }
    run(async () =>
      onAdded(
        await createClimb(
          {
            type: "combo",
            colour: left!.colour,
            secondary: right!.colour,
            line,
            grade,
            setter: firstAscent.trim(),
            setAt: firstAscentDate,
            leadable,
          },
          { hands: { left: leftId, right: rightId }, initialRating: rating },
        ),
      ),
    );
  };

  return (
    <SidePanel title={`New combo on line ${line}`} busy={busy} onClose={onClose}>
      {routes.length < 2 ? (
        <>
          <p className="flex-1 p-6 text-sm text-neutral-600">
            A combo needs two routes up on line {line} or the lines either side, and there aren&apos;t that many right
            now.
          </p>
          <div className="flex justify-end border-t border-neutral-200 px-6 py-4">
            <button type="button" onClick={onClose} className={CANCEL_BUTTON_CLASS}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6">
            <div className={LABEL_CLASS}>
              Line
              <p className="text-sm font-semibold normal-case tracking-normal text-neutral-800">Line {line}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={LABEL_CLASS}>
                Left hand
                <select required value={leftId} onChange={(event) => setLeftId(event.target.value)} className={FIELD_CLASS}>
                  <option value="" disabled>
                    Choose a route
                  </option>
                  <RouteOptions routes={leftOptions} />
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Right hand
                <select required value={rightId} onChange={(event) => setRightId(event.target.value)} className={FIELD_CLASS}>
                  <option value="" disabled>
                    Choose a route
                  </option>
                  <RouteOptions routes={rightOptions} />
                </select>
              </label>
            </div>
            {left && right && (
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Combo</span>
                <ClimbColour climb={{ colour: left.colour, secondary: right.colour }} />
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={LABEL_CLASS}>
                Grade
                <ListSelect
                  options={ROUTE_GRADES}
                  required
                  value={grade}
                  onChange={setGrade}
                  emptyLabel="Choose a grade"
                />
              </label>
              <label className={LABEL_CLASS}>
                Leadable
                <select
                  value={leadable}
                  onChange={(event) => setLeadable(event.target.value as Leadable)}
                  className={FIELD_CLASS}
                >
                  {LEADABLE.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                First ascent
                <input
                  value={firstAscent}
                  onChange={(event) => setFirstAscent(event.target.value)}
                  placeholder="Who sent it first?"
                  maxLength={128}
                  className={FIELD_CLASS}
                />
              </label>
              <label className={LABEL_CLASS}>
                First ascent date
                <input
                  type="date"
                  value={firstAscentDate}
                  max={todayDate()}
                  onChange={(event) => setFirstAscentDate(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            </div>
            <div className={LABEL_CLASS}>
              Rating
              <div className="font-normal normal-case tracking-normal">
                <RatingPicker value={rating} onChange={setRating} />
              </div>
            </div>

            <ErrorMessage message={triedWithoutRating && rating === undefined ? "Give the combo a rating." : error} />
          </div>

          {/* Pinned under the scrolling fields so Add is always in reach. */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
            <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
              {busy ? "Adding…" : "Add combo"}
            </button>
          </div>
        </form>
      )}
    </SidePanel>
  );
}
