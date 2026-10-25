"use client";

import { useEffect, useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";

type DayHours = { open: string; close: string } | null;

// Placeholder hours - replace once real scheduling data is wired up.
const WEEKLY_HOURS: Record<number, DayHours> = {
  0: { open: "4:00 PM", close: "10:00 PM" },
  1: null,
  2: { open: "4:00 PM", close: "10:00 PM" },
  3: null,
  4: { open: "4:00 PM", close: "10:00 PM" },
  5: { open: "12:00 PM", close: "4:00 PM" },
  6: { open: "12:00 PM", close: "4:00 PM" },
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Lessons run during the same hours as the wall itself, on Mon/Wed/Fri only.
const LESSON_SLOTS: { open: string; close: string }[] = [
  { open: "4:00 PM", close: "5:30 PM" },
  { open: "6:00 PM", close: "7:30 PM" },
];
const LESSON_DAYS = new Set([0, 2, 4]); // Monday, Wednesday, Friday

function getLessonSlots(weekday: number): { open: string; close: string }[] | null {
  return LESSON_DAYS.has(weekday) ? LESSON_SLOTS : null;
}

type ScheduleUpdate = {
  id: string;
  message: string;
  postedAt: string;
  priority: number;
  // If omitted, the update only shows for a week after postedAt.
  endDate?: string;
};

// Placeholder - replace with real announcements once there's a backend for them.
const SCHEDULE_UPDATES: ScheduleUpdate[] = [
  { id: "1", message: "The wall website is in testing... JK this is Jun lol", postedAt: "2026-09-25", priority: 1 },
  { id: "2", message: "This is Jun again", postedAt: "2026-09-24", priority: 2 },
];

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const UPDATE_ROTATE_MS = 12000;

// An update with an end date stays visible until then; one without shows for
// a week after it was posted. Priority (higher first) decides display order.
function getActiveUpdates(updates: ScheduleUpdate[], now: Date): ScheduleUpdate[] {
  return updates
    .filter((update) =>
      update.endDate
        ? now.getTime() <= new Date(update.endDate).getTime()
        : now.getTime() - new Date(update.postedAt).getTime() <= ONE_WEEK_MS,
    )
    .sort((a, b) => b.priority - a.priority);
}

const BELAY_TEST_NOTE = "The climber must pass or have passed a belay test at TPASC.";

// Placeholder - replace with the real external booking system URL.
const BOOKING_URL = "https://tpasc.ezfacility.com/";
const WAIVER_URL = "https://waiver.smartwaiver.com/w/5b6064099948a/kiosk/";

type PriceItem = {
  label: string;
  price?: string;
  note?: string;
  // Shows an info icon explaining the belay test requirement.
  needsBelayTest?: boolean;
  tiers?: { label: string; price: string }[];
};

const PRICE_GROUPS: { audience: string; items: PriceItem[] }[] = [
  {
    audience: "UTSC Students",
    items: [
      { label: "Drop-in", price: "$0", note: "You have your own gear (shoes + harness)", needsBelayTest: true },
      { label: "Drop-in + Gear", price: "$5", needsBelayTest: true },
      { label: "Learn-to-Climb", price: "$5" },
    ],
  },
  {
    audience: "TPASC Members",
    items: [
      { label: "Drop-in", price: "$0", note: "You have your own gear (shoes + harness)", needsBelayTest: true },
      { label: "Drop-in + Gear", price: "$6", needsBelayTest: true },
      { label: "Belay service (1 hour)", price: "$12" },
      { label: "Learn-to-Climb", price: "$30" },
    ],
  },
  {
    audience: "Non-TPASC Members",
    items: [
      { label: "Drop-in + Gear", price: "$12", needsBelayTest: true },
      {
        label: "Belay service + Gear (1 hour)",
        tiers: [
          { label: "Age 5–12", price: "$18" },
          { label: "Age 13–21", price: "$20.40" },
          { label: "Age 22+", price: "$24" },
        ],
      },
      { label: "Learn-to-Climb", price: "$30" },
    ],
  },
];

const CONTAINER_TABS = [
  { id: "hours", label: "Our Hours" },
  { id: "prices", label: "Prices" },
] as const;

function formatHours(hours: DayHours): string {
  return hours ? `${hours.open} – ${hours.close}` : "Closed";
}

function getMonthGrid(year: number, month: number): (number | null)[] {
  // Date.getDay() is 0=Sun..6=Sat - shift it to a Monday-first index so the
  // grid lines up with the Mon-Sun header row.
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function parseTimeString(time: string): { hours: number; minutes: number } {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return { hours: 0, minutes: 0 };
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

function combineDateAndTime(date: Date, time: string): Date {
  const { hours, minutes } = parseTimeString(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const BOOKING_WINDOW_MS = 48 * ONE_HOUR_MS;

// Booking for a day is only surfaced once its closing time is close enough to
// be worth booking (within 48 hours) but not so close it's already too late
// (within the last hour before closing).
function getClosingSoon(date: Date, hours: DayHours, now: Date): Date | null {
  if (!hours) return null;
  const closingAt = combineDateAndTime(date, hours.close);
  const msUntilClose = closingAt.getTime() - now.getTime();
  if (msUntilClose >= ONE_HOUR_MS && msUntilClose <= BOOKING_WINDOW_MS) {
    return closingAt;
  }
  return null;
}

export default function SchedulePage() {
  const [tab, setTab] = useState<(typeof CONTAINER_TABS)[number]["id"]>("hours");
  const [view, setView] = useState<"weekly" | "calendar">("weekly");

  const today = useMemo(() => new Date(), []);
  // Date.getDay() is 0=Sun..6=Sat - shift it to match the Monday-first
  // DAY_NAMES/DAY_SHORT/WEEKLY_HOURS ordering used throughout this page.
  const todayIndex = (today.getDay() + 6) % 7;
  const [calendarCursor, setCalendarCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const activeUpdates = useMemo(() => getActiveUpdates(SCHEDULE_UPDATES, today), [today]);
  const [updateIndex, setUpdateIndex] = useState(0);
  const [updateVisible, setUpdateVisible] = useState(true);

  function stepUpdate(delta: number) {
    if (activeUpdates.length <= 1) return;
    setUpdateVisible(false);
    setTimeout(() => {
      setUpdateIndex((i) => (i + delta + activeUpdates.length) % activeUpdates.length);
      setUpdateVisible(true);
    }, 300);
  }

  useEffect(() => {
    if (activeUpdates.length <= 1) return;
    const interval = setInterval(() => stepUpdate(1), UPDATE_ROTATE_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUpdates.length]);

  const monthGrid = useMemo(
    () => getMonthGrid(calendarCursor.getFullYear(), calendarCursor.getMonth()),
    [calendarCursor],
  );

  const isCurrentMonth =
    calendarCursor.getFullYear() === today.getFullYear() && calendarCursor.getMonth() === today.getMonth();

  function changeMonth(delta: number) {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">Schedule</h1>
          <p className="mt-2 text-neutral-600">Wall hours and upcoming schedule changes.</p>
        </div>

        {activeUpdates.length > 0 && (
          <div className="relative rounded-lg bg-neutral-200 px-10 py-4 text-center text-sm text-neutral-700">
            {activeUpdates.length > 1 && (
              <button
                type="button"
                onClick={() => stepUpdate(-1)}
                aria-label="Previous update"
                className="absolute inset-y-0 left-0 flex items-center px-2 text-neutral-500 hover:text-neutral-800"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M12.7 15.3a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 1 1 1.4 1.4L8.42 9.6l4.3 4.3a1 1 0 0 1 0 1.4z" />
                </svg>
              </button>
            )}

            <span className="font-semibold text-neutral-800">Update: </span>
            <span className={`transition-opacity duration-300 ${updateVisible ? "opacity-100" : "opacity-0"}`}>
              {activeUpdates[updateIndex % activeUpdates.length].message}
            </span>
            {activeUpdates.length > 1 && (
              <div className="mt-2 flex justify-center gap-1.5">
                {activeUpdates.map((update, i) => (
                  <span
                    key={update.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      i === updateIndex % activeUpdates.length ? "bg-neutral-600" : "bg-neutral-400"
                    }`}
                  />
                ))}
              </div>
            )}

            {activeUpdates.length > 1 && (
              <button
                type="button"
                onClick={() => stepUpdate(1)}
                aria-label="Next update"
                className="absolute inset-y-0 right-0 flex items-center px-2 text-neutral-500 hover:text-neutral-800"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-neutral-600">Reserve your spot through our online booking system.</p>
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80"
            >
              Book online
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </a>
            <p className="text-xs text-neutral-500">
              UTSC students must book a Learn-to-Climb lesson before becoming eligible for regular drop-ins.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-neutral-600">Every climber must also sign our waiver before climbing.</p>
            <a
              href={WAIVER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-primary px-6 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
            >
              Sign waiver
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </a>
            <p className="text-xs text-neutral-500">
              Climbers under the age of 18 must have a parent or guardian sign the waiver for them.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <div role="tablist" className="-mx-6 -mt-6 mb-5 flex border-b border-neutral-200">
            {CONTAINER_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`-mb-px flex-1 border-b-2 py-3 text-sm font-semibold transition-colors ${
                  tab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "prices" ? (
            <div role="tabpanel" id="panel-prices" aria-labelledby="tab-prices" className="flex flex-col gap-6">
              {PRICE_GROUPS.map((group) => (
                <section key={group.audience}>
                  <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    {group.audience}
                  </h2>
                  <div className="flex flex-col divide-y divide-neutral-100">
                    {group.items.map((item) => (
                      <div key={item.label} className="flex flex-col gap-1 px-2 py-3 text-sm text-neutral-700">
                        <div className="flex items-start justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            {item.label}
                            {item.needsBelayTest && <InfoTip text={BELAY_TEST_NOTE} size={14} />}
                          </span>
                          {item.price && <span className="font-semibold text-primary">{item.price}</span>}
                        </div>
                        {item.note && <span className="text-xs text-neutral-500">{item.note}</span>}
                        {item.tiers?.map((tier) => (
                          <div key={tier.label} className="flex items-center justify-between pl-4 text-neutral-600">
                            <span>{tier.label}</span>
                            <span className="font-semibold text-primary">{tier.price}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

            </div>
          ) : (
            <div role="tabpanel" id="panel-hours" aria-labelledby="tab-hours">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Drop-in hours</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setView("weekly")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      view === "weekly" ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }`}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("calendar")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      view === "calendar" ? "bg-primary text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }`}
                  >
                    Calendar
                  </button>
                </div>
              </div>

              {view === "weekly" ? (
                <div className="flex flex-col divide-y divide-neutral-100">
                  {DAY_NAMES.map((name, i) => {
                    const isToday = i === todayIndex;
                    const lessonSlots = getLessonSlots(i);
                    return (
                      <div
                        key={name}
                        className={`flex flex-col gap-1 px-2 py-3 text-sm ${
                          isToday ? "text-primary" : "text-neutral-700"
                        }`}
                      >
                        <div className={`flex items-center justify-between ${isToday ? "font-semibold" : ""}`}>
                          <span>{name}</span>
                          <span>{formatHours(WEEKLY_HOURS[i])}</span>
                        </div>
                        {lessonSlots && (
                          <div className="flex items-center justify-between text-xs text-neutral-500">
                            <span>Learn-to-Climb</span>
                            <span>
                              {lessonSlots.map((slot) => `${slot.open} – ${slot.close}`).join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => changeMonth(-1)}
                      aria-label="Previous month"
                      className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
                    >
                      ←
                    </button>
                    <span className="text-sm font-semibold text-neutral-800">
                      {calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeMonth(1)}
                      aria-label="Next month"
                      className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
                    >
                      →
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-500">
                    {DAY_SHORT.map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {monthGrid.map((day, i) => {
                      if (day === null) return <div key={i} />;
                      const weekday = (i % 7) as number;
                      const isToday = isCurrentMonth && day === today.getDate();
                      const hours = WEEKLY_HOURS[weekday];
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setSelectedDate(new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day))
                          }
                          className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                            isToday
                              ? "border-transparent bg-primary text-white hover:bg-primary/90"
                              : "border-transparent text-neutral-700 hover:border-secondary hover:bg-secondary/10"
                          }`}
                        >
                          <span className="text-sm font-semibold">{day}</span>
                          <span className={`text-[10px] leading-tight ${isToday ? "text-white/80" : "text-neutral-500"}`}>
                            {hours ? hours.open.replace(" AM", "a").replace(" PM", "p") : "Closed"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedDate && (() => {
        const weekday = (selectedDate.getDay() + 6) % 7;
        const hours = WEEKLY_HOURS[weekday];
        const lessonSlots = getLessonSlots(weekday);
        const closingAt = getClosingSoon(selectedDate, hours, today);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-neutral-800">
                {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="mt-1 text-sm text-neutral-600">{formatHours(hours)}</p>

              {lessonSlots && (
                <div className="mt-2 text-sm text-neutral-600">
                  <span className="font-medium text-neutral-700">Lessons: </span>
                  {lessonSlots.map((slot) => `${slot.open} – ${slot.close}`).join(", ")}
                </div>
              )}

              {closingAt && (
                <div className="mt-4 rounded-md bg-secondary/10 p-3 text-sm">
                  <p className="font-medium text-primary">Booking is available for this time.</p>
                  <a
                    href={BOOKING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary underline"
                  >
                    Book online →
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="mt-5 w-full rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
