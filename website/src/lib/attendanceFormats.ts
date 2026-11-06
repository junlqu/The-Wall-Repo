// Every format the attendance sheet has had, each with the dates it was used
// for. Weekly and monthly sheets didn't always change on the same day, so each
// format has a start for both. A format covers a date from its start until the
// next format's. Columns and prices are read off the real sheets in
// local/TPASC Wall Usage.
//
// Prices admins set on the Operations pages override a format's own for the
// dates they cover, so earnings follow the prices of the time. The sheet's
// layout (and its printed header) stays the format's.

import { columnCents, type PricingEntry, pricingBetween, pricingOn } from "@/lib/details";

// Mirrors ATTENDANCE_COLUMN_KEYS in api/src/models/Attendance.ts.
export type AttendanceColumnKey =
  | "utscLearnToClimb"
  | "utscDropInGear"
  | "utscDropInNoGear"
  | "lessons"
  | "belayTpasc"
  | "belay5to12"
  | "belay13to21"
  | "belay22plus"
  | "equipmentRental"
  | "wallPass"
  | "free5to12"
  | "free13to21"
  | "free22plus"
  | "waiting"
  | "noShows"
  | "belayedSession"
  | "memberGear"
  | "memberNoGear"
  | "lessons13to20"
  | "lessonsOver20"
  | "belayedUnder13"
  | "belayed13to20"
  | "belayedOver20"
  | "gearUnder13"
  | "gear13to20"
  | "gearOver20"
  | "noGearUnder13"
  | "noGear13to20"
  | "noGearOver20"
  | "flexPass"
  | "noBelay22plus"
  | "tpascGear"
  | "tpascNoGear"
  | "nonMemberGear"
  | "nonMemberNoGear"
  | "employees";

// One tally column. `cents` is what each person in it paid - 0 for the free
// ones, null for the columns that count people who didn't climb (waiting at
// capacity, no-shows), which stay out of the climber totals.
export type AttendanceColumn = {
  key: AttendanceColumnKey;
  label: string;
  cents: number | null;
};

export type AttendanceColumnGroup = {
  label: string;
  children: AttendanceColumnNode[];
};

export type AttendanceColumnNode = AttendanceColumn | AttendanceColumnGroup;

// A filled cell of the sheet's header: its column, then what it says.
type HeaderCell = [column: string, value: string | number];

// How a format's table is laid out on the sheet, so an export can match it.
export type SheetLayout = {
  // The header rows, top to bottom. Tally columns run left to right from B.
  header: HeaderCell[][];
  // Merged header cells, with rows counted from the top of the table: "F1:I1".
  merges: string[];
  // The label of the row that adds up each column.
  totalLabel: string;
  // Runs of columns that share an Overall Total. A lone column has no total
  // of its own in the row above, just its Overall Total. Formats whose totals
  // are one "TOTAL" row leave this out.
  overallGroups?: string[];
  turnedAway: boolean;
  // The column widths, as [first column, last column, width].
  widths: [string, string, number][];
  // Slots that stop ten minutes short of the hour - "12:00-12:50pm".
  fiftyMinuteHours?: boolean;
  // Whether a monthly sheet's title says "Usage Report:" or just "Usage:".
  monthlyTitle: string;
  // "Total Climbers", where the All Days table renames the total column.
  allDaysTotal?: string;
  // Row 2 holds a stray space on the newest sheets.
  spacerRow?: boolean;
  // How many header rows are bold, when it isn't the top two.
  boldHeaderRows?: number;
};

export type AttendanceFormat = {
  id: string;
  name: string;
  // First date this format's weekly sheets cover, or null if it only appeared
  // on a monthly sheet.
  weeklyFrom: string | null;
  // First month (YYYY-MM) of its monthly sheets, or null if it only appeared
  // on weekly sheets.
  monthlyFrom: string | null;
  // As its header lays them out, left to right.
  groups: AttendanceColumnNode[];
  // Every tally column, left to right.
  columns: AttendanceColumn[];
  sheet: SheetLayout;
};

export function isColumnGroup(node: AttendanceColumnNode): node is AttendanceColumnGroup {
  return "children" in node;
}

function leavesOf(node: AttendanceColumnNode): AttendanceColumn[] {
  return isColumnGroup(node) ? node.children.flatMap(leavesOf) : [node];
}

