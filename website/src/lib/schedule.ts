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
