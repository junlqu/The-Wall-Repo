import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  corsHeaders,
  readCurrentUser,
  readSessionUser,
  SessionUser,
  signSessionToken,
  toSessionUser,
} from "../authUtils";

// Logged-out visitors get 200 with `user: null` rather than a 401, since not
// being logged in is a normal state for the header to render.
export async function authMe(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return { status: 200, headers, jsonBody: { user: null } };

    // The token holds the account as it was at login. If it's changed since -
    // a new level, most of all - send the account as it is now and reissue
    // the token to match. An account that's gone logs them out.
    const account = await readCurrentUser(request);
    if (!account) {
      return { status: 200, headers, cookies: [buildClearedSessionCookie()], jsonBody: { user: null } };
    }
    const user = toSessionUser(account);
    const changed = (Object.keys(user) as (keyof SessionUser)[]).some((key) => user[key] !== session[key]);
    return {
      status: 200,
      headers,
      cookies: changed ? [buildSessionCookie(signSessionToken(user))] : undefined,
      jsonBody: { user },
    };
  } catch (error) {
    context.error("Failed to read session", error);
    return { status: 500, headers, jsonBody: { error: "Failed to read session." } };
  }
}

app.http("authMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return authMe(request, context);
  },
});