function makeFormat(
  id: string,
  name: string,
  weeklyFrom: string | null,
  monthlyFrom: string | null,
  groups: AttendanceColumnNode[],
  sheet: SheetLayout,
): AttendanceFormat {
  return { id, name, weeklyFrom, monthlyFrom, groups, columns: groups.flatMap(leavesOf), sheet };
}

const REPORT_TITLE = "TPASC Climbing Wall Usage Report";
const USAGE_TITLE = "TPASC Climbing Wall Usage";

const WAITING: AttendanceColumn = { key: "waiting", label: "Waiting (at capacity)", cents: null };
const NO_SHOWS: AttendanceColumn = { key: "noShows", label: "No shows", cents: null };

function utscColumns(cents: number): AttendanceColumnGroup {
  return {
    label: "UTSC",
    children: [
      { key: "utscLearnToClimb", label: "Learn to Climb", cents },
      { key: "utscDropInGear", label: "Drop-ins (Gear)", cents },
      { key: "utscDropInNoGear", label: "Drop-ins (No Gear)", cents: 0 },
    ],
  };
}

const FREE_DROP_INS: AttendanceColumnGroup = {
  label: "Drop-ins Free",
  children: [
    { key: "free5to12", label: "5–12", cents: 0 },
    { key: "free13to21", label: "13–21", cents: 0 },
    { key: "free22plus", label: "22+", cents: 0 },
  ],
};

// Jan 2016 onward: no age groups, and only UTSC and everyone else.
const FORMAT_2016 = makeFormat(
  "2016",
  "Lessons and belayed sessions",
  "2016-01-01",
  "2016-01",
  [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [
        { key: "lessons", label: "Lessons", cents: 1500 },
        { key: "belayedSession", label: "Belayed Sessions", cents: 1000 },
        { key: "memberGear", label: "Drop-ins (Gear)", cents: 500 },
        { key: "memberNoGear", label: "Drop-ins (No Gear)", cents: 0 },
      ],
    },
  ],
  {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["I", "Total Daily Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Lessons"], ["F", "Belayed Sessions"], ["G", "Drop-ins"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 15], ["F", 10], ["G", "Gear Rental ($5)"], ["H", "No Gear (Free)"]],
    ],
    merges: ["A0:A2", "B0:D0", "C1:D1", "E0:H0", "G1:H1"],
    totalLabel: "TOTAL",
    turnedAway: false,
    widths: [["A", "A", 27.66], ["B", "I", 23.66]],
    monthlyTitle: USAGE_TITLE,
    allDaysTotal: "Total Climbers",
  },
);

// May 2017 onward: the same columns, split by age.
const FORMAT_2017 = makeFormat(
  "2017",
  "Lessons and belayed sessions by age",
  "2017-05-12",
  "2017-06",
  [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [
        {
          label: "Lessons",
          children: [
            { key: "lessons13to20", label: "13–20", cents: 1500 },
            { key: "lessonsOver20", label: "Over 20", cents: 1500 },
          ],
        },
        {
          label: "Belayed Sessions",
          children: [
            { key: "belayedUnder13", label: "Under 13", cents: 1000 },
            { key: "belayed13to20", label: "13–20", cents: 1000 },
            { key: "belayedOver20", label: "Over 20", cents: 1000 },
          ],
        },
        {
          label: "Drop-ins (Gear)",
          children: [
            { key: "gearUnder13", label: "Under 13", cents: 500 },
            { key: "gear13to20", label: "13–20", cents: 500 },
            { key: "gearOver20", label: "Over 20", cents: 500 },
          ],
        },
        {
          label: "Drop-ins (No Gear)",
          children: [
            { key: "noGearUnder13", label: "Under 13", cents: 0 },
            { key: "noGear13to20", label: "13–20", cents: 0 },
            { key: "noGearOver20", label: "Over 20", cents: 0 },
          ],
        },
      ],
    },
  ],
  {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["P", "Total Daily Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Lessons"], ["G", "Belayed Sessions"], ["J", "Drop-ins"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 15], ["G", 10], ["J", "Gear Rental ($5)"], ["M", "No Gear (Free)"]],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13-20"], ["F", "Over 20"], ["G", "Under 13"], ["H", "13-20"], ["I", "Over 20"], ["J", "Under 13"], ["K", "13-20"], ["L", "Over 20"], ["M", "Under 13"], ["N", "13-20"], ["O", "Over 20"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:O0", "E1:F1", "E2:F2", "G1:I1", "G2:I2", "J1:O1", "J2:L2", "M2:O2"],
    totalLabel: "Total Per Age Group",
    overallGroups: ["B", "C", "D", "E:F", "G:I", "J:L", "M:O"],
    turnedAway: false,
    widths: [["A", "A", 27.66], ["B", "D", 19.66], ["E", "O", 13.66], ["P", "P", 23.66]],
    monthlyTitle: USAGE_TITLE,
  },
);

