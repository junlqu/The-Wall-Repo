import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { eraseAccount } from "../accountDeletion";
import { MAX_USERNAME_LENGTH, readAccountDetails } from "../accountFields";
import { corsHeaders, readCurrentUser, rejectUnlessAdmin } from "../authUtils";
import { getStarterAvatar } from "../avatarUtils";
import { readClimbs } from "../climbLinks";
import { isNotFound, PublicPerson, readPeople, toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Avatar, AVATAR_CONTAINER } from "../models/Avatar";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { activeBan, activeTimeout, Ban, isUserLevel, Timeout, User, USER_CONTAINER, USER_LEVEL } from "../models/User";

const FORBIDDEN = "Only staff and admins can look up users.";
const NOT_FOUND = "That account doesn't exist any more.";
// For bans and timeouts alike. Mirrors MAX_RESTRICTION_DAYS and
// MAX_RESTRICTION_REASON_LENGTH in website/src/lib/users.ts - the longest the
// page's wheels go is 365 days, 23 hours and 59 minutes.
const MAX_RESTRICTION_MINUTES = (365 * 24 + 23) * 60 + 59;
const MAX_RESTRICTION_REASON_LENGTH = 500;
const LEADERBOARD_SIZE = 10;
// Mirrors USER_COMMENTS_PAGE in website/src/lib/users.ts.
const COMMENTS_PAGE = 10;
const MAX_COMMENTS_OFFSET = 10000;
// Mirrors USER_PAGE_SIZES in website/src/lib/users.ts.
const PAGE_SIZES = [10, 25, 50, 100];
const MAX_SEARCH_LENGTH = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// The fields a search looks through, highest priority first - a user who
// matches on more than one is shown matching on the first.
const SEARCH_FIELDS = ["username", "fname", "lname", "email", "phone"] as const;
type SearchField = (typeof SEARCH_FIELDS)[number];

// Where a search hit a user: the field, its whole value, and the part of it
// that matched, so the page can highlight it.
type SearchMatch = { field: SearchField; value: string; start: number; length: number };

type Leader = PublicPerson & { count: number };

// GROUP BY gives one row per person; the biggest counts come first.
async function countByUser(filter: string): Promise<{ userID: string; count: number }[]> {
  try {
    const { resources } = await getContainer(COMMENT_CONTAINER)
      .items.query<{ userID: string; count: number }>(
        `SELECT c.userID, COUNT(1) AS count FROM c WHERE ${filter} GROUP BY c.userID`,
      )
      .fetchAll();
    return resources.sort((a, b) => b.count - a.count || a.userID.localeCompare(b.userID));
  } catch (error) {
    // The container may not exist until comments can be posted.
    if (isNotFound(error)) return [];
    throw error;
  }
}

// The top of a count, leaving out anyone whose account is gone.
function leaders(counts: { userID: string; count: number }[], people: Map<string, PublicPerson>): Leader[] {
  return counts
    .slice(0, LEADERBOARD_SIZE)
    .flatMap(({ userID, count }) => {
      const person = people.get(userID);
      return person ? [{ ...person, count }] : [];
    });
}

// The earliest moment the activity chart can reach back to: the start of the
// year or a week ago, whichever is earlier, less a day so the page can
// bucket by its own timezone.
function activitySince(now: Date) {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  return new Date(Math.min(startOfYear, now.getTime() - 7 * ONE_DAY_MS) - ONE_DAY_MS).toISOString();
}

// When each user joined, each comment with text was posted, and each send
// happened, since `since` - the page counts them up per day. A send is dated
// by the day its climber said they sent it (a YYYY-MM-DD in their own
// timezone), or when it was logged for sends from before that was asked.
async function readActivity(since: string) {
  const parameters = [
    { name: "@since", value: since },
    { name: "@sinceDay", value: since.slice(0, 10) },
  ];
  const [{ resources: users }, comments] = await Promise.all([
    getContainer(USER_CONTAINER)
      .items.query<string>({ query: "SELECT VALUE c.createdAt FROM c WHERE c.createdAt >= @since", parameters })
      .fetchAll(),
    getContainer(COMMENT_CONTAINER)
      .items.query<{ commentedAt: string; hasText: boolean; send?: boolean; sentAt?: string }>({
        query: `SELECT c.commentedAt, c.comment != "" AS hasText, c.send, c.sentAt FROM c
                WHERE c.commentedAt >= @since OR c.sentAt >= @sinceDay`,
        parameters,
      })
      .fetchAll()
      .then(({ resources }) => resources)
      .catch((error) => {
        if (isNotFound(error)) return [];
        throw error;
      }),
  ]);
  return {
    users,
    comments: comments
      .filter((comment) => comment.hasText && comment.commentedAt >= since)
      .map((comment) => comment.commentedAt),
    sends: comments.filter((comment) => comment.send).map((comment) => comment.sentAt ?? comment.commentedAt),
  };
}

