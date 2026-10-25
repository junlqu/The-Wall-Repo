import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readSessionUser } from "../authUtils";

// Logged-out visitors get 200 with `user: null` rather than a 401, since not
// being logged in is a normal state for the header to render.
export async function authMe(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    return { status: 200, headers, jsonBody: { user: readSessionUser(request) } };
  } catch (error) {
    context.error("Failed to read session", error);
    return { status: 500, headers, jsonBody: { error: "Failed to read session." } };
  }
}

app.http("authMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return authMe(request, context);
  },
});
