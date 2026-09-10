import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getContainer } from "../cosmosClient";

const CONTAINER_ID = "routes";

export async function getRoutes(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const container = getContainer(CONTAINER_ID);
    const { resources } = await container.items
      .query("SELECT * FROM c")
      .fetchAll();

    return {
      status: 200,
      jsonBody: resources,
    };
  } catch (error) {
    context.error("Failed to fetch routes", error);
    return {
      status: 500,
      jsonBody: { error: "Failed to fetch routes" },
    };
  }
}

app.http("getRoutes", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "routes",
  handler: getRoutes,
});