function belayColumns(prices: { tpasc?: number; flexPass?: number; under13: number; to21: number; over22: number }): AttendanceColumnGroup {
  return {
    label: "Drop-ins (equipment + belay)",
    children: [
      ...(prices.tpasc === undefined ? [] : [{ key: "belayTpasc", label: "TPASC", cents: prices.tpasc } as const]),
      ...(prices.flexPass === undefined ? [] : [{ key: "flexPass", label: "Flex Pass", cents: prices.flexPass } as const]),
      { key: "belay5to12", label: "5–12", cents: prices.under13 },
      { key: "belay13to21", label: "13–21", cents: prices.to21 },
      { key: "belay22plus", label: "22+", cents: prices.over22 },
    ],
  };
}

const NO_BELAY: AttendanceColumn = { key: "noBelay22plus", label: "Drop-ins w/o Belays (22+)", cents: 1700 };
const EQUIPMENT_13_PLUS: AttendanceColumn = { key: "equipmentRental", label: "Equipment Only (13+)", cents: 500 };
const LESSONS_25: AttendanceColumn = { key: "lessons", label: "Intro Lessons (13+)", cents: 2500 };

// May 2018: priced by age, not membership, with no TPASC column.
const FORMAT_2018_MAY = makeFormat(
  "2018-may",
  "Intro lessons, no TPASC drop-ins",
  "2018-05-02",
  null,
  [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [LESSONS_25, belayColumns({ under13: 1300, to21: 1500, over22: 2000 }), NO_BELAY, EQUIPMENT_13_PLUS],
    },
    FREE_DROP_INS,
    WAITING,
  ],
  {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["N", "Total Daily Climbers"], ["O", "Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Intro Lessons"], ["F", "Drop-ins with Equipment + Belays"], ["I", "Drop-ins w/o Belays"], ["J", "Equipment Only"], ["K", "Drop-ins"], ["O", "Waiting"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 25], ["F", 13], ["G", 15], ["H", 20], ["I", 17], ["J", 5], ["K", "No Gear (Free)"], ["O", "(Capacity"]],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13+"], ["F", "<13"], ["G", "13-21"], ["H", "22+"], ["I", "22+"], ["J", "13+"], ["K", "<13"], ["L", "13-21"], ["M", "22+"], ["O", "Issues)"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:M0", "F1:H1", "K1:M1", "K2:M2"],
    totalLabel: "Total Per Age Group",
    overallGroups: ["B", "C", "D", "E", "F:H", "I", "J", "K:M"],
    turnedAway: true,
    widths: [["A", "A", 27.66], ["B", "E", 19.66], ["F", "H", 13.66], ["I", "J", 20.66], ["K", "M", 13.66], ["N", "N", 23.66], ["O", "O", 12.66]],
    monthlyTitle: USAGE_TITLE,
  },
);

// Late May 2018: adds a TPASC drop-in column.
const FORMAT_2018_SUMMER = makeFormat(
  "2018-summer",
  "Intro lessons with TPASC drop-ins",
  "2018-05-26",
  "2018-05",
  [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [LESSONS_25, belayColumns({ tpasc: 1000, under13: 1300, to21: 1500, over22: 2000 }), NO_BELAY, EQUIPMENT_13_PLUS],
    },
    FREE_DROP_INS,
    WAITING,
  ],
  {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["O", "Total Daily Climbers"], ["P", "Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Intro Lessons"], ["F", "Drop-ins with Equipment + Belays"], ["J", "Drop-ins w/o Belays"], ["K", "Equipment Only"], ["L", "Drop-ins"], ["P", "Waiting"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 25], ["F", 10], ["G", 13], ["H", 15], ["I", 20], ["J", 17], ["K", 5], ["L", "No Gear (Free)"], ["P", "(Capacity"]],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13+"], ["F", "TPASC"], ["G", "<13"], ["H", "13-21"], ["I", "22+"], ["J", "22+"], ["K", "13+"], ["L", "<13"], ["M", "13-21"], ["N", "22+"], ["P", "Issues)"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:N0", "F1:I1", "L1:N1", "L2:N2"],
    totalLabel: "Total Per Age Group",
    overallGroups: ["B", "C", "D", "E", "F:I", "J", "K", "L:N"],
    turnedAway: true,
    widths: [["A", "A", 27.66], ["B", "E", 19.33], ["F", "I", 12], ["J", "K", 20.66], ["L", "N", 12], ["O", "O", 23.66], ["P", "P", 12.66]],
    monthlyTitle: USAGE_TITLE,
  },
);

