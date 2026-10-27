export const ATTENDANCE_CONTAINER = "Attendance";

// One tally column on the attendance sheet. Mirrors ATTENDANCE_COLUMNS in
// website/src/lib/attendance.ts, which also holds each column's price.
export const ATTENDANCE_COLUMN_KEYS = [
  "utscLearnToClimb",
  "utscDropInGear",
  "utscDropInNoGear",
  "lessons",
  "belayTpasc",
  "belay5to12",
  "belay13to21",
  "belay22plus",
  "equipmentRental",
  "wallPass",
  "free5to12",
  "free13to21",
  "free22plus",
  "waiting",
  "noShows",
] as const;
export type AttendanceColumnKey = (typeof ATTENDANCE_COLUMN_KEYS)[number];

// Tallies for one hour. Columns nobody was counted in are left out.
export type AttendanceCounts = Partial<Record<AttendanceColumnKey, number>>;

export type AttendanceDay = {
  // Keyed by the hour the slot starts, 24-hour: "16" is 4-5 PM. Every hour
  // the wall was open is present, even when nobody came.
  hours: Record<string, AttendanceCounts>;
  turnedAway: number;
};

// Partition key: /attendanceID, which is the week's endDay - one document per
// week, so saving a week again replaces it. `id` mirrors attendanceID (Cosmos
// requires an id). The wall's week runs Saturday to Friday, so startDay is
// always the Saturday six days before endDay. The week's tallies are one
// JSON value.
export type AttendanceWeek = {
  id: string;
  attendanceID: string;
  // YYYY-MM-DD.
  startDay: string;
  endDay: string;
  // Keyed by date (YYYY-MM-DD), only the days the wall was open.
  attendance: Record<string, AttendanceDay>;
  updatedAt: string;
  // Username of whoever saved it last.
  updatedBy: string;
};
