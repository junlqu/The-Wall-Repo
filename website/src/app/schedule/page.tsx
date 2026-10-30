"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Carousel from "@/components/Carousel";
import InfoTip from "@/components/InfoTip";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import { formatShortDate } from "@/lib/announcements";
import { parseDate } from "@/lib/climbs";
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
      { label: "Belay service + Gear (1 hour)", price: "$12" },
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

function formatHours(hours: DayHours): string {
  return hours ? `${hours.open} – ${hours.close}` : "Closed";
}

// The next day after `weekday` that the wall is open, as a Monday-first index.
function nextOpenDay(weekday: number) {
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = (weekday + ahead) % 7;
    if (WEEKLY_HOURS[day]) return { day, ahead };
  }
  return null;
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

// The booking system's slots for the bookable days, fetched when the page loads.
type SlotsState = Map<string, BookingSlot[]> | "loading" | "error";

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
    <section className="flex flex-col gap-1">
      <Kicker className="text-neutral-500">{title}</Kicker>
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

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.75-13a.75.75 0 0 0-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 1 0 1.06-1.06l-2.78-2.78V5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function UpdateSlide({ update }: { update: ScheduleUpdate }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-2">
        <Kicker className="text-amber-700">Schedule update</Kicker>
        <span className="text-xs font-semibold text-amber-800/70">{formatShortDate(parseDate(update.postedAt))}</span>
      </div>
      <p className="font-serif text-2xl leading-snug font-bold text-neutral-900 sm:text-3xl">{update.message}</p>
    </article>
  );
}

// The lesson times as chips - what today shows if the booking system can't
// be reached.
function LessonTimes({ weekday }: { weekday: number }) {
  const lessonSlots = getLessonSlots(weekday);
  if (!lessonSlots) return <p className="text-sm text-neutral-600">No lessons today - drop-ins only.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-600">Learn-to-Climb lessons today:</p>
      <div className="flex flex-wrap gap-2">
        {lessonSlots.map((slot) => (
          <span
            key={slot.open}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-semibold text-primary"
          >
            <ClockIcon />
            {`${slot.open} – ${slot.close}`}
          </span>
        ))}
      </div>
    </div>
  );
}

// Today's sessions and how many online spots each has left.
function TodaySlots({ weekday, slots }: { weekday: number; slots: BookingSlot[] }) {
  if (slots.length === 0) {
    return <p className="text-sm text-neutral-600">No sessions left to book online today.</p>;
  }
  // Anything that isn't a lesson is booked like a drop-in.
  const dropIns = slots.filter((slot) => slot.kind !== "lesson");
  const lessons = slots.filter((slot) => slot.kind === "lesson");
  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
      {dropIns.length > 0 && <SlotSection title="Drop-ins" slots={dropIns} />}
      {lessons.length > 0 ? (
        <SlotSection title="Lessons" slots={lessons} />
      ) : (
        getLessonSlots(weekday) === null && <p className="text-xs text-neutral-500">No lessons today.</p>
      )}
      <p className="text-[11px] text-neutral-400">Spots shown are for online booking.</p>
    </div>
  );
}

