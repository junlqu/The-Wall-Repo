import { randomUUID } from "node:crypto";
import { Cookie, HttpRequest, HttpResponseInit } from "@azure/functions";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { canUseAdminTools, User, UserLevel } from "./models/User";

export type SessionUser = {
  userID: string;
  username: string;
  fname: string;
  level: UserLevel;
  avatarUpdatedAt?: string;
};

const SESSION_COOKIE_NAME = "wall_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET app setting.");
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function newUserId(): string {
  return randomUUID();
}

export function signSessionToken(user: SessionUser): string {
  return jwt.sign(user, getJwtSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function buildSessionCookie(token: string): Cookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function buildClearedSessionCookie(): Cookie {
  return { ...buildSessionCookie(""), maxAge: 0 };
}

// The signed-in user from the request's session cookie, or null when there is
// no valid session (missing, expired, or tampered with).
export function readSessionUser(request: HttpRequest): SessionUser | null {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  if (!token) return null;

  const secret = getJwtSecret();
  try {
    const { userID, username, fname, level, avatarUpdatedAt } = jwt.verify(token, secret) as SessionUser;
    return { userID, username, fname, level, avatarUpdatedAt };
  } catch {
    return null;
  }
}

// The 401/403 to send back when the request isn't from someone logged in who
// can use the admin tools (staff and admins), or null when it is. `forbidden`
// is the 403's message, naming what was refused.
export function rejectUnlessAdmin(
  request: HttpRequest,
  headers: Record<string, string>,
  forbidden = "Only staff and admins can change climbs.",
): HttpResponseInit | null {
  const session = readSessionUser(request);
  if (!session) {
    return { status: 401, headers, jsonBody: { error: "You need to be logged in." } };
  }
  if (!canUseAdminTools(session.level)) {
    return { status: 403, headers, jsonBody: { error: forbidden } };
  }
  return null;
}

export function toSessionUser(user: User): SessionUser {
  return {
    userID: user.userID,
    username: user.username,
    fname: user.fname,
    level: user.level,
    avatarUpdatedAt: user.avatarUpdatedAt,
  };
}

// Local dev runs the website and the Functions API on different ports, so
// requests are cross-origin - reflect the request's own origin (rather than
// "*") since a session cookie requires Access-Control-Allow-Credentials.
export function corsHeaders(request: HttpRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