const FLEX_BELAY = belayColumns({ tpasc: 1000, flexPass: 1100, under13: 1300, to21: 1500, over22: 2000 });

// Sep 2018: adds a Flex Pass column.
const FORMAT_2018_FLEX = makeFormat(
  "2018-flex",
  "Flex Pass, with drop-ins w/o belays",
  "2018-09-29",
  "2018-09",
  [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [LESSONS_25, FLEX_BELAY, NO_BELAY, EQUIPMENT_13_PLUS],
    },
    FREE_DROP_INS,
    WAITING,
  ],
  {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["P", "Total Daily Climbers"], ["Q", "Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Intro Lessons"], ["F", "Drop-ins with Equipment + Belays"], ["K", "Drop-ins w/o Belays"], ["L", "Equipment Only"], ["M", "Drop-ins"], ["Q", "Waiting"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 25], ["F", 10], ["G", 11], ["H", 13], ["I", 15], ["J", 20], ["K", 17], ["L", 5], ["M", "No Gear (Free)"], ["Q", "(Capacity"]],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13+"], ["F", "TPASC"], ["G", "Flex Pass"], ["H", "<13"], ["I", "13-21"], ["J", "22+"], ["K", "22+"], ["L", "13+"], ["M", "<13"], ["N", "13-21"], ["O", "22+"], ["Q", "Issues)"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:O0", "F1:J1", "M1:O1", "M2:O2"],
    totalLabel: "Total Per Age Group",
    overallGroups: ["B", "C", "D", "E", "F:J", "K", "L", "M:O"],
    turnedAway: true,
    widths: [["A", "A", 25.66], ["B", "E", 17.88], ["F", "J", 12], ["K", "L", 18.66], ["M", "O", 12], ["P", "P", 23.66], ["Q", "Q", 12.66]],
    monthlyTitle: USAGE_TITLE,
  },
);

// Oct 2018's monthly sheet alone: both the columns the month's weeks used.
const FORMAT_2018_OCTOBER = makeFormat(
  "2018-october",
  "October 2018 monthly sheet",
  null,
  "2018-10",
  [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [
        LESSONS_25,
        FLEX_BELAY,
        NO_BELAY,
        { key: "equipmentRental", label: "Equipment Only (TPASC)", cents: 500 },
        { key: "wallPass", label: "Equipment Only (Non-TPASC)", cents: 1000 },
      ],
    },
    FREE_DROP_INS,
    WAITING,
  ],
  {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["Q", "Total Daily Climbers"], ["R", "Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Intro Lessons"], ["F", "Drop-ins with Equipment + Belays"], ["K", "Drop-ins w/o Belays"], ["L", "Equipment Only**"], ["N", "Drop-ins"], ["R", "Waiting"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 25], ["F", 10], ["G", 11], ["H", 13], ["I", 15], ["J", 20], ["K", 17], ["L", 5], ["M", 10], ["N", "No Gear (Free)"], ["R", "(Capacity"]],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13+"], ["F", "TPASC"], ["G", "Flex Pass"], ["H", "<13"], ["I", "13-21"], ["J", "22+"], ["K", "22+"], ["L", "TPASC"], ["M", "Non-TPASC"], ["N", "<13"], ["O", "13-21"], ["P", "22+"], ["R", "Issues)"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:P0", "F1:J1", "L1:M1", "N1:P1", "N2:P2"],
    totalLabel: "Total Per Demographic",
    overallGroups: ["B:D", "E", "F:J", "K", "L:M", "N:P"],
    turnedAway: true,
    widths: [["A", "A", 25.66], ["B", "E", 17.88], ["F", "J", 12], ["K", "M", 12.66], ["N", "P", 12], ["Q", "Q", 23.66], ["R", "R", 12.66]],
    monthlyTitle: USAGE_TITLE,
  },
);