// GET /users/stats - how many users, comments and sends there are, who's
// commented and sent the most, and when each recent one happened. Only
// comments with text are counted as comments, as on the climbs.
export async function getUserStats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const [{ resources: userCount }, commentCounts, sendCounts, activity] = await Promise.all([
      getContainer(USER_CONTAINER).items.query<number>("SELECT VALUE COUNT(1) FROM c").fetchAll(),
      countByUser('c.comment != ""'),
      countByUser("c.send = true"),
      readActivity(activitySince(new Date())),
    ]);
    const people = await readPeople(
      [...commentCounts.slice(0, LEADERBOARD_SIZE), ...sendCounts.slice(0, LEADERBOARD_SIZE)].map(
        ({ userID }) => userID,
      ),
    );

    return {
      status: 200,
      headers,
      jsonBody: {
        totalUsers: userCount[0] ?? 0,
        totalComments: commentCounts.reduce((total, { count }) => total + count, 0),
        totalSends: sendCounts.reduce((total, { count }) => total + count, 0),
        topCommenters: leaders(commentCounts, people),
        topSenders: leaders(sendCounts, people),
        activity,
      },
    };
  } catch (error) {
    context.error("Failed to fetch user stats", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the user stats." } };
  }
}

// Phone numbers are stored as digits only, so they're searched by the
// search's digits - "(416) 555" finds 416555....
function phoneDigits(search: string) {
  return search.replace(/\D/g, "");
}

// Only the part of an email before the @ is searched - otherwise "gmail"
// would find half the club. Mirrors the LEFT(...INDEX_OF...) in listUsers.
function searchablePart(field: SearchField, value: string) {
  return field === "email" ? value.slice(0, Math.max(0, value.indexOf("@"))) : value;
}

function findMatch(user: Partial<User>, search: string): SearchMatch | null {
  const lowered = search.toLowerCase();
  const digits = phoneDigits(search);
  for (const field of SEARCH_FIELDS) {
    const value = user[field];
    const needle = field === "phone" ? digits : lowered;
    // The whole value is sent back, so the highlight sits in the full email.
    const start = value && needle ? searchablePart(field, value).toLowerCase().indexOf(needle) : -1;
    if (start !== -1) return { field, value: value!, start, length: needle.length };
  }
  return null;
}

