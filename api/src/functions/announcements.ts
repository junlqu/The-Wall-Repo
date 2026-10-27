import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { FORBIDDEN, readAnnouncementFields, toPublicAnnouncement } from "../announcementFields";
import { corsHeaders, readSessionUser, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { Announcement, ANNOUNCEMENT_CONTAINER } from "../models/Announcement";

// GET /announcements - every announcement, active and archived. Listing them
// doesn't count as viewing them; opening one does (see announcementItem.ts).
export async function getAnnouncements(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const { resources } = await getContainer(ANNOUNCEMENT_CONTAINER)
      .items.query<Announcement>("SELECT * FROM c")
      .fetchAll();
    return { status: 200, headers, jsonBody: resources.map((item) => toPublicAnnouncement(item, request)) };
  } catch (error) {
    context.error("Failed to fetch announcements", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load announcements." } };
  }
}

// POST /announcements - posts one announcement. Admin-only.
export async function createAnnouncement(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const fields = readAnnouncementFields(await request.json());
    if (!fields) {
      return { status: 400, headers, jsonBody: { error: "Some of the announcement's details are missing or invalid." } };
    }

    const session = readSessionUser(request)!;
    const announcementID = randomUUID();
    const announcement: Announcement = {
      id: announcementID,
      announcementID,
      userID: session.userID,
      author: session.username,
      // Announced the moment it's posted.
      announcedAt: new Date().toISOString(),
      ...fields,
      likes: [],
      views: [],
    };
    const { resource } = await getContainer(ANNOUNCEMENT_CONTAINER).items.create(announcement);
    return { status: 201, headers, jsonBody: toPublicAnnouncement(resource!, request) };
  } catch (error) {
    context.error("Failed to create announcement", error);
    return { status: 500, headers, jsonBody: { error: "Failed to post the announcement." } };
  }
}

app.http("announcements", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "announcements",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return request.method === "POST" ? createAnnouncement(request, context) : getAnnouncements(request, context);
  },
});
