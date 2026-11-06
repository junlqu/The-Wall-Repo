// Anyone's profile: everything to its owner, and without what they've hidden
// to everyone else.

import { apiUrl } from "@/lib/api";
import { type ApiRoute, type ClimbComment, type ClimbPerson, toClimb } from "@/lib/climbs";
import type { DashboardComment, DashboardMetrics } from "@/lib/dashboard";
import type { ProfilePrivacy } from "@/lib/privacy";

// Each one is missing when it's hidden. `favouriteLine` is the line's number,
// or null when they haven't sent anything on one.
export type ProfileStats = Partial<Pick<DashboardMetrics, "sends" | "commentsPosted" | "hardestSend">> & {
  favouriteLine?: string | null;
};

export type Profile = ClimbPerson & {
  fname: string;
  // Just the first letter of their last name.
  lastInitial: string;
  stats: ProfileStats;
  // Newest first. Null when hidden.
  recentComments: DashboardComment[] | null;
  // Most recently sent first. Never on a climb that's gone. Null when hidden.
  recentSends: DashboardComment[] | null;
  // Only to the owner, when they're not seeing it as others do.
  privacy?: ProfilePrivacy;
};

// Mirrors getProfile in api/src/functions/profiles.ts.
type ApiComment = { comment: ClimbComment; climb: ApiRoute | null };
type ApiProfile = Omit<Profile, "recentComments" | "recentSends"> & {
  recentComments: ApiComment[] | null;
  recentSends: ApiComment[] | null;
};

// `asOthers` shows someone their own profile without the parts only they see.
export function profileHref(username: string, asOthers = false) {
  return `/profile?username=${encodeURIComponent(username)}${asOthers ? "&view=public" : ""}`;
}

// "Alex R."
export function displayName({ fname, lastInitial }: Pick<Profile, "fname" | "lastInitial">) {
  return lastInitial ? `${fname} ${lastInitial}.` : fname;
}

function toComment({ comment, climb }: ApiComment): DashboardComment {
  return { comment, climb: climb && toClimb(climb) };
}

// Null when nobody has that username. `asOthers` gets their own profile as
// everyone else does.
export async function fetchProfile(username: string, asOthers = false): Promise<Profile | null> {
  const path = `/profiles/${encodeURIComponent(username)}${asOthers ? "?view=public" : ""}`;
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load the profile (${res.status})`);
  const body = (await res.json()) as ApiProfile;
  return {
    ...body,
    recentComments: body.recentComments?.map(toComment) ?? null,
    recentSends: body.recentSends?.map(toComment) ?? null,
  };
}
