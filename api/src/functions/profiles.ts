import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders } from "../authUtils";
import { readClimbs } from "../climbLinks";
import { toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { User, USER_CONTAINER } from "../models/User";
import { computeMetrics } from "../userMetrics";

// Anyone's profile, as everyone else sees it: their picture, username, first
// name and the first letter of their last, their numbers, and what they've
// said and sent lately. Nothing else of their account.

const RECENT_COMMENTS = 5;
const RECENT_SENDS = 3;
const MAX_USERNAME_LENGTH = 128;

async function readByUsername(username: string): Promise<User | undefined> {
  const { resources } = await getContainer(USER_CONTAINER)
    .items.query<User>({
      // Ignoring case: sign-up lowercases usernames, but accounts made
      // before that - or by hand - can have capitals.
      // A deleted account's profile is gone, as if they'd never been.
      query: "SELECT * FROM c WHERE STRINGEQUALS(c.username, @username, true) AND NOT IS_DEFINED(c.deletedAt)",
      parameters: [{ name: "@username", value: username }],
    })
    .fetchAll();
  return resources[0];
}

async function readRecentComments(userID: string): Promise<Comment[]> {
  const { resources } = await getContainer(COMMENT_CONTAINER)
    .items.query<Comment>({
      query: `SELECT TOP @limit * FROM c WHERE c.userID = @userID AND c.comment != "" ORDER BY c.commentedAt DESC`,
      parameters: [
        { name: "@limit", value: RECENT_COMMENTS },
        { name: "@userID", value: userID },
      ],
    })
    .fetchAll();
  return resources;
}

// When a climb was sent, to sort by - the day, then when it was logged to
// settle two on one day. Mirrors sentWhen in userMetrics.ts.
function sentWhen({ sentAt, commentedAt }: Comment) {
  return `${sentAt ?? commentedAt.slice(0, 10)} ${commentedAt}`;
}

async function readSends(userID: string): Promise<Comment[]> {
  const { resources } = await getContainer(COMMENT_CONTAINER)
    .items.query<Comment>({
      query: "SELECT * FROM c WHERE c.userID = @userID AND c.send = true",
      parameters: [{ name: "@userID", value: userID }],
    })
    .fetchAll();
  return resources.sort((a, b) => sentWhen(b).localeCompare(sentWhen(a)));
}

// GET /profiles/{username}
export async function getProfile(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const username = (request.params.username ?? "").trim();
    const user = username && username.length <= MAX_USERNAME_LENGTH ? await readByUsername(username) : undefined;
    if (!user) return { status: 404, headers, jsonBody: { error: "There's nobody with that username." } };

    const [metrics, comments, sends] = await Promise.all([
      user.settings?.metrics ?? computeMetrics(user.userID),
      readRecentComments(user.userID),
      readSends(user.userID),
    ]);
    const routes = await readClimbs([...new Set([...comments, ...sends].map((comment) => comment.routeID))]);

    const person = { userID: user.userID, username: user.username, avatarUpdatedAt: user.avatarUpdatedAt };
    const people = new Map([[user.userID, person]]);
    const withClimb = (comment: Comment) => ({
      comment: toPublicComment(comment, people),
      climb: routes.get(comment.routeID) ?? null,
    });

    return {
      status: 200,
      headers,
      jsonBody: {
        ...person,
        fname: user.fname,
        lastInitial: user.lname.trim().charAt(0).toUpperCase(),
        metrics,
        recentComments: comments.map(withClimb),
        // A send on a climb that's since been deleted isn't counted, as in
        // their metrics.
        recentSends: sends
          .filter((comment) => routes.has(comment.routeID))
          .slice(0, RECENT_SENDS)
          .map(withClimb),
      },
    };
  } catch (error) {
    context.error("Failed to load a profile", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load that profile." } };
  }
}

app.http("profiles", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "profiles/{username}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getProfile(request, context);
  },
});
