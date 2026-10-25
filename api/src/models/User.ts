export const USER_CONTAINER = "User";

export const USER_LEVEL = {
  default: 0,
  admin: 1,
} as const;

export type UserLevel = (typeof USER_LEVEL)[keyof typeof USER_LEVEL];

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
  // Never accepted from a request body: new accounts get USER_LEVEL.default,
  // and only an existing admin can promote another user to USER_LEVEL.admin.
  level: UserLevel;
};
