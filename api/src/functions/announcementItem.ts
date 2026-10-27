import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { FORBIDDEN, isDateTime, readAnnouncementFields, toPublicAnnouncement } from "../announcementFields";
import { corsHeaders, readSessionUser, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { Announcement, ANNOUNCEMENT_CONTAINER } from "../models/Announcement";

function errorCode(error: unknown) {
  return (error as { code?: number }).code;
}

function notFound(headers: Record<string, string>): HttpResponseInit {
  return { status: 404, headers, jsonBody: { error: "That announcement doesn't exist any more." } };
}

function announcementItem(request: HttpRequest) {
  const { announcementID } = request.params;
  return getContainer(ANNOUNCEMENT_CONTAINER).item(announcementID, announcementID);
}

// Unliking can lose a race with another change to the likes - it tries again
// this many times before giving up.
const UNLIKE_ATTEMPTS = 3;

type AnnouncementItem = ReturnType<typeof announcementItem>;

// Adds the userID to `likes` or `views` unless it's already there, in one
// step, so doing it twice at once can't count twice. The userID comes from the
// signed session, so it's safe in the condition. Returns the announcement as
// it now stands.
async function addUser(item: AnnouncementItem, list: "likes" | "views", userID: string) {
  try {
    const { resource } = await item.patch<Announcement>({
      condition: `FROM c WHERE NOT ARRAY_CONTAINS(c.${list}, ${JSON.stringify(userID)})`,
      operations: [{ op: "add", path: `/${list}/-`, value: userID }],
    });
    return resource;
  } catch (error) {
    // 412: already there, so there's nothing to add.
    if (errorCode(error) !== 412) throw error;
    return (await item.read<Announcement>()).resource;
  }
}

// Takes the userID out of `likes`, as long as it's still where it was read -
// otherwise reads again and retries. Undefined if it kept losing the race.
async function removeLike(item: AnnouncementItem, userID: string) {
  for (let attempt = 0; attempt < UNLIKE_ATTEMPTS; attempt++) {
    const { resource } = await item.read<Announcement>();
    const index = resource?.likes.indexOf(userID) ?? -1;
    if (!resource || index === -1) return resource;
    try {
      const { resource: updated } = await item.patch<Announcement>({
        condition: `FROM c WHERE c.likes[${index}] = ${JSON.stringify(userID)}`,
        operations: [{ op: "remove", path: `/likes/${index}` }],
      });
      return updated;
    } catch (error) {
      if (errorCode(error) !== 412) throw error;
    }
  }
  return undefined;
}

// GET /announcements/{announcementID} - one announcement.
export async function getAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const { resource } = await announcementItem(request).read<Announcement>();
    if (!resource) return notFound(headers);
    return { status: 200, headers, jsonBody: toPublicAnnouncement(resource, request) };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to fetch announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the announcement." } };
  }
}

// POST /announcements/{announcementID}/view - the updates page showed it. A
// member counts once however often they see it; anyone not logged in adds one
// to the guest count every time.
export async function viewAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const item = announcementItem(request);
    const session = readSessionUser(request);
    const resource = session
      ? await addUser(item, "views", session.userID)
      : (await item.patch<Announcement>([{ op: "incr", path: "/guestViews", value: 1 }])).resource;
    if (!resource) return notFound(headers);
    return { status: 200, headers, jsonBody: toPublicAnnouncement(resource, request) };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to count announcement view", error);
    return { status: 500, headers, jsonBody: { error: "Failed to count the view." } };
  }
}

// POST /announcements/{announcementID}/like likes it, DELETE takes the like
// back. Members only.
export async function likeAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const session = readSessionUser(request);
    if (!session) {
      return { status: 401, headers, jsonBody: { error: "Log in to like announcements." } };
    }

    const item = announcementItem(request);
    if (request.method === "DELETE") {
      const resource = await removeLike(item, session.userID);
      if (resource === undefined) {
        // Either it's gone, or the like kept changing under it.
        const { resource: current } = await item.read<Announcement>();
        if (!current) return notFound(headers);
        return { status: 409, headers, jsonBody: { error: "Couldn't remove the like. Try again." } };
      }
      return { status: 200, headers, jsonBody: toPublicAnnouncement(resource, request) };
    }

    const resource = await addUser(item, "likes", session.userID);
    if (!resource) return notFound(headers);
    return { status: 200, headers, jsonBody: toPublicAnnouncement(resource, request) };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to change announcement like", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save the like." } };
  }
}

// PUT /announcements/{announcementID} - replaces what the admin wrote. When
// it was announced, its author, likes and views are left alone.
export async function updateAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const item = announcementItem(request);
    const { resource: existing } = await item.read<Announcement>();
    if (!existing) return notFound(headers);

    const fields = readAnnouncementFields(await request.json());
    if (!fields) {
      return { status: 400, headers, jsonBody: { error: "Some of the announcement's details are missing or invalid." } };
    }

    // A cleared end date comes through as undefined, so it's dropped from the
    // document rather than kept.
    const { resource: updated } = await item.replace<Announcement>({ ...existing, ...fields });
    return { status: 200, headers, jsonBody: toPublicAnnouncement(updated!, request) };
  } catch (error) {
    context.error("Failed to update announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save the announcement." } };
  }
}

// DELETE /announcements/{announcementID}
export async function deleteAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    await announcementItem(request).delete();
    return { status: 204, headers };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to delete announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to delete the announcement." } };
  }
}

// POST /announcements/{announcementID}/archive - ends its relevance now, which
// moves it to the archive.
export async function archiveAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { resource: updated } = await announcementItem(request).patch<Announcement>([
      { op: "set", path: "/relevantUntil", value: new Date().toISOString() },
    ]);
    return { status: 200, headers, jsonBody: toPublicAnnouncement(updated!, request) };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to archive announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to archive the announcement." } };
  }
}

// POST /announcements/{announcementID}/restore - makes an archived
// announcement relevant again until `relevantUntil`, which must be in the
// future.
export async function restoreAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const { relevantUntil } = (await request.json()) as { relevantUntil?: unknown };
    if (!isDateTime(relevantUntil) || Date.parse(relevantUntil) <= Date.now()) {
      return { status: 400, headers, jsonBody: { error: "The new relevance date has to be in the future." } };
    }

    const { resource: updated } = await announcementItem(request).patch<Announcement>([
      { op: "set", path: "/relevantUntil", value: new Date(relevantUntil).toISOString() },
    ]);
    return { status: 200, headers, jsonBody: toPublicAnnouncement(updated!, request) };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to restore announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to restore the announcement." } };
  }
}

app.http("announcementItem", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "announcements/{announcementID}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    if (request.method === "PUT") return updateAnnouncement(request, context);
    if (request.method === "DELETE") return deleteAnnouncement(request, context);
    return getAnnouncement(request, context);
  },
});

app.http("viewAnnouncement", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "announcements/{announcementID}/view",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return viewAnnouncement(request, context);
  },
});

app.http("likeAnnouncement", {
  methods: ["POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "announcements/{announcementID}/like",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return likeAnnouncement(request, context);
  },
});

app.http("archiveAnnouncement", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "announcements/{announcementID}/archive",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return archiveAnnouncement(request, context);
  },
});

app.http("restoreAnnouncement", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "announcements/{announcementID}/restore",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return restoreAnnouncement(request, context);
  },
});
