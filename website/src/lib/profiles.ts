// Anyone's profile, as everyone else sees it.

import { apiUrl } from "@/lib/api";
import { type ApiRoute, type ClimbComment, type ClimbPerson, toClimb } from "@/lib/climbs";
import type { DashboardComment, DashboardMetrics } from "@/lib/dashboard";

export type Profile = ClimbPerson & {
  fname: string;
  // Just the first letter of their last name.
  lastInitial: string;
  metrics: DashboardMetrics;
  // Newest first.
  recentComments: DashboardComment[];
  // Most recently sent first. Never on a climb that's gone.
  recentSends: DashboardComment[];
};

// Mirrors getProfile in api/src/functions/profiles.ts.
type ApiComment = { comment: ClimbComment; climb: ApiRoute | null };
type ApiProfile = Omit<Profile, "recentComments" | "recentSends"> & {
  recentComments: ApiComment[];
  recentSends: ApiComment[];
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

// Null when nobody has that username.
export async function fetchProfile(username: string): Promise<Profile | null> {
  const res = await fetch(apiUrl(`/profiles/${encodeURIComponent(username)}`), { credentials: "include" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load the profile (${res.status})`);
  const body = (await res.json()) as ApiProfile;
  return {
    ...body,
    recentComments: body.recentComments.map(toComment),
    recentSends: body.recentSends.map(toComment),
  };
}
