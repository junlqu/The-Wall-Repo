export const ROUTE_CONTAINER = "Routes";

export const ROUTE_LINES = [1, 2, 3, 4, 5, 6] as const;
export type RouteLine = (typeof ROUTE_LINES)[number];

export const CLIMB_TYPES = ["route", "boulder", "combo"] as const;
export type ClimbType = (typeof CLIMB_TYPES)[number];

export const LEADABLE = ["Yes", "Sketch", "No", "?"] as const;
export type Leadable = (typeof LEADABLE)[number];

// Partition key: /routeID. `id` mirrors routeID (Cosmos requires an id).
// Boulders and combos are stored here too, told apart by `type`.
export type Route = {
  id: string;
  routeID: string;
  type: ClimbType;
  // The setter's name(s) as the wall records them, e.g. "Denzil/Alex".
  setter: string;
  // The setter's account, when they have one.
  userID?: string;
  // YYYY-MM-DD, or "" when the set date was never recorded.
  setAt: string;
  // 0 while the route is still up; set to the removal date once it comes down,
  // or null when it's down but nobody recorded when.
  removedAt: string | 0 | null;
  colour: string;
  // Boulders only: colour of the tape marking the problem, when it has some.
  tape?: string;
  // Routes and combos only - boulders aren't on a line.
  line?: RouteLine;
  proposedGrade: string;
  // Combo climbs only: the second hold colour. Combos are climbed with a
  // different colour for each hand, so `colour` and `secondary` together
  // make up the climb's colour.
  secondary?: string;
  leadable: Leadable;
  // userIDs in the order they sent the route.
  ascents: string[];
  // userIDs of everyone following the climb, whose dashboards show its new
  // comments. Climbs added before follows existed don't have it.
  follows?: string[];
  // How many comments it has, kept in step by changeCommentCount. Climbs
  // added before the count existed lack it until their first comment.
  comments?: number;
  // The sum of its comments' ratings (each 0-10) and how many there are, so
  // the average is total / count. Kept in step by changeRating, and missing
  // on older climbs until their first rating.
  rating?: RouteRating;
};

export type RouteRating = { total: number; count: number };
