"use client";

import dynamic from "next/dynamic";
import { cloneElement, useEffect, useRef, useState } from "react";
import type { JSX } from "react/jsx-runtime";

import { ShapedHolds } from "@/static/holds/ShapedHolds";
import { RoundHolds } from "@/static/holds/RoundHolds";
import { GeometricHolds } from "@/static/holds/GeometricHolds";

const HOLD_COLOURS = [
  "#E63946", // red
  "#F4A300", // orange
  "#F1C40F", // yellow
  "#2ECC71", // green
  "#2D6CDF", // blue
  "#14B8A6", // teal
  "#EC4899", // pink
  "#9B59B6", // purple
  "#1C1C1C", // black
  "#F5F5F5", // white
  "#C7C7C7", // light gray
  "#8B5E3C", // brown
];

type PositionKey = "L" | "M" | "R";

const BASE_PATTERNS: PositionKey[][] = [
  ["L", "R", "L", "R"],
  ["L", "M", "R", "M"],
  ["L", "R", "M", "M"],
];

function flipPattern(pattern: PositionKey[]): PositionKey[] {
  return pattern.map((key) => (key === "L" ? "R" : key === "R" ? "L" : "M"));
}

const ALL_PATTERNS: PositionKey[][] = [
  ...BASE_PATTERNS,
  ...BASE_PATTERNS.map(flipPattern),
];

type ShapeType = "round" | "geometric" | "shaped";
const SHAPE_TYPES: ShapeType[] = ["round", "geometric", "shaped"];

// Every hold type is a library of hand-drawn SVG paths/polygons keyed
// shape1..shape12, all drawn in the same 0-200 coordinate space.
const HOLD_LIBRARIES: Record<ShapeType, { [key: string]: JSX.Element }> = {
  round: RoundHolds,
  geometric: GeometricHolds,
  shaped: ShapedHolds,
};
const HOLD_LIBRARY_KEYS: Record<ShapeType, string[]> = {
  round: Object.keys(RoundHolds),
  geometric: Object.keys(GeometricHolds),
  shaped: Object.keys(ShapedHolds),
};

const ROUTE_COUNT = 6;
const HOLDS_PER_ROUTE = 90;
const TEXTURE_SLOT_COUNT = 8;
const TEXTURE_COLS = 4;
const WALL_FACET_COLS = 7;
const WALL_FACET_ROWS = 5;
const WALL_BASE_LIGHTNESS = 46; // roughly matches the old flat bg-neutral-500
const WALL_LIGHTNESS_SPREAD = 24;
const ROPE_WIDTH_PX = 12;
const ROPE_LIME = "#DFFF1A";
const ROPE_LIME_DARK = "#B4D100";
const ROPE_BLUE = "#2D6CDF";
const ROPE_RED = "#E63946";

// Every hold falls at the exact same speed: FALL_DURATION_S is how long the
// visible fall itself takes, covering ROCK_FALL_DISTANCE_VH (-10vh to 110vh,
// see the "fall" keyframe in globals.css). The CSS keyframe only "shows" a
// hold for the first FALL_FRACTION of its animation, then hides it for the
// rest of OUTER_CYCLE_S - so increasing OUTER_CYCLE_S (relative to the fixed
// number of holds) spreads them out more without changing fall speed.
// The texture triangles fall on this same OUTER_CYCLE_S loop. The rope and
// wall are continuous (never hidden), so instead they're each given their
// own duration matching this exact same vh/second pace (see below).
const FALL_DURATION_S = 9;
const ROCK_FALL_DISTANCE_VH = 120;
const ROCK_SPEED_VH_PER_S = ROCK_FALL_DISTANCE_VH / FALL_DURATION_S;
const FALL_FRACTION = 0.15; // must match the 15% keyframe stop in globals.css
const OUTER_CYCLE_S = FALL_DURATION_S / FALL_FRACTION;
const ROW_INTERVAL_S = OUTER_CYCLE_S / HOLDS_PER_ROUTE;
const TEXTURE_INTERVAL_S = OUTER_CYCLE_S / TEXTURE_SLOT_COUNT;
// The rope scrolls its pattern by the same distance the rocks fall, in the
// same time, so it reads as moving at the identical pace.
const ROPE_SCROLL_DURATION_S = FALL_DURATION_S;
// The wall scrolls exactly one tile (100% of its own height) at that same
// vh/second pace.
const WALL_SCROLL_DURATION_S = 100 / ROCK_SPEED_VH_PER_S;
// Wider than the lane itself, so neighboring lanes' holds visually overlap
// and read as one connected wall rather than isolated columns.
const LATERAL_OFFSET_PX = 64;
const JITTER_RANGE_PX = 22;