// GET /users?search=&page=&pageSize=&level= - one page of users, newest
// first. A search keeps those whose username, first or last name, email
// (before the @) or phone contains it, ignoring case, and says where each one
// matched. `level` keeps only those at that level. Email and phone are only
// sent back as that match.
export async function listUsers(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const search = (request.query.get("search") ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
    const requestedSize = Number(request.query.get("pageSize"));
    const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : PAGE_SIZES[0];
    const page = Math.max(1, Math.floor(Number(request.query.get("page")) || 1));

    const levelParam = request.query.get("level");
    const level = levelParam === null ? null : Number(levelParam);
    if (level !== null && !isUserLevel(level)) {
      return { status: 400, headers, jsonBody: { error: "That isn't a level." } };
    }

    const parameters = [
      { name: "@search", value: search },
      { name: "@digits", value: phoneDigits(search) },
      { name: "@level", value: level },
    ];
    const conditions = [];
    if (search) {
      conditions.push(`(CONTAINS(c.username, @search, true) OR CONTAINS(c.fname, @search, true)
        OR CONTAINS(c.lname, @search, true)
        OR CONTAINS(LEFT(c.email, INDEX_OF(c.email, "@")), @search, true)
        OR (@digits != "" AND CONTAINS(c.phone, @digits)))`);
    }
    if (level !== null) conditions.push("c.level = @level");
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const container = getContainer(USER_CONTAINER);
    const [{ resources: total }, { resources: users }] = await Promise.all([
      container.items.query<number>({ query: `SELECT VALUE COUNT(1) FROM c ${where}`, parameters }).fetchAll(),
      container.items
        .query<Partial<User>>({
          query: `SELECT c.userID, c.username, c.fname, c.lname, c.email, c.phone, c.createdAt, c.avatarUpdatedAt,
                    c.level
                  FROM c ${where} ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit`,
          parameters: [
            ...parameters,
            { name: "@offset", value: (page - 1) * pageSize },
            { name: "@limit", value: pageSize },
          ],
        })
        .fetchAll(),
    ]);

    return {
      status: 200,
      headers,
      jsonBody: {
        total: total[0] ?? 0,
        page,
        pageSize,
        users: users.map((user) => ({
          ...toListedUser(user),
          match: search ? findMatch(user, search) : null,
        })),
      },
    };
  } catch (error) {
    context.error("Failed to list users", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load users." } };
  }
}

// What the admin pages show of someone - never their email, phone or
// password hash.
function toListedUser(user: Partial<User>) {
  return {
    userID: user.userID,
    username: user.username,
    fname: user.fname,
    lname: user.lname,
    createdAt: user.createdAt,
    avatarUpdatedAt: user.avatarUpdatedAt,
    level: user.level ?? USER_LEVEL.member,
  };
}

// GET /users/permissions - everyone above member, newest first, for the
// permissions page to sort into its levels.
export async function listPermissionUsers(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { resources } = await getContainer(USER_CONTAINER)
      .items.query<Partial<User>>({
        query: `SELECT c.userID, c.username, c.fname, c.lname, c.createdAt, c.avatarUpdatedAt, c.level
                FROM c WHERE c.level > @member ORDER BY c.createdAt DESC`,
        parameters: [{ name: "@member", value: USER_LEVEL.member }],
      })
      .fetchAll();
    return { status: 200, headers, jsonBody: resources.map(toListedUser) };
  } catch (error) {
    context.error("Failed to list user levels", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load user levels." } };
  }
}

// PUT /users/{userID}/level { level, from } - moves someone to another level.
// Whoever does it has to be above both the level the person is at and the
// level they're moving to - nobody can move someone at their own level,
// themselves included, or bring anyone up to it. Both levels are read fresh
// from the database, not
// from the session. `from` is the level the page showed them at; if they've
// been moved since, nothing changes.
export async function setUserLevel(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;
    const actor = (await readCurrentUser(request))!;

    const { level, from } = (await request.json().catch(() => ({}))) as { level?: unknown; from?: unknown };
    if (!isUserLevel(level) || (from !== undefined && !isUserLevel(from))) {
      return { status: 400, headers, jsonBody: { error: "That isn't a level." } };
    }

    const { userID } = request.params;
    if (userID === actor.userID) {
      return { status: 403, headers, jsonBody: { error: "You can't change your own level." } };
    }

    const item = getContainer(USER_CONTAINER).item(userID, userID);
    const { resource: user } = await item.read<User>();
    if (!user) return { status: 404, headers, jsonBody: { error: "That account doesn't exist any more." } };

    const current = user.level ?? USER_LEVEL.member;
    if ((from !== undefined && from !== current) || level === current) {
      return { status: 409, headers, jsonBody: { error: "Their level has changed - refresh and try again." } };
    }
    if (current >= actor.level || level >= actor.level) {
      return {
        status: 403,
        headers,
        jsonBody: { error: "You can only move people below your own level, to another level below yours." },
      };
    }

    // Only saves if nobody else has changed them since they were read.
    const { resource: updated } = await item.patch<User>([{ op: "set", path: "/level", value: level }], {
      accessCondition: { type: "IfMatch", condition: user._etag },
    });
    return { status: 200, headers, jsonBody: toListedUser(updated ?? { ...user, level }) };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: "Their level has changed - refresh and try again." } };
    }
    context.error("Failed to change a user's level", error);
    return { status: 500, headers, jsonBody: { error: "Failed to change their level." } };
  }
}

// Everything the admin user panel shows of someone - their listing plus
// their email and phone ("" when they haven't given one), when the account
// was deleted, if it was, and every ban and timeout they've had, oldest
// first, each with who gave it (`by`, null if that account is gone). Never
// their password hash.
async function toUserDetails(user: User) {
  const bans = user.ban ?? [];
  const timeouts = user.timeout ?? [];
  const people = await readPeople([
    ...bans.map((ban) => ban.bannedBy),
    ...timeouts.map((timeout) => timeout.timedOutBy),
  ]);
  const shown = ({ startAt, endAt, reason }: Ban | Timeout, by: string) => ({
    startAt,
    endAt,
    reason,
    by: people.get(by) ?? null,
  });
  return {
    ...toListedUser(user),
    email: user.email ?? "",
    phone: user.phone ?? "",
    deletedAt: user.deletedAt,
    ban: bans.map((ban) => shown(ban, ban.bannedBy)),
    timeout: timeouts.map((timeout) => shown(timeout, timeout.timedOutBy)),
  };
}

