import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../cosmosClient";
import {
  buildSessionCookie,
  corsHeaders,
  hashPassword,
  newUserId,
  signSessionToken,
  toSessionUser,
  UserRecord,
} from "../authUtils";

const CONTAINER_ID = "users";

type RegisterBody = {
  name?: string;
  email?: string;
  phone?: string;
  username?: string;
  password?: string;
};

export async function authRegister(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const body = (await request.json()) as RegisterBody;
    const name = body.name?.trim();
    const username = body.username?.trim().toLowerCase();
    const email = body.email?.trim().toLowerCase() || undefined;
    const phone = body.phone?.trim() || undefined;

    if (!name || !username) {
      return { status: 400, headers, jsonBody: { error: "Name and username are required." } };
    }
    if (!body.password) {
      return { status: 400, headers, jsonBody: { error: "Password is required." } };
    }

    // Email and phone are optional, but must still be unique when provided.
    const conditions = ["c.username = @username"];
    const parameters = [{ name: "@username", value: username }];
    if (email) {
      conditions.push("c.email = @email");
      parameters.push({ name: "@email", value: email });
    }
    if (phone) {
      conditions.push("c.phone = @phone");
      parameters.push({ name: "@phone", value: phone });
    }

    const container = getContainer(CONTAINER_ID);
    const { resources: existing } = await container.items
      .query({ query: `SELECT * FROM c WHERE ${conditions.join(" OR ")}`, parameters })
      .fetchAll();

    if (existing.length > 0) {
      return {
        status: 409,
        headers,
        jsonBody: { error: "An account with that username, email, or phone already exists." },
      };
    }

    const user: UserRecord = {
      id: newUserId(),
      username,
      name,
      email,
      phone,
      passwordHash: await hashPassword(body.password),
      createdAt: new Date().toISOString(),
    };

    await container.items.create(user);

    const token = signSessionToken(toSessionUser(user));
    return {
      status: 201,
      headers,
      cookies: [buildSessionCookie(token)],
      jsonBody: { user: toSessionUser(user) },
    };
  } catch (error) {
    context.error("Failed to register user", error);
    return { status: 500, headers, jsonBody: { error: "Failed to create account." } };
  }
}

app.http("authRegister", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/register",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return authRegister(request, context);
  },
});
