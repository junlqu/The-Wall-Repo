import { randomUUID } from "node:crypto";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, readCurrentUser } from "../authUtils";
import { comboExists, isLineInReach, toComboHand } from "../climbLinks";
import { isSendDate } from "../commentFields";
import { getContainer } from "../cosmosClient";
import { comboIDFor, Route, ROUTE_CONTAINER } from "../models/Route";
import { canUseAdminTools } from "../models/User";
import { isFilledText, isLeadable, readRouteFields, RouteFields } from "../routeFields";

const MAX_RATING = 10;
const COMBO_GRADE_PATTERN = /^5\.\d+[a-d]?$/;

export async function getRoutes(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const container = getContainer(ROUTE_CONTAINER);
    const { resources } = await container.items
      .query("SELECT * FROM c")
      .fetchAll();

    return {
      status: 200,
      headers,
      jsonBody: resources,
    };
  } catch (error) {
    context.error("Failed to fetch routes", error);
    return {
      status: 500,
      headers,
      jsonBody: { error: "Failed to fetch routes" },
    };
  }
}

// The routes a combo's hands take, given their IDs - or null if it isn't one the
// wall can have: two different routes, which can share a colour, both up on its
// line or the ones either side, with a real grade and a first ascent that isn't
// in the future.
// Anyone logged in can add one, so it isn't left to the form.
async function readComboHands(fields: RouteFields, hands: unknown): Promise<Route["hands"] | null> {
  const { colour, secondary, line, proposedGrade, setAt } = fields;
  if (!secondary || line === undefined) return null;
  if (!COMBO_GRADE_PATTERN.test(proposedGrade)) return null;
  if (setAt !== "" && !isSendDate(setAt)) return null;

  const { left: leftID, right: rightID } = (hands ?? {}) as { left?: unknown; right?: unknown };
  if (!isFilledText(leftID) || !isFilledText(rightID) || leftID === rightID) return null;

  const container = getContainer(ROUTE_CONTAINER);
  const [{ resource: left }, { resource: right }] = await Promise.all([
    container.item(leftID, leftID).read<Route>(),
    container.item(rightID, rightID).read<Route>(),
  ]);
  const inReach = (route: Route | undefined): route is Route =>
    route !== undefined &&
    (route.type ?? "route") === "route" &&
    route.removedAt === 0 &&
    route.line !== undefined &&
    isLineInReach(line, toComboHand(route));
  if (!inReach(left) || !inReach(right) || left.colour !== colour || right.colour !== secondary) return null;

  return { left: toComboHand(left), right: toComboHand(right) };
}

// A combo's starting rating, 0-10. Left out, it starts unrated.
function isInitialRating(value: unknown) {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_RATING);
}

// POST /routes - adds one climb, up on the wall from its set date. Anyone logged
// in can add a combo; everything else is for staff and admins.
export async function createRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    const user = await readCurrentUser(request);
    if (!user) return { status: 401, headers, jsonBody: { error: "You need to be logged in." } };

    const body = (await request.json()) as { type?: unknown; leadable?: unknown; initialRating?: unknown; hands?: unknown };
    const isCombo = body.type === "combo";
    if (!isCombo && !canUseAdminTools(user.level)) {
      return { status: 403, headers, jsonBody: { error: "Only staff and admins can change climbs." } };
    }

    const invalid: HttpResponseInit = {
      status: 400,
      headers,
      jsonBody: { error: "Some of the climb's details are missing or invalid." },
    };
    const fields = readRouteFields(body);
    if (!fields || !isLeadable(body.leadable)) return invalid;

    const { initialRating } = body;
    if (initialRating !== undefined && !isCombo) return invalid;
    if (!isInitialRating(initialRating)) return invalid;
    const hands = isCombo ? await readComboHands(fields, body.hands) : undefined;
    if (isCombo && !hands) {
      return {
        status: 400,
        headers,
        jsonBody: { error: "A combo needs two different routes up on its line or the ones either side." },
      };
    }

    const alreadyExists: HttpResponseInit = {
      status: 409,
      headers,
      jsonBody: { error: "That combo already exists - it has the same left and right hand routes." },
    };
    // Looked for as well as kept out by its ID, for combos from before that ID.
    if (hands && (await comboExists(hands.left.routeID, hands.right.routeID))) return alreadyExists;

    const routeID = hands ? comboIDFor(hands.left.routeID, hands.right.routeID) : randomUUID();
    const route: Route = {
      id: routeID,
      routeID,
      ...fields,
      ...(isCombo ? { userID: user.userID, hands: hands! } : {}),
      removedAt: 0,
      leadable: body.leadable,
      ascents: [],
      follows: [],
      comments: 0,
      rating: initialRating === undefined ? { total: 0, count: 0 } : { total: initialRating as number, count: 1 },
    };
    try {
      const { resource } = await getContainer(ROUTE_CONTAINER).items.create(route);
      return { status: 201, headers, jsonBody: resource };
    } catch (error) {
      if ((error as { code?: number }).code === 409) return alreadyExists;
      throw error;
    }
  } catch (error) {
    context.error("Failed to create route", error);
    return { status: 500, headers, jsonBody: { error: "Failed to add the climb." } };
  }
}

app.http("routes", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "routes",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return request.method === "POST" ? createRoute(request, context) : getRoutes(request, context);
  },
});
