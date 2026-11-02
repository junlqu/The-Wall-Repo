"use client";

import { type ReactNode, useState } from "react";
import CountChart from "@/components/CountChart";
import GroupedCountChart from "@/components/GroupedCountChart";
import SlidingTabs from "@/components/SlidingTabs";
import ToggleSwitch from "@/components/ToggleSwitch";
import {
  addDays,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceWeek,
  blockWeekDay,
  formatHourRange,
  formatMoney,
  measure,
  measureBlock,
  measureDay,
  type Metric,
  OPEN_DAYS,
  type WeekDay,
  weekDayOf,
  weekEndingFor,
} from "@/lib/attendance";
import { formatForDate, formatForMonth } from "@/lib/attendanceFormats";
import { formatDate } from "@/lib/climbs";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// How much a chart covers, keyed "2026-10-30" (the week's Friday), "2026-10"
// or "2026". A week is shown whole, even when it runs into the next month.
export type Scale = "week" | "month" | "year";
type Period = { scale: Scale; key: string };

const SCALES: { id: Scale; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

// The period of `scale` that `date` falls in.
function periodOf(scale: Scale, date: string): Period {
  const key = scale === "year" ? date.slice(0, 4) : scale === "month" ? date.slice(0, 7) : weekEndingFor(date);
  return { scale, key };
}

// One day of the week over some stretch of time: what each of its hours added
// up to, and how many days that was. A date from a weekly sheet is one day; a
// monthly sheet's Saturdays are several. `summer` marks weekdays on the summer
// schedule.
type DayTally = {
  day: WeekDay;
  days: number;
  summer: boolean;
  hours: Record<string, { count: number; days: number }>;
};

// Weekday drop-ins open earlier in the summer: 2-9 PM rather than the schedule's
// 4-10 PM. Those are the two sets of bars on the weekday chart.
const WEEKDAY_OPENING = Math.min(...OPEN_DAYS.filter((day) => !day.weekend).flatMap((day) => day.hours));
const WEEKDAY_SCHEDULES = [
  { summer: false, name: "Regular hours", colorClassName: "bg-primary" },
  { summer: true, name: "Summer hours", colorClassName: "bg-secondary" },
];

function tallyOfDay(day: AttendanceDay, metric: Metric): DayTally {
  const format = formatForDate(day.date);
  const weekDay = weekDayOf(day.date);
  const hours = Object.entries(day.hours).map(([hour, counts]) => [hour, { count: measure(counts, metric, format), days: 1 }]);
  const summer = !weekDay.weekend && Object.keys(day.hours).some((hour) => Number(hour) < WEEKDAY_OPENING);
  return { day: weekDay, days: 1, summer, hours: Object.fromEntries(hours) };
}

// The last date a monthly sheet covers. One filled in partway through the month
// says how far it got: "As of October 30".
function sheetThrough({ startDay, endDay, notes }: AttendanceMonth) {
  const asOf = new RegExp(`^As of ${MONTHS[Number(startDay.slice(5, 7)) - 1]} (\\d{1,2})\\b`, "i");
  const day = notes.map((note) => note.match(asOf)?.[1]).find(Boolean);
  return day ? `${startDay.slice(0, 8)}${day.padStart(2, "0")}` : endDay;
}

function countWeekDay({ startDay, endDay }: AttendanceMonth, offset: number) {
  let count = 0;
  for (let date = startDay; date <= endDay; date = addDays(date, 1)) {
    if (weekDayOf(date).offset === offset) count++;
  }
  return count;
}

// A monthly sheet adds up each day of the week without saying how many days that
// was, which the averages need, so those come from the weekly sheets. A day
// nobody came to was a closure the monthly sheet doesn't count. A month whose
// weeks were never entered is assumed to have been open every one of that day.
function talliesOfSheet(month: AttendanceMonth, weeks: AttendanceWeek[], metric: Metric): DayTally[] {
  const format = formatForMonth(month.startDay);
  const through = sheetThrough(month);
  const openDays = weeks
    .flatMap((week) => week.days)
    .filter((day) => day.date >= month.startDay && day.date <= through && measureDay(day, "numbers") > 0);

  // A day can have more than one table: "Monday, Oct. 9" and "Mondays (excl. 9)".
  const tallies = new Map<number, DayTally>();
  for (const block of month.blocks) {
    const day = blockWeekDay(block.label);
    if (!day) continue;
    const ofDay = openDays.filter((open) => weekDayOf(open.date).offset === day.offset);
    const assumed = ofDay.length === 0 && measureBlock(block, "numbers", format) > 0 ? countWeekDay(month, day.offset) : 0;
    const tally = tallies.get(day.offset) ?? { day, days: 0, summer: false, hours: {} };
    tally.days = Math.max(tally.days, ofDay.length || assumed);
    for (const [hour, counts] of Object.entries(block.hours)) {
      const count = (tally.hours[hour]?.count ?? 0) + measure(counts, metric, format);
      const days = Math.max(tally.hours[hour]?.days ?? 0, ofDay.filter((open) => open.hours[hour]).length || assumed);
      tally.hours[hour] = { count, days };
    }
    tallies.set(day.offset, tally);
  }

  // A sheet can't separate one day from the rest, so the whole month goes by what
  // most of its weekdays ran: Sept. 2 and 4 on summer hours don't make September
  // a summer month.
  const weekdays = [...tallies.values()].filter((tally) => !tally.day.weekend);
  const opensEarly = (tally: DayTally) =>
    Math.max(0, ...Object.entries(tally.hours).map(([hour, { days }]) => (Number(hour) < WEEKDAY_OPENING ? days : 0)));
  const summer = 2 * weekdays.reduce((sum, tally) => sum + opensEarly(tally), 0) > countDays(weekdays);
  for (const tally of weekdays) tally.summer = summer;
  return [...tallies.values()];
}

// A week comes from its weekly sheet. A month or year comes from its monthly
// sheets, except any month without one yet, which adds up the days its weekly
// sheets show someone came, until there is; `fromWeeks` names those months.
// Without `months` at all, everything adds up the weekly sheets.
function tallyPeriod(
  weeks: AttendanceWeek[],
  months: AttendanceMonth[] | undefined,
  { scale, key }: Period,
  metric: Metric,
): { tallies: DayTally[]; fromWeeks: string[] } {
  if (scale === "week") {
    const days = weeks.find((week) => week.weekEnding === key)?.days ?? [];
    return { tallies: days.map((day) => tallyOfDay(day, metric)), fromWeeks: [] };
  }
  const sheets = (months ?? []).filter((month) => month.startDay.startsWith(key));
  const covered = sheets.map((month) => month.startDay.slice(0, 7));
  const days = weeks
    .flatMap((week) => week.days)
    .filter((day) => day.date.startsWith(key) && !covered.includes(day.date.slice(0, 7)) && measureDay(day, "numbers") > 0);
  const uncovered = [...new Set(days.map((day) => Number(day.date.slice(5, 7))))].sort((a, b) => a - b);
  return {
    tallies: [...sheets.flatMap((sheet) => talliesOfSheet(sheet, weeks, metric)), ...days.map((day) => tallyOfDay(day, metric))],
    fromWeeks: months ? uncovered.map((month) => MONTHS[month - 1]) : [],
  };
}

function countDays(tallies: DayTally[]) {
  return tallies.reduce((total, tally) => total + tally.days, 0);
}

// " · November from weekly sheets", when part of a period has no monthly sheet.
function describeSource(fromWeeks: string[]) {
  return fromWeeks.length > 0 ? ` · ${fromWeeks.join(", ")} from weekly sheets` : "";
}

function describePeriod({ scale, key }: Period) {
  if (scale === "week") return `Week ending ${formatDate(key)}`;
  if (scale === "month") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  return key;
}

function ScaleSlider({ scale, onChange }: { scale: Scale; onChange: (scale: Scale) => void }) {
  return <SlidingTabs label="Period" tabs={SCALES} active={scale} onChange={onChange} />;
}

function formatter(metric: Metric, average: boolean) {
  if (metric === "earnings") return formatMoney;
  return average ? (count: number) => count.toFixed(1) : (count: number) => count.toLocaleString();
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function ChartCard({
  title,
  subtitle,
  controls,
  loadingText,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  controls: ReactNode;
  loadingText?: string | null;
  children: ReactNode;
  className: string;
}) {
  return (
    <section aria-label={title} className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{controls}</div>
      </div>
      <div className="mt-3">
        {loadingText ? (
          <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{loadingText}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// One bar per open day of the week, adding up every one of that day in the
// period - or, as an average, that total spread over the hours it was open.
export function DailyAttendanceChart({
  weeks,
  months,
  anchor,
  defaultScale = "year",
  metric,
  loadingText,
  className,
}: {
  weeks: AttendanceWeek[];
  // The monthly sheets the month and year views add up.
  months?: AttendanceMonth[];
  // The Friday of the week the chart counts from - the slider shows that
  // week, or the month or year it ended in.
  anchor: string;
  defaultScale?: Scale;
  metric: Metric;
  loadingText?: string | null;
  className: string;
}) {
  const [scale, setScale] = useState<Scale>(defaultScale);
  const period = periodOf(scale, anchor);
  const [average, setAverage] = useState(false);
  const { tallies, fromWeeks } = tallyPeriod(weeks, months, period, metric);
  const format = formatter(metric, average);

  // The open days, plus any others the wall opened on in this period.
  const weekDays = [...new Map([...OPEN_DAYS, ...tallies.map((tally) => tally.day)].map((day) => [day.offset, day])).values()];
  const counts = weekDays.sort((a, b) => a.offset - b.offset).map((openDay) => {
    const ofDay = tallies.filter((tally) => tally.day.offset === openDay.offset).flatMap((tally) => Object.values(tally.hours));
    const total = ofDay.reduce((sum, hour) => sum + hour.count, 0);
    const hours = ofDay.reduce((sum, hour) => sum + hour.days, 0);
    return { label: openDay.short, count: average ? (hours === 0 ? 0 : total / hours) : total };
  });

  const what = metric === "numbers" ? "Climbers" : "Earnings";
  return (
    <ChartCard
      title={average ? `${what} per hour, by day` : `${what} per day`}
      subtitle={`${describePeriod(period)} · ${plural(countDays(tallies), "day")} recorded${average ? " · average per open hour" : ""}${describeSource(fromWeeks)}`}
      loadingText={loadingText}
      className={className}
      controls={
        <>
          <ToggleSwitch off="Total" on="Avg per hour" checked={average} onChange={setAverage} label="Show average per hour" />
          <ScaleSlider scale={scale} onChange={setScale} />
        </>
      }
    >
      <CountChart
        counts={counts}
        noun={(count) => (metric === "numbers" ? `${format(count)} climbers` : format(count))}
        formatCount={format}
        caption={`${what}${average ? " per hour" : ""} by day, ${describePeriod(period)}`}
        categoryHeader="Day"
        countHeader={what}
        emptyText="No attendance recorded for this period"
      />
    </ChartCard>
  );
}

// One bar per hour slot: the average number of climbers (or earnings) in that
// hour across the weekend days or weekdays in the period that had it open.
// Weekends and weekdays keep different hours, so they're shown apart, and
// weekdays have a bar each for the regular and summer schedules. An hour before
// the regular opening can only have been on summer hours, even in a month that
// mostly wasn't.
export function HourlyAttendanceChart({
  weeks,
  months,
  anchor,
  defaultScale = "year",
  metric,
  loadingText,
  className,
}: {
  weeks: AttendanceWeek[];
  // The monthly sheets the month and year views add up.
  months?: AttendanceMonth[];
  // The Friday of the week the chart counts from - the slider shows that
  // week, or the month or year it ended in.
  anchor: string;
  defaultScale?: Scale;
  metric: Metric;
  loadingText?: string | null;
  className: string;
}) {
  const [scale, setScale] = useState<Scale>(defaultScale);
  const period = periodOf(scale, anchor);
  const [weekdays, setWeekdays] = useState(false);
  const { tallies: allTallies, fromWeeks } = tallyPeriod(weeks, months, period, metric);
  const tallies = allTallies.filter((tally) => tally.day.weekend === !weekdays);
  const format = formatter(metric, true);

  // The schedule's hours, plus any others a day was recorded with.
  const hours = [
    ...new Set([
      ...OPEN_DAYS.filter((day) => day.weekend === !weekdays).flatMap((day) => day.hours),
      ...tallies.flatMap((tally) => Object.keys(tally.hours).map(Number)),
    ]),
  ].sort((a, b) => a - b);
  const slotsAt = (hour: number, ofTally: (tally: DayTally) => boolean = () => true) =>
    tallies.filter(ofTally).flatMap((tally) => tally.hours[String(hour)] ?? []);
  // Only days that were open that hour count towards its average.
  const average = (slots: { count: number; days: number }[]) => {
    const days = slots.reduce((sum, slot) => sum + slot.days, 0);
    return days === 0 ? 0 : slots.reduce((sum, slot) => sum + slot.count, 0) / days;
  };
  const counts = hours.map((hour) => ({ label: formatHourRange(hour), count: average(slotsAt(hour)) }));

  const schedules = WEEKDAY_SCHEDULES.flatMap(({ summer, name, colorClassName }) => {
    const slotsOf = (hour: number) => slotsAt(hour, (tally) => (tally.summer || hour < WEEKDAY_OPENING) === summer);
    const open = hours.filter((hour) => slotsOf(hour).length > 0);
    if (open.length === 0) return [];
    return [{ name: `${name}, ${formatHourRange(open[0], open[open.length - 1])}`, colorClassName, slotsOf }];
  });

  const what = metric === "numbers" ? "Climbers" : "Earnings";
  const group = weekdays ? "Weekdays" : "Weekends";
  return (
    <ChartCard
      title={`Average ${what.toLowerCase()} per hour`}
      subtitle={`${group} · ${describePeriod(period)} · averaged over ${plural(countDays(tallies), "day")}${describeSource(fromWeeks)}`}
      loadingText={loadingText}
      className={className}
      controls={
        <>
          <ToggleSwitch off="Weekends" on="Weekdays" checked={weekdays} onChange={setWeekdays} label="Show weekdays" />
          <ScaleSlider scale={scale} onChange={setScale} />
        </>
      }
    >
      {weekdays ? (
        <GroupedCountChart
          series={schedules}
          counts={hours.map((hour) => ({
            label: formatHourRange(hour),
            values: schedules.map(({ slotsOf }) => (slotsOf(hour).length > 0 ? average(slotsOf(hour)) : null)),
          }))}
          noun={(count) => (metric === "numbers" ? `${format(count)} climbers` : format(count))}
          formatCount={format}
          caption={`Average ${what.toLowerCase()} per hour on weekdays, ${describePeriod(period)}`}
          categoryHeader="Hour"
          emptyText="No weekdays recorded for this period"
          barClassName="min-w-16"
        />
      ) : (
        <CountChart
          counts={counts}
          noun={(count) => (metric === "numbers" ? `${format(count)} climbers` : format(count))}
          formatCount={format}
          caption={`Average ${what.toLowerCase()} per hour on weekends, ${describePeriod(period)}`}
          categoryHeader="Hour"
          countHeader={what}
          emptyText="No weekends recorded for this period"
          barClassName="min-w-16"
        />
      )}
    </ChartCard>
  );
}