// Why `actor` can't edit, ban, time out or delete `user`, or null when they
// can. As with levels, only people below your own level - your own account
// is changed, or deleted, from Settings. Mirrors editLockedReason in
// website/src/lib/users.ts.
function refusal(actor: User, user: User, action: "edit" | "ban" | "timeout" | "delete"): string | null {
  const doing = action === "timeout" ? "time out" : action;
  if (user.userID === actor.userID) {
    if (action === "edit") return "Change your own account from Settings.";
    if (action === "delete") return "Delete your own account from Settings.";
    return `You can't ${doing} yourself.`;
  }
  if ((user.level ?? USER_LEVEL.member) >= actor.level) {
    return `You can only ${doing} people below your own level.`;
  }
  if (user.deletedAt) return "That account has been deleted.";
  return null;
}

// GET /users/{userID} - one person's account, for the admin user panel.
export async function getUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { userID } = request.params;
    const { resource: user } = await getContainer(USER_CONTAINER).item(userID, userID).read<User>();
    if (!user) return { status: 404, headers, jsonBody: { error: NOT_FOUND } };
    return { status: 200, headers, jsonBody: await toUserDetails(user) };
  } catch (error) {
    context.error("Failed to read a user", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load their account." } };
  }
}

// PUT /users/{userID} { username, fname, lname, email, phone, resetAvatar } -
// changes someone's account for them. The same rules as sign-up and Settings
// apply: names are required, email and phone are optional, and username,
// email and phone can't be one another account already has. `resetAvatar`
// puts their picture back to their starter. See editRefusal for who can be
// edited.
export async function updateUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;
    const actor = (await readCurrentUser(request))!;

    const { userID } = request.params;
    const item = getContainer(USER_CONTAINER).item(userID, userID);
    const { resource: user } = await item.read<User>();
    if (!user) return { status: 404, headers, jsonBody: { error: NOT_FOUND } };
    const refused = refusal(actor, user, "edit");
    if (refused) return { status: 403, headers, jsonBody: { error: refused } };

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    // Kept as typed, as at sign-up - usernames can mix upper and lowercase.
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!username) return { status: 400, headers, jsonBody: { error: "Username is required." } };
    if (username.length > MAX_USERNAME_LENGTH) {
      return { status: 400, headers, jsonBody: { error: `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.` } };
    }
    const details = readAccountDetails(body);
    if ("error" in details) return { status: 400, headers, jsonBody: { error: details.error } };
    const { email, phone } = details;
    const resetAvatar = body.resetAvatar === true;

    // Ignoring case for username and email, as sign-up does - profile links
    // ignore case, so two usernames differing only by it would clash there.
    const conditions = ["STRINGEQUALS(c.username, @username, true)"];
    const parameters = [
      { name: "@userID", value: userID },
      { name: "@username", value: username },
    ];
    if (email) {
      conditions.push("STRINGEQUALS(c.email, @email, true)");
      parameters.push({ name: "@email", value: email });
    }
    if (phone) {
      conditions.push("c.phone = @phone");
      parameters.push({ name: "@phone", value: phone });
    }
    const { resources: taken } = await getContainer(USER_CONTAINER)
      .items.query<{ username: string; email?: string; phone?: string }>({
        query: `SELECT c.username, c.email, c.phone FROM c WHERE c.userID != @userID AND (${conditions.join(" OR ")})`,
        parameters,
      })
      .fetchAll();
    if (taken.length > 0) {
      const what = taken.some((other) => other.username.toLowerCase() === username.toLowerCase())
        ? "username"
        : taken.some((other) => email && other.email?.toLowerCase() === email)
          ? "email"
          : "phone number";
      return { status: 409, headers, jsonBody: { error: `Another account already uses that ${what}.` } };
    }

    // The picture goes first, as when an account is deleted: if the account
    // then fails to save, trying again resets it again and moves the
    // version, so nobody is left with the old one cached under a new URL.
    const now = new Date().toISOString();
    if (resetAvatar) {
      const avatar: Avatar = { id: userID, userID, avatar: getStarterAvatar(userID), updatedAt: now };
      await getContainer(AVATAR_CONTAINER).items.upsert(avatar);
    }

    // Blank email and phone are dropped from the document, as in Settings.
    // Only saved if nothing else changed the account since it was read. Their
    // session picks up the change on its next GET /auth/me.
    const next: User = { ...user, username, ...details, ...(resetAvatar ? { avatarUpdatedAt: now } : {}) };
    const { resource: updated } = await item.replace<User>(next, {
      accessCondition: { type: "IfMatch", condition: user._etag },
    });
    return { status: 200, headers, jsonBody: await toUserDetails(updated ?? next) };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: "Their account changed while saving - refresh and try again." } };
    }
    context.error("Failed to update a user", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save their account." } };
  }
}

