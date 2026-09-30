import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../cosmosClient";
import { buildSessionCookie, corsHeaders, signSessionToken, toSessionUser, UserRecord, verifyPassword } from "../authUtils";

const CONTAINER_ID = "users";

type LoginBody = {
  identifier?: string; // email, username, or phone
  password?: string;
};

export async function authLogin(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const body = (await request.json()) as LoginBody;
    const identifier = body.identifier?.trim().toLowerCase();
    const password = body.password;

    if (!identifier || !password) {
      return { status: 400, headers, jsonBody: { error: "Identifier and password are required." } };
    }

    const container = getContainer(CONTAINER_ID);
    const { resources } = await container.items
      .query({
        query:
          "SELECT * FROM c WHERE c.email = @identifier OR c.username = @identifier OR c.phone = @identifier",
        parameters: [{ name: "@identifier", value: identifier }],
      })
      .fetchAll();

    const user = resources[0] as UserRecord | undefined;
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
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
