import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readSessionUser } from "../authUtils";
import { readClimbs } from "../climbLinks";
import { toPublicComment } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { countFollowers, readFollowing } from "../follows";
import { Comment, COMMENT_CONTAINER } from "../models/Comment";
import { followingIDs, User, USER_CONTAINER, UserMetrics } from "../models/User";
import { isVisibleToOthers, privacyOf, ProfileSection } from "../profilePrivacy";
import { computeMetrics } from "../userMetrics";

// Anyone's profile: their picture, username, first name and the first letter
// of their last, how many people follow them and they follow, and - unless
// they've hidden them - their numbers and what they've said and sent lately.
// Nothing else of their account.

const RECENT_COMMENTS = 5;
const RECENT_SENDS = 3;
const MAX_USERNAME_LENGTH = 128;

export async function readByUsername(username: string): Promise<User | undefined> {
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

async function readViewer(userID: string): Promise<User | undefined> {
  const { resource } = await getContainer(USER_CONTAINER).item(userID, userID).read<User>();
  return resource;
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

// The line they've sent the most on, the lower line on a tie - or null when
// they haven't sent anything on one. Only the line, so it doesn't give away
// how many sends they have.
function favouriteLine({ lineSends }: UserMetrics): string | null {
  const lines = Object.entries(lineSends).sort(([a, sendsA], [b, sendsB]) => sendsB - sendsA || Number(a) - Number(b));
  return lines[0]?.[0] ?? null;
}

// GET /profiles/{username} - all of it to its owner, along with their privacy
// settings, and without what they've hidden to everyone else. ?view=public
// shows the owner what everyone else gets.
export async function getProfile(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const username = (request.params.username ?? "").trim();
    const user = username && username.length <= MAX_USERNAME_LENGTH ? await readByUsername(username) : undefined;
    if (!user) return { status: 404, headers, jsonBody: { error: "There's nobody with that username." } };

    const viewerID = readSessionUser(request)?.userID;
    const isOwner = viewerID === user.userID && request.query.get("view") !== "public";
    const privacy = privacyOf(user);
    const shows = (section: ProfileSection) => isOwner || isVisibleToOthers(privacy[section]);
    const showsStats = (["sends", "comments", "hardestSend", "favouriteLine"] as const).some(shows);

    // Someone logged in looking at somebody else's profile.
    const otherID = viewerID !== user.userID ? viewerID : undefined;
    // Only what's shown is read.
    const [metrics, comments, sends, followers, { following }, viewer] = await Promise.all([
      showsStats ? (user.settings?.metrics ?? computeMetrics(user.userID)) : undefined,
      shows("recentComments") ? readRecentComments(user.userID) : [],
      shows("recentSends") ? readSends(user.userID) : [],
      countFollowers(user.userID),
      readFollowing(user),
      otherID ? readViewer(otherID) : undefined,
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
        followers,
        following: following.length,
        // Whether the logged-in visitor follows them and they follow the
        // visitor back - left out for visitors who aren't logged in, and on
        // their own profile.
        relation: otherID
          ? {
              follows: viewer ? followingIDs(viewer).includes(user.userID) : false,
              followedBy: followingIDs(user).includes(otherID),
            }
          : undefined,
        // Each number is left out when it's hidden.
        stats: metrics
          ? {
              ...(shows("sends") ? { sends: metrics.sends } : {}),
              ...(shows("comments") ? { commentsPosted: metrics.commentsPosted } : {}),
              ...(shows("hardestSend") ? { hardestSend: metrics.hardestSend } : {}),
              ...(shows("favouriteLine") ? { favouriteLine: favouriteLine(metrics) } : {}),
            }
          : {},
        // Null when hidden.
        recentComments: shows("recentComments") ? comments.map(withClimb) : null,
        // A send on a climb that's since been deleted isn't counted, as in
        // their metrics.
        recentSends: shows("recentSends")
          ? sends
              .filter((comment) => routes.has(comment.routeID))
              .slice(0, RECENT_SENDS)
              .map(withClimb)
          : null,
        // So they can see what's hidden from everyone else.
        privacy: isOwner ? privacy : undefined,
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
