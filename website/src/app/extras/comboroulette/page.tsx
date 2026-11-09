"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GradeTag } from "@/components/ClimbCards";
import ClimbColour from "@/components/ClimbColour";
import ColourGrid from "@/components/ColourGrid";
import InfoTip from "@/components/InfoTip";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import TabBar from "@/components/TabBar";
import { type Climb, climbHref, COMBO_LINE_REACH, fetchClimbs, LINES, swatchFor } from "@/lib/climbs";
import { colourTextShade, type Line, lineColourNames, MULTI_COLOUR, MULTI_COLOUR_STRIPES } from "@/lib/lineColours";

// The grid is drawn on a 200 x 200 board: four 92 wide squares with a 16 wide
// gap between them. PAD leaves room for the borders round the board's rim.
const BOARD = 200;
const GAP = 16;
const SQUARE = (BOARD - GAP) / 2;
const FAR = SQUARE + GAP;
const MID = BOARD / 2;
const PAD = 4;
const RADIUS = 12;
// Each shape's border is drawn twice this wide, then the shapes' fills are laid
// over the inner half - so where shapes overlap, only their joint outline shows.
const BORDER = 2;

// The four limbs, laid out as they are on a climber: hands on top, legs below.
// `align` pushes a square's writing into its outer corner, clear of the
// connections in the middle.
const LIMBS = [
  { key: "leftHand", label: "Left Hand", short: "L Hand", x: 0, y: 0, align: "justify-start items-start text-left" },
  { key: "rightHand", label: "Right Hand", short: "R Hand", x: FAR, y: 0, align: "justify-start items-end text-right" },
  { key: "leftLeg", label: "Left Leg", short: "L Leg", x: 0, y: FAR, align: "justify-end items-start text-left" },
  { key: "rightLeg", label: "Right Leg", short: "R Leg", x: FAR, y: FAR, align: "justify-end items-end text-right" },
] as const;
type LimbKey = (typeof LIMBS)[number]["key"];

type Rect = { x: number; y: number; width: number; height: number };

// Every pair of limbs that can be joined. Joined limbs climb the same colour.
// `bridge` is the shape that fills the gap once they're joined: a bar across
// the gap for an edge, tucked under the squares' rounded corners, or a band
// corner to corner for a cross. `hit` is where to click, which for the edges
// stops short of the centre - the centre belongs to the crosses. An edge's
// `knob` is the circle in the middle of its gap, there joined or not, that
// shows it can be clicked and whether it's joined. An unjoined cross is marked
// by a line along its diagonal (see CROSS_HINT).
const CONNECTIONS = [
  {
    key: "hands",
    a: "leftHand",
    b: "rightHand",
    cross: false,
    bridge: { x: SQUARE - RADIUS, y: 0, width: GAP + 2 * RADIUS, height: SQUARE },
    hit: { x: MID - 12, y: 0, width: 24, height: 74 },
    knob: { cx: MID, cy: SQUARE / 2 },
  },
  {
    key: "legs",
    a: "leftLeg",
    b: "rightLeg",
    cross: false,
    bridge: { x: SQUARE - RADIUS, y: FAR, width: GAP + 2 * RADIUS, height: SQUARE },
    hit: { x: MID - 12, y: BOARD - 74, width: 24, height: 74 },
    knob: { cx: MID, cy: FAR + SQUARE / 2 },
  },
  {
    key: "leftSide",
    a: "leftHand",
    b: "leftLeg",
    cross: false,
    bridge: { x: 0, y: SQUARE - RADIUS, width: SQUARE, height: GAP + 2 * RADIUS },
    hit: { x: 0, y: MID - 12, width: 74, height: 24 },
    knob: { cx: SQUARE / 2, cy: MID },
  },
  {
    key: "rightSide",
    a: "rightHand",
    b: "rightLeg",
    cross: false,
    bridge: { x: FAR, y: SQUARE - RADIUS, width: SQUARE, height: GAP + 2 * RADIUS },
    hit: { x: BOARD - 74, y: MID - 12, width: 74, height: 24 },
    knob: { cx: FAR + SQUARE / 2, cy: MID },
  },
  { key: "crossDown", a: "leftHand", b: "rightLeg", cross: true, angle: 45 },
  { key: "crossUp", a: "rightHand", b: "leftLeg", cross: true, angle: -45 },
] as const satisfies readonly ({
  key: string;
  a: LimbKey;
  b: LimbKey;
} & (
  | { cross: false; bridge: Rect; hit: Rect; knob: { cx: number; cy: number } }
  | { cross: true; angle: number }
))[];

