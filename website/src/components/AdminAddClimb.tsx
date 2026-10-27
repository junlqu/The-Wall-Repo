"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import {
  ErrorMessage,
  FIELD_CLASS,
  LABEL_CLASS,
  ListSelect,
  PRIMARY_BUTTON_CLASS,
  ROUTE_GRADE_OPTIONS,
  useRequest,
} from "@/components/ClimbForm";
import {
  CLIMB_COLOURS,
  type Climb,
  type ClimbDetails,
  type ClimbType,
  climbName,
  createClimb,
  fetchClimbs,
  LEADABLE,
  type Leadable,
  LINES,
  SETTERS,
  todayDate,
} from "@/lib/climbs";
import { BOULDER_GRADES, NEW_GRADE } from "@/lib/grades";

const TYPE_OPTIONS: { id: ClimbType; label: string; description: string }[] = [
  { id: "route", label: "Route", description: "One colour, set on a line." },
  { id: "boulder", label: "Boulder", description: "A problem marked by its holds and tape." },
  { id: "combo", label: "Combo", description: "Two active routes on a line, one per hand." },
];

const CARD_CLASS = "rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-6";
const STEP_CLASS = "text-xs font-semibold uppercase tracking-wide text-neutral-500";

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className={STEP_CLASS}>
        Step {number} · {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// The fields every climb type shares: grade, who set it, when, and (for
// routes and combos) whether it can be led.
function SharedFields({
  type,
  grade,
  setGrade,
  setter,
  setSetter,
  setAt,
  setSetAt,
  leadable,
  setLeadable,
}: {
  type: ClimbType;
  grade: string;
  setGrade: (grade: string) => void;
  setter: string;
  setSetter: (setter: string) => void;
  setAt: string;
  setSetAt: (setAt: string) => void;
  leadable: Leadable;
  setLeadable: (leadable: Leadable) => void;
}) {
  const gradeListId = useId();
  const setterListId = useId();

  return (
    <>
      <label className={LABEL_CLASS}>
        Grade
        {type === "boulder" ? (
          // The boulder scale doesn't match the wall's grades yet, so it's
          // only suggested.
          <>
            <input
              required
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              list={gradeListId}
              maxLength={128}
              className={FIELD_CLASS}
            />
            <datalist id={gradeListId}>
              {[NEW_GRADE, ...BOULDER_GRADES].map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </>
        ) : (
          <ListSelect
            options={ROUTE_GRADE_OPTIONS}
            required
            value={grade}
            onChange={setGrade}
            emptyLabel="Choose a grade"
          />
        )}
      </label>
      {type !== "boulder" && (
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
      )}
      <label className={LABEL_CLASS}>
        Setter
        <input
          required
          value={setter}
          onChange={(event) => setSetter(event.target.value)}
          list={setterListId}
          placeholder="e.g. Alex, or Denzil/Alex"
          maxLength={128}
          className={FIELD_CLASS}
        />
        <datalist id={setterListId}>
          {SETTERS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label className={LABEL_CLASS}>
        Set date
        <input
          type="date"
          required
          value={setAt}
          max={todayDate()}
          onChange={(event) => setSetAt(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>
    </>
  );
}

// Step 2 for one type. Mounted fresh whenever the type changes, so nothing
// from another type's form carries over.
function DetailsForm({
  type,
  activeRoutes,
  onAdded,
}: {
  type: ClimbType;
  // undefined while loading, null if they couldn't be loaded.
  activeRoutes: Climb[] | null | undefined;
  onAdded: (climb: Climb) => void;
}) {
  const [line, setLine] = useState("");
  const [colour, setColour] = useState("");
  const [tape, setTape] = useState("");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [grade, setGrade] = useState(NEW_GRADE);
  const [setter, setSetter] = useState("");
  const [setAt, setSetAt] = useState(todayDate);
  const [leadable, setLeadable] = useState<Leadable>("?");
  const { busy, error, run } = useRequest();

  const routesOnLine = (activeRoutes ?? []).filter((route) => route.line === Number(line));
  const left = routesOnLine.find((route) => route.id === leftId);
  const right = routesOnLine.find((route) => route.id === rightId);
  // A combo is one colour per hand, so the second route can't share the first's colour.
  const rightOptions = routesOnLine.filter((route) => route.id !== leftId && route.colour !== left?.colour);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const details: ClimbDetails = {
      type,
      colour: type === "combo" ? left!.colour : colour,
      secondary: type === "combo" ? right!.colour : undefined,
      tape: type === "boulder" && tape ? tape : undefined,
      line: type === "boulder" ? undefined : Number(line),
      grade,
      setter: setter.trim(),
      setAt,
      leadable: type === "boulder" ? "No" : leadable,
    };
    run(async () => onAdded(await createClimb(details)));
  };

  const shared = (
    <SharedFields
      type={type}
      grade={grade}
      setGrade={setGrade}
      setter={setter}
      setSetter={setSetter}
      setAt={setAt}
      setSetAt={setSetAt}
      leadable={leadable}
      setLeadable={setLeadable}
    />
  );
  const lineSelect = (lineLabel: (option: number) => string, isDisabled?: (option: number) => boolean) => (
    <label className={LABEL_CLASS}>
      Line
      <select
        required
        value={line}
        onChange={(event) => {
          setLine(event.target.value);
          setLeftId("");
          setRightId("");
        }}
        className={FIELD_CLASS}
      >
        <option value="" disabled>
          Choose a line
        </option>
        {LINES.map((option) => (
          <option key={option} value={option} disabled={isDisabled?.(option)}>
            {lineLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );

  let fields: ReactNode;
  if (type === "route") {
    fields = (
      <>
        {lineSelect((option) => `Line ${option}`)}
        <label className={LABEL_CLASS}>
          Colour
          <ListSelect options={CLIMB_COLOURS} required value={colour} onChange={setColour} emptyLabel="Choose a colour" />
        </label>
        {shared}
      </>
    );
  } else if (type === "boulder") {
    fields = (
      <>
        <label className={LABEL_CLASS}>
          Hold colour
          <ListSelect options={CLIMB_COLOURS} required value={colour} onChange={setColour} emptyLabel="Choose a colour" />
        </label>
        <label className={LABEL_CLASS}>
          Tape
          <ListSelect options={CLIMB_COLOURS} value={tape} onChange={setTape} emptyLabel="No tape" />
        </label>
        {shared}
      </>
    );
  } else if (activeRoutes === undefined) {
    return <p className="text-sm text-neutral-500">Loading the routes that are up…</p>;
  } else if (activeRoutes === null) {
    return <ErrorMessage message="Couldn't load the routes that are up, so a combo can't be added right now. Refresh to try again." />;
  } else {
    const countOn = (option: number) => activeRoutes.filter((route) => route.line === option).length;
    if (LINES.every((option) => countOn(option) < 2)) {
      return <p className="text-sm text-neutral-500">A combo needs two routes up on the same line, and no line has that right now.</p>;
    }
    // Each step appears once the one before it is filled in.
    fields = (
      <>
        {lineSelect(
          (option) => `Line ${option} (${countOn(option)} route${countOn(option) === 1 ? "" : "s"} up)`,
          (option) => countOn(option) < 2,
        )}
        {line && (
          <label className={LABEL_CLASS}>
            Left hand
            <select
              required
              value={leftId}
              onChange={(event) => {
                setLeftId(event.target.value);
                setRightId("");
              }}
              className={FIELD_CLASS}
            >
              <option value="" disabled>
                Choose a route
              </option>
              {routesOnLine.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.colour} {route.grade}
                </option>
              ))}
            </select>
          </label>
        )}
        {left && (
          <label className={LABEL_CLASS}>
            Right hand
            <select required value={rightId} onChange={(event) => setRightId(event.target.value)} className={FIELD_CLASS}>
              <option value="" disabled>
                {rightOptions.length > 0 ? "Choose a route" : "No other colour on this line"}
              </option>
              {rightOptions.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.colour} {route.grade}
                </option>
              ))}
            </select>
          </label>
        )}
        {left && right && (
          <>
            <div className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Combo</span>
              <ClimbColour climb={{ colour: left.colour, secondary: right.colour }} />
            </div>
            {shared}
          </>
        )}
      </>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{fields}</div>
      <ErrorMessage message={error} />
      {(type !== "combo" || (left && right)) && (
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Adding…" : `Add ${type}`}
          </button>
        </div>
      )}
    </form>
  );
}

// /admin/climbs/new: pick what kind of climb, then fill in what that kind
// needs. Combos are built from two routes that are up.
export default function AdminAddClimb() {
  const [type, setType] = useState<ClimbType | null>(null);
  const [added, setAdded] = useState<Climb | null>(null);
  // Combos are built from these. undefined while loading, null if they failed.
  const [activeRoutes, setActiveRoutes] = useState<Climb[] | null>();

  useEffect(() => {
    fetchClimbs()
      .then((climbs) => setActiveRoutes(climbs.filter((climb) => climb.status === "active" && climb.type === "route")))
      .catch(() => setActiveRoutes(null));
  }, []);

  if (added) {
    return (
      <div className={`${CARD_CLASS} flex flex-col items-center gap-4 text-center`}>
        <div>
          <p className="font-semibold text-primary">Added {climbName(added)}</p>
          <p className="mt-1 text-sm text-neutral-600">It&apos;s now in the active climbs.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setAdded(null);
              setType(null);
            }}
            className={PRIMARY_BUTTON_CLASS}
          >
            Add another
          </button>
          <Link
            href="/admin/climbs/active"
            className="inline-flex items-center justify-center rounded-full border border-primary bg-white px-5 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
          >
            See active climbs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Step number={1} title="What are you adding?">
        <div role="radiogroup" aria-label="Climb type" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map((option) => {
            const isChosen = option.id === type;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isChosen}
                onClick={() => setType(option.id)}
                className={`flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                  isChosen
                    ? "border-secondary bg-secondary/10"
                    : "border-neutral-200 hover:border-secondary/60 hover:bg-secondary/5"
                }`}
              >
                <span className="font-bold text-primary">{option.label}</span>
                <span className="text-sm text-neutral-600">{option.description}</span>
              </button>
            );
          })}
        </div>
      </Step>

      {type && (
        <Step number={2} title={`${TYPE_OPTIONS.find((option) => option.id === type)!.label} details`}>
          <DetailsForm key={type} type={type} activeRoutes={activeRoutes} onAdded={setAdded} />
        </Step>
      )}
    </div>
  );
}
