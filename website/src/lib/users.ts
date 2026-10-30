// User data for the admin User center. Mirrors api/src/functions/users.ts.

import { adminRequest } from "@/lib/api";
import { USER_LEVEL } from "@/lib/session";

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

// The levels the permissions page lays out, highest first. Members - where
// every account starts - aren't listed.
export const PERMISSION_LEVELS = [
  { level: USER_LEVEL.admin, label: "Admin" },
  { level: USER_LEVEL.staff, label: "Staff" },
  { level: USER_LEVEL.moderator, label: "Moderator" },
  { level: USER_LEVEL.executive, label: "Executive" },
];

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