const KNOB_RADIUS = 6;
type Connection = (typeof CONNECTIONS)[number];
type ConnectionKey = Connection["key"];

// A cross's band, before it's turned to its diagonal about the board's centre.
// Long enough for its ends to sit well inside the two squares.
const CROSS_BAND = { length: 64, thickness: 26 };
// A cross's click area, along its diagonal from the centre - roomy enough for a
// fingertip, while staying clear of the edges' knobs.
const CROSS_HIT = { reach: 28, thickness: 24 };
// An unjoined cross's line, along its diagonal from the centre, with a knob at
// each end like the edges'. It reaches just to the two squares' rounded
// corners, so the knobs sit on their corners.
const CROSS_HINT = {
  reach: (MID - (SQUARE - RADIUS) - RADIUS / Math.SQRT2) * Math.SQRT2,
  width: 2.5,
};

// When all four limbs are joined by the edges, the hole left between the four
// bars is filled with this.
const CENTRE: Rect = { x: SQUARE - RADIUS, y: SQUARE - RADIUS, width: GAP + 2 * RADIUS, height: GAP + 2 * RADIUS };

const EDGES: ConnectionKey[] = CONNECTIONS.filter((c) => !c.cross).map((c) => c.key);
const CROSSES: ConnectionKey[] = CONNECTIONS.filter((c) => c.cross).map((c) => c.key);
const OPPOSITE_EDGE: Partial<Record<ConnectionKey, ConnectionKey>> = {
  hands: "legs",
  legs: "hands",
  leftSide: "rightSide",
  rightSide: "leftSide",
};

// The joins after clicking one, kept to the simplest shape that means the same
// grouping. A cross and an edge can't both be joined - together they'd only
// make a group of three or four, which the edges already draw - so joining one
// kind cuts the other. Three edges already join all four limbs, so the fourth
// is filled in; cutting an edge from all four also cuts the one opposite,
// splitting the limbs into the two sides that edge was holding together.
function toggleJoin(connected: ConnectionKey[], key: ConnectionKey): ConnectionKey[] {
  if (connected.includes(key)) {
    const allEdges = EDGES.every((edge) => connected.includes(edge));
    const opposite = allEdges ? OPPOSITE_EDGE[key] : undefined;
    return connected.filter((k) => k !== key && k !== opposite);
  }
  const otherKind = CROSSES.includes(key) ? EDGES : CROSSES;
  const next = [...connected.filter((k) => !otherKind.includes(k)), key];
  const edges = next.filter((k) => EDGES.includes(k));
  return edges.length === EDGES.length - 1 ? [...new Set([...next, ...EDGES])] : next;
}

const PRESETS: { id: string; label: string; detail: string; connections: ConnectionKey[] }[] = [
  { id: "default", label: "Default", detail: "Left / Right", connections: ["leftSide", "rightSide"] },
  { id: "inverted", label: "Inverted", detail: "Top / Bottom", connections: ["hands", "legs"] },
  { id: "quad", label: "Quad", detail: "All 4 split", connections: [] },
];

function limbLabel(limb: LimbKey) {
  return LIMBS.find((l) => l.key === limb)!.label;
}

// The limbs that climb together. Joining is transitive, so two edges that share
// a limb make a group of three. Groups keep the limbs' order.
function limbGroups(connected: ConnectionKey[]): LimbKey[][] {
  const groupOf = new Map<LimbKey, number>(LIMBS.map((limb, i) => [limb.key, i]));
  for (const connection of CONNECTIONS) {
    if (!connected.includes(connection.key)) continue;
    const from = groupOf.get(connection.b)!;
    const to = groupOf.get(connection.a)!;
    for (const [limb, group] of groupOf) if (group === from) groupOf.set(limb, to);
  }
  const groups = new Map<number, LimbKey[]>();
  for (const limb of LIMBS) {
    const group = groupOf.get(limb.key)!;
    groups.set(group, [...(groups.get(group) ?? []), limb.key]);
  }
  return [...groups.values()];
}

const GROUP_NAMES: Record<string, string> = {
  "leftHand,rightHand": "Hands",
  "leftLeg,rightLeg": "Legs",
  "leftHand,leftLeg": "Left side",
  "rightHand,rightLeg": "Right side",
};

function groupName(group: LimbKey[]) {
  if (group.length === LIMBS.length) return "All limbs";
  return GROUP_NAMES[group.join(",")] ?? group.map(limbLabel).join(" + ");
}

// A colour a group can climb. `key` tells the same colour on two lines apart,
// as they're different holds.
type RollColour = { key: string; line: Line; name: string };

