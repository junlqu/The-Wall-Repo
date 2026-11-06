"use client";

// Following climbs (saving them, as the site calls it) and people. Both show
// what's new from them on the visitor's dashboard. Two people who follow each
// other are friends.

import { useSyncExternalStore } from "react";
import { adminRequest } from "@/lib/api";
import type { Climb } from "@/lib/climbs";
import { useSessionUser } from "@/lib/session";

// Climbs saved or unsaved since they were loaded, by `${userID}:${climbID}`.
// Laid over each climb's followerIDs, so every row, dropdown and page showing
// a climb agrees as soon as it changes, without loading the climbs again.
const savedOverrides = new Map<string, boolean>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setOverride(key: string, saved: boolean) {
  savedOverrides.set(key, saved);
  listeners.forEach((listener) => listener());
}

// Whether the logged-in visitor has saved the climb - false when nobody's
// logged in.
export function useClimbSaved(climb: Pick<Climb, "id" | "followerIDs">): boolean {
  const userID = useSessionUser()?.userID;
  const key = `${userID}:${climb.id}`;
  const override = useSyncExternalStore(
    subscribe,
    () => savedOverrides.get(key),
    () => undefined,
  );
  if (!userID) return false;
  return override ?? climb.followerIDs.includes(userID);
}

// Saves or unsaves the climb for the logged-in visitor, showing it straight
// away and putting it back if the request fails. Errors carry the API's
// message, written for them to read.
export async function setClimbSaved(userID: string, climbID: string, saved: boolean) {
  const key = `${userID}:${climbID}`;
  setOverride(key, saved);
  try {
    await adminRequest(`/routes/${encodeURIComponent(climbID)}/follow`, { method: saved ? "PUT" : "DELETE" });
  } catch (error) {
    setOverride(key, !saved);
    throw error;
  }
}

// Where the logged-in visitor stands with someone. Mirrors `relation` in
// getProfile, api/src/functions/profiles.ts.
export type FollowRelation = { follows: boolean; followedBy: boolean };

export function isFriend(relation: FollowRelation) {
  return relation.follows && relation.followedBy;
}

// Follows or unfollows them, answering with where the two of them now stand.
// Becoming (or no longer being) friends can change what their profile shows,
// so load it again after.
export async function setUserFollowed(username: string, follow: boolean): Promise<{ relation: FollowRelation }> {
  return adminRequest(`/profiles/${encodeURIComponent(username)}/follow`, { method: follow ? "PUT" : "DELETE" });
}

export type FollowList = "followers" | "following";

// Someone in a followers or following list. Mirrors ListedFollow in
// api/src/follows.ts.
export type ListedFollow = {
  userID: string;
  username: string;
  fname: string;
  lastInitial: string;
  avatarUpdatedAt?: string;
  // Whether the two of them follow each other.
  mutual: boolean;
};

// Everyone who follows the logged-in visitor, or who they follow, most recent
// first. Only for their own profile.
export async function fetchFollowList(username: string, list: FollowList): Promise<ListedFollow[]> {
  const body = await adminRequest(`/profiles/${encodeURIComponent(username)}/${list}`, {});
  return (body as { users: ListedFollow[] }).users;
}
