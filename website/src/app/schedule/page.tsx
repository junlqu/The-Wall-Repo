"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Carousel, { SLIDE_PADDING } from "@/components/Carousel";
import InfoTip from "@/components/InfoTip";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import { formatShortDate } from "@/lib/announcements";
import { parseDate } from "@/lib/climbs";
import {
  closureOn,
  DAY_NAMES,
  type DayHours,
  entryStatus,
  formatCents,
  formatDayHours,
  formatEntryDates,
  formatShortClock,
  hoursOn,
  lessonsOf,
  lessonsOn,
  PRICE_LIST,
  type PriceListItem,
  type Prices,
  pricesOn,
  useDetails,
  type WeekHours,
  type WeekLessons,
} from "@/lib/details";
import { BOOKING_URL, type BookingSlot, fetchBookingSlots, WAIVER_URL } from "@/lib/schedule";

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A date's Learn-to-Climb sessions, set with the hours on the Operations page -
// null when there are none (or the wall is closed).
function getLessonSlots(date: Date): DayHours[] | null {
  const lessons = lessonsOn(dateKey(date));
  return lessons.length > 0 ? lessons : null;
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

// Hours, closures and prices all come from the Operations pages (lib/details),
// falling back on the built-in ones for anything never set.
function formatHours(hours: DayHours | null): string {
  return formatDayHours(hours);
}

// How far ahead to look for the next open day - long enough for any closure.
const NEXT_OPEN_SEARCH_DAYS = 120;

// The next day after `from` that the wall is open, going by the hours and
// closures in effect on each day.
function nextOpenDay(from: Date) {
  for (let ahead = 1; ahead <= NEXT_OPEN_SEARCH_DAYS; ahead++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + ahead);
    const hours = hoursOn(dateKey(date));
    if (hours) return { date, ahead, hours };
  }
  return null;
}

// "Mon, Wed, Fri: 4:00 PM – 10:00 PM · Tue, Thu: Closed" - days with the same
// hours grouped together.
function describeWeek(week: WeekHours) {
  return groupDays(week.map((hours) => formatHours(hours)));
}

// "Mon, Wed, Fri: 4:00 PM – 5:30 PM, 6:00 PM – 7:30 PM" - the days with
// lessons, grouped the same way.
function describeLessons(lessons: WeekLessons) {
  const text = groupDays(lessons.map((sessions) => (sessions.length > 0 ? sessions.map(formatHours).join(", ") : null)));
  return text || "none";
}

// Days grouped by what they say, leaving out the ones with nothing to say.
function groupDays(texts: (string | null)[]) {
  const groups = new Map<string, string[]>();
  texts.forEach((text, index) => {
    if (text !== null) groups.set(text, [...(groups.get(text) ?? []), DAY_SHORT[index]]);
  });
  return [...groups].map(([text, days]) => `${days.join(", ")}: ${text}`).join(" · ");
}

