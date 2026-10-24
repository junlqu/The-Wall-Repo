import { randomUUID } from "node:crypto";
import { Cookie, HttpRequest } from "@azure/functions";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type UserRecord = {
  id: string;
  // Partition key of the Cosmos "User" container - always equal to id.
  userID: string;
  username: string;
  email?: string;
  phone?: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

export type SessionUser = {
  id: string;
  username: string;
  name: string;
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

export function toSessionUser(user: UserRecord): SessionUser {
  return { id: user.id, username: user.username, name: user.name };
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