function flexEquipmentGroups(under13: number, to21: number) {
  return [
    utscColumns(200),
    {
      label: "TPASC & Other members",
      children: [
        LESSONS_25,
        belayColumns({ tpasc: 1000, flexPass: 1100, under13, to21, over22: 2000 }),
        { key: "equipmentRental", label: "Equipment Only (TPASC)", cents: 500 },
        { key: "wallPass", label: "Equipment Only (Non-TPASC)", cents: 1000 },
      ],
    },
    FREE_DROP_INS,
    WAITING,
  ] satisfies AttendanceColumnNode[];
}

function flexEquipmentSheet(under13: number, to21: number, totalsSplit: boolean): SheetLayout {
  return {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["P", "Total Daily Climbers"], ["Q", "Climbers"]],
      [["B", "Learn to Climb"], ["C", "Drop-ins"], ["E", "Intro Lessons"], ["F", "Drop-ins with Equipment + Belays"], ["K", "Equipment Only"], ["M", "Drop-ins"], ["Q", "Waiting"]],
      [["B", 2], ["C", "Gear Rental ($2)"], ["D", "No Gear (Free)"], ["E", 25], ["F", 10], ["G", 11], ["H", under13], ["I", to21], ["J", 20], ["K", 5], ["L", 10], ["M", "No Gear (Free)"], ["Q", "(Capacity"]],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13+"], ["F", "TPASC"], ["G", "Flex Pass"], ["H", "<13"], ["I", "13-21"], ["J", "22+"], ["K", "TPASC"], ["L", "Non-TPASC"], ["M", "<13"], ["N", "13-21"], ["O", "22+"], ["Q", "Issues)"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:O0", "F1:J1", "K1:L1", "M1:O1", "M2:O2"],
    totalLabel: "Total Per Demographic",
    overallGroups: totalsSplit ? ["B", "C", "D", "E", "F:J", "K:L", "M:O"] : ["B:D", "E", "F:J", "K:L", "M:O"],
    turnedAway: true,
    widths: [["A", "A", 25.66], ["B", "E", 17.88], ["F", "J", 12], ["K", "L", 18.66], ["M", "O", 12], ["P", "P", 23.66], ["Q", "Q", 12.66]],
    monthlyTitle: USAGE_TITLE,
  };
}

// Oct 2018: equipment splits by membership, and drop-ins w/o belays go.
const FORMAT_2018_EQUIPMENT = makeFormat(
  "2018-equipment",
  "Flex Pass, with equipment by membership",
  "2018-10-13",
  "2018-11",
  flexEquipmentGroups(1300, 1500),
  flexEquipmentSheet(13, 15, true),
);

// The first days of Sep 2019: the new under-22 prices, still with a Flex Pass.
const FORMAT_2019_SEPTEMBER = makeFormat(
  "2019-september",
  "Flex Pass at September 2019 prices",
  "2019-09-04",
  null,
  flexEquipmentGroups(1500, 1700),
  flexEquipmentSheet(15, 17, false),
);

const LESSONS_13_PLUS = (cents: number): AttendanceColumn => ({ key: "lessons", label: "Lessons (13+)", cents });

// Sep 2019 onward: the Flex Pass goes, leaving today's column positions.
function memberGroups(prices: Prices, noShows: boolean, equipmentLabels: [string, string]): AttendanceColumnNode[] {
  return [
    utscColumns(prices.utsc),
    {
      label: "TPASC & Other members",
      children: [
        LESSONS_13_PLUS(prices.lessons),
        {
          label: "Drop-ins (equipment + belay)",
          children: [
            { key: "belayTpasc", label: "TPASC", cents: prices.tpasc },
            { key: "belay5to12", label: "5–12", cents: prices.under13 },
            { key: "belay13to21", label: "13–21", cents: prices.to21 },
            { key: "belay22plus", label: "22+", cents: prices.over22 },
          ],
        },
        { key: "equipmentRental", label: equipmentLabels[0], cents: prices.equipment },
        { key: "wallPass", label: equipmentLabels[1], cents: prices.pass },
      ],
    },
    FREE_DROP_INS,
    WAITING,
    ...(noShows ? [NO_SHOWS] : []),
  ];
}