// How far ahead the Hours card lists closures and hours changes.
const UPCOMING_DAYS = 90;

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
  return hoursOn(dateKey(date)) !== null;
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
    <article className={`flex h-full flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 ${SLIDE_PADDING}`}>
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
function LessonTimes({ date }: { date: Date }) {
  const lessonSlots = getLessonSlots(date);
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
            {formatHours(slot)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Today's sessions and how many online spots each has left.
function TodaySlots({ date, slots }: { date: Date; slots: BookingSlot[] }) {
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
        getLessonSlots(date) === null && <p className="text-xs text-neutral-500">No lessons today.</p>
      )}
      <p className="text-[11px] text-neutral-400">Spots shown are for online booking.</p>
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-neutral-200/70 ${className}`} />;
}

// Today's hours and sessions up front - or when the wall opens next.
function TodayCard({ weekday, today, slots, ready }: { weekday: number; today: Date; slots: SlotsState; ready: boolean }) {
  const closure = closureOn(dateKey(today));
  const hours = hoursOn(dateKey(today));
  const next = hours ? null : nextOpenDay(today);

  return (
    <article className="relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Kicker className="text-secondary">Today at the wall</Kicker>
        <span className="text-sm font-semibold text-neutral-500">{DAY_NAMES[weekday]}</span>
      </div>

      {!ready ? (
        <div className="flex flex-col gap-3" aria-label="Loading today's hours">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : hours ? (
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
              <LessonTimes date={today} />
              <p className="text-xs text-neutral-500">Couldn&apos;t load available slots right now.</p>
            </>
          ) : (
            <TodaySlots date={today} slots={slots.get(dateKey(today)) ?? []} />
          )}
        </>
      ) : (
        <>
          <h2 className="font-serif text-3xl leading-tight font-bold text-primary sm:text-4xl">Closed today</h2>
          {closure && <p className="text-sm font-semibold text-amber-800">{closure.reason}</p>}
          {next && (
            <p className="text-sm text-neutral-600">
              Open again{" "}
              {next.ahead === 1
                ? "tomorrow"
                : next.ahead < 7
                  ? DAY_NAMES[(next.date.getDay() + 6) % 7]
                  : next.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              , <span className="font-semibold text-neutral-800">{formatHours(next.hours)}</span>.
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

function PriceCard({ audience, items, prices }: { audience: string; items: PriceListItem[]; prices: Prices }) {
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
              {item.key && <span className="font-semibold text-primary tabular-nums">{formatCents(prices[item.key])}</span>}
            </div>
            {item.note && <span className="text-xs text-neutral-500">{item.note}</span>}
            {item.tiers?.map((tier) => (
              <div key={tier.label} className="flex items-center justify-between pl-4 text-neutral-600">
                <span>{tier.label}</span>
                <span className="font-semibold text-primary tabular-nums">{formatCents(prices[tier.key])}</span>
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

type DetailsState = ReturnType<typeof useDetails>;

// The closures and hours changes coming up soon, soonest first.
function upcomingChanges(details: DetailsState, today: Date) {
  if (!details) return [];
  const todayText = dateKey(today);
  const until = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + UPCOMING_DAYS));
  const closures = details.closures.entries
    .filter((entry) => entryStatus("closures", entry, todayText) !== "past" && entry.startDate <= until)
    .map((entry) => ({ id: entry.id, start: entry.startDate, when: formatEntryDates("closures", entry), what: `Closed - ${entry.reason}` }));
  const hours = details.hours.entries
    .filter((entry) => entryStatus("hours", entry, todayText) === "upcoming" && entry.startDate <= until)
    .map((entry) => ({ id: entry.id, start: entry.startDate, when: formatEntryDates("hours", entry), what: `New hours - ${describeWeek(entry.week)}. Lessons - ${describeLessons(lessonsOf(entry))}` }));
  return [...closures, ...hours].sort((a, b) => a.start.localeCompare(b.start));
}

export default function SchedulePage() {
  const [view, setView] = useState<"weekly" | "calendar">("weekly");
  const [priceView, setPriceView] = useState<"now" | "next">("now");
  // Hours, closures and prices - the built-in ones stand in if they can't load.
  const details = useDetails();
  const ready = details !== undefined;

  const today = useMemo(() => new Date(), []);
  // Date.getDay() is 0=Sun..6=Sat - shift it to match the Monday-first
  // DAY_NAMES/DAY_SHORT ordering used throughout this page.
  const todayIndex = (today.getDay() + 6) % 7;
  // This week, Monday to Sunday, so the weekly view shows its closures.
  const weekDates = useMemo(
    () => DAY_NAMES.map((_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayIndex + i)),
    [today, todayIndex],
  );
  const [calendarCursor, setCalendarCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<SlotsState>("loading");

  useEffect(() => {
    fetchBookingSlots()
      .then(setSlots)
      .catch(() => setSlots("error"));
  }, []);

  const activeUpdates = useMemo(() => getActiveUpdates(SCHEDULE_UPDATES, today), [today]);
  const changes = upcomingChanges(details, today);
  const nextPricing = details?.pricing.entries.find((entry) => entryStatus("pricing", entry, dateKey(today)) === "upcoming");
  const prices = pricesOn(priceView === "next" && nextPricing ? nextPricing.startDate : dateKey(today));

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
          title="Schedule"
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
          <TodayCard weekday={todayIndex} today={today} slots={slots} ready={ready} />
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

            {!ready ? (
              <div className="flex flex-col gap-3" aria-label="Loading hours">
                {DAY_NAMES.map((name) => (
                  <Skeleton key={name} className="h-5 w-full" />
                ))}
              </div>
            ) : view === "weekly" ? (
              <div className="flex flex-col divide-y divide-neutral-100">
                {DAY_NAMES.map((name, i) => {
                  const isToday = i === todayIndex;
                  const date = weekDates[i];
                  const hours = hoursOn(dateKey(date));
                  const closure = closureOn(dateKey(date));
                  const lessonSlots = getLessonSlots(date);
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
                          <span className="text-xs font-normal text-neutral-400">
                            {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          {isToday && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                              Today
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums">{formatHours(hours)}</span>
                      </div>
                      {closure && <p className="text-xs font-semibold text-amber-800">Closure: {closure.reason}</p>}
                      {lessonSlots && (
                        <div className="flex items-start justify-between text-xs text-neutral-500">
                          <span>Learn-to-Climb</span>
                          <span className="flex flex-col items-end tabular-nums">
                            {lessonSlots.map((slot) => (
                              <span key={slot.open}>{formatHours(slot)}</span>
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
                    const date = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day);
                    const isToday = isCurrentMonth && day === today.getDate();
                    const hours = hoursOn(dateKey(date));
                    const closure = closureOn(dateKey(date));
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
                        <span
                          className={`text-[10px] leading-tight ${
                            closure
                              ? `font-semibold ${isToday ? "text-white" : "text-amber-700"}`
                              : isToday
                                ? "text-white/80"
                                : "text-neutral-500"
                          }`}
                        >
                          {hours ? formatShortClock(hours.open) : "Closed"}
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
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm border border-secondary bg-secondary/15" />
                      Bookable online
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold text-amber-700">Closed</span>
                      Special closure
                    </span>
                  </span>
                  {slots === "loading" && <span>Checking available slots…</span>}
                  {slots === "error" && <span>Couldn&apos;t load available slots right now.</span>}
                </div>
              </div>
            )}

            {changes.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
                <Kicker className="text-neutral-500">Coming up</Kicker>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {changes.map((change) => (
                    <li key={change.id} className="flex flex-col gap-x-3 sm:flex-row">
                      <span className="shrink-0 font-semibold text-primary">{change.when}</span>
                      <span className="text-neutral-600">{change.what}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionRule title="Prices" />
          {nextPricing && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-primary">
              <span>Prices change {formatEntryDates("pricing", nextPricing).replace(/^From /, "from ")}.</span>
              <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-neutral-200">
                <ViewToggle active={priceView === "now"} label="Current" onClick={() => setPriceView("now")} />
                <ViewToggle active={priceView === "next"} label="Upcoming" onClick={() => setPriceView("next")} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PRICE_LIST.map((group) =>
              ready ? (
                <PriceCard key={group.audience} audience={group.audience} items={group.items} prices={prices} />
              ) : (
                <Skeleton key={group.audience} className="h-56 w-full rounded-xl" />
              ),
            )}
          </div>
        </section>
      </div>

      {selectedDate && (() => {
        const hours = hoursOn(dateKey(selectedDate));
        const closure = closureOn(dateKey(selectedDate));
        const lessonSlots = getLessonSlots(selectedDate);
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
              {closure && <p className="mt-1 text-sm font-semibold text-amber-800">Closure: {closure.reason}</p>}

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
                    <p key={slot.open}>{formatHours(slot)}</p>
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
