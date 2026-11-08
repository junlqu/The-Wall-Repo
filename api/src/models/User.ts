import type { PatchOperation } from "@azure/cosmos";
import type { ProfilePrivacy } from "../profilePrivacy";
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
  // Which shape they were worked out in - see METRICS_VERSION in userMetrics.ts.
  version?: number;
  // Climbs they've sent, by type.
  sends: Record<ClimbType, number>;
  // The hardest grade they've sent of each type of climb - combos on the
  // route scale, but apart from routes. A type they haven't sent anything
  // graded of is left out.
  hardestSend: Partial<Record<ClimbType, string>>;
  // Climbs they've sent on each line, by line number. Boulders aren't on one.
  lineSends: Record<string, number>;
  // Climbs they've sent at each grade, by the climb's grade - routes, combos
  // and boulders together, as the two scales share no grades. Ungraded climbs
  // are left out.
  gradeSends: Record<string, number>;
  // How many of their comments gave each rating, by the rating (0-10).
  ratingsGiven: Record<string, number>;
  // Comments with text, as on the climbs.
  commentsPosted: number;
  // Their most recent send, or null when they haven't sent anything. `date` is
  // YYYY-MM-DD.
  latestSend: { routeID: string; date: string } | null;
};

// Their choice about cookies the site could do without. Off until they turn
// it on. There aren't any such cookies yet, so it changes nothing for now -
// what they let them hold will go here too.
export type CookieSettings = { optional: boolean };

export const DEFAULT_COOKIES: CookieSettings = { optional: false };

// What's saved with the user's account. New accounts start with all three.
// On older accounts, `metrics` is missing until they first open their
// dashboard, and `privacy` and `cookies` until they first save them - see
// privacyOf in profilePrivacy.ts and cookiesOf below for what that means.
export type UserSettings = { metrics?: UserMetrics; privacy?: Partial<ProfilePrivacy>; cookies?: CookieSettings };

export function cookiesOf(user: User): CookieSettings {
  return { ...DEFAULT_COOKIES, ...user.settings?.cookies };
}

// The patch that saves one of their settings. Accounts made before settings
// existed need the whole object - a patch can't reach inside one that isn't
// there.
export function settingsPatch<K extends keyof UserSettings>(user: User, key: K, value: UserSettings[K]): PatchOperation {
  return user.settings
    ? { op: "set", path: `/settings/${key}`, value }
    : { op: "set", path: "/settings", value: { [key]: value } };
}

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
  // The people they follow, whose comments and sends show on their dashboard,
  // oldest first. Two people who follow each other are friends. Missing until
  // they first follow someone - see follows.ts.
  following?: Follow[];
  // ISO date and time they deleted their account. The document stays - with
  // their details wiped by DELETE /account - so their comments and sends
  // still have someone to point at, but nobody can log in as them or open
  // their profile.
  deletedAt?: string;
};

// Someone they follow, and when they started - an ISO date and time.
export type Follow = { userID: string; followedAt: string };

// The userIDs of the people they follow.
export function followingIDs(user: Pick<User, "following">): string[] {
  return (user.following ?? []).map((follow) => follow.userID);
}

export function isUserLevel(value: unknown): value is UserLevel {
  return Object.values(USER_LEVEL).includes(value as UserLevel);
}
