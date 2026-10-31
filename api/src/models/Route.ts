export const ROUTE_CONTAINER = "Routes";

export const ROUTE_LINES = [1, 2, 3, 4, 5, 6] as const;
export type RouteLine = (typeof ROUTE_LINES)[number];

export const CLIMB_TYPES = ["route", "boulder", "combo"] as const;
export type ClimbType = (typeof CLIMB_TYPES)[number];

// How far from its own line a combo's hands can reach.
export const COMBO_LINE_REACH = 1;

export const LEADABLE = ["Yes", "Sketch", "No", "?"] as const;
export type Leadable = (typeof LEADABLE)[number];

// Partition key: /routeID. `id` mirrors routeID (Cosmos requires an id).
// Boulders and combos are stored here too, told apart by `type`.
export type Route = {
  id: string;
  routeID: string;
  type: ClimbType;
  // The setter's name(s) as the wall records them, e.g. "Denzil/Alex". Combos
  // aren't set, so theirs is whoever made the first ascent, as written when it
  // was added - "" when it wasn't given.
  setter: string;
  // The setter's account, when they have one. For a combo, whoever added it.
  userID?: string;
  // YYYY-MM-DD, or "" when the set date was never recorded. A combo's is the day
  // of its first ascent.
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
  // Combos only: the routes each hand takes, since the same colour can be up on
  // two lines near each other. It's what links a combo to its routes: each copy is
  // kept in step with its route, and the combo's colours and being up or down
  // follow from them. Combos from a spreadsheet import don't have them.
  hands?: { left: ComboHand; right: ComboHand };
  // The sum of its comments' ratings (each 0-10) and how many there are, so
  // the average is total / count. Kept in step by changeRating, and missing
  // on older climbs until their first rating.
  rating?: RouteRating;
};

export type RouteRating = { total: number; count: number };

export type ComboHand = { routeID: string; line: RouteLine; colour: string; grade: string };

// A combo's routeID. There's one per left and right hand, so the database turns
// away a second, even two at once. (A combo added before this has a random ID.)
export function comboIDFor(leftID: string, rightID: string) {
  return `${leftID}_${rightID}`;
}
