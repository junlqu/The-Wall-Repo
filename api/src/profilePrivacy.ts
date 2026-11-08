import type { ClimbType } from "./models/Route";
import type { User } from "./models/User";

// Who can see each part of someone's profile. Their picture, name and
// username are always shown. Keep in sync with website/src/lib/privacy.ts.

export const PROFILE_SECTIONS = [
  "sends",
  "comments",
  // All three hardest sends - each also has its own below, which can only
  // narrow who sees it further.
  "hardestSend",
  "hardestRoute",
  "hardestBoulder",
  "hardestCombo",
  "favouriteLine",
  "recentComments",
  "recentSends",
  // How many people follow them.
  "followers",
  // How many people they follow.
  "following",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const VISIBILITIES = ["everyone", "friends", "nobody"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type ProfilePrivacy = Record<ProfileSection, Visibility>;

// The part for each type of climb's hardest send, under hardestSend.
export const HARDEST_SEND_PARTS: Record<ClimbType, ProfileSection> = {
  route: "hardestRoute",
  boulder: "hardestBoulder",
  combo: "hardestCombo",
};
const HARDEST_SEND_PART_IDS: readonly ProfileSection[] = Object.values(HARDEST_SEND_PARTS);

// Who can see a part, once anything it's under is taken into account: a
// hardest send of one type is seen by whoever both it and hardestSend allow.
export function visibilityOf(privacy: ProfilePrivacy, section: ProfileSection): Visibility {
  if (!HARDEST_SEND_PART_IDS.includes(section)) return privacy[section];
  const own = VISIBILITIES.indexOf(privacy[section]);
  return VISIBILITIES[Math.max(own, VISIBILITIES.indexOf(privacy.hardestSend))];
}

// What a new account starts with: every part shown to everyone.
export const DEFAULT_PRIVACY = Object.fromEntries(
  PROFILE_SECTIONS.map((section) => [section, "everyone"]),
) as ProfilePrivacy;

// Anything they haven't chosen is left as the default. Older accounts may not
// have chosen anything. Choices for parts that no longer exist are dropped.
export function privacyOf(user: User): ProfilePrivacy {
  const saved = user.settings?.privacy ?? {};
  return Object.fromEntries(
    PROFILE_SECTIONS.map((section) => [section, saved[section] ?? DEFAULT_PRIVACY[section]]),
  ) as ProfilePrivacy;
}

// Whether someone other than the owner can see a part. `isFriend` when they
// and the owner follow each other - see follows.ts.
export function isVisibleToOthers(visibility: Visibility, isFriend: boolean) {
  return visibility === "everyone" || (visibility === "friends" && isFriend);
}

// Checks a full set of choices from a request body. A page from before the
// hardest send of each type could be chosen doesn't send those, so they're
// kept as `current` has them.
export function readPrivacy(value: unknown, current: ProfilePrivacy): ProfilePrivacy | { error: string } {
  const body = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const known = new Set<string>(PROFILE_SECTIONS);
  const valid =
    Object.keys(body).every((key) => known.has(key)) &&
    PROFILE_SECTIONS.every(
      (section) =>
        VISIBILITIES.includes(body[section] as Visibility) ||
        (body[section] === undefined && HARDEST_SEND_PART_IDS.includes(section)),
    );
  if (!valid) return { error: "Choose who can see each part of your profile." };
  return Object.fromEntries(
    PROFILE_SECTIONS.map((section) => [section, (body[section] as Visibility | undefined) ?? current[section]]),
  ) as ProfilePrivacy;
}
