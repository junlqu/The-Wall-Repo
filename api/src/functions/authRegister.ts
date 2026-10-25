import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../cosmosClient";
import { buildSessionCookie, corsHeaders, hashPassword, newUserId, signSessionToken, toSessionUser } from "../authUtils";
import { getStarterAvatar } from "../avatarUtils";
import { Avatar, AVATAR_CONTAINER } from "../models/Avatar";
import { User, USER_CONTAINER, USER_LEVEL } from "../models/User";

// Keep in sync with website/src/app/signup/page.tsx.
const MAX_NAME_LENGTH = 128;
const MAX_EMAIL_LENGTH = 512;
// Digits only, up to 15 - the longest number E.164 allows.
const PHONE_PATTERN = /^\d{1,15}$/;
// Something before the @, and a "." with text either side somewhere after it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RULES = [/.{8,}/, /[A-Z]/, /[a-z]/, /[0-9]/];

type RegisterBody = {
  fname?: string;
  lname?: string;
  email?: string;
  phone?: string;
  username?: string;
  password?: string;
};

export async function authRegister(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const body = (await request.json()) as RegisterBody;
    const fname = body.fname?.trim();
    const lname = body.lname?.trim();
    const username = body.username?.trim().toLowerCase();
    const email = body.email?.trim().toLowerCase() || undefined;
    const phone = body.phone?.trim() || undefined;

    if (!fname || !lname || !username) {
      return { status: 400, headers, jsonBody: { error: "First name, last name, and username are required." } };
    }
    if (fname.length > MAX_NAME_LENGTH || lname.length > MAX_NAME_LENGTH) {
      return { status: 400, headers, jsonBody: { error: `Names must be ${MAX_NAME_LENGTH} characters or fewer.` } };
    }
    if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
      return { status: 400, headers, jsonBody: { error: "Enter a valid email address." } };
    }
    if (phone && !PHONE_PATTERN.test(phone)) {
      return { status: 400, headers, jsonBody: { error: "Phone number can only contain digits." } };
    }
    if (!body.password || !PASSWORD_RULES.every((rule) => rule.test(body.password!))) {
      return {
        status: 400,
        headers,
        jsonBody: {
          error: "Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a number.",
        },
      };
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

    const container = getContainer(USER_CONTAINER);
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

    const userID = newUserId();
    const createdAt = new Date().toISOString();
    const user: User = {
      id: userID,
      userID,
      username,
      email,
      phone,
      fname,
      lname,
      passwordHash: await hashPassword(body.password),
      createdAt,
      avatarUpdatedAt: createdAt,
      level: USER_LEVEL.default,
    };

    await container.items.create(user);

    // Not fatal: GET /avatars/{userID} serves the same starter image when the
    // document is missing.
    try {
      const avatar: Avatar = { id: userID, userID, avatar: getStarterAvatar(userID), updatedAt: createdAt };
      await getContainer(AVATAR_CONTAINER).items.create(avatar);
    } catch (error) {
      context.warn("Failed to create starter avatar", error);
    }

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
