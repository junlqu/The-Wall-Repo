import type { User } from "./models/User";

// Who can see each part of someone's profile. Their picture, name and
// username are always shown. Keep in sync with website/src/lib/privacy.ts.

export const PROFILE_SECTIONS = [
  "sends",
  "comments",
  "hardestSend",
  "favouriteLine",
  "recentComments",
  "recentSends",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const VISIBILITIES = ["everyone", "friends", "nobody"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type ProfilePrivacy = Record<ProfileSection, Visibility>;

// What a new account starts with: every part shown to everyone.
export const DEFAULT_PRIVACY = Object.fromEntries(
  PROFILE_SECTIONS.map((section) => [section, "everyone"]),
) as ProfilePrivacy;

// Anything they haven't chosen is left as the default. Older accounts may not
// have chosen anything.
export function privacyOf(user: User): ProfilePrivacy {
  return { ...DEFAULT_PRIVACY, ...user.settings?.privacy };
}

// Whether someone other than the owner can see a part. There are no friends
// yet, so "friends" hides it from everyone for now.
export function isVisibleToOthers(visibility: Visibility) {
  return visibility === "everyone";
}

// Checks a full set of choices from a request body.
export function readPrivacy(value: unknown): ProfilePrivacy | { error: string } {
  const body = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const keys = Object.keys(body);
  const valid =
    keys.length === PROFILE_SECTIONS.length &&
    PROFILE_SECTIONS.every((section) => VISIBILITIES.includes(body[section] as Visibility));
  if (!valid) return { error: "Choose who can see each part of your profile." };
  return Object.fromEntries(PROFILE_SECTIONS.map((section) => [section, body[section]])) as ProfilePrivacy;
}
