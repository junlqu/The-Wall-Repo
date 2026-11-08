// User data for the admin User center. Mirrors api/src/functions/users.ts.

import { adminRequest } from "@/lib/api";
import { type SessionUser, USER_LEVEL } from "@/lib/session";

// Mirrors PAGE_SIZES in api/src/functions/users.ts.
export const USER_PAGE_SIZES = [10, 25, 50, 100] as const;
export type UserPageSize = (typeof USER_PAGE_SIZES)[number];

export type SearchField = "username" | "fname" | "lname" | "email" | "phone";

export const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  username: "Username",
  fname: "First name",
  lname: "Last name",
  email: "Email",
  phone: "Phone",
};

// Where a search hit a user - `value.slice(start, start + length)` is the
// part that matched.
export type SearchMatch = { field: SearchField; value: string; start: number; length: number };

export type Leader = { userID: string; username: string; avatarUpdatedAt?: string; count: number };

export type UserStats = {
  totalUsers: number;
  // Only comments with text, as on the climbs.
  totalComments: number;
  totalSends: number;
  topCommenters: Leader[];
  topSenders: Leader[];
  // When each recent one happened, from a little before the start of the year
  // (or a week ago, if that's earlier) - ISO timestamps, except sends dated
  // by the day the climber said they sent it, which are a plain YYYY-MM-DD.
  activity: Record<ActivityMetric, string[]>;
};

export type ActivityMetric = "users" | "comments" | "sends";

// Someone as the admin pages show them. Mirrors toListedUser in
// api/src/functions/users.ts.
export type ListedUser = {
  userID: string;
  username: string;
  fname: string;
  lname: string;
  createdAt: string;
  avatarUpdatedAt?: string;
  level: number;
};

export type UserSummary = ListedUser & {
  // Where a search matched them - the first of username, first name, last
  // name, email and phone that did. Null when not searching.
  match: SearchMatch | null;
};

export type UserPage = { users: UserSummary[]; total: number; page: number; pageSize: number };

export async function fetchUserStats(): Promise<UserStats> {
  return (await adminRequest("/users/stats", {})) as UserStats;
}

// `level` keeps only the users at that level.
export async function fetchUsers(
  search: string,
  page: number,
  pageSize: UserPageSize,
  level?: number,
): Promise<UserPage> {
  const query = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) });
  if (level !== undefined) query.set("level", String(level));
  return (await adminRequest(`/users?${query}`, {})) as UserPage;
}

// A ban or timeout: ISO dates and times. Only a ban can have no `endAt`,
// which makes it permanent. `by` is who gave it, null when that account is
// gone. Mirrors toUserDetails in api/src/functions/users.ts.
export type UserRestriction = {
  startAt: string;
  endAt: string | null;
  reason: string;
  by: { userID: string; username: string } | null;
};

// Someone's whole account, for the admin user panel. Email and phone are ""
// when they haven't given one; `ban` and `timeout` are every one they've had,
// oldest first. Mirrors toUserDetails in api/src/functions/users.ts.
export type UserDetails = ListedUser & {
  email: string;
  phone: string;
  deletedAt?: string;
  ban: UserRestriction[];
  timeout: UserRestriction[];
};

export type RestrictionKind = "ban" | "timeout";

// For bans and timeouts alike. Mirror MAX_RESTRICTION_MINUTES and
// MAX_RESTRICTION_REASON_LENGTH in api/src/functions/users.ts.
export const MAX_RESTRICTION_DAYS = 365;
export const MAX_RESTRICTION_REASON_LENGTH = 500;

// The one of `list` running now, if any. Mirrors running in
// api/src/models/User.ts.
export function running(list: UserRestriction[], now = new Date().toISOString()): UserRestriction | undefined {
  return list.find((item) => item.startAt <= now && (item.endAt === null || item.endAt > now));
}

// Bans them from now for `minutes`, or for good when it's null, or times
// them out for `minutes`. Returns them as they are now.
export async function restrictUser(
  userID: string,
  kind: RestrictionKind,
  minutes: number | null,
  reason: string,
): Promise<UserDetails> {
  return (await adminRequest(`/users/${encodeURIComponent(userID)}/${kind}`, {
    method: "POST",
    body: JSON.stringify({ minutes, reason }),
  })) as UserDetails;
}

// What the panel's edit form sends. `resetAvatar` puts their picture back to
// their starter.
export type UserEdit = Pick<UserDetails, "username" | "fname" | "lname" | "email" | "phone"> & {
  resetAvatar: boolean;
};

// Mirrors MAX_USERNAME_LENGTH in api/src/accountFields.ts.
export const MAX_USERNAME_LENGTH = 128;

export async function fetchUser(userID: string): Promise<UserDetails> {
  return (await adminRequest(`/users/${encodeURIComponent(userID)}`, {})) as UserDetails;
}

// Returns them as saved.
export async function updateUser(userID: string, edit: UserEdit): Promise<UserDetails> {
  return (await adminRequest(`/users/${encodeURIComponent(userID)}`, {
    method: "PUT",
    body: JSON.stringify(edit),
  })) as UserDetails;
}

// Why `me` can't edit `user`'s account, or null when they can. Mirrors
// editRefusal in api/src/functions/users.ts, which makes the same checks.
export function editLockedReason(me: SessionUser, user: UserDetails): string | null {
  if (user.userID === me.userID) return "Change your own account from Settings.";
  if (user.level >= me.level) return "You can only edit people below your own level.";
  if (user.deletedAt) return "This account has been deleted.";
  return null;
}

// The levels the permissions page lays out, highest first. Members - where
// every account starts - aren't listed.
export const PERMISSION_LEVELS = [
  { level: USER_LEVEL.admin, label: "Admin" },
  { level: USER_LEVEL.staff, label: "Staff" },
  { level: USER_LEVEL.moderator, label: "Moderator" },
  { level: USER_LEVEL.executive, label: "Executive" },
];

// Members are the one level the permissions page has no box for.
export function levelLabel(level: number) {
  return PERMISSION_LEVELS.find((item) => item.level === level)?.label ?? "Member";
}

// Everyone above member.
export async function fetchPermissionUsers(): Promise<ListedUser[]> {
  return (await adminRequest("/users/permissions", {})) as ListedUser[];
}

// Moves someone from `from` - the level the page shows them at - to `level`,
// returning them as they are now. Refused if they've been moved since.
export async function setUserLevel(userID: string, level: number, from: number): Promise<ListedUser> {
  return (await adminRequest(`/users/${encodeURIComponent(userID)}/level`, {
    method: "PUT",
    body: JSON.stringify({ level, from }),
  })) as ListedUser;
}