// In cents.
type Prices = {
  utsc: number;
  lessons: number;
  tpasc: number;
  under13: number;
  to21: number;
  over22: number;
  equipment: number;
  pass: number;
};

// What the sheet prints for a price in cents - 20.4 for $20.40.
function dollars(cents: number) {
  return cents / 100;
}

function memberSheet(prices: Prices, options: { pass: boolean; noShows: boolean; widths: [string, string, number][]; report: boolean; spacer?: boolean }): SheetLayout {
  const utsc = dollars(prices.utsc);
  return {
    header: [
      [["B", "UTSC Students"], ["E", "TPASC & Other Members"], ["O", "Total Daily Climbers"], ["P", "Climbers"]],
      [
        ["B", "Learn to Climb"],
        ["C", "Drop-ins"],
        ["E", "Intro Lessons"],
        ["F", "Drop-ins with Equipment + Belays"],
        ["J", "Equipment Only"],
        ...(options.pass ? [["K", "Climbing Wall Pass"] satisfies HeaderCell] : []),
        ["L", "Drop-ins"],
        ["P", "Waiting"],
        ...(options.noShows ? [["Q", "No"] satisfies HeaderCell] : []),
      ],
      [
        ["B", utsc],
        ["C", `Gear Rental ($${utsc})`],
        ["D", "No Gear (Free)"],
        ["E", dollars(prices.lessons)],
        ["F", dollars(prices.tpasc)],
        ["G", dollars(prices.under13)],
        ["H", dollars(prices.to21)],
        ["I", dollars(prices.over22)],
        ["J", dollars(prices.equipment)],
        ["K", dollars(prices.pass)],
        ["L", "No Gear (Free)"],
        ["P", "(Capacity"],
        ...(options.noShows ? [["Q", "Shows"] satisfies HeaderCell] : []),
      ],
      [["B", "N/A"], ["C", "N/A"], ["D", "N/A"], ["E", "13+"], ["F", "TPASC"], ["G", "<13"], ["H", "13-21"], ["I", "22+"], ["J", "TPASC"], ["K", "Non-TPASC"], ["L", "<13"], ["M", "13-21"], ["N", "22+"], ["P", "Issues)"]],
    ],
    merges: ["A0:A3", "B0:D0", "C1:D1", "E0:N0", "F1:I1", ...(options.pass ? [] : ["J1:K1"]), "L1:N1", "L2:N2"],
    totalLabel: "Total Per Demographic",
    overallGroups: options.pass ? ["B:D", "E", "F:I", "J", "K", "L:N"] : ["B:D", "E", "F:I", "J:K", "L:N"],
    turnedAway: true,
    widths: options.widths,
    monthlyTitle: options.report ? REPORT_TITLE : USAGE_TITLE,
    spacerRow: options.spacer,
  };
}

const PRICES_2019: Prices = { utsc: 200, lessons: 2500, tpasc: 1000, under13: 1500, to21: 1700, over22: 2000, equipment: 500, pass: 1000 };
const PRICES_2023: Prices = { ...PRICES_2019, lessons: 3000, tpasc: 1200, under13: 1800, to21: 2040, over22: 2400, equipment: 600, pass: 1200 };
const PRICES_2025: Prices = { ...PRICES_2023, utsc: 500 };
const WIDE_WIDTHS: [string, string, number][] = [["A", "A", 25.66], ["B", "E", 18.66], ["F", "I", 12.66], ["J", "K", 18.66], ["L", "N", 12.66], ["O", "O", 23.66], ["P", "P", 12.66]];
const NARROW_WIDTHS: [string, string, number][] = [["A", "A", 25.66], ["B", "E", 17.66], ["F", "I", 11.66], ["J", "K", 17.66], ["L", "N", 11.66], ["O", "O", 23.66], ["P", "Q", 11.66]];

const FORMAT_2019_EQUIPMENT = makeFormat(
  "2019-equipment",
  "Equipment by membership",
  "2019-09-07",
  "2019-09",
  memberGroups(PRICES_2019, false, ["Equipment Only (TPASC)", "Equipment Only (Non-TPASC)"]),
  memberSheet(PRICES_2019, { pass: false, noShows: false, widths: WIDE_WIDTHS, report: false }),
);

