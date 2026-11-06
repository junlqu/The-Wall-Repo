import { randomBytes } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { isValidPassword, PASSWORD_RULES_MESSAGE, readAccountDetails } from "../accountFields";
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  corsHeaders,
  hashPassword,
  readCurrentUser,
  readSessionUser,
  signSessionToken,
  toSessionUser,
  verifyPassword,
} from "../authUtils";
import { getStarterAvatar } from "../avatarUtils";
import { getContainer } from "../cosmosClient";
import { Avatar, AVATAR_CONTAINER } from "../models/Avatar";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { cookiesOf, settingsPatch, User, USER_CONTAINER } from "../models/User";
import { privacyOf, readPrivacy } from "../profilePrivacy";

// The logged-in visitor's own account, for their profile page. Their username
// is shown but can't be changed here; their picture goes through
// PUT /avatars/{userID}.

const NOT_LOGGED_IN: HttpResponseInit = { status: 401, jsonBody: { error: "You need to be logged in." } };

// What the profile page shows. Never the password hash.
function toAccount(user: User) {
  return {
    userID: user.userID,
    username: user.username,
    fname: user.fname,
    lname: user.lname,
    email: user.email ?? "",
    phone: user.phone ?? "",
    avatarUpdatedAt: user.avatarUpdatedAt,
    privacy: privacyOf(user),
    cookies: cookiesOf(user),
  };
}

// GET /account
export async function getAccount(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { ...NOT_LOGGED_IN, headers };
    return { status: 200, headers, jsonBody: toAccount(user) };
  } catch (error) {
    context.error("Failed to read account", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load your account." } };
  }
}

// PUT /account - changes their name, email and phone. Email and phone can be
// cleared, but not taken from someone else's account.
export async function updateAccount(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return { ...NOT_LOGGED_IN, headers };
    const item = getContainer(USER_CONTAINER).item(session.userID, session.userID);
    const { resource: user } = await item.read<User>();
    if (!user || user.deletedAt) return { ...NOT_LOGGED_IN, headers };

    const details = readAccountDetails(await request.json().catch(() => null));
    if ("error" in details) return { status: 400, headers, jsonBody: { error: details.error } };
    const { email, phone } = details;

    const conditions: string[] = [];
    const parameters = [{ name: "@userID", value: user.userID }];
    if (email) {
      conditions.push("c.email = @email");
      parameters.push({ name: "@email", value: email });
    }
    if (phone) {
      conditions.push("c.phone = @phone");
      parameters.push({ name: "@phone", value: phone });
    }
    if (conditions.length > 0) {
      const { resources: taken } = await getContainer(USER_CONTAINER).items
        .query<{ email?: string; phone?: string }>({
          query: `SELECT c.email, c.phone FROM c WHERE c.userID != @userID AND (${conditions.join(" OR ")})`,
          parameters,
        })
        .fetchAll();
      if (taken.length > 0) {
        const what = taken.some((other) => email && other.email === email) ? "email" : "phone number";
        return { status: 409, headers, jsonBody: { error: `Another account already uses that ${what}.` } };
      }
    }

    // Blank email and phone are dropped from the document rather than kept
    // empty. Only saved if nothing else changed the account since it was read,
    // so a dashboard visit or level change in between isn't written over.
    const { resource: updated } = await item.replace<User>({ ...user, ...details }, { accessCondition: { type: "IfMatch", condition: user._etag } });
    const account = updated ?? { ...user, ...details };

    // The session token carries their first name, so reissue it.
    const sessionUser = toSessionUser(account);
    return {
      status: 200,
      headers,
      cookies: [buildSessionCookie(signSessionToken(sessionUser))],
      jsonBody: { account: toAccount(account), user: sessionUser },
    };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: "Your account changed while saving - try again." } };
    }
    context.error("Failed to update account", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save your details." } };
  }
}

// PUT /account/password - needs their current password as well as the new one.
export async function changePassword(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { ...NOT_LOGGED_IN, headers };

    const { currentPassword, newPassword } = ((await request.json().catch(() => null)) ?? {}) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return { status: 403, headers, jsonBody: { error: "Your current password is incorrect." } };
    }
    if (!isValidPassword(newPassword)) {
      return { status: 400, headers, jsonBody: { error: PASSWORD_RULES_MESSAGE } };
    }
    if (newPassword === currentPassword) {
      return { status: 400, headers, jsonBody: { error: "Your new password is the same as your current one." } };
    }

    await getContainer(USER_CONTAINER)
      .item(user.userID, user.userID)
      .patch([{ op: "set", path: "/passwordHash", value: await hashPassword(newPassword) }]);
    return { status: 204, headers };
  } catch (error) {
    context.error("Failed to change password", error);
    return { status: 500, headers, jsonBody: { error: "Failed to change your password." } };
  }
}

// PUT /account/privacy - who can see each part of their profile. Takes all of
// them at once.
export async function updatePrivacy(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { ...NOT_LOGGED_IN, headers };

    const privacy = readPrivacy(((await request.json().catch(() => null)) as { privacy?: unknown } | null)?.privacy);
    if ("error" in privacy) return { status: 400, headers, jsonBody: { error: privacy.error } };

    await getContainer(USER_CONTAINER)
      .item(user.userID, user.userID)
      .patch([settingsPatch(user, "privacy", privacy)]);
    return { status: 200, headers, jsonBody: { privacy } };
  } catch (error) {
    context.error("Failed to save privacy", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save your privacy settings." } };
  }
}

