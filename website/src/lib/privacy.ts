import type { ClimbType } from "@/lib/climbs";

// Who can see each part of someone's profile. Their picture, name and username
// are always shown. Mirrors api/src/profilePrivacy.ts.

export const PROFILE_SECTIONS = [
  { id: "sends", label: "Number of sends" },
  { id: "comments", label: "Number of comments" },
  { id: "hardestSend", label: "Hardest send" },
  // Each only narrows who sees it further than hardestSend does.
  { id: "hardestRoute", label: "Hardest route", under: "hardestSend" },
  { id: "hardestBoulder", label: "Hardest boulder", under: "hardestSend" },
  { id: "hardestCombo", label: "Hardest combo", under: "hardestSend" },
  { id: "favouriteLine", label: "Favourite line" },
  { id: "recentComments", label: "Most recent comments" },
  { id: "recentSends", label: "Most recent sends" },
  { id: "followers", label: "Number of followers" },
  { id: "following", label: "Number of people you follow" },
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number]["id"];

export const VISIBILITIES = [
  { id: "everyone", label: "Everyone" },
  { id: "friends", label: "Friends" },
  { id: "nobody", label: "No one" },
] as const;
export type Visibility = (typeof VISIBILITIES)[number]["id"];

export type ProfilePrivacy = Record<ProfileSection, Visibility>;

// The part for each type of climb's hardest send, under hardestSend.
export const HARDEST_SEND_PARTS = {
  route: "hardestRoute",
  boulder: "hardestBoulder",
  combo: "hardestCombo",
} as const satisfies Record<ClimbType, ProfileSection>;

const VISIBILITY_ORDER: Visibility[] = VISIBILITIES.map((visibility) => visibility.id);

// The narrower of two choices: Everyone, then Friends, then No one.
export function narrower(a: Visibility, b: Visibility): Visibility {
  return VISIBILITY_ORDER[Math.max(VISIBILITY_ORDER.indexOf(a), VISIBILITY_ORDER.indexOf(b))];
}

// Whether `visibility` lets in more people than `than`.
export function isWider(visibility: Visibility, than: Visibility) {
  return VISIBILITY_ORDER.indexOf(visibility) < VISIBILITY_ORDER.indexOf(than);
}

// Who can see a part, once what it's under is taken into account. Mirrors
// visibilityOf in api/src/profilePrivacy.ts.
export function visibilityOf(privacy: ProfilePrivacy, section: ProfileSection): Visibility {
  const parent = PROFILE_SECTIONS.find((each) => each.id === section);
  return parent && "under" in parent ? narrower(privacy[section], privacy[parent.under]) : privacy[section];
}
