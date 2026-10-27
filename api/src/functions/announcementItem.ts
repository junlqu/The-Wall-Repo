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

// GET /announcements/{announcementID} - one announcement. Opening it while
// logged in marks it as viewed by that user.
export async function getAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const item = announcementItem(request);
    const session = readSessionUser(request);
    if (session) {
      // Only adds the view when it isn't there yet, in one step, so opening it
      // twice at once can't count twice. The userID comes from the signed
      // session, so it's safe in the condition.
      try {
        const { resource } = await item.patch<Announcement>({
          condition: `FROM c WHERE NOT ARRAY_CONTAINS(c.views, ${JSON.stringify(session.userID)})`,
          operations: [{ op: "add", path: "/views/-", value: session.userID }],
        });
        return { status: 200, headers, jsonBody: toPublicAnnouncement(resource!, request) };
      } catch (error) {
        // 412: already viewed, so there's nothing to add.
        if (errorCode(error) !== 412) throw error;
      }
    }

    const { resource } = await item.read<Announcement>();
    if (!resource) return notFound(headers);
    return { status: 200, headers, jsonBody: toPublicAnnouncement(resource, request) };
  } catch (error) {
    if (errorCode(error) === 404) return notFound(headers);
    context.error("Failed to fetch announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load the announcement." } };
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