// Today's hours and sessions up front - or when the wall opens next.
function TodayCard({ weekday, today, slots }: { weekday: number; today: Date; slots: SlotsState }) {
  const hours = WEEKLY_HOURS[weekday];
  const next = hours ? null : nextOpenDay(weekday);

  return (
    <article className="relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Kicker className="text-secondary">Today at the wall</Kicker>
        <span className="text-sm font-semibold text-neutral-500">{DAY_NAMES[weekday]}</span>
      </div>

      {hours ? (
        <>
          <h2 className="font-serif text-3xl leading-tight font-bold text-primary sm:text-4xl">
            Drop-ins run {formatHours(hours)}
          </h2>
          {slots === "loading" ? (
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4" aria-label="Checking available slots">
              <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-200/70" />
              <div className="h-4 w-full animate-pulse rounded bg-neutral-200/70" />
              <div className="h-4 w-full animate-pulse rounded bg-neutral-200/70" />
            </div>
          ) : slots === "error" ? (
            <>
              <LessonTimes weekday={weekday} />
              <p className="text-xs text-neutral-500">Couldn&apos;t load available slots right now.</p>
            </>
          ) : (
            <TodaySlots weekday={weekday} slots={slots.get(dateKey(today)) ?? []} />
          )}
        </>
      ) : (
        <>
          <h2 className="font-serif text-3xl leading-tight font-bold text-primary sm:text-4xl">Closed today</h2>
          {next && (
            <p className="text-sm text-neutral-600">
              Open again {next.ahead === 1 ? "tomorrow" : DAY_NAMES[next.day]},{" "}
              <span className="font-semibold text-neutral-800">{formatHours(WEEKLY_HOURS[next.day])}</span>.
            </p>
          )}
        </>
      )}
    </article>
  );
}

function Step({
  number,
  title,
  children,
  notes = [],
  action,
}: {
  number: number;
  title: string;
  children: ReactNode;
  notes?: string[];
  action?: ReactNode;
}) {
  return (
    <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-lg font-bold text-white"
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
        <p className="text-sm text-neutral-600">{children}</p>
        {action}
        {notes.map((note) => (
          <p key={note} className="text-xs text-neutral-500">
            {note}
          </p>
        ))}
      </div>
    </li>
  );
}

