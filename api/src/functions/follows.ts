import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readCurrentUser, readSessionUser } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { listFollowers, listFollowing, setFollowsRoute, setFollowsUser } from "../follows";
import { Route, ROUTE_CONTAINER } from "../models/Route";
import { followingIDs, User, USER_CONTAINER } from "../models/User";
import { readByUsername } from "./profiles";

function notLoggedIn(headers: Record<string, string>, what: string): HttpResponseInit {
  return { status: 401, headers, jsonBody: { error: `You need to be logged in to ${what}.` } };
}

// PUT /routes/{routeID}/follow follows (saves) the climb, so its new comments
// and sends show on the visitor's dashboard; DELETE unfollows it. Only a
// climb that's up can be followed, but one that's come down can still be
// unfollowed.
export async function followRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);
  const follow = request.method === "PUT";

  try {
    const session = await readCurrentUser(request);
    if (!session) return notLoggedIn(headers, "save climbs");

    const { routeID } = request.params;
    const item = getContainer(ROUTE_CONTAINER).item(routeID, routeID);
    if (follow) {
      const { resource: route } = await item.read<Route>();
      if (route && route.removedAt !== 0) {
        return { status: 403, headers, jsonBody: { error: "This climb has come down, so it can't be saved." } };
      }
    }

    const route = await setFollowsRoute<Route>(item, session.userID, follow);
    if (!route) return { status: 404, headers, jsonBody: { error: "That climb doesn't exist any more." } };
    return { status: 200, headers, jsonBody: { following: follow } };
  } catch (error) {
    context.error("Failed to change a climb follow", error);
    return { status: 500, headers, jsonBody: { error: `Failed to ${follow ? "save" : "unsave"} the climb.` } };
  }
}

// PUT /profiles/{username}/follow follows them, so their comments and sends
// show on the visitor's dashboard; DELETE unfollows them. Answers with where
// the two of them now stand. Becoming (or no longer being) friends can change
// what their profile shows, so the page loads it again after.
export async function followUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);
  const follow = request.method === "PUT";

  try {
    const me = await readCurrentUser(request);
    if (!me) return notLoggedIn(headers, "follow people");

    const them = await readByUsername((request.params.username ?? "").trim());
    if (!them) return { status: 404, headers, jsonBody: { error: "There's nobody with that username." } };
    if (them.userID === me.userID) {
      return { status: 400, headers, jsonBody: { error: "You can't follow yourself." } };
    }

    const item = getContainer(USER_CONTAINER).item(me.userID, me.userID);
    await setFollowsUser<User>(item, them.userID, follow);

    return {
      status: 200,
      headers,
      jsonBody: { relation: { follows: follow, followedBy: followingIDs(them).includes(me.userID) } },
    };
  } catch (error) {
    context.error("Failed to change a user follow", error);
    return { status: 500, headers, jsonBody: { error: `Failed to ${follow ? "follow" : "unfollow"} them.` } };
  }
}

// GET /profiles/{username}/followers and /following - everyone who follows
// them, or who they follow, most recent first. Only to the profile's owner.
async function getFollowList(
  request: HttpRequest,
  context: InvocationContext,
  list: "followers" | "following",
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const me = await readCurrentUser(request);
    if (!me) return notLoggedIn(headers, "see who follows you");

    const username = (request.params.username ?? "").trim().toLowerCase();
    if (username !== me.username.toLowerCase()) {
      return { status: 403, headers, jsonBody: { error: "You can only see your own followers and follows." } };
    }

    const users = list === "followers" ? await listFollowers(me) : await listFollowing(me);
    return { status: 200, headers, jsonBody: { users } };
  } catch (error) {
    context.error(`Failed to list ${list}`, error);
    return { status: 500, headers, jsonBody: { error: `Failed to load your ${list === "followers" ? "followers" : "follows"}.` } };
  }
}

app.http("routeFollow", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes/{routeID}/follow",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return followRoute(request, context);
  },
});

app.http("userFollow", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "profiles/{username}/follow",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return followUser(request, context);
  },
});

for (const list of ["followers", "following"] as const) {
  app.http(`user${list === "followers" ? "Followers" : "Following"}`, {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: `profiles/{username}/${list}`,
    handler: async (request, context) => {
      if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders(request) };
      }
      return getFollowList(request, context, list);
    },
  });
}
