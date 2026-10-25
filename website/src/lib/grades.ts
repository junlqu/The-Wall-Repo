export type ClimbKind = "route" | "boulder";

// Easiest to hardest. A grade missing from these lists won't show on the
// grade chart, so extend them if the wall starts setting outside the range.
export const ROUTE_GRADES = [
  "5.4", "5.5", "5.6", "5.7", "5.8", "5.9",
  "5.10a", "5.10b", "5.10c", "5.10d",
  "5.11a", "5.11b", "5.11c", "5.11d",
  "5.12a", "5.12b", "5.12c", "5.12d",
  "5.13a", "5.13b", "5.13c", "5.13d",
];

// Boulders are graded in bands rather than single grades. Dyno isn't a
// difficulty, so it sits after the hardest band.
export const BOULDER_GRADES = ["VB", "V0-V1", "V2-V3", "V4-V5", "V6-V7", "V8-V9", "V10+", "Dyno"];

export const GRADE_SCALES: Record<ClimbKind, string[]> = {
  route: ROUTE_GRADES,
  boulder: BOULDER_GRADES,
};
