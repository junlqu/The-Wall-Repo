"use client";

import { useEffect, useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";
import { type BookingSlot, type DayHours, fetchBookingSlots, WEEKLY_HOURS } from "@/lib/schedule";

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Online booking opens 48 hours ahead - today, tomorrow and the day after.
const BOOKABLE_DAYS = 3;

// The booking system's slots for the bookable days, fetched the first time
// the calendar is opened. Unset until then.
type SlotsState = Map<string, BookingSlot[]> | "loading" | "error" | undefined;

function pad(part: number) {
  return String(part).padStart(2, "0");
}

// A local date as "YYYY-MM-DD", matching the booking system's days.
function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Whether a day can be booked online. Once the booking system has answered,
// it decides - a day with nothing left isn't bookable. Until then, any open
// day in the window counts.
function isBookable(date: Date, today: Date, slots: SlotsState) {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Rounded, since a day with a clock change isn't exactly 24 hours.
  const daysAhead = Math.round((date.getTime() - startOfToday.getTime()) / ONE_DAY_MS);
  if (daysAhead < 0 || daysAhead >= BOOKABLE_DAYS) return false;
  if (slots instanceof Map) return (slots.get(dateKey(date))?.length ?? 0) > 0;
  return WEEKLY_HOURS[(date.getDay() + 6) % 7] !== null;
}

// A booking system time ("...T16:00") split into "4:00" and "PM".
function slotClock(stamp: string) {
  const [hours, minutes] = stamp.slice(11, 16).split(":").map(Number);
  return { time: `${hours % 12 || 12}:${pad(minutes)}`, period: hours < 12 ? "AM" : "PM" };
}

// "4:00 – 5:30 PM", or "11:00 AM – 12:30 PM" when it crosses noon.
function formatSlotRange(slot: BookingSlot) {
  const start = slotClock(slot.start);
  const end = slotClock(slot.end);
  const startText = start.period === end.period ? start.time : `${start.time} ${start.period}`;
  return `${startText} – ${end.time} ${end.period}`;
}

function spotsLeft(slot: BookingSlot) {
  return Math.max(0, slot.spots - slot.booked);
}

// Green with plenty left, amber at half or less, red for the last one (or a
// quarter or less), grey once it's full.
function availabilityClass(slot: BookingSlot) {
  const left = spotsLeft(slot);
  if (left === 0) return "bg-neutral-100 text-neutral-500";
  if (left === 1 || left / slot.spots <= 0.25) return "bg-red-100 text-red-700";
  if (left / slot.spots <= 0.5) return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-700";
}

function SlotSection({ title, slots }: { title: string; slots: BookingSlot[] }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <ul className="flex flex-col">
        {slots.map((slot) => {
          const left = spotsLeft(slot);
          return (
            <li key={slot.id} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="tabular-nums text-neutral-800">{formatSlotRange(slot)}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${availabilityClass(slot)}`}
              >
                {left > 0 ? `${left}/${slot.spots} left` : "Full"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// How many drop-ins on a day still have an online spot.
function openDropIns(slots: BookingSlot[]) {
  return slots.filter((slot) => slot.kind === "dropin" && spotsLeft(slot) > 0).length;
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
  const [slots, setSlots] = useState<SlotsState>(undefined);

  // Asks the booking system only the first time the calendar is opened.
  function showCalendar() {
    setView("calendar");
    if (slots !== undefined) return;
    setSlots("loading");
    fetchBookingSlots()
      .then(setSlots)
      .catch(() => setSlots("error"));
  }

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
                    onClick={showCalendar}
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
                          <div className="flex items-start justify-between text-xs text-neutral-500">
                            <span>Learn-to-Climb</span>
                            <span className="flex flex-col items-end">
                              {lessonSlots.map((slot) => (
                                <span key={slot.open}>{`${slot.open} – ${slot.close}`}</span>
                              ))}
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
                      const date = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day);
                      const isToday = isCurrentMonth && day === today.getDate();
                      const hours = WEEKLY_HOURS[weekday];
                      const bookable = isBookable(date, today, slots);
                      const daySlots = slots instanceof Map ? slots.get(dateKey(date)) : undefined;
                      let slotText: string | null = null;
                      if (bookable && slots === "loading") slotText = "…";
                      else if (bookable && daySlots) {
                        const open = openDropIns(daySlots);
                        slotText = open > 0 ? `${open} open` : "Full";
                      }
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedDate(date)}
                          className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                            isToday
                              ? `border-transparent bg-primary text-white hover:bg-primary/90 ${bookable ? "ring-2 ring-secondary ring-offset-1" : ""}`
                              : bookable
                                ? "border-secondary bg-secondary/15 text-primary hover:bg-secondary/25"
                                : "border-transparent text-neutral-700 hover:border-secondary hover:bg-secondary/10"
                          }`}
                        >
                          <span className="text-sm font-semibold">{day}</span>
                          <span className={`text-[10px] leading-tight ${isToday ? "text-white/80" : "text-neutral-500"}`}>
                            {hours ? hours.open.replace(" AM", "a").replace(" PM", "p") : "Closed"}
                          </span>
                          {slotText && (
                            <span
                              className={`text-[10px] font-semibold leading-tight ${isToday ? "text-secondary" : "text-primary"}`}
                            >
                              {slotText}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm border border-secondary bg-secondary/15" />
                      Bookable online
                    </span>
                    {slots === "loading" && <span>Checking available slots…</span>}
                    {slots === "error" && <span>Couldn&apos;t load available slots right now.</span>}
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
        const bookable = isBookable(selectedDate, today, slots);
        const daySlots = slots instanceof Map ? slots.get(dateKey(selectedDate)) : undefined;
        // Anything that isn't a lesson is booked like a drop-in.
        const dropIns = daySlots?.filter((slot) => slot.kind !== "lesson") ?? [];
        const lessons = daySlots?.filter((slot) => slot.kind === "lesson") ?? [];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
            onClick={() => setSelectedDate(null)}
          >
            <div
              className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-lg font-semibold text-neutral-900">
                {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="text-sm text-neutral-600">{formatHours(hours)}</p>

              {bookable && daySlots ? (
                <div className="mt-4 flex flex-col gap-3">
                  {dropIns.length > 0 && <SlotSection title="Drop-ins" slots={dropIns} />}
                  {lessons.length > 0 && <SlotSection title="Lessons" slots={lessons} />}
                  <p className="text-[11px] text-neutral-400">Spots shown are for online booking.</p>
                </div>
              ) : lessonSlots && (
                <div className="mt-2 text-sm text-neutral-600">
                  <span className="font-medium text-neutral-700">Lessons:</span>
                  {lessonSlots.map((slot) => (
                    <p key={slot.open}>{`${slot.open} – ${slot.close}`}</p>
                  ))}
                </div>
              )}

              {bookable && slots === "loading" && (
                <p className="mt-4 text-sm text-neutral-500">Checking available slots…</p>
              )}

              {bookable && (
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
