import { type Climb, LINES } from "@/lib/climbs";
import { NEW_GRADE, ROUTE_GRADES } from "@/lib/grades";

// The colours the extras games (Twister, Combo Roulette) play with.

export type Line = (typeof LINES)[number];

// Multi-Colour's usual swatch is a conic gradient, which a wheel slice or an
// SVG shape can't be filled with, so there it's drawn as a few stripes.
export const MULTI_COLOUR = "Multi-Colour";
export const MULTI_COLOUR_STRIPES = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

// For writing a colour's name on the light page, the palest colours get a
// darker shade.
const TEXT_SHADES: Record<string, string> = { White: "#AFAFAF", Clear: "#9CA3AF", "Multi-Colour": "#6B7280" };

export function colourTextShade(name: string, swatch: string) {
  return TEXT_SHADES[name] ?? swatch;
}

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
// Combos are two colours, so they aren't counted.
export function lineColourNames(climbs: Climb[], line: Line): string[] {
  const routes = climbs
    .filter((climb) => climb.status === "active" && climb.type === "route" && climb.line === line)
    .sort(routeOrder);
  return [...new Set(routes.map((route) => route.colour))];
}
