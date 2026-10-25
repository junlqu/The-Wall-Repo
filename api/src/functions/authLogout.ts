import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { buildClearedSessionCookie, corsHeaders } from "../authUtils";

export async function authLogout(request: HttpRequest): Promise<HttpResponseInit> {
  return { status: 204, headers: corsHeaders(request), cookies: [buildClearedSessionCookie()] };
}

app.http("authLogout", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: async (request) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return authLogout(request);
  },
});
