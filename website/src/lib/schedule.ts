import { apiUrl } from "@/lib/api";

// The wall's opening hours, shared by the schedule page and the attendance
// sheets (which have a row for every hour the wall is open).

export type DayHours = { open: string; close: string } | null;

// Indexed Monday-first: 0 = Monday ... 6 = Sunday.
// Placeholder hours - replace once real scheduling data is wired up.
export const WEEKLY_HOURS: Record<number, DayHours> = {
  0: { open: "4:00 PM", close: "10:00 PM" },
  1: null,
  2: { open: "4:00 PM", close: "10:00 PM" },
  3: null,
  4: { open: "4:00 PM", close: "10:00 PM" },
  5: { open: "12:00 PM", close: "4:00 PM" },
  6: { open: "12:00 PM", close: "4:00 PM" },
};

export function parseTimeString(time: string): { hours: number; minutes: number } {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return { hours: 0, minutes: 0 };
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

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
