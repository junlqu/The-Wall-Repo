import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders } from "../authUtils";

// TPASC books the wall through EZFacility. Its sessions page has no public
// API, so this asks it the same way the page's calendar does: load the page
// for a session cookie, then post the calendar's filter for one day at a time.
const EZFACILITY_URL = "https://tpasc.ezfacility.com";
const LOCATION_ID = "9906";
const WALL_SCHEDULE_GROUP = "Climbing Wall";
const TIME_ZONE = "America/Toronto";
// Online booking opens 48 hours ahead: today, tomorrow and the day after.
const BOOKABLE_DAYS = 3;
// Kept briefly so a busy schedule page doesn't send every visitor to EZFacility.
const CACHE_MS = 5 * 60 * 1000;

// One session as EZFacility's FilterResults sends it - only what's used here.
// Times are Toronto time with no offset, e.g. "2026-10-28T16:00:00.0000000".
type EzSession = {
  id: string;
  reservationType: string;
  start: string;
  end: string;
  // Online reservations only - walk-in places aren't counted.
  classSize: number;
  currentClassSize: number;
  venues: { ScheduleGroup: string }[];
};

export type SlotKind = "dropin" | "lesson" | "other";

export type Slot = {
  id: string;
  name: string;
  kind: SlotKind;
  // Toronto time, "YYYY-MM-DDTHH:mm".
  start: string;
  end: string;
  // Online spots, and how many of them are taken.
  spots: number;
  booked: number;
};

export type SlotDay = { date: string; slots: Slot[] };

type SlotsResponse = { updatedAt: string; days: SlotDay[] };

// "YYYY-MM-DD" and "HH:mm" for a moment, in Toronto.
function torontoParts(moment: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(date: string, days: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function slotKind(name: string): SlotKind {
  if (/learn to climb|lesson/i.test(name)) return "lesson";
  if (/drop.?in/i.test(name)) return "dropin";
  return "other";
}

// A fresh anonymous session - no login is needed to see the calendar.
async function openSession() {
  const res = await fetch(`${EZFACILITY_URL}/Sessions`);
  if (!res.ok) throw new Error(`EZFacility sessions page returned ${res.status}`);
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

// Every session on one day. `-1` selects every reservation type and resource,
// and the days and times are the calendar's own defaults.
async function fetchDay(cookie: string, date: string): Promise<EzSession[]> {
  const form = new URLSearchParams({
    LocationId: LOCATION_ID,
    Sunday: "true",
    Monday: "true",
    Tuesday: "true",
    Wednesday: "true",
    Thursday: "true",
    Friday: "true",
    Saturday: "true",
    StartTime: "12:00 AM",
    EndTime: "12:00 AM",
    "ReservationTypes[0].Id": "-1",
    "ReservationTypes[0].Selected": "true",
    "Resources[0].Id": "-1",
    "Resources[0].Selected": "true",
    // The range has to be exactly one day.
    StartDate: date,
    EndDate: addDays(date, 1),
  });
  const res = await fetch(`${EZFACILITY_URL}/Sessions/FilterResults`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${EZFACILITY_URL}/Sessions`,
    },
    body: form,
  });
  if (!res.ok) throw new Error(`EZFacility FilterResults returned ${res.status} for ${date}`);
  return (await res.json()) as EzSession[];
}

// The wall's sessions for each bookable day, leaving out any that have
// already started.
async function loadSlots(): Promise<SlotsResponse> {
  const now = new Date();
  const { date: today, time } = torontoParts(now);
  const nowStamp = `${today}T${time}`;
  const cookie = await openSession();
  const dates = Array.from({ length: BOOKABLE_DAYS }, (_, i) => addDays(today, i));

  const days = await Promise.all(
    dates.map(async (date) => {
      const sessions = await fetchDay(cookie, date);
      const slots = sessions
        .filter((session) => session.venues.some((venue) => venue.ScheduleGroup === WALL_SCHEDULE_GROUP))
        .map((session) => ({
          id: session.id,
          name: session.reservationType,
          kind: slotKind(session.reservationType),
          start: session.start.slice(0, 16),
          end: session.end.slice(0, 16),
          spots: session.classSize,
          booked: session.currentClassSize,
        }))
        .filter((slot) => slot.start.startsWith(date) && slot.start > nowStamp)
        .sort((a, b) => a.start.localeCompare(b.start));
      return { date, slots };
    }),
  );

  return { updatedAt: now.toISOString(), days };
}

let cached: { at: number; response: Promise<SlotsResponse> } | null = null;

// Shares one EZFacility lookup between everyone asking within CACHE_MS. A
// failed lookup isn't kept, so the next request tries again.
function getSlots() {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const response = loadSlots();
    cached = { at: Date.now(), response };
    response.catch(() => {
      if (cached?.response === response) cached = null;
    });
  }
  return cached.response;
}

// GET /schedule/slots - the wall's bookable sessions for today, tomorrow and
// the day after, with how many online spots each has left.
export async function getScheduleSlots(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const headers = corsHeaders(request);

  try {
    return { status: 200, headers, jsonBody: await getSlots() };
  } catch (error) {
    context.error("Failed to load booking slots", error);
    return { status: 502, headers, jsonBody: { error: "Couldn't reach the booking system." } };
  }
}

app.http("scheduleSlots", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "schedule/slots",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(request) };
    }
    return getScheduleSlots(request, context);
  },
});