// GET /users/{userID}/comments?offset= - a page of everything someone has
// commented, newest first - those that are only a send, grade or rating too -
// with how many there are in all and whether there are more. Each comes with
// its climb, or null if that's gone. For the admin user panel, so anyone's,
// whatever their privacy settings, and a deleted account's too.
export async function listUserComments(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const offset = Number(request.query.get("offset") ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > MAX_COMMENTS_OFFSET) {
      return { status: 400, headers, jsonBody: { error: "That isn't a valid page of comments." } };
    }

    const { userID } = request.params;
    const parameters = [{ name: "@userID", value: userID }];
    const container = getContainer(COMMENT_CONTAINER);
    const [{ resources }, { resources: counts }] = await Promise.all([
      // One more than a page, to tell whether there's another after it.
      container.items
        .query<Comment>({
          query: "SELECT * FROM c WHERE c.userID = @userID ORDER BY c.commentedAt DESC OFFSET @offset LIMIT @limit",
          parameters: [
            ...parameters,
            { name: "@offset", value: offset },
            { name: "@limit", value: COMMENTS_PAGE + 1 },
          ],
        })
        .fetchAll(),
      container.items.query<number>({ query: "SELECT VALUE COUNT(1) FROM c WHERE c.userID = @userID", parameters }).fetchAll(),
    ]);

    const page = resources.slice(0, COMMENTS_PAGE);
    const [people, routes] = await Promise.all([
      readPeople([userID]),
      readClimbs([...new Set(page.map((comment) => comment.routeID))]),
    ]);
    return {
      status: 200,
      headers,
      jsonBody: {
        comments: page.map((comment) => ({
          comment: toPublicComment(comment, people),
          climb: routes.get(comment.routeID) ?? null,
        })),
        hasMore: resources.length > COMMENTS_PAGE,
        total: counts[0] ?? 0,
      },
    };
  } catch (error) {
    // The container may not exist until comments can be posted.
    if (isNotFound(error)) return { status: 200, headers, jsonBody: { comments: [], hasMore: false, total: 0 } };
    context.error("Failed to list a user's comments", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load their comments." } };
  }
}

// DELETE /users/{userID} - deletes someone's account for them, as they could
// from Settings - see eraseAccount. Their comments and sends stay, no longer
// naming them, and any session they have ends. See refusal for who can be
// deleted. Returns them as they are now.
export async function deleteUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;
    const actor = (await readCurrentUser(request))!;

    const { userID } = request.params;
    const { resource: user } = await getContainer(USER_CONTAINER).item(userID, userID).read<User>();
    if (!user) return { status: 404, headers, jsonBody: { error: NOT_FOUND } };
    const refused = refusal(actor, user, "delete");
    if (refused) return { status: 403, headers, jsonBody: { error: refused } };

    const deleted = await eraseAccount(user, actor.userID);
    return { status: 200, headers, jsonBody: await toUserDetails(deleted) };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: "Their account changed while deleting - refresh and try again." } };
    }
    context.error("Failed to delete a user", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete their account." } };
  }
}

// What a ban and a timeout each need: a ban can be permanent and stops them
// logging in; a timeout always ends and only stops them posting.
const RESTRICTIONS = {
  ban: { noun: "ban", verb: "banned", verbing: "banning", permanent: true },
  timeout: { noun: "timeout", verb: "timed out", verbing: "timing out", permanent: false },
} as const;

type Restriction = keyof typeof RESTRICTIONS;