// A colour for each group, by key. `kept` holds the locked groups' colours and
// leaves the rest undefined; those get a different colour each, picked at
// random from `pool` and never one a locked group already has.
function rollColours(pool: string[], kept: (string | undefined)[]): string[] {
  const free = pool.filter((key) => !kept.includes(key));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  let next = 0;
  return kept.map((key) => key ?? free[next++]);
}

const MAX_REROLL_ATTEMPTS = 20;

// Like rollColours, but tries not to land on the same colours as last time.
function rollNewColours(pool: string[], kept: (string | undefined)[], previous: string[] | null): string[] {
  let rolled = rollColours(pool, kept);
  for (let attempt = 0; previous && attempt < MAX_REROLL_ATTEMPTS; attempt++) {
    if (rolled.some((key, i) => kept[i] === undefined && key !== previous[i])) break;
    rolled = rollColours(pool, kept);
  }
  return rolled;
}

function LockIcon({ locked, className }: { locked: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x={3} y={7} width={10} height={7} rx={1.5} fill={locked ? "currentColor" : "none"} />
      <path d={locked ? "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" : "M5.5 7V5a2.5 2.5 0 0 1 4.8-1"} />
    </svg>
  );
}

const SHUFFLE_DURATION_MS = 1000;
const SHUFFLE_STEP_MS = 80;

// Colours too pale for white writing on top of them.
const PALE_COLOURS = new Set(["White", "Clear", "Yellow", "Sea Foam", "Lime Green"]);

// A board position as a percentage of the drawing, rim padding included.
function percent(position: number) {
  return span(position + PAD);
}

// A board length as a percentage of the drawing.
function span(length: number) {
  return `${(length / (BOARD + 2 * PAD)) * 100}%`;
}

// One group's squares and the bridges joining them, drawn with no paint of
// their own - the caller sets the fill or the border.
function GroupShapes({ group, connected }: { group: LimbKey[]; connected: ConnectionKey[] }) {
  const joins = CONNECTIONS.filter((c) => connected.includes(c.key) && group.includes(c.a));
  const allEdges = EDGES.every((edge) => connected.includes(edge));
  return (
    <>
      {LIMBS.filter((limb) => group.includes(limb.key)).map((limb) => (
        <rect key={limb.key} x={limb.x} y={limb.y} width={SQUARE} height={SQUARE} rx={RADIUS} />
      ))}
      {joins.map((join) =>
        join.cross ? (
          <rect
            key={join.key}
            x={MID - CROSS_BAND.length / 2}
            y={MID - CROSS_BAND.thickness / 2}
            width={CROSS_BAND.length}
            height={CROSS_BAND.thickness}
            transform={`rotate(${join.angle} ${MID} ${MID})`}
          />
        ) : (
          <rect key={join.key} {...join.bridge} />
        ),
      )}
      {allEdges && group.length === LIMBS.length && <rect {...CENTRE} />}
    </>
  );
}

// A line along a cross's diagonal, `reach` either way from the centre.
function crossLine(connection: Extract<Connection, { cross: true }>, reach: number) {
  const d = reach / Math.SQRT2;
  const turn = Math.sign(connection.angle);
  return { x1: MID - d, y1: MID - d * turn, x2: MID + d, y2: MID + d * turn };
}

function CrossHint({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g className="fill-white stroke-neutral-300 transition-colors group-hover:stroke-neutral-500">
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={CROSS_HINT.width} />
      <circle cx={x1} cy={y1} r={KNOB_RADIUS} strokeWidth={2} />
      <circle cx={x2} cy={y2} r={KNOB_RADIUS} strokeWidth={2} />
    </g>
  );
}

