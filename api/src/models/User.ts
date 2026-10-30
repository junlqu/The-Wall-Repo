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

// The user's saved preferences. None exist yet, so every account starts with
// an empty object.
export type UserSettings = Record<string, unknown>;

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
  // Never accepted from a request body: new accounts get USER_LEVEL.member,
  // and anything higher is set by hand in the database.
  level: UserLevel;
  // Accounts made before settings existed don't have it.
  settings?: UserSettings;
};

export function isUserLevel(value: unknown): value is UserLevel {
  return Object.values(USER_LEVEL).includes(value as UserLevel);
}