// Nov 2019: the Non-TPASC equipment column becomes the Climbing Wall Pass.
const FORMAT_2019_PASS = makeFormat(
  "2019-pass",
  "Climbing Wall Pass",
  "2019-11-16",
  "2019-11",
  memberGroups(PRICES_2019, false, ["Equipment Rental", "Wall pass"]),
  memberSheet(PRICES_2019, { pass: true, noShows: false, widths: [["A", "A", 25.66], ["B", "E", 18.66], ["F", "I", 12.66], ["J", "K", 19.66], ["L", "N", 12.66], ["O", "O", 23.66], ["P", "P", 12.66]], report: false }),
);

function reopeningGroups(noShows: boolean): AttendanceColumnNode[] {
  return [
    {
      label: "UTSC",
      children: [
        { key: "utscDropInGear", label: "Gear Rental", cents: 200 },
        { key: "utscDropInNoGear", label: "No Gear", cents: 200 },
      ],
    },
    {
      label: "TPASC Members",
      children: [
        { key: "tpascGear", label: "Gear Rental", cents: 750 },
        { key: "tpascNoGear", label: "No Gear", cents: 500 },
      ],
    },
    {
      label: "Non-Members",
      children: [
        { key: "nonMemberGear", label: "Gear Rental", cents: 2000 },
        { key: "nonMemberNoGear", label: "No Gear", cents: 1500 },
      ],
    },
    { key: "employees", label: "Employees", cents: 0 },
    WAITING,
    ...(noShows ? [NO_SHOWS] : []),
  ];
}

function reopeningSheet(noShows: boolean): SheetLayout {
  return {
    header: [
      [["B", "UTSC Students"], ["D", "TPASC Members"], ["F", "Non-Members"], ["H", "Employees"], ["I", "Total Daily Climbers"], ["J", "Waiting"]],
      [["B", "Gear Rental"], ["C", "No Gear"], ["D", "Gear Rental"], ["E", "No Gear"], ["F", "Gear Rental"], ["G", "No Gear"], ["H", "N/A"], ["J", "(Capacity"], ...(noShows ? [["K", "No Shows"] satisfies HeaderCell] : [])],
      [["B", 2], ["C", 2], ["D", 7.5], ["E", 5], ["F", 20], ["G", 15], ["H", "Free"], ["J", "Issues)"]],
    ],
    merges: ["A0:A2", "B0:C0", "D0:E0", "F0:G0"],
    totalLabel: "Total Per Category",
    overallGroups: ["B:C", "D:E", "F:G", "H"],
    turnedAway: true,
    widths: [["A", "A", 25.66], ["B", "E", 18.66], ["F", "F", 18.55], ["G", "H", 18.66], ["I", "I", 23.66], ["J", "K", 12.66]],
    fiftyMinuteHours: true,
    monthlyTitle: USAGE_TITLE,
    allDaysTotal: "Total Monthly Climbers",
    boldHeaderRows: 1,
  };
}

// Aug 2020: the wall reopens with its own categories and 50-minute slots.
const FORMAT_2020 = makeFormat("2020", "Reopening categories", "2020-08-07", "2020-08", reopeningGroups(false), reopeningSheet(false));

// Sep 2021: adds No Shows.
const FORMAT_2021_REOPENING = makeFormat("2021-reopening", "Reopening categories with no-shows", "2021-09-11", "2021-09", reopeningGroups(true), reopeningSheet(true));

// Oct 2021 onward: today's columns, with only the prices moving since.
const CURRENT_LABELS: [string, string] = ["Equipment Rental", "Wall pass"];

const FORMAT_2021 = makeFormat(
  "2021",
  "Today's columns at 2021 prices",
  "2021-10-23",
  "2021-10",
  memberGroups(PRICES_2019, true, CURRENT_LABELS),
  memberSheet(PRICES_2019, { pass: true, noShows: true, widths: NARROW_WIDTHS, report: true }),
);

const FORMAT_2023 = makeFormat(
  "2023",
  "Today's columns at 2023 prices",
  "2023-10-16",
  "2023-10",
  memberGroups(PRICES_2023, true, CURRENT_LABELS),
  memberSheet(PRICES_2023, { pass: true, noShows: true, widths: NARROW_WIDTHS, report: true, spacer: true }),
);