// The four limbs as squares with a gap between them. Joined limbs are bridged
// across the gap and outlined as one shape. With `onToggle` the connections can
// be clicked on and off. With `onGroupClick` the groups' shapes can be clicked -
// by mouse only, so whatever it does needs a button elsewhere too.
function LimbGrid({
  connected,
  onToggle,
  onGroupClick,
  colourFor,
  renderLabel,
  className,
}: {
  connected: ConnectionKey[];
  onToggle?: (key: ConnectionKey) => void;
  onGroupClick?: (group: LimbKey[]) => void;
  // The colour name a limb's group is filled with, if it has one.
  colourFor?: (limb: LimbKey) => string | undefined;
  renderLabel: (limb: (typeof LIMBS)[number]) => ReactNode;
  className: string;
}) {
  const multiColourId = `multi-colour-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const groups = limbGroups(connected);

  function handleKey(event: KeyboardEvent, key: ConnectionKey) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle?.(key);
  }

  function fillFor(colour: string | undefined) {
    if (!colour) return "var(--color-neutral-100)";
    return colour === MULTI_COLOUR ? `url(#${multiColourId})` : swatchFor(colour);
  }

  return (
    <div className={`relative aspect-square ${className}`}>
      <svg
        viewBox={`${-PAD} ${-PAD} ${BOARD + 2 * PAD} ${BOARD + 2 * PAD}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden={!onToggle}
      >
        <defs>
          <pattern id={multiColourId} width={30} height={30} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            {MULTI_COLOUR_STRIPES.map((hex, i) => (
              <rect key={hex} x={i * 6} y={0} width={6} height={30} fill={hex} />
            ))}
          </pattern>
        </defs>

        {/* Group by group, so where two crosses' bands cross, the one on top
            keeps its outline. */}
        {groups.map((group) => {
          const colour = colourFor?.(group[0]);
          return (
            <g
              key={group.join(",")}
              onClick={onGroupClick && (() => onGroupClick(group))}
              className={onGroupClick ? "cursor-pointer" : undefined}
            >
              {/* As one layer, so where two borders overlap they don't darken. */}
              <g
                fill="none"
                stroke={colour ? "#000" : "var(--color-neutral-300)"}
                opacity={colour ? 0.18 : 1}
                strokeWidth={BORDER * 2}
                strokeLinejoin="round"
              >
                <GroupShapes group={group} connected={connected} />
              </g>
              <g fill={fillFor(colour)} className="transition-[fill]">
                <GroupShapes group={group} connected={connected} />
              </g>
            </g>
          );
        })}

        {onToggle &&
          CONNECTIONS.map((connection) => {
            const on = connected.includes(connection.key);
            return (
              <g
                key={connection.key}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`Join ${limbLabel(connection.a)} and ${limbLabel(connection.b)}`}
                onClick={() => onToggle(connection.key)}
                onKeyDown={(event) => handleKey(event, connection.key)}
                className="group cursor-pointer focus:outline-none"
              >
                {connection.cross ? (
                  <line
                    {...crossLine(connection, CROSS_HIT.reach)}
                    strokeWidth={CROSS_HIT.thickness}
                    strokeLinecap="round"
                    className="stroke-transparent transition-colors group-hover:stroke-black/5 group-focus-visible:stroke-secondary/30"
                  />
                ) : (
                  <rect
                    {...connection.hit}
                    rx={6}
                    className="fill-transparent transition-colors group-hover:fill-black/5 group-focus-visible:fill-secondary/30"
                  />
                )}
                {connection.cross ? (
                  !on && (
                    <CrossHint {...crossLine(connection, CROSS_HINT.reach)} />
                  )
                ) : (
                  <circle
                    {...connection.knob}
                    r={KNOB_RADIUS}
                    strokeWidth={2}
                    className={`transition-colors ${
                      on
                        ? "fill-primary stroke-primary group-hover:fill-primary/80"
                        : "fill-white stroke-neutral-300 group-hover:stroke-neutral-500"
                    }`}
                  />
                )}
              </g>
            );
          })}
      </svg>
      {LIMBS.map((limb) => (
        <div
          key={limb.key}
          className="pointer-events-none absolute"
          style={{ left: percent(limb.x), top: percent(limb.y), width: span(SQUARE), height: span(SQUARE) }}
        >
          {renderLabel(limb)}
        </div>
      ))}
    </div>
  );
}

const SIDE_LINES_TIP = `Also uses the lines either side of the one picked, up to ${COMBO_LINE_REACH} away`;
const EXISTING_COMBOS_TIP = "Only rolls combos already up on the wall. Works with Left / Right only";

// Simple splits the limbs one of two ways and rolls a colour for each half.
// Advanced lets the limbs be joined any way and the colours be picked.
type SetupTab = "simple" | "advanced";
const SETUP_TABS: { id: SetupTab; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "advanced", label: "Advanced" },
];

type SimpleLayout = "leftRight" | "topBottom";
const SIMPLE_LAYOUTS: { id: SimpleLayout; label: string; connections: ConnectionKey[] }[] = [
  { id: "leftRight", label: "Left / Right", connections: ["leftSide", "rightSide"] },
  { id: "topBottom", label: "Top / Bottom", connections: ["hands", "legs"] },
];

function colourKey(line: number, name: string) {
  return `${line}:${name}`;
}

function keyColour(key: string): RollColour {
  const split = key.indexOf(":");
  return { key, line: Number(key.slice(0, split)) as Line, name: key.slice(split + 1) };
}

function isActiveCombo(climb: Climb) {
  return climb.type === "combo" && climb.status === "active";
}

// A combo's colours, left hand first, by key. A combo from a spreadsheet import
// doesn't say which line each hand is on, so both are taken to be on the
// combo's own.
function comboPair(combo: Climb): string[] | null {
  const left = combo.hands?.left ?? (combo.line === undefined ? undefined : { line: combo.line, colour: combo.colour });
  const right =
    combo.hands?.right ??
    (combo.line === undefined || !combo.secondary ? undefined : { line: combo.line, colour: combo.secondary });
  return left && right ? [colourKey(left.line, left.colour), colourKey(right.line, right.colour)] : null;
}

// The colour pairs of the combos up on the wall, each once.
function comboPairs(climbs: Climb[]): string[][] {
  const pairs = new Set<string>();
  for (const combo of climbs.filter(isActiveCombo)) {
    const pair = comboPair(combo);
    if (pair) pairs.add(JSON.stringify(pair));
  }
  return [...pairs].map((pair) => JSON.parse(pair) as string[]);
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export default function ComboRoulettePage() {
  const [setupTab, setSetupTab] = useState<SetupTab>("simple");
  const [simpleLayout, setSimpleLayout] = useState<SimpleLayout>("leftRight");
  const [existingOnly, setExistingOnly] = useState(false);
  // Advanced's joins.
  const [connected, setConnected] = useState<ConnectionKey[]>(PRESETS[0].connections);
  const [selectedLine, setSelectedLine] = useState<Line>(1);
  const [sideLines, setSideLines] = useState(false);
  // The colours of the lines in play that have been left out, by key. Picking a
  // line starts with all its colours in.
  const [optedOut, setOptedOut] = useState<string[]>([]);
  // The colour each group climbs, by key, in the groups' order - null until
  // generated.
  const [result, setResult] = useState<string[] | null>(null);
  // Which groups, by index, keep their colour when rolling again.
  const [locked, setLocked] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  // The wall's climbs - undefined while loading, null if they couldn't be loaded.
  const [climbs, setClimbs] = useState<Climb[] | null>();
  const now = useMemo(() => new Date(), []);
  const shuffleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetchClimbs()
      .then(setClimbs)
      .catch(() => setClimbs(null));
  }, []);

  useEffect(() => () => window.clearInterval(shuffleTimer.current), []);

  const isAdvanced = setupTab === "advanced";
  const activeConnections = isAdvanced ? connected : SIMPLE_LAYOUTS.find((layout) => layout.id === simpleLayout)!.connections;
  const groups = useMemo(() => limbGroups(activeConnections), [activeConnections]);
  // Existing combos are a colour for each hand, so they only fit Left / Right.
  const usesCombos = !isAdvanced && existingOnly && simpleLayout === "leftRight";
  const linesInPlay = useMemo(
    () => LINES.filter((line) => (sideLines ? Math.abs(line - selectedLine) <= COMBO_LINE_REACH : line === selectedLine)),
    [selectedLine, sideLines],
  );
  const colourRows = useMemo(
    () =>
      linesInPlay.map((line) => ({
        line,
        colours: lineColourNames(climbs ?? [], line).map((name): RollColour => ({ key: colourKey(line, name), line, name })),
        small: line !== selectedLine,
      })),
    [climbs, linesInPlay, selectedLine],
  );
  const allColours = useMemo(() => colourRows.flatMap((row) => row.colours), [colourRows]);
  const pool = useMemo(
    () => allColours.filter((colour) => !optedOut.includes(colour.key)).map((colour) => colour.key),
    [allColours, optedOut],
  );

  // Simple rolls a pair, one colour for each half. Neither can skip a line: one
  // is always on the picked line and the other within reach of it - so line 4
  // with side lines gives 3/4, 4/4 or 4/5, never 3/5 or 3/3.
  const simplePairs = useMemo(() => {
    if (isAdvanced) return [];
    const fits = (key: string) => linesInPlay.includes(keyColour(key).line);
    const candidates = usesCombos
      ? comboPairs(climbs ?? [])
      : allColours.flatMap((a) => allColours.map((b) => [a.key, b.key]));
    return candidates.filter(
      ([a, b]) => a !== b && fits(a) && fits(b) && (keyColour(a).line === selectedLine || keyColour(b).line === selectedLine),
    );
  }, [isAdvanced, usesCombos, climbs, allColours, linesInPlay, selectedLine]);

  // The locked groups' colours, with the groups to roll left undefined.
  const kept = groups.map((_, i) => (result && locked.includes(i) ? result[i] : undefined));
  const toRoll = kept.filter((key) => key === undefined).length;
  const freeColours = pool.filter((key) => !kept.includes(key)).length;
  // The pairs that keep the locked colours where they are.
  const matchingPairs = simplePairs.filter((pair) => pair.every((key, i) => kept[i] === undefined || kept[i] === key));

  const linesText =
    linesInPlay.length === 1 ? `line ${selectedLine}` : `lines ${linesInPlay[0]}-${linesInPlay[linesInPlay.length - 1]}`;

  // Why there's nothing to generate, if there isn't. With everything locked
  // there's nothing to roll, which the button says itself.
  function whyUnavailable() {
    if (climbs === undefined) return "Loading routes…";
    if (climbs === null) return "Couldn't load the routes";
    if (toRoll === 0) return null;
    if (isAdvanced) {
      if (allColours.length === 0) return `No routes up on ${linesText}`;
      if (pool.length === 0) return "Pick some colours in Setup";
      if (freeColours < toRoll) {
        return `Only ${freeColours} colour${freeColours === 1 ? "" : "s"} left to pick from - join more limbs, add colours or pick another line`;
      }
      return null;
    }
    if (matchingPairs.length > 0) return null;
    if (simplePairs.length > 0) return "Nothing goes with the locked colour - unlock it to roll again";
    if (usesCombos) return `No combos up on ${linesText}`;
    if (allColours.length === 0) return `No routes up on ${linesText}`;
    return `Not enough colours up on ${linesText}`;
  }
  const unavailable = whyUnavailable();

  // A roll partway through the shuffle.
  function rollAny() {
    return isAdvanced ? rollColours(pool, kept) : randomItem(matchingPairs);
  }

  // The roll to land on, which tries not to be the same as the last.
  function rollFinal() {
    if (isAdvanced) return rollNewColours(pool, kept, result);
    const fresh = matchingPairs.filter((pair) => !result || pair.some((key, i) => key !== result[i]));
    return randomItem(fresh.length > 0 ? fresh : matchingPairs);
  }

  // A new grouping or set of lines makes the last roll meaningless, so it's
  // cleared, locks and all.
  function resetRoll() {
    window.clearInterval(shuffleTimer.current);
    setRolling(false);
    setResult(null);
    setLocked([]);
  }

  function toggleConnection(key: ConnectionKey) {
    resetRoll();
    setConnected((current) => toggleJoin(current, key));
  }

  function applyPreset(preset: ConnectionKey[]) {
    resetRoll();
    setConnected(preset);
  }

  function changeTab(tab: SetupTab) {
    resetRoll();
    setSetupTab(tab);
  }

  function changeSimpleLayout(layout: SimpleLayout) {
    resetRoll();
    setSimpleLayout(layout);
  }

  function toggleExistingOnly() {
    resetRoll();
    setExistingOnly((on) => !on);
  }

  // A new set of lines starts with all their colours in.
  function selectLine(line: Line) {
    resetRoll();
    setOptedOut([]);
    setSelectedLine(line);
  }

  function toggleSideLines() {
    resetRoll();
    setOptedOut([]);
    setSideLines((on) => !on);
  }

  // Leaving a colour out only changes what the next roll picks from - the
  // colours already rolled stay.
  function toggleColour(key: string) {
    setOptedOut((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  function toggleLock(group: number) {
    if (!result || rolling) return;
    setLocked((current) => (current.includes(group) ? current.filter((g) => g !== group) : [...current, group]));
  }

  function handleGenerate() {
    if (unavailable || rolling || toRoll === 0) return;
    const final = rollFinal();
    if (skipAnimation) {
      setResult(final);
      return;
    }
    // Flick through a few random picks before landing, roulette style. Locked
    // groups hold still.
    setRolling(true);
    const started = Date.now();
    window.clearInterval(shuffleTimer.current);
    shuffleTimer.current = window.setInterval(() => {
      if (Date.now() - started >= SHUFFLE_DURATION_MS) {
        window.clearInterval(shuffleTimer.current);
        setResult(final);
        setRolling(false);
        return;
      }
      setResult(rollAny());
    }, SHUFFLE_STEP_MS);
  }

  function groupIndex(limb: LimbKey) {
    return groups.findIndex((g) => g.includes(limb));
  }

  function groupColour(group: number) {
    const key = result?.[group];
    return key === undefined ? undefined : keyColour(key);
  }

  // With side lines in play, the same colour can be up on more than one, so
  // names say which line.
  function colourLabel(colour: RollColour) {
    return linesInPlay.length > 1 ? `${colour.name} · L${colour.line}` : colour.name;
  }

  const matchingPreset = PRESETS.find(
    (preset) => preset.connections.length === connected.length && preset.connections.every((key) => connected.includes(key)),
  );
  const canLock = result !== null && !rolling;
  // The climbs a roll of existing combos landed on - more than one when combos
  // share both colours.
  const rolledCombos =
    usesCombos && result && !rolling
      ? (climbs ?? []).filter((climb) => {
          if (!isActiveCombo(climb)) return false;
          const pair = comboPair(climb);
          return pair !== null && pair.every((key, i) => key === result[i]);
        })
      : [];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead title="Combo Roulette" tagline="Join your limbs, pick a line, and see what you're climbing." now={now} />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="flex flex-col gap-6">
            <SectionRule title="The roulette" />
            <div className="flex flex-col items-center gap-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              {usesCombos && (
                // Held open from before the first roll, one row high, so the
                // combo landing doesn't push the page down. As wide as the
                // colours panel below, so the two line up.
                <div className="-mb-4 flex min-h-11 w-full max-w-sm flex-col justify-center rounded-lg border border-neutral-200 px-3">
                  {rolledCombos.length > 0 ? (
                    <ul className="flex flex-col divide-y divide-neutral-100">
                      {rolledCombos.map((combo) => (
                        <li key={combo.id} className="py-1">
                          <Link
                            href={climbHref(combo.id)}
                            className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                          >
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-medium text-neutral-800">
                                <ClimbColour climb={combo} />
                              </span>
                              {/* Combos aren't set, so their setter is who made the first ascent. */}
                              <span className="text-xs text-neutral-500">FA: {combo.setter || "Unknown"}</span>
                            </span>
                            <GradeTag grade={combo.grade} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-center text-sm text-neutral-400">
                      {rolling ? "Finding a combo…" : "Roll to find a combo"}
                    </p>
                  )}
                </div>
              )}
              <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg bg-neutral-50 px-6 py-4 text-sm" aria-live="polite">
                {groups.map((group, i) => {
                  const isLocked = locked.includes(i);
                  // Mid-roll, only the locked colours are settled.
                  const colour = rolling && !isLocked ? undefined : groupColour(i);
                  return (
                    <div key={group.join(",")} className="flex items-center justify-between gap-4">
                      <span className="font-medium text-neutral-500">{groupName(group)}:</span>
                      <span className="flex items-center gap-2">
                        <span
                          className="flex items-center gap-1.5 font-semibold"
                          style={{ color: colour ? colourTextShade(colour.name, swatchFor(colour.name)) : undefined }}
                        >
                          {colour && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                              style={{ background: swatchFor(colour.name) }}
                            />
                          )}
                          {colour ? colourLabel(colour) : <span className="text-neutral-400">—</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleLock(i)}
                          disabled={!canLock}
                          aria-pressed={isLocked}
                          aria-label={`${isLocked ? "Unlock" : "Lock"} ${groupName(group)}`}
                          title={isLocked ? "Unlock" : "Lock"}
                          className={`rounded p-1 transition-colors disabled:cursor-default disabled:opacity-30 ${
                            isLocked ? "text-primary" : "text-neutral-400 enabled:hover:text-neutral-600"
                          }`}
                        >
                          <LockIcon locked={isLocked} className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>

              <LimbGrid
                connected={activeConnections}
                colourFor={(limb) => groupColour(groupIndex(limb))?.name}
                onGroupClick={canLock ? (group) => toggleLock(groupIndex(group[0])) : undefined}
                className="w-64 sm:w-80"
                renderLabel={(limb) => {
                  const colour = groupColour(groupIndex(limb.key));
                  const isLocked = locked.includes(groupIndex(limb.key));
                  const dark = colour !== undefined && PALE_COLOURS.has(colour.name);
                  return (
                    <div
                      className={`flex h-full w-full flex-col p-3 sm:p-4 ${limb.align} ${
                        colour
                          ? dark
                            ? "text-neutral-800"
                            : "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
                          : "text-neutral-500"
                      }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wide sm:text-sm">{limb.short}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold leading-tight sm:text-xs">
                        {colour ? colourLabel(colour) : "?"}
                        {isLocked && <LockIcon locked className="h-3 w-3 shrink-0" />}
                      </span>
                    </div>
                  );
                }}
              />
              {result && !rolling && (
                <p className="-mt-5 text-xs text-neutral-500">Click a colour or its lock to keep it when you roll again.</p>
              )}

              <div className="flex w-full flex-col items-center gap-3">
                {unavailable ? (
                  <p className="max-w-xs text-center text-sm font-semibold text-neutral-500">{unavailable}</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={rolling || toRoll === 0}
                    className="rounded-full bg-secondary px-8 py-3 text-lg font-semibold text-primary shadow-md transition-colors enabled:hover:bg-secondary/80 disabled:cursor-default disabled:opacity-70"
                  >
                    {rolling ? "Rolling…" : toRoll === 0 ? "All locked" : result ? "Generate again" : "Generate"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSkipAnimation((v) => !v)}
                  aria-pressed={skipAnimation}
                  className={`self-start rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition-colors ${
                    skipAnimation
                      ? "border-primary bg-primary text-white"
                      : "border-primary bg-white text-primary hover:bg-primary hover:text-white"
                  }`}
                >
                  Skip
                </button>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <SectionRule title="Setup" />
            <div className="flex flex-col gap-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              <TabBar label="Setup" tabs={SETUP_TABS} active={setupTab} onChange={changeTab} />
              <div className="flex flex-col gap-8 sm:flex-row lg:flex-col">
                {isAdvanced ? (
                  <div className="flex flex-col gap-3 sm:flex-1">
                    <Kicker className="text-neutral-400">Limbs</Kicker>
                    <div className="grid grid-cols-3 gap-1">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyPreset(preset.connections)}
                          aria-pressed={matchingPreset === preset}
                          className={`flex flex-col rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                            matchingPreset === preset
                              ? "bg-primary text-white"
                              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                          }`}
                        >
                          {preset.label}
                          <span className={`text-[11px] font-normal ${matchingPreset === preset ? "text-white/80" : "text-neutral-500"}`}>
                            {preset.detail}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-500">Tap between limbs, or diagonally across the middle, to join them. Joined limbs climb the same colour.</p>
                    <LimbGrid
                      connected={connected}
                      onToggle={toggleConnection}
                      className="w-48 self-center"
                      renderLabel={(limb) => (
                        <div
                          className={`flex h-full w-full flex-col p-2 text-[11px] font-bold uppercase tracking-wide text-neutral-600 ${limb.align}`}
                        >
                          {limb.short}
                        </div>
                      )}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-1">
                    <Kicker className="text-neutral-400">Limbs</Kicker>
                    <div className="grid grid-cols-2 gap-1">
                      {SIMPLE_LAYOUTS.map((layout) => (
                        <button
                          key={layout.id}
                          type="button"
                          onClick={() => changeSimpleLayout(layout.id)}
                          aria-pressed={simpleLayout === layout.id}
                          className={`rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                            simpleLayout === layout.id
                              ? "bg-primary text-white"
                              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                          }`}
                        >
                          {layout.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-6 sm:flex-1">
                  <div className="flex flex-col gap-2">
                    <Kicker className="text-neutral-400">Line</Kicker>
                    <div className="grid grid-flow-col grid-cols-2 grid-rows-3 gap-1">
                      {LINES.map((line) => (
                        <button
                          key={line}
                          type="button"
                          onClick={() => selectLine(line)}
                          aria-pressed={line === selectedLine}
                          className={`rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                            line === selectedLine
                              ? "bg-primary text-white"
                              : linesInPlay.includes(line)
                                ? "bg-primary/15 text-primary hover:bg-primary/25"
                                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                          }`}
                        >
                          Line {line}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Kicker className="text-neutral-400">Options</Kicker>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleSideLines}
                        aria-pressed={sideLines}
                        className={`flex-1 rounded-md px-4 py-2 text-left text-sm font-medium transition-colors ${
                          sideLines ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                        }`}
                      >
                        Side lines
                      </button>
                      <InfoTip text={SIDE_LINES_TIP} align="end" />
                    </div>
                    {!isAdvanced && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleExistingOnly}
                          disabled={simpleLayout !== "leftRight"}
                          aria-pressed={existingOnly}
                          className={`flex-1 rounded-md px-4 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            existingOnly ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 enabled:hover:bg-neutral-200"
                          }`}
                        >
                          Existing combos only
                        </button>
                        <InfoTip text={EXISTING_COMBOS_TIP} align="end" />
                      </div>
                    )}
                  </div>

                  {isAdvanced && (
                    <div className="flex flex-col gap-2">
                      <Kicker className="text-neutral-400">Colours</Kicker>
                      {climbs === undefined ? (
                        <p className="text-sm text-neutral-400">Loading routes…</p>
                      ) : climbs === null ? (
                        <p className="text-sm text-neutral-400">Couldn&apos;t load the routes</p>
                      ) : (
                        <>
                          <p className="text-xs text-neutral-500">Click a colour to leave it out.</p>
                          <ColourGrid
                            rows={colourRows}
                            picked={allColours.filter((colour) => !optedOut.includes(colour.key)).map((colour) => colour.key)}
                            onToggle={toggleColour}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
