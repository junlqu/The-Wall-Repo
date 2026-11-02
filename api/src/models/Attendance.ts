export const ATTENDANCE_CONTAINER = "Attendance";

// One tally column on an attendance sheet, across every format the sheet has
// had. Mirrors website/src/lib/attendanceFormats.ts, which holds which columns
// each format has and what each one cost at the time.
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
  // Jan 2016 - May 2017.
  "belayedSession",
  "memberGear",
  "memberNoGear",
  // May 2017 - Apr 2018.
  "lessons13to20",
  "lessonsOver20",
  "belayedUnder13",
  "belayed13to20",
  "belayedOver20",
  "gearUnder13",
  "gear13to20",
  "gearOver20",
  "noGearUnder13",
  "noGear13to20",
  "noGearOver20",
  // May 2018 - Sep 2019.
  "flexPass",
  "noBelay22plus",
  // Aug 2020 - Oct 2021.
  "tpascGear",
  "tpascNoGear",
  "nonMemberGear",
  "nonMemberNoGear",
  "employees",
] as const;
export type AttendanceColumnKey = (typeof ATTENDANCE_COLUMN_KEYS)[number];

// Tallies for one hour. Columns nobody was counted in are left out.
export type AttendanceCounts = Partial<Record<AttendanceColumnKey, number>>;

export type AttendanceDay = {
  // Keyed by the hour the slot starts, 24-hour: "16" is 4-5 PM. Every hour
  // the wall was open is present, even when nobody came.
  hours: Record<string, AttendanceCounts>;
  turnedAway: number;
  // The "*" or "**" a monthly sheet puts before an hour, pointing at a note.
  // Keyed like `hours`.
  hourMarks?: Record<string, string>;
};

export const ATTENDANCE_TYPES = ["weekly", "monthly"] as const;
export type AttendanceType = (typeof ATTENDANCE_TYPES)[number];

// Partition key: /attendanceID, which leads with W or M for the type, then the
// start and end days - W-20261024-20261030. Saving the same period again
// replaces it. `id` mirrors attendanceID (Cosmos requires an id).
export type AttendanceRecord = {
  id: string;
  attendanceID: string;
  type: AttendanceType;
  // YYYY-MM-DD. A weekly record runs Saturday to Friday, a monthly one covers
  // its whole calendar month.
  startDay: string;
  endDay: string;
  // Weekly: keyed by date (YYYY-MM-DD), only the days the wall was open.
  // Monthly: keyed by the label of each table on the sheet - "Saturdays",
  // "Sundays (excl. 1)" - since a month adds its weekdays up.
  attendance: Record<string, AttendanceDay>;
  // The notes at the bottom of a monthly sheet.
  notes?: string[];
  updatedAt: string;
  // Username of whoever saved it last.
  updatedBy: string;
};