// PUT /account/cookies - whether the site can use cookies it could do
// without.
export async function updateCookies(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { ...NOT_LOGGED_IN, headers };

    const { optional } = ((await request.json().catch(() => null)) ?? {}) as { optional?: unknown };
    if (typeof optional !== "boolean") {
      return { status: 400, headers, jsonBody: { error: "Choose whether to allow optional cookies." } };
    }

    const cookies = { ...cookiesOf(user), optional };
    await getContainer(USER_CONTAINER)
      .item(user.userID, user.userID)
      .patch([settingsPatch(user, "cookies", cookies)]);
    return { status: 200, headers, jsonBody: { cookies } };
  } catch (error) {
    context.error("Failed to save cookie settings", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save your cookie settings." } };
  }
}

// What the database adds to every document for itself - not theirs.
function withoutSystemFields(document: object) {
  return Object.fromEntries(Object.entries(document).filter(([key]) => !key.startsWith("_")));
}

// GET /account/data/user - their account as it's saved, for them to keep.
// Everything but their password hash, which is no use to them and a risk if
// the file goes astray.
export async function exportUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { ...NOT_LOGGED_IN, headers };
    const { passwordHash: _passwordHash, ...rest } = user;
    return { status: 200, headers, jsonBody: withoutSystemFields(rest) };
  } catch (error) {
    context.error("Failed to export account", error);
    return { status: 500, headers, jsonBody: { error: "Failed to get your account data." } };
  }
}

// GET /account/data/comments - every comment they've left, as saved, oldest
// first. That includes the ones that are only a send, grade or rating.
export async function exportComments(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { ...NOT_LOGGED_IN, headers };
    const { resources } = await getContainer(COMMENT_CONTAINER)
      .items.query<Comment>({
        query: "SELECT * FROM c WHERE c.userID = @userID ORDER BY c.commentedAt ASC",
        parameters: [{ name: "@userID", value: user.userID }],
      })
      .fetchAll();
    return { status: 200, headers, jsonBody: resources.map(withoutSystemFields) };
  } catch (error) {
    context.error("Failed to export comments", error);
    return { status: 500, headers, jsonBody: { error: "Failed to get your comments." } };
  }
}

// DELETE /account - needs their password. The account isn't removed but
// emptied: everything that says who they were is wiped, so their comments and
// sends stay put without naming them. Their username and name become pieces
// of their userID, email and phone go, their password is swapped for one
// nobody knows and their picture goes back to their starter. Their settings
// stay, for recovering the account by hand. deletedAt then stops anyone
// logging in as them or opening their profile.
export async function deleteAccount(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) return { ...NOT_LOGGED_IN, headers };
    const item = getContainer(USER_CONTAINER).item(session.userID, session.userID);
    const { resource: user } = await item.read<User>();
    if (!user || user.deletedAt) return { ...NOT_LOGGED_IN, headers };

    const { password } = ((await request.json().catch(() => null)) ?? {}) as { password?: unknown };
    if (typeof password !== "string" || !(await verifyPassword(password, user.passwordHash))) {
      return { status: 403, headers, jsonBody: { error: "Your password is incorrect." } };
    }

    // Their picture goes first: if the rest then fails they can try again,
    // whereas a deleted account can't log back in to finish the job.
    const now = new Date().toISOString();
    const avatar: Avatar = { id: user.userID, userID: user.userID, avatar: getStarterAvatar(user.userID), updatedAt: now };
    await getContainer(AVATAR_CONTAINER).items.upsert(avatar);

    // 32 hex digits once the dashes are out.
    const digits = user.userID.replace(/-/g, "");
    const deleted: User = {
      ...user,
      username: digits.slice(0, 16),
      fname: digits.slice(16, 20),
      lname: digits.slice(20, 24),
      // Left off the document, as a blank email or phone always is.
      email: undefined,
      phone: undefined,
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      avatarUpdatedAt: now,
      deletedAt: now,
    };
    // Only if nothing else changed the account since it was read, as in
    // updateAccount.
    await item.replace<User>(deleted, { accessCondition: { type: "IfMatch", condition: user._etag } });

    return { status: 204, headers, cookies: [buildClearedSessionCookie()] };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: "Your account changed while deleting - try again." } };
    }
    context.error("Failed to delete account", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete your account." } };
  }
}

app.http("account", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "account",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    if (request.method === "DELETE") return deleteAccount(request, context);
    return request.method === "PUT" ? updateAccount(request, context) : getAccount(request, context);
  },
});

app.http("accountPassword", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/password",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return changePassword(request, context);
  },
});

app.http("accountPrivacy", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/privacy",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return updatePrivacy(request, context);
  },
});

app.http("accountCookies", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/cookies",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return updateCookies(request, context);
  },
});

// /account/data/user or /account/data/comments.
app.http("accountData", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "account/data/{part}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    if (request.params.part === "user") return exportUser(request, context);
    if (request.params.part === "comments") return exportComments(request, context);
    return { status: 404, headers: corsHeaders(request), jsonBody: { error: "Not found." } };
  },
});