// POST /users/{userID}/ban { minutes, reason } bans someone from now for
// `minutes`, or for good when it's null. POST /users/{userID}/timeout
// { minutes, reason } times them out for `minutes` - never for good. Each is
// added to their `ban` or `timeout` list, which keeps every one they've had.
// Nobody can be given another of either until the one they have ends, or be
// timed out while banned. See refusal for who can be banned or timed out.
export async function restrictUser(
  request: HttpRequest,
  context: InvocationContext,
  kind: Restriction,
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);
  const { noun, verb, verbing, permanent } = RESTRICTIONS[kind];

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;
    const actor = (await readCurrentUser(request))!;

    const { userID } = request.params;
    const item = getContainer(USER_CONTAINER).item(userID, userID);
    const { resource: user } = await item.read<User>();
    if (!user) return { status: 404, headers, jsonBody: { error: NOT_FOUND } };
    const refused = refusal(actor, user, kind);
    if (refused) return { status: 403, headers, jsonBody: { error: refused } };

    const body = ((await request.json().catch(() => null)) ?? {}) as { minutes?: unknown; reason?: unknown };
    // null for a permanent ban.
    const minutes =
      permanent && body.minutes === null ? null : Number.isInteger(body.minutes) ? (body.minutes as number) : 0;
    if (minutes !== null && (minutes < 1 || minutes > MAX_RESTRICTION_MINUTES)) {
      const error = `Choose how long the ${noun} lasts${permanent ? ", or make it permanent" : ""}.`;
      return { status: 400, headers, jsonBody: { error } };
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return { status: 400, headers, jsonBody: { error: `Give a reason for the ${noun}.` } };
    if (reason.length > MAX_RESTRICTION_REASON_LENGTH) {
      return {
        status: 400,
        headers,
        jsonBody: { error: `The reason must be ${MAX_RESTRICTION_REASON_LENGTH} characters or fewer.` },
      };
    }

    const now = new Date();
    const ban = activeBan(user, now.toISOString());
    if (ban) {
      return { status: 409, headers, jsonBody: { error: ban.endAt ? "They're already banned." : "They're already banned permanently." } };
    }
    if (kind === "timeout" && activeTimeout(user, now.toISOString())) {
      return { status: 409, headers, jsonBody: { error: "They're already timed out." } };
    }

    const startAt = now.toISOString();
    const endAt = minutes === null ? null : new Date(now.getTime() + minutes * 60_000).toISOString();
    const entry: Ban | Timeout =
      kind === "ban"
        ? { startAt, endAt, reason, bannedBy: actor.userID }
        : { startAt, endAt: endAt!, reason, timedOutBy: actor.userID };
    // Only if nothing else changed them since they were read, so two at once
    // can't both go on. Accounts that have never had one have no list to add
    // to yet.
    const list = user[kind];
    const { resource: updated } = await item.patch<User>(
      [list ? { op: "add", path: `/${kind}/-`, value: entry } : { op: "set", path: `/${kind}`, value: [entry] }],
      { accessCondition: { type: "IfMatch", condition: user._etag } },
    );
    const fallback = { ...user, [kind]: [...(list ?? []), entry] } as User;
    return { status: 200, headers, jsonBody: await toUserDetails(updated ?? fallback) };
  } catch (error) {
    if ((error as { code?: number }).code === 412) {
      return { status: 409, headers, jsonBody: { error: `Their account changed while ${verbing} them - refresh and try again.` } };
    }
    context.error(`Failed to put a ${noun} on a user`, error);
    return { status: 500, headers, jsonBody: { error: `Failed to get them ${verb}.` } };
  }
}

app.http("users", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return listUsers(request, context);
  },
});

app.http("userPermissions", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/permissions",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return listPermissionUsers(request, context);
  },
});

app.http("userLevel", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/{userID}/level",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return setUserLevel(request, context);
  },
});

// Only matches a GUID - every userID is one - so it can't swallow
// users/stats and users/permissions: the host doesn't rank those literal
// routes ahead of a {userID} one.
app.http("userItem", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/{userID:guid}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    if (request.method === "DELETE") return deleteUser(request, context);
    return request.method === "PUT" ? updateUser(request, context) : getUser(request, context);
  },
});

for (const kind of Object.keys(RESTRICTIONS) as Restriction[]) {
  app.http(kind === "ban" ? "userBan" : "userTimeout", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    route: `users/{userID}/${kind}`,
    handler: async (request, context) => {
      if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders(request) };
      }
      return restrictUser(request, context, kind);
    },
  });
}

app.http("userComments", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/{userID}/comments",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return listUserComments(request, context);
  },
});

app.http("userStats", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users/stats",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getUserStats(request, context);
  },
});
