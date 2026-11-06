// Who can see each part of someone's profile. Their picture, name and username
// are always shown. Mirrors api/src/profilePrivacy.ts.

export const PROFILE_SECTIONS = [
  { id: "sends", label: "Number of sends" },
  { id: "comments", label: "Number of comments" },
  { id: "hardestSend", label: "Hardest send" },
  { id: "favouriteLine", label: "Favourite line" },
  { id: "recentComments", label: "Most recent comments" },
  { id: "recentSends", label: "Most recent sends" },
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number]["id"];

export const VISIBILITIES = [
  { id: "everyone", label: "Everyone" },
  { id: "friends", label: "Friends" },
  { id: "nobody", label: "No one" },
] as const;
export type Visibility = (typeof VISIBILITIES)[number]["id"];

export type ProfilePrivacy = Record<ProfileSection, Visibility>;
