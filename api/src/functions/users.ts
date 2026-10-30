import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readCurrentUser, rejectUnlessAdmin } from "../authUtils";
import { isNotFound, PublicPerson, readPeople } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { COMMENT_CONTAINER } from "../models/Comment";
import { isUserLevel, User, USER_CONTAINER, USER_LEVEL } from "../models/User";

const FORBIDDEN = "Only staff and admins can look up users.";
const LEADERBOARD_SIZE = 10;
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
