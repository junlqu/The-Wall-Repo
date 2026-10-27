import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../cosmosClient";
import { buildSessionCookie, corsHeaders, readSessionUser, signSessionToken } from "../authUtils";
import { decodeDataUrl, getStarterAvatar, isValidAvatarUpload } from "../avatarUtils";
import { Avatar, AVATAR_CONTAINER } from "../models/Avatar";
import { USER_CONTAINER } from "../models/User";

// Data URLs are ~4/3 the size of the image, plus a little JSON.
const MAX_UPLOAD_BODY_BYTES = 100 * 1024;

export async function getAvatar(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);
  const userID = request.params.userID;

  try {
    const { resource } = await getContainer(AVATAR_CONTAINER).item(userID, userID).read<Avatar>();
    // Users from before avatars existed have no document - give them their starter.
    const { contentType, bytes } = decodeDataUrl(resource?.avatar ?? getStarterAvatar(userID));

    return {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        // Pages add ?v=<avatarUpdatedAt>, so a versioned URL never changes.
        "Cache-Control": request.query.get("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
      body: bytes,
    };
  } catch (error) {
    context.error("Failed to read avatar", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load avatar." } };
  }
}

export async function putAvatar(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);
  const userID = request.params.userID;

  try {
    const session = readSessionUser(request);
    if (!session) {
      return { status: 401, headers, jsonBody: { error: "You need to be logged in." } };
    }
    if (session.userID !== userID) {
      return { status: 403, headers, jsonBody: { error: "You can only change your own picture." } };
    }
    if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BODY_BYTES) {
      return { status: 413, headers, jsonBody: { error: "That image is too large." } };
    }

    const body = (await request.json()) as { avatar?: unknown };
    if (!isValidAvatarUpload(body.avatar)) {
      return { status: 400, headers, jsonBody: { error: "Picture must be a PNG, JPEG, or WebP image under 64 KB." } };
    }

    const updatedAt = new Date().toISOString();
    const avatar: Avatar = { id: userID, userID, avatar: body.avatar, updatedAt };
    await getContainer(AVATAR_CONTAINER).items.upsert(avatar);
    await getContainer(USER_CONTAINER)
      .item(userID, userID)
      .patch([{ op: "set", path: "/avatarUpdatedAt", value: updatedAt }]);

    // The session token carries avatarUpdatedAt, so reissue it.
    const user = { ...session, avatarUpdatedAt: updatedAt };
    return {
      status: 200,
      headers,
      cookies: [buildSessionCookie(signSessionToken(user))],
      jsonBody: { user },
    };
  } catch (error) {
    context.error("Failed to save avatar", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save picture." } };
  }
}

app.http("avatars", {
  methods: ["GET", "PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "avatars/{userID}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return request.method === "PUT" ? putAvatar(request, context) : getAvatar(request, context);
  },
});
