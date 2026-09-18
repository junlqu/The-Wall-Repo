import { Container, CosmosClient, Database } from "@azure/cosmos";

let client: CosmosClient | undefined;
let database: Database | undefined;

function getClient(): CosmosClient {
  if (!client) {
    const endpoint = process.env.COSMOS_DB_ENDPOINT;
    const key = process.env.COSMOS_DB_KEY;
    if (!endpoint || !key) {
      throw new Error(
        "Missing COSMOS_DB_ENDPOINT or COSMOS_DB_KEY app settings."
      );
    }
    client = new CosmosClient({ endpoint, key });
  }
  return client;
}

export function getDatabase(): Database {
  if (!database) {
    const databaseName = process.env.COSMOS_DB_DATABASE_NAME;
    if (!databaseName) {
      throw new Error("Missing COSMOS_DB_DATABASE_NAME app setting.");
    }
    database = getClient().database(databaseName);
  }
  return database;
}

export function getContainer(containerId: string): Container {
  return getDatabase().container(containerId);
}
