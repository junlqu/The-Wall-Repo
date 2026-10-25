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
  line: RouteLine;
  proposedGrade: string;
  // Combo climbs only: the routeIDs of the two routes being linked.
  left?: string;
  right?: string;
  // userIDs in the order they sent the route.
  ascents: string[];
};