function BeforeYouClimb() {
  return (
    <article className="flex h-full flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <Kicker className="text-neutral-500">Before you climb</Kicker>
      <ol className="flex flex-col divide-y divide-neutral-100">
        <Step
          number={1}
          title="Book your spot"
          notes={["UTSC students must book a Learn-to-Climb lesson before becoming eligible for regular drop-ins."]}
          action={
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80"
            >
              Book online
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </a>
          }
        >
          Reserve your spot through our online booking system.
        </Step>
        <Step
          number={2}
          title="Sign the waiver"
          notes={["Climbers under the age of 18 must have a parent or guardian sign the waiver for them."]}
          action={
            <a
              href={WAIVER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
            >
              Sign waiver
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </a>
          }
        >
          Every climber must sign our waiver before climbing.
        </Step>
        <Step
          number={3}
          title="Pay at the front desk"
          notes={["Show up at least 5 minutes early to get geared up."]}
        >
          Pay at the front desk, then bring the receipt down to show staff at the wall.
        </Step>
      </ol>
    </article>
  );
}

function PriceCard({ audience, items }: { audience: string; items: PriceItem[] }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="font-serif text-xl font-bold text-primary">{audience}</h3>
      <div className="flex flex-col divide-y divide-neutral-100 border-t border-neutral-100">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 py-3 text-sm text-neutral-700">
            <div className="flex items-start justify-between gap-4">
              <span className="flex items-center gap-1.5">
                {item.label}
                {item.needsBelayTest && <InfoTip text={BELAY_TEST_NOTE} size={14} />}
              </span>
              {item.price && <span className="font-semibold text-primary tabular-nums">{item.price}</span>}
            </div>
            {item.note && <span className="text-xs text-neutral-500">{item.note}</span>}
            {item.tiers?.map((tier) => (
              <div key={tier.label} className="flex items-center justify-between pl-4 text-neutral-600">
                <span>{tier.label}</span>
                <span className="font-semibold text-primary tabular-nums">{tier.price}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

function ViewToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1 text-sm font-semibold transition-colors ${
        active ? "bg-primary text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}

export default function SchedulePage() {
  const [view, setView] = useState<"weekly" | "calendar">("weekly");

  const today = useMemo(() => new Date(), []);
  // Date.getDay() is 0=Sun..6=Sat - shift it to match the Monday-first
  // DAY_NAMES/DAY_SHORT/WEEKLY_HOURS ordering used throughout this page.
  const todayIndex = (today.getDay() + 6) % 7;
  const [calendarCursor, setCalendarCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<SlotsState>("loading");

  useEffect(() => {
    fetchBookingSlots()
      .then(setSlots)
      .catch(() => setSlots("error"));
  }, []);

  const activeUpdates = useMemo(() => getActiveUpdates(SCHEDULE_UPDATES, today), [today]);

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
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead
          title="The Wall Schedule"
          tagline="Opening hours, lessons, prices, and how to book your spot on the wall."
          now={today}
        />

        {activeUpdates.length > 0 && (
          <Carousel
            label="Schedule updates"
            items={activeUpdates}
            getKey={(update) => update.id}
            renderItem={(update) => <UpdateSlide update={update} />}
            rotateMs={UPDATE_ROTATE_MS}
          />
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <TodayCard weekday={todayIndex} today={today} slots={slots} />
          <BeforeYouClimb />
        </div>

        <section className="flex flex-col gap-6">
          <SectionRule title="Hours" />
          <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Kicker className="text-neutral-500">Drop-in hours</Kicker>
              <div className="flex gap-1 rounded-full bg-neutral-50 p-1 ring-1 ring-neutral-200">
                <ViewToggle active={view === "weekly"} label="Weekly" onClick={() => setView("weekly")} />
                <ViewToggle active={view === "calendar"} label="Calendar" onClick={() => setView("calendar")} />
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
                      className={`flex flex-col gap-1 px-3 py-3 text-sm ${
                        isToday ? "rounded-lg bg-secondary/10 text-primary" : "text-neutral-700"
                      }`}
                    >
                      <div className={`flex items-center justify-between ${isToday ? "font-semibold" : ""}`}>
                        <span className="flex items-center gap-2">
                          {name}
                          {isToday && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                              Today
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums">{formatHours(WEEKLY_HOURS[i])}</span>
                      </div>
                      {lessonSlots && (
                        <div className="flex items-start justify-between text-xs text-neutral-500">
                          <span>Learn-to-Climb</span>
                          <span className="flex flex-col items-end tabular-nums">
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
                    className="rounded-full px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
                  >
                    ←
                  </button>
                  <span className="font-serif text-lg font-bold text-primary">
                    {calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeMonth(1)}
                    aria-label="Next month"
                    className="rounded-full px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
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
                        className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
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
        </section>

        <section className="flex flex-col gap-6">
          <SectionRule title="Prices" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PRICE_GROUPS.map((group) => (
              <PriceCard key={group.audience} audience={group.audience} items={group.items} />
            ))}
          </div>
        </section>
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
              className="relative w-full max-w-sm overflow-hidden rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />
              <p className="font-serif text-2xl leading-tight font-bold text-primary">
                {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="mt-1 text-sm text-neutral-600">{formatHours(hours)}</p>

              {bookable && daySlots ? (
                <div className="mt-4 flex flex-col gap-3">
                  {dropIns.length > 0 && <SlotSection title="Drop-ins" slots={dropIns} />}
                  {lessons.length > 0 && <SlotSection title="Lessons" slots={lessons} />}
                  <p className="text-[11px] text-neutral-400">Spots shown are for online booking.</p>
                </div>
              ) : lessonSlots && (
                <div className="mt-4 flex flex-col gap-1 text-sm text-neutral-600">
                  <Kicker className="text-neutral-500">Lessons</Kicker>
                  {lessonSlots.map((slot) => (
                    <p key={slot.open}>{`${slot.open} – ${slot.close}`}</p>
                  ))}
                </div>
              )}

              {bookable && slots === "loading" && (
                <p className="mt-4 text-sm text-neutral-500">Checking available slots…</p>
              )}

              {bookable && (
                <div className="mt-4 rounded-lg bg-secondary/10 p-3 text-sm">
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