export const CURRENT_FORMAT = makeFormat(
  "2025",
  "Current format",
  "2025-09-03",
  "2025-09",
  memberGroups(PRICES_2025, true, CURRENT_LABELS),
  memberSheet(PRICES_2025, { pass: true, noShows: true, widths: NARROW_WIDTHS, report: true, spacer: true }),
);

// Oldest first.
export const ATTENDANCE_FORMATS: AttendanceFormat[] = [
  FORMAT_2016,
  FORMAT_2017,
  FORMAT_2018_MAY,
  FORMAT_2018_SUMMER,
  FORMAT_2018_FLEX,
  FORMAT_2018_OCTOBER,
  FORMAT_2018_EQUIPMENT,
  FORMAT_2019_SEPTEMBER,
  FORMAT_2019_EQUIPMENT,
  FORMAT_2019_PASS,
  FORMAT_2020,
  FORMAT_2021_REOPENING,
  FORMAT_2021,
  FORMAT_2023,
  CURRENT_FORMAT,
];

// Each format at each pricing period's prices, made once.
const PRICED = new WeakMap<PricingEntry, Map<string, AttendanceFormat>>();

function withCents(node: AttendanceColumnNode, cents: Partial<Record<AttendanceColumnKey, number>>): AttendanceColumnNode {
  if (isColumnGroup(node)) return { ...node, children: node.children.map((child) => withCents(child, cents)) };
  // Columns of people who didn't climb are never priced.
  const price = cents[node.key];
  return node.cents === null || price === undefined ? node : { ...node, cents: price };
}

// A format with its prices swapped for a pricing period's.
function priced(format: AttendanceFormat, pricing: PricingEntry | undefined): AttendanceFormat {
  if (!pricing) return format;
  let formats = PRICED.get(pricing);
  if (!formats) PRICED.set(pricing, (formats = new Map()));
  let found = formats.get(format.id);
  if (!found) {
    const cents = columnCents(pricing);
    const groups = format.groups.map((node) => withCents(node, cents));
    found = { ...format, groups, columns: groups.flatMap(leavesOf) };
    formats.set(format.id, found);
  }
  return found;
}

// The format a weekly sheet used for this date, YYYY-MM-DD, at the prices of
// that date. Before the first format's start it falls back on the oldest.
export function formatForDate(date: string): AttendanceFormat {
  let found = FORMAT_2016;
  for (const format of ATTENDANCE_FORMATS) {
    if (format.weeklyFrom && format.weeklyFrom <= date) found = format;
  }
  return priced(found, pricingOn(date));
}

function namesIn(nodes: AttendanceColumnNode[], path: string[] = []): [AttendanceColumnKey, string][] {
  return nodes.flatMap((node) =>
    isColumnGroup(node) ? namesIn(node.children, [...path, node.label]) : [[node.key, [...path, node.label].join(", ")]],
  );
}

// "UTSC, Drop-ins (Gear)". A column that isn't in this format is named by the
// newest format that had it.
export function columnName(format: AttendanceFormat, key: AttendanceColumnKey) {
  for (const candidate of [format, ...[...ATTENDANCE_FORMATS].reverse()]) {
    const found = namesIn(candidate.groups).find(([name]) => name === key);
    if (found) return found[1];
  }
  return key;
}

// The format a monthly sheet used for this month, at the prices most of the
// month had. Takes any date in it.
export function formatForMonth(date: string): AttendanceFormat {
  const month = date.slice(0, 7);
  let found = FORMAT_2016;
  for (const format of ATTENDANCE_FORMATS) {
    if (format.monthlyFrom && format.monthlyFrom <= month) found = format;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return priced(found, pricingBetween(`${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`));
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function columnIndex(letter: string) {
  return LETTERS.indexOf(letter);
}

export function columnLetter(index: number) {
  return LETTERS[index];
}

// Which sheet column holds each tally. Tallies run left to right from B, with
// the daily total sitting between the climbers and the columns who didn't
// climb.
export function sheetColumns(format: AttendanceFormat) {
  const climbers = format.columns.filter((column) => column.cents !== null);
  const others = format.columns.filter((column) => column.cents === null);
  const totalIndex = climbers.length + 1;
  return {
    climbers: climbers.map((column, index) => ({ column, letter: columnLetter(index + 1) })),
    total: columnLetter(totalIndex),
    others: others.map((column, index) => ({ column, letter: columnLetter(totalIndex + 1 + index) })),
  };
}
