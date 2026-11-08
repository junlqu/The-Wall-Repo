"use client";

import { useEffect, useSyncExternalStore } from "react";
import { apiUrl } from "@/lib/api";

// Lowest to highest - a higher level has more control. Mirrors USER_LEVEL in
// api/src/models/User.ts.
export const USER_LEVEL = {
  member: 0,
  executive: 1, // club executives
  moderator: 2,
  staff: 3,
  admin: 4,
} as const;

// Mirrors SessionUser in api/src/authUtils.ts. `timedOutUntil` and
// `timeoutReason` are their timeout, when they have one - see timeoutOf.
export type SessionUser = {
  userID: string;
  username: string;
  fname: string;
  level: number;
  avatarUpdatedAt?: string;
  timedOutUntil?: string;
  timeoutReason?: string;
};

// Their timeout, if it's still running. While it is they can't post or edit
// comments, like updates or add combos - the API refuses, so pages say so
// up front instead.
export function timeoutOf(user: SessionUser | null | undefined): { endAt: string; reason: string } | null {
  if (!user?.timedOutUntil || user.timedOutUntil <= new Date().toISOString()) return null;
  return { endAt: user.timedOutUntil, reason: user.timeoutReason ?? "" };
}

// The session cookie is httpOnly, so the browser can't read it - the API's
// /auth/me tells us who is logged in. `undefined` means not checked yet.
let currentUser: SessionUser | null | undefined;
let sessionFetchStarted = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Staff and admins can use the admin tools. Mirrors canUseAdminTools in
// api/src/models/User.ts.
export function canUseAdminTools(user: Pick<SessionUser, "level"> | null | undefined) {
  return user != null && user.level >= USER_LEVEL.staff;
}

export function setSessionUser(user: SessionUser | null) {
  currentUser = user;
  listeners.forEach((listener) => listener());
}

export function useSessionUser(): SessionUser | null | undefined {
  const user = useSyncExternalStore(
    subscribe,
    () => currentUser,
    () => undefined,
  );

  useEffect(() => {
    if (sessionFetchStarted) return;
    sessionFetchStarted = true;
    fetchSession().then((user) => {
      // A login/signup that finished first already knows better.
      if (currentUser === undefined) setSessionUser(user ?? null);
    });
    // Checked again whenever they come back to the tab, so a ban - or a
    // login or logout in another tab - shows without a reload.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshSession();
    });
  }, []);

  return user;
}

// Who /auth/me says is logged in: null when nobody is, undefined when it
// couldn't be reached.
async function fetchSession(): Promise<SessionUser | null | undefined> {
  const res = await fetch(apiUrl("/auth/me"), { credentials: "include" }).catch(() => null);
  if (!res?.ok) return undefined;
  const body = await res.json().catch(() => null);
  return body ? (body.user ?? null) : undefined;
}

// Asks the API again who is logged in - a banned account comes back as
// nobody. If it can't be reached, they're left as they were.
export async function refreshSession() {
  const user = await fetchSession();
  if (user !== undefined && JSON.stringify(user) !== JSON.stringify(currentUser)) setSessionUser(user);
}

export async function logout() {
  await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include" }).catch(() => null);
  setSessionUser(null);
}
