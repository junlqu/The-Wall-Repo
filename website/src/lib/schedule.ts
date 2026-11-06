import { apiUrl } from "@/lib/api";

// Booking for the schedule page. The wall's opening hours, prices and
// closures live in lib/details.ts.

// Placeholder - replace with the real external booking system URL.
export const BOOKING_URL = "https://tpasc.ezfacility.com/";
export const WAIVER_URL = "https://waiver.smartwaiver.com/w/5b6064099948a/kiosk/";

// Mirrors Slot in api/src/functions/scheduleSlots.ts - one session on the
// wall from the booking system.
export type BookingSlot = {
  id: string;
  name: string;
  kind: "dropin" | "lesson" | "other";
  // Toronto time, "YYYY-MM-DDTHH:mm".
  start: string;
  end: string;
  // Online spots, and how many of them are taken. Walk-in places aren't counted.
  spots: number;
  booked: number;
};

// Today, tomorrow and the day after - the days that can be booked online -
// keyed by "YYYY-MM-DD". A day with no sessions left has an empty list.
export async function fetchBookingSlots(): Promise<Map<string, BookingSlot[]>> {
  const res = await fetch(apiUrl("/schedule/slots"));
  if (!res.ok) throw new Error(`Failed to load booking slots (${res.status})`);
  const body = (await res.json()) as { days: { date: string; slots: BookingSlot[] }[] };
  return new Map(body.days.map((day) => [day.date, day.slots]));
}
