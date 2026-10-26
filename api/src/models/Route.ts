export const ROUTE_CONTAINER = "Routes";

export type RouteLine = 1 | 2 | 3 | 4 | 5 | 6;

// Partition key: /routeID. `id` mirrors routeID (Cosmos requires an id).
export type Route = {
  id: string;
  routeID: string;
  userID: string; // the setter
  setAt: string;
  // 0 while the route is still up; set to the removal date once it comes down.
  removedAt: string | 0;
  colour: string;
  // Colour of the tape marking the climb, for climbs set with tape.
  tape?: string;
  line: RouteLine;
  proposedGrade: string;
  // Combo climbs only: the second hold colour. Combos are climbed with a
  // different colour for each hand, so `colour` and `secondary` together
  // make up the climb's colour.
  secondary?: string;
  // userIDs in the order they sent the route.
  ascents: string[];
};
