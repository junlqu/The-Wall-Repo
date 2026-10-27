import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDatabase } from "../cosmosClient";

// Only whether each setting is present - never its value.
const REQUIRED_SETTINGS = ["COSMOS_DB_ENDPOINT", "COSMOS_DB_KEY", "COSMOS_DB_DATABASE_NAME", "JWT_SECRET"];

// Reads the database's metadata, so it fails the same way real queries would
// (missing settings, bad key, firewall, wrong database name). Reports only the
// status code, not the message, since that can include account details.
async function checkCosmos(): Promise<{ ok: boolean; code?: number | string }> {
  try {
    await getDatabase().read();
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: number | string }).code;
    return { ok: false, code: code ?? "unknown" };
  }
}

export async function health(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  const settings = Object.fromEntries(REQUIRED_SETTINGS.map((name) => [name, Boolean(process.env[name])]));
  const cosmos = await checkCosmos();
  const ok = Object.values(settings).every(Boolean) && cosmos.ok;

  return {
    status: ok ? 200 : 503,
    jsonBody: {
      status: ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      settings,
      cosmos,
    },
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