// Routes reveal outward from the center as the viewport widens, so exactly
// one route is visible on mobile; the visible set always spans the full width.
function computeVisibleIndices(width: number): number[] {
  if (width >= 1536) return [0, 1, 2, 3, 4, 5];
  if (width >= 1280) return [0, 1, 2, 3, 4];
  if (width >= 1024) return [1, 2, 3, 4];
  if (width >= 768) return [1, 2, 3];
  if (width >= 640) return [2, 3];
  return [2];
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function polygonPoints(sides: number, rotationDeg: number, r = 45) {
  const points: string[] = [];
  for (let k = 0; k < sides; k++) {
    const angle = ((rotationDeg + (k * 360) / sides) * Math.PI) / 180;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

type HoldBase = {
  key: number;
  positionKey: PositionKey;
  jitterPx: number;
  size: number;
  delay: number;
  shape: ShapeType;
  shapeKey: string;
  rotation: number;
  colour: string;
};

type RouteBase = {
  key: number;
  holds: HoldBase[];
};

// Splits a route's holds into runs of 24-32, each a new colour (never
// repeating the immediately preceding one), so the line re-colours
// every couple dozen holds.
function assignSegmentColours(count: number, firstColour: string): string[] {
  const colours: string[] = [];
  let previousColour: string | null = null;

  while (colours.length < count) {
    const segmentLength = Math.min(count - colours.length, 24 + Math.floor(Math.random() * 9));
    let colour: string;
    if (previousColour === null) {
      colour = firstColour;
    } else {
      do {
        colour = HOLD_COLOURS[Math.floor(Math.random() * HOLD_COLOURS.length)];
      } while (colour === previousColour);
    }
    for (let i = 0; i < segmentLength; i++) colours.push(colour);
    previousColour = colour;
  }

  return colours;
}

type TextureSlot = {
  key: number;
  col: number;
  sizeRatio: number;
  jitterX: number;
  rotation: number;
  opacity: number;
  delay: number;
};

function generateRouteBase(): RouteBase[] {
  const firstColours = shuffle(HOLD_COLOURS).slice(0, ROUTE_COUNT);

  return Array.from({ length: ROUTE_COUNT }, (_, routeIndex) => {
    const pattern = ALL_PATTERNS[Math.floor(Math.random() * ALL_PATTERNS.length)];

    // Same average hold size as before (~108), but a tighter spread so the
    // maximum is 75% of what it used to be (~157.5 vs. ~210).
    const baseSize = 68.5 + Math.random() * 79;
    const rowColours = assignSegmentColours(HOLDS_PER_ROUTE, firstColours[routeIndex]);

    const holds: HoldBase[] = Array.from({ length: HOLDS_PER_ROUTE }, (_, holdIndex) => {
      const shape = SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
      const keys = HOLD_LIBRARY_KEYS[shape];

      return {
        key: holdIndex,
        positionKey: pattern[holdIndex % pattern.length],
        jitterPx: (Math.random() - 0.5) * 2 * JITTER_RANGE_PX,
        size: baseSize + (Math.random() - 0.5) * 20,
        // Evenly spaced along the loop (no large random gaps), with only a
        // small jitter so it doesn't look perfectly mechanical.
        delay: -(holdIndex * ROW_INTERVAL_S + (Math.random() - 0.5) * ROW_INTERVAL_S * 0.4),
        // Mixed per hold, not per route - a single line can carry circles,
        // geometric polygons, and shaped holds side by side.
        shape,
        shapeKey: keys[Math.floor(Math.random() * keys.length)],
        // A single random rotation applied to every spawned hold.
        rotation: Math.random() * 360,
        colour: rowColours[holdIndex],
      };
    });

    return { key: routeIndex, holds };
  });
}

function generateTextureSlots(): TextureSlot[] {
  return Array.from({ length: TEXTURE_SLOT_COUNT }, (_, i) => ({
    key: i,
    col: i % TEXTURE_COLS,
    sizeRatio: 0.55 + Math.random() * 0.3,
    jitterX: (Math.random() - 0.5) * 2,
    rotation: Math.random() * 360,
    opacity: 0.14 + Math.random() * 0.12,
    // Same evenly-spaced-with-jitter scheme as holds, on the same cycle
    // length, so the triangles fall at the exact same speed as the holds.
    delay: -(i * TEXTURE_INTERVAL_S + (Math.random() - 0.5) * TEXTURE_INTERVAL_S * 0.4),
  }));
}

type WallFacet = {
  key: string;
  points: string;
  fill: string;
};

// Builds a low-poly rock face: a grid of points jittered off-grid (edges
// pinned so the mosaic still fully tiles with no gaps), each cell split into
// two triangles along a random diagonal, each shaded a different gray so the
// facets read as light/shadow on an uneven rock surface. Coordinates are in
// a 0-100 unit space, independent of real pixel size (the SVG stretches to
// fill the container), so this needs no DOM measurement to render.
function generateWallFacets(): WallFacet[] {
  const cellW = 100 / WALL_FACET_COLS;
  const cellH = 100 / WALL_FACET_ROWS;

  const grid: { x: number; y: number }[][] = [];
  for (let row = 0; row <= WALL_FACET_ROWS; row++) {
    const points: { x: number; y: number }[] = [];
    for (let col = 0; col <= WALL_FACET_COLS; col++) {
      const isEdge = row === 0 || row === WALL_FACET_ROWS || col === 0 || col === WALL_FACET_COLS;
      const jitterX = isEdge ? 0 : (Math.random() - 0.5) * cellW * 0.7;
      const jitterY = isEdge ? 0 : (Math.random() - 0.5) * cellH * 0.7;
      points.push({ x: col * cellW + jitterX, y: row * cellH + jitterY });
    }
    grid.push(points);
  }

  const facets: WallFacet[] = [];
  for (let row = 0; row < WALL_FACET_ROWS; row++) {
    for (let col = 0; col < WALL_FACET_COLS; col++) {
      const topLeft = grid[row][col];
      const topRight = grid[row][col + 1];
      const bottomLeft = grid[row + 1][col];
      const bottomRight = grid[row + 1][col + 1];

      const splitDiagonal = Math.random() < 0.5;
      const triangles = splitDiagonal
        ? [
            [topLeft, topRight, bottomRight],
            [topLeft, bottomRight, bottomLeft],
          ]
        : [
            [topLeft, topRight, bottomLeft],
            [topRight, bottomRight, bottomLeft],
          ];

      triangles.forEach((triangle, i) => {
        const lightness = WALL_BASE_LIGHTNESS + (Math.random() - 0.5) * WALL_LIGHTNESS_SPREAD;
        facets.push({
          key: `${row}-${col}-${i}`,
          points: triangle.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
          fill: `hsl(0, 0%, ${lightness.toFixed(1)}%)`,
        });
      });
    }
  }

  return facets;
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.5-6.5a1 1 0 0 0 0-1.7l-10.5-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function Hold({ shape, shapeKey, colour, rotation }: { shape: ShapeType; shapeKey: string; colour: string; rotation: number }) {
  const stroke = "rgba(0,0,0,0.35)";
  const element = HOLD_LIBRARIES[shape][shapeKey];

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible" style={{ transform: `rotate(${rotation}deg)` }}>
      {cloneElement(element, { fill: colour, stroke, strokeWidth: 2 })}
    </svg>
  );
}

function FallingRocksCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Generated once via lazy initial state (not an effect) - this component is
  // only ever mounted client-side (see the ssr:false export below), so it's
  // safe to call Math.random() here without risking a hydration mismatch.
  const [routes] = useState(generateRouteBase);
  const [textureSlots] = useState(generateTextureSlots);
  // Percentage-based (0-100), so unlike everything else here it doesn't need
  // the real container size - the SVG just stretches to fill it.
  const [wallFacets] = useState(generateWallFacets);
  const [paused, setPaused] = useState(false);
  const animationPlayState = paused ? "paused" : "running";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  let textureNodes = null;
  let ropeNodes = null;
  let holdNodes = null;

  if (size) {
    const cellWidth = size.width / TEXTURE_COLS;

    textureNodes = textureSlots.map((slot) => {
      const triSize = cellWidth * slot.sizeRatio;
      const maxJitterX = Math.max(0, ((cellWidth - triSize) / 2) * 0.7);
      const centerX = (slot.col + 0.5) * cellWidth + slot.jitterX * maxJitterX;

      return (
        <svg
          key={slot.key}
          viewBox="0 0 100 100"
          className="animate-fall absolute top-[-10%]"
          style={{
            left: centerX - triSize / 2,
            width: triSize,
            height: triSize,
            opacity: slot.opacity,
            animationDuration: `${OUTER_CYCLE_S}s`,
            animationDelay: `${slot.delay}s`,
            animationPlayState,
          }}
        >
          <polygon points={polygonPoints(3, slot.rotation)} fill="#3f3f3f" />
        </svg>
      );
    });

    const visibleIndices = computeVisibleIndices(size.width);

    ropeNodes = visibleIndices.map((routeIndex, orderIndex) => {
      const route = routes[routeIndex];
      const centerPx = ((orderIndex + 0.5) / visibleIndices.length) * size.width;

      return (
        <div
          key={route.key}
          className="animate-rope-scroll absolute inset-y-0"
          style={{
            left: centerPx,
            width: ROPE_WIDTH_PX,
            marginLeft: -ROPE_WIDTH_PX / 2,
            backgroundImage: [
              `repeating-linear-gradient(-45deg, ${ROPE_BLUE} 0px, ${ROPE_BLUE} 2px, transparent 2px, transparent 8px)`,
              `repeating-linear-gradient(45deg, ${ROPE_RED} 0px, ${ROPE_RED} 2px, transparent 2px, transparent 8px)`,
              // Vertical rope-fiber texture so the lime base visibly scrolls too, not just the stitching.
              `repeating-linear-gradient(0deg, ${ROPE_LIME} 0px, ${ROPE_LIME} 10px, ${ROPE_LIME_DARK} 10px, ${ROPE_LIME_DARK} 14px)`,
            ].join(", "),
            animationDuration: `${ROPE_SCROLL_DURATION_S}s`,
            animationPlayState,
          }}
        />
      );
    });

    holdNodes = visibleIndices.map((routeIndex, orderIndex) => {
      const route = routes[routeIndex];
      const centerPx = ((orderIndex + 0.5) / visibleIndices.length) * size.width;

      return route.holds.map((hold) => {
        const lateral = hold.positionKey === "L" ? -LATERAL_OFFSET_PX : hold.positionKey === "R" ? LATERAL_OFFSET_PX : 0;
        const left = centerPx + lateral + hold.jitterPx;

        return (
          <div
            key={`${route.key}-${hold.key}`}
            className="animate-fall absolute top-[-10%]"
            style={{
              left,
              width: hold.size,
              height: hold.size,
              marginLeft: -hold.size / 2,
              animationDuration: `${OUTER_CYCLE_S}s`,
              animationDelay: `${hold.delay}s`,
              animationPlayState,
            }}
          >
            <Hold shape={hold.shape} shapeKey={hold.shapeKey} colour={hold.colour} rotation={hold.rotation} />
          </div>
        );
      });
    });
  }

  const wallFacetPolygons = wallFacets.map((facet) => (
    <polygon key={facet.key} points={facet.points} fill={facet.fill} stroke={facet.fill} strokeWidth={0.6} />
  ));

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Purely decorative - hidden from the accessibility tree so it
          doesn't hide the pause button below along with it. */}
      <div aria-hidden="true">
        {/* Two stacked copies of the same mosaic, scrolled down by exactly
            one copy's height in a loop, so the wall moves down seamlessly
            forever at the same pace as the falling rocks. */}
        <div
          className="animate-wall-scroll absolute inset-x-0 top-0"
          style={{ height: "200%", animationDuration: `${WALL_SCROLL_DURATION_S}s`, animationPlayState }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-1/2 w-full">
            {wallFacetPolygons}
          </svg>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-1/2 h-1/2 w-full">
            {wallFacetPolygons}
          </svg>
        </div>
        {textureNodes}
        {holdNodes}
        {ropeNodes}
      </div>

      <button
        type="button"
        onClick={() => setPaused((current) => !current)}
        aria-label={paused ? "Play background animation" : "Pause background animation"}
        className="pointer-events-auto absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>
    </div>
  );
}

// This background is randomized per page load and must never render on the
// server (Math.random() would produce different output than the client and
// React would flag a hydration mismatch), so it's excluded from SSR entirely.
export default dynamic(() => Promise.resolve(FallingRocksCanvas), { ssr: false });
