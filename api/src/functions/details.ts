import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readSessionUser, rejectUnlessAdmin } from "../authUtils";
import { getContainer } from "../cosmosClient";
import { readDetailEntries } from "../detailFields";
import { DETAIL_CONTAINER, DETAIL_IDS, DetailEntry, DetailID, DetailRecord } from "../models/Detail";

const FORBIDDEN = "Only staff and admins can change prices, hours and closures.";

export type DetailsResponse = Record<DetailID, { entries: DetailEntry[]; updatedAt?: string; updatedBy?: string }>;

// One detail's record, or null if it was never saved.
export async function readDetail(detailID: DetailID): Promise<DetailRecord | null> {
  try {
    const { resource } = await getContainer(DETAIL_CONTAINER).item(detailID, detailID).read<DetailRecord>();
    return resource ?? null;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

// GET /details - prices, opening hours and closures, each with every entry on
// record. Public: the schedule page shows them all. A detail that was never
// saved has no entries, and the website falls back on its built-in ones.
export async function getDetails(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const records = await Promise.all(DETAIL_IDS.map(readDetail));
    const body = Object.fromEntries(
      DETAIL_IDS.map((detailID, index) => {
        const record = records[index];
        return [detailID, { entries: record?.entries ?? [], updatedAt: record?.updatedAt, updatedBy: record?.updatedBy }];
      }),
    ) as DetailsResponse;
    return { status: 200, headers, jsonBody: body };
  } catch (error) {
    context.error("Failed to fetch details", error);
    return { status: 500, headers, jsonBody: { error: "Failed to load prices, hours and closures." } };
  }
}

// PUT /details/{detailID} - replaces one detail's whole list of entries, which
// is also how an announcement gets linked to an entry. Admin-only.
export async function saveDetail(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const rejection = await rejectUnlessAdmin(request, headers, FORBIDDEN);
    if (rejection) return rejection;

    const detailID = request.params.detailID as DetailID;
    if (!DETAIL_IDS.includes(detailID)) {
      return { status: 404, headers, jsonBody: { error: "There's no such detail." } };
    }

    const { entries } = ((await request.json().catch(() => null)) ?? {}) as { entries?: unknown };
    const read = readDetailEntries(detailID, entries);
    if ("error" in read) return { status: 400, headers, jsonBody: { error: read.error } };

    const record: DetailRecord = {
      id: detailID,
      detailID,
      entries: read.entries,
      updatedAt: new Date().toISOString(),
      updatedBy: readSessionUser(request)!.username,
    };
    const { resource } = await getContainer(DETAIL_CONTAINER).items.upsert<DetailRecord>(record);
    const saved = resource ?? record;
    return {
      status: 200,
      headers,
      jsonBody: { entries: saved.entries, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy },
    };
  } catch (error) {
    context.error("Failed to save details", error);
    return { status: 500, headers, jsonBody: { error: "Failed to save the changes." } };
  }
}

app.http("details", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "details",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getDetails(request, context);
  },
});

app.http("detailItem", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "details/{detailID}",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return saveDetail(request, context);
  },
});
