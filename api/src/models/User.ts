import { ClimbType } from "./Route";

export const USER_CONTAINER = "User";

// Lowest to highest - a higher level has more control.
export const USER_LEVEL = {
  member: 0,
  executive: 1, // club executives
  moderator: 2,
  staff: 3,
  admin: 4,
} as const;

export type UserLevel = (typeof USER_LEVEL)[keyof typeof USER_LEVEL];

// Staff and admins can use the admin tools.
export function canUseAdminTools(level: number) {
  return level >= USER_LEVEL.staff;
}

// The numbers on someone's dashboard, kept up to date by userMetrics.ts.
export type UserMetrics = {
  // Climbs they've sent, by type.
  sends: Record<ClimbType, number>;
  // The hardest grade they've sent on each scale - combos are on the route
  // scale. A scale they haven't sent anything graded on is left out.
  hardestSend: { route?: string; boulder?: string };
  // Climbs they've sent on each line, by line number. Boulders aren't on one.
  lineSends: Record<string, number>;
  // Comments with text, as on the climbs.
  commentsPosted: number;
  // Their most recent send, or null when they haven't sent anything. `date` is
  // YYYY-MM-DD.
  latestSend: { routeID: string; date: string } | null;
};

// What's saved with the user's account. `metrics` is missing on older accounts
// until they first open their dashboard.
export type UserSettings = { metrics?: UserMetrics };

// Partition key: /userID. Cosmos also requires an `id` on every document, so
// it's always set to the same value as userID.
export type User = {
  id: string;
  userID: string;
  username: string;
  email?: string;
  phone?: string;
  fname: string;
  lname: string;
  passwordHash: string;
  createdAt: string;
  // Mirrors the user's Avatar document's updatedAt, so pages can cache-bust the
  // avatar URL without reading the Avatars container.
  avatarUpdatedAt?: string;
  // ISO date and time they last opened their dashboard - only that moves it, so
  // no other request has to write to the account. Older accounts don't have it
  // until they do.
  lastOnline?: string;
  // Never accepted from a request body: new accounts get USER_LEVEL.member,
  // and anything higher is set by hand in the database.
  level: UserLevel;
  // Accounts made before settings existed don't have it.
  settings?: UserSettings;
};

export function isUserLevel(value: unknown): value is UserLevel {
  return Object.values(USER_LEVEL).includes(value as UserLevel);
}
