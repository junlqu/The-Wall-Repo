"use client";

import { useEffect, useSyncExternalStore } from "react";
import { apiUrl } from "@/lib/api";

// Mirrors USER_LEVEL in api/src/models/User.ts.
export const USER_LEVEL = {
  default: 0,
  admin: 1,
} as const;

// Mirrors SessionUser in api/src/authUtils.ts.
export type SessionUser = {
  userID: string;
  username: string;
  fname: string;
  level: number;
  avatarUpdatedAt?: string;
};

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
    fetch(apiUrl("/auth/me"), { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.user ?? null)
      .catch(() => null)
      .then((user: SessionUser | null) => {
        // A login/signup that finished first already knows better.
        if (currentUser === undefined) setSessionUser(user);
      });
  }, []);

  return user;
}

export async function logout() {
  await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include" }).catch(() => null);
  setSessionUser(null);
}
