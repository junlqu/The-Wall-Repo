import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../cosmosClient";
import { buildSessionCookie, corsHeaders, signSessionToken, toSessionUser, verifyPassword } from "../authUtils";
import { User, USER_CONTAINER } from "../models/User";

type LoginBody = {
  identifier?: string; // email, username, or phone
  password?: string;
};

export async function authLogin(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const body = (await request.json()) as LoginBody;
    const identifier = body.identifier?.trim();
    const password = body.password;

    if (!identifier || !password) {
      return { status: 400, headers, jsonBody: { error: "Identifier and password are required." } };
    }

    const container = getContainer(USER_CONTAINER);
    const { resources } = await container.items
      .query({
        // Usernames are case-sensitive; emails aren't (sign-up stores them
        // lowercased, but older or hand-made accounts can have capitals).
        query: `SELECT * FROM c WHERE c.username = @identifier OR c.phone = @identifier
          OR STRINGEQUALS(c.email, @identifier, true)`,
        parameters: [{ name: "@identifier", value: identifier }],
      })
      .fetchAll();

    const user = resources[0] as User | undefined;
    // A deleted account's password is already unguessable - this is belt and braces.
    if (!user || user.deletedAt || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return { status: 401, headers, jsonBody: { error: "Incorrect login or password." } };
    }

    const token = signSessionToken(toSessionUser(user));
    return {
      status: 200,
      headers,
      cookies: [buildSessionCookie(token)],
      jsonBody: { user: toSessionUser(user) },
    };
  } catch (error) {
    context.error("Failed to log in", error);
    return { status: 500, headers, jsonBody: { error: "Failed to log in." } };
  }
}

app.http("authLogin", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/login",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return authLogin(request, context);
  },
});
