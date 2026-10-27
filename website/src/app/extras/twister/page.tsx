"use client";

import { useEffect, useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";
import { type Climb, fetchClimbs, LINES, swatchFor } from "@/lib/climbs";
import { NEW_GRADE, ROUTE_GRADES } from "@/lib/grades";

type Line = (typeof LINES)[number];

const LIMBS = [
  { key: "leftHand", label: "Left Hand" },
  { key: "rightHand", label: "Right Hand" },
  { key: "leftLeg", label: "Left Leg" },
  { key: "rightLeg", label: "Right Leg" },
] as const;
type LimbKey = (typeof LIMBS)[number]["key"];

const LIMB_SHORT_LABEL: Record<LimbKey, string> = {
  leftHand: "L Hand",
  leftLeg: "L Leg",
  rightHand: "R Hand",
  rightLeg: "R Leg",
};

// One colour on the wheel. `text` is for writing the colour's name on the
// light page, so the palest colours get a darker shade there.
type WheelColour = { name: string; fill: string; text: string };

const TEXT_SHADES: Record<string, string> = { White: "#AFAFAF", Clear: "#9CA3AF" };
// A wheel slice is a solid band of the conic gradient, so Multi-Colour is
// drawn as a few thin stripes instead of its usual gradient swatch.
const MULTI_COLOUR = "Multi-Colour";
const MULTI_COLOUR_STRIPES = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

// New first, then up the scale, then grades that aren't on it.
function routeOrder(a: Climb, b: Climb) {
  const rank = (grade: string) => {
    if (grade === NEW_GRADE) return -1;
    const index = ROUTE_GRADES.indexOf(grade);
    return index === -1 ? ROUTE_GRADES.length : index;
  };
  return rank(a.grade) - rank(b.grade);
}

// The colours of the routes up on a line, easiest first, each colour once.
// Combos are two colours, so they don't get a slice.
function lineColours(climbs: Climb[], line: Line): WheelColour[] {
  const routes = climbs
    .filter((climb) => climb.status === "active" && climb.type === "route" && climb.line === line)
    .sort(routeOrder);
  const names = [...new Set(routes.map((route) => route.colour))];
  return names.map((name) => ({
    name,
    fill: name === MULTI_COLOUR ? MULTI_COLOUR_STRIPES[0] : swatchFor(name),
    text: TEXT_SHADES[name] ?? (name === MULTI_COLOUR ? "#6B7280" : swatchFor(name)),
  }));
}

type RerollMode = "none" | "noReroll" | "noRerollPlus";

type Slice = { limb: LimbKey; colourName: string; colourHex: string };

type LineHistory = {
  lastLimb: LimbKey | null;
  lastColourByLimb: Partial<Record<LimbKey, string>>;
};

const EMPTY_HISTORY: LineHistory = { lastLimb: null, lastColourByLimb: {} };

function buildSlices(limbs: readonly LimbKey[], colours: WheelColour[]): Slice[] {
  const slices: Slice[] = [];
  for (const limb of limbs) {
    for (const colour of colours) {
      slices.push({ limb, colourName: colour.name, colourHex: colour.fill });
    }
  }
  return slices;
}

function isPickValid(picked: Slice, rerollMode: RerollMode, history: LineHistory, applyLimbExclusion: boolean): boolean {
  // "no reroll plus" forbids landing on the same limb twice in a row.
  if (applyLimbExclusion && rerollMode === "noRerollPlus" && picked.limb === history.lastLimb) {
    return false;
  }
  // "no reroll" forbids landing on the same limb+colour combo twice in a row.
  if (rerollMode !== "none" && picked.limb === history.lastLimb && picked.colourName === history.lastColourByLimb[picked.limb]) {
    return false;
  }
  return true;
}

const MAX_REROLL_ATTEMPTS = 200;

// The wheel's slices never change based on reroll mode - only the pick does.
// An invalid pick (per the active reroll rule) is silently re-randomized
// against the same full slice set, rather than removing options from the
// wheel itself.
function pickValidSlice(
  slices: Slice[],
  rerollMode: RerollMode,
  history: LineHistory,
  applyLimbExclusion: boolean,
): Slice {
  for (let attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt++) {
    const candidate = slices[Math.floor(Math.random() * slices.length)];
    if (isPickValid(candidate, rerollMode, history, applyLimbExclusion)) {
      return candidate;
    }
  }
  // Every slice violates the rule (e.g. a single limb/colour left) - give up
  // rerolling and just land on something so a spin always finishes.
  return slices[Math.floor(Math.random() * slices.length)];
}

const SPIN_DURATION_MS = 2200;
const EXTRA_SPINS = 5;

export default function TwisterPage() {
  const [selectedLine, setSelectedLine] = useState<Line>(1);
  const [fourLimbStart, setFourLimbStart] = useState(false);
  const [rerollMode, setRerollMode] = useState<RerollMode>("none");

  const [history, setHistory] = useState<Record<Line, LineHistory>>(() =>
    Object.fromEntries(LINES.map((line) => [line, EMPTY_HISTORY])) as Record<Line, LineHistory>,
  );

  const [gameActive, setGameActive] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [showLockedPopup, setShowLockedPopup] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  // The wall's climbs - undefined while loading, null if they couldn't be loaded.
  const [climbs, setClimbs] = useState<Climb[] | null>();

  useEffect(() => {
    fetchClimbs()
      .then(setClimbs)
      .catch(() => setClimbs(null));
  }, []);

  const colours = useMemo(() => lineColours(climbs ?? [], selectedLine), [climbs, selectedLine]);
  const currentHistory = history[selectedLine];
  // Why there's no wheel to play yet, if there isn't.
  const unavailable =
    climbs === undefined
      ? "Loading routes…"
      : climbs === null
        ? "Couldn't load the routes"
        : colours.length === 0
          ? `No routes up on line ${selectedLine}`
          : null;

  // The wheel always shows the full, unfiltered slice set - reroll rules
  // only affect which slice gets picked (see pickValidSlice), not what's
  // visible on the wheel.
  const wheelSlices = useMemo(() => buildSlices(LIMBS.map((l) => l.key), colours), [colours]);

  const wheelBackground = useMemo(() => {
    if (wheelSlices.length === 0) return "#d4d4d4";
    const step = 360 / wheelSlices.length;
    const stops = wheelSlices.flatMap((slice, i) => {
      if (slice.colourName !== MULTI_COLOUR) return [`${slice.colourHex} ${i * step}deg ${(i + 1) * step}deg`];
      const stripe = step / MULTI_COLOUR_STRIPES.length;
      return MULTI_COLOUR_STRIPES.map(
        (hex, j) => `${hex} ${i * step + j * stripe}deg ${i * step + (j + 1) * stripe}deg`,
      );
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [wheelSlices]);

  function applyPick(picked: Slice) {
    setHistory((prev) => ({
      ...prev,
      [selectedLine]: {
        lastLimb: picked.limb,
        lastColourByLimb: { ...prev[selectedLine].lastColourByLimb, [picked.limb]: picked.colourName },
      },
    }));
  }

  function rollSingleAnimated() {
    const picked = pickValidSlice(wheelSlices, rerollMode, currentHistory, true);

    const index = wheelSlices.indexOf(picked);
    const step = 360 / wheelSlices.length;
    const targetAngle = index * step + step / 2;

    if (skipAnimation) {
      setRotation((prev) => prev - (prev % 360) + (360 - targetAngle));
      applyPick(picked);
      return;
    }

    setSpinning(true);
    setRotation((prev) => {
      const base = prev - (prev % 360);
      return base + 360 * EXTRA_SPINS + (360 - targetAngle);
    });

    window.setTimeout(() => {
      applyPick(picked);
      setSpinning(false);
    }, SPIN_DURATION_MS);
  }

  function rollFourLimbInstant() {
    let remaining: LimbKey[] = LIMBS.map((l) => l.key);
    let runningHistory = currentHistory;

    while (remaining.length > 0) {
      const candidates = buildSlices(remaining, colours);
      const picked = pickValidSlice(candidates, rerollMode, runningHistory, false);
      runningHistory = {
        lastLimb: picked.limb,
        lastColourByLimb: { ...runningHistory.lastColourByLimb, [picked.limb]: picked.colourName },
      };
      remaining = remaining.filter((limb) => limb !== picked.limb);
    }

    setHistory((prev) => ({ ...prev, [selectedLine]: runningHistory }));
  }

  function handleWheelClick() {
    if (!gameActive || spinning) return;
    rollSingleAnimated();
  }

  function handleStartGame() {
    setGameActive(true);
    if (fourLimbStart) {
      rollFourLimbInstant();
    }
  }

  function handleEndGame() {
    setGameActive(false);
    setSpinning(false);
    setShowLockedPopup(false);
    setHistory(Object.fromEntries(LINES.map((line) => [line, EMPTY_HISTORY])) as Record<Line, LineHistory>);
  }

  function guardSelectionChange(change: () => void) {
    if (gameActive) {
      setShowLockedPopup(true);
      return;
    }
    change();
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">Twister</h1>
          <p className="mt-2 text-neutral-600">Click the wheel to roll.</p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-lg bg-neutral-100 px-6 py-4 text-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            {LIMBS.map((limb) => {
              const colourName = currentHistory.lastColourByLimb[limb.key];
              const colour = colourName ? colours.find((c) => c.name === colourName) : undefined;
              return (
                <div key={limb.key} className="flex items-center gap-2">
                  <span className="font-medium text-neutral-500">{limb.label}:</span>
                  <span className="flex items-center gap-1.5 font-semibold" style={{ color: colour?.text }}>
                    {colour && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                        style={{ background: swatchFor(colour.name) }}
                      />
                    )}
                    {colourName ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="text-center">
            {currentHistory.lastLimb ? (
              <span
                className="font-semibold"
                style={{
                  color: colours.find((c) => c.name === currentHistory.lastColourByLimb[currentHistory.lastLimb!])
                    ?.text,
                }}
              >
                {LIMBS.find((l) => l.key === currentHistory.lastLimb)!.label} —{" "}
                {currentHistory.lastColourByLimb[currentHistory.lastLimb]}
              </span>
            ) : (
              <span className="font-semibold text-neutral-400">—</span>
            )}
          </div>
        </div>

        <div className="relative flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
          <div className="absolute -top-2 left-1/2 z-10 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-neutral-800 bg-neutral-800" />

          {/* Clips the spinning wheel to its circle - turned part-way, its square
              box and the label layers' corners would otherwise poke past the
              edge of a phone screen and make the page scroll sideways. */}
          <div className="absolute inset-0 overflow-hidden rounded-full shadow-xl">
            <button
              type="button"
              onClick={handleWheelClick}
              disabled={!gameActive || spinning}
              aria-label="Roll the wheel"
              className="relative h-full w-full rounded-full border-4 border-neutral-800 disabled:cursor-default"
              style={{
                background: wheelBackground,
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.17, 0.67, 0.2, 1)` : "none",
                cursor: gameActive && !spinning ? "pointer" : undefined,
              }}
            >
              {wheelSlices.map((slice, i) => {
                const step = 360 / wheelSlices.length;
                const mid = i * step + step / 2;
                return (
                  <div
                    key={`${slice.limb}-${slice.colourName}-${i}`}
                    className="pointer-events-none absolute inset-0 flex justify-center"
                    style={{ transform: `rotate(${mid}deg)` }}
                  >
                    <span className="mt-4 whitespace-nowrap text-[11px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                      {LIMB_SHORT_LABEL[slice.limb]}
                    </span>
                  </div>
                );
              })}
            </button>
          </div>

          {!gameActive && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-full bg-black/50">
              {unavailable ? (
                <p className="max-w-[12rem] text-center text-sm font-semibold text-white">{unavailable}</p>
              ) : (
                <button
                  type="button"
                  onClick={handleStartGame}
                  className="rounded-full bg-secondary px-8 py-3 text-lg font-semibold text-primary shadow-md transition-colors hover:bg-secondary/80"
                >
                  Start
                </button>
              )}
            </div>
          )}

          {gameActive && !spinning && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-neutral-800 bg-white/90 text-xs font-bold uppercase tracking-wide text-primary shadow-md">
                Spin
              </div>
            </div>
          )}

          {gameActive && (
            <button
              type="button"
              onClick={handleEndGame}
              className="absolute -bottom-3 -right-3 z-30 rounded-full border border-primary bg-white px-4 py-1.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
            >
              End
            </button>
          )}

          <button
            type="button"
            onClick={() => setSkipAnimation((v) => !v)}
            aria-pressed={skipAnimation}
            className={`absolute -bottom-3 -left-3 z-30 rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition-colors ${
              skipAnimation
                ? "border-primary bg-primary text-white"
                : "border-primary bg-white text-primary hover:bg-primary hover:text-white"
            }`}
          >
            Skip
          </button>
        </div>

        <div className="flex w-full flex-col gap-8 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-start sm:justify-center">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Line</span>
            <div className="grid grid-flow-col grid-cols-2 grid-rows-3 gap-1">
              {LINES.map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => guardSelectionChange(() => setSelectedLine(line))}
                  className={`rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                    selectedLine === line
                      ? "bg-primary text-white"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  Line {line}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Options</span>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => guardSelectionChange(() => setFourLimbStart((v) => !v))}
                  className={`flex-1 rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                    fourLimbStart ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  4 limb start
                </button>
                <InfoTip text="Randomly selects the starting colours" align="end" />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    guardSelectionChange(() => setRerollMode((m) => (m === "noReroll" ? "none" : "noReroll")))
                  }
                  className={`flex-1 rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                    rerollMode === "noReroll" ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  No rerolls
                </button>
                <InfoTip text="Cannot reroll the same limb/colour combo" align="end" />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    guardSelectionChange(() => setRerollMode((m) => (m === "noRerollPlus" ? "none" : "noRerollPlus")))
                  }
                  className={`flex-1 rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                    rerollMode === "noRerollPlus" ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  No rerolls +
                </button>
                <InfoTip text="Cannot reroll the same limb" align="end" />
              </div>
            </div>
          </div>
        </div>

        {showLockedPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
              <p className="text-sm font-semibold text-neutral-800">
                A round is currently in progress. End the round to change your selections.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowLockedPopup(false)}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleEndGame}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  End round
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
