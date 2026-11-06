// The logged-in visitor's own account, for sign-up and their profile page.
// Mirrors api/src/functions/account.ts.

import { apiUrl } from "@/lib/api";
import type { ProfilePrivacy } from "@/lib/privacy";
import type { SessionUser } from "@/lib/session";

// Keep in sync with api/src/accountFields.ts.
export const MAX_NAME_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 512;
export const MAX_PHONE_DIGITS = 15;
// Something before the @, and a "." with text either side somewhere after it.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "A number", test: (p: string) => /[0-9]/.test(p) },
];

// Email and phone are "" when they haven't given one.
export type Account = {
  userID: string;
  username: string;
  fname: string;
  lname: string;
  email: string;
  phone: string;
  avatarUpdatedAt?: string;
  privacy: ProfilePrivacy;
  cookies: CookieSettings;
};

// Whether the site can use cookies it could do without. Off until they turn
// it on - there aren't any yet. Mirrors CookieSettings in api/src/models/User.ts.
export type CookieSettings = { optional: boolean };

export type AccountDetails = Pick<Account, "fname" | "lname" | "email" | "phone">;

// Errors carry the API's message, written for the visitor to read.
async function accountRequest(path: string, init: RequestInit = {}) {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  }).catch(() => {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}

export async function fetchAccount(): Promise<Account> {
  return (await accountRequest("/account")) as Account;
}

// Returns the account as saved, and who they are now for the header - their
// first name is part of it.
export async function saveAccount(details: AccountDetails): Promise<{ account: Account; user: SessionUser }> {
  return accountRequest("/account", { method: "PUT", body: JSON.stringify(details) });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await accountRequest("/account/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) });
}

// Returns the choices as saved.
export async function savePrivacy(privacy: ProfilePrivacy): Promise<ProfilePrivacy> {
  const body = await accountRequest("/account/privacy", { method: "PUT", body: JSON.stringify({ privacy }) });
  return body.privacy as ProfilePrivacy;
}

// Returns the choice as saved.
export async function saveCookies(optional: boolean): Promise<CookieSettings> {
  const body = await accountRequest("/account/cookies", { method: "PUT", body: JSON.stringify({ optional }) });
  return body.cookies as CookieSettings;
}

// A copy of what's saved about them: their account, or every comment they've
// left. Both exactly as the database has them, bar their password hash.
export async function fetchAccountData(part: "user" | "comments"): Promise<unknown> {
  return accountRequest(`/account/data/${part}`);
}

// Wipes their details and logs them out - see deleteAccount in
// api/src/functions/account.ts.
export async function deleteAccount(password: string): Promise<void> {
  await accountRequest("/account", { method: "DELETE", body: JSON.stringify({ password }) });
}

// `avatar` is a data URL from renderAvatar. Returns who they are now, with
// the new picture's version.
export async function uploadAvatar(userID: string, avatar: string): Promise<SessionUser> {
  const body = await accountRequest(`/avatars/${encodeURIComponent(userID)}`, {
    method: "PUT",
    body: JSON.stringify({ avatar }),
  });
  return body.user as SessionUser;
}
