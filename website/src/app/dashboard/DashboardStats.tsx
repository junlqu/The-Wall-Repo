"use client";

import { type ReactNode, useState } from "react";
import CountChart from "@/components/CountChart";
import RingChart from "@/components/RingChart";
import TabBar from "@/components/TabBar";
import { LINES } from "@/lib/climbs";
import type { DashboardMetrics } from "@/lib/dashboard";
import { type ClimbKind, GRADE_SCALES } from "@/lib/grades";

// Charts of their own climbing, for the dashboard's Stats tab.

// The site's colours, as the attendance rings use them. Each stays with its
// type of climb.
const TYPE_SLICES = [
  { type: "route", name: "Routes", color: "var(--color-primary)" },
  { type: "boulder", name: "Boulders", color: "var(--color-secondary)" },
  { type: "combo", name: "Combos", color: "#eb6834" },
] as const;

const SHAPE_TABS = [
  { id: "bar" as const, label: "Bars" },
  { id: "ring" as const, label: "Rings" },
];
type Shape = (typeof SHAPE_TABS)[number]["id"];

const KIND_TABS = [
  { id: "route" as const, label: "Routes" },
  { id: "boulder" as const, label: "Boulders" },
];

const plural = (word: string) => (count: number) => `${count} ${word}${count === 1 ? "" : "s"}`;
const sends = plural("send");

// Dyno is a grade they can send, but not a difficulty to sit between two others.
const DYNO = "Dyno";

// Each grade on the scale from the easiest they've sent to the hardest, with
// the ones between that they haven't sent kept in to show the gaps - and a
// dyno after them all, when they've sent one.
function gradeCounts(kind: ClimbKind, gradeSends: Record<string, number>) {
  const counts = GRADE_SCALES[kind]
    .filter((grade) => grade !== DYNO)
    .map((grade) => ({ label: grade, count: gradeSends[grade] ?? 0 }));
  const first = counts.findIndex((entry) => entry.count > 0);
  const last = counts.findLastIndex((entry) => entry.count > 0);
  const range = first === -1 ? [] : counts.slice(first, last + 1);
  const dynos = kind === "boulder" ? (gradeSends[DYNO] ?? 0) : 0;
  return dynos > 0 ? [...range, { label: DYNO, count: dynos }] : range;
}

function sentOnScale(kind: ClimbKind, gradeSends: Record<string, number>) {
  return GRADE_SCALES[kind].reduce((sum, grade) => sum + (gradeSends[grade] ?? 0), 0);
}

// Half-star steps, as they're given. No rating is 0 stars from the site's own
// picker, so that bar only shows when one is there.
function ratingCounts(ratingsGiven: Record<string, number>) {
  const ratings = Array.from({ length: 11 }, (_, rating) => rating).filter(
    (rating) => rating > 0 || (ratingsGiven[rating] ?? 0) > 0,
  );
  return ratings.map((rating) => ({ label: `${rating / 2}★`, count: ratingsGiven[rating] ?? 0 }));
}

// Shades from the site's light blue to its navy, for categories that run in
// an order - easiest to hardest, line 1 to 6 - so the darker slice is further
// along.
function shades(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const navy = count === 1 ? 100 : Math.round(15 + (85 * index) / (count - 1));
    return `color-mix(in oklab, var(--color-primary) ${navy}%, var(--color-secondary))`;
  });
}

type Counts = { label: string; count: number }[];

// The counts as bars, or as slices of a ring. A ring leaves out what's 0 unless
// `keepEmpty`, so it doesn't list every grade between two they've sent.
function StatsChart({
  shape,
  counts,
  colors = shades(counts.length),
  keepEmpty = false,
  noun,
  caption,
  categoryHeader,
  countHeader,
  emptyText,
  barClassName,
}: {
  shape: Shape;
  counts: Counts;
  // One for each count, in order.
  colors?: string[];
  keepEmpty?: boolean;
  noun: (count: number) => string;
  caption: string;
  categoryHeader: string;
  countHeader: string;
  emptyText: string;
  barClassName?: string;
}) {
  if (shape === "ring") {
    return (
      <RingChart
        slices={counts
          .map(({ label, count }, index) => ({
            name: label,
            value: count,
            color: colors[index],
          }))
          .filter((slice) => keepEmpty || slice.value > 0)}
        formatValue={String}
        caption={caption}
        emptyText={emptyText}
      />
    );
  }
  return (
    <CountChart
      counts={counts}
      noun={noun}
      caption={caption}
      categoryHeader={categoryHeader}
      countHeader={countHeader}
      emptyText={emptyText}
      barClassName={barClassName}
    />
  );
}

function StatsSection({
  title,
  subtitle,
  controls,
  children,
}: {
  title: string;
  subtitle: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 py-6 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-neutral-900">{title}</h3>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        {controls}
      </div>
      {children}
    </section>
  );
}

export default function DashboardStats({ metrics }: { metrics: DashboardMetrics }) {
  const { gradeSends, ratingsGiven, lineSends } = metrics;
  // One choice for every chart.
  const [shape, setShape] = useState<Shape>("bar");
  // Start on whichever scale they've sent anything graded on, routes first.
  const [kind, setKind] = useState<ClimbKind>(() =>
    sentOnScale("route", gradeSends) === 0 && sentOnScale("boulder", gradeSends) > 0 ? "boulder" : "route",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-neutral-500">Show as</span>
        <div className="flex-1">
          <TabBar label="Chart style" tabs={SHAPE_TABS} active={shape} onChange={setShape} />
        </div>
      </div>

      <div className="flex flex-col divide-y divide-neutral-100">
        <StatsSection title="Sends (type)" subtitle="Every climb you've sent, once each">
          <StatsChart
            shape={shape}
            counts={TYPE_SLICES.map(({ type, name }) => ({ label: name, count: metrics.sends[type] }))}
            colors={TYPE_SLICES.map((slice) => slice.color)}
            keepEmpty
            noun={sends}
            caption="Your sends by type of climb"
            categoryHeader="Type"
            countHeader="Sends"
            emptyText="Log a send on a climb to see it here."
          />
        </StatsSection>

        <StatsSection
          title="Sends (grade)"
          subtitle={kind === "route" ? "Routes and combos, on the route scale" : "Boulders, on the V scale"}
          controls={
            <div className="w-44">
              <TabBar label="Grade scale" tabs={KIND_TABS} active={kind} onChange={setKind} />
            </div>
          }
        >
          <StatsChart
            shape={shape}
            counts={gradeCounts(kind, gradeSends)}
            noun={sends}
            caption={`Your ${kind === "route" ? "route and combo" : "boulder"} sends at each grade`}
            categoryHeader="Grade"
            countHeader="Sends"
            emptyText={`No graded ${kind === "route" ? "routes or combos" : "boulders"} sent yet.`}
            barClassName="min-w-8"
          />
        </StatsSection>

        <StatsSection title="Sends (line)" subtitle="Routes and combos - boulders aren't on a line">
          <StatsChart
            shape={shape}
            counts={LINES.map((line) => ({ label: `Line ${line}`, count: lineSends[line] ?? 0 }))}
            keepEmpty
            noun={sends}
            caption="Your sends on each line"
            categoryHeader="Line"
            countHeader="Sends"
            emptyText="No sends on a line yet."
          />
        </StatsSection>

        <StatsSection title="Ratings" subtitle="How many stars you gave the climbs you rated">
          <StatsChart
            shape={shape}
            counts={ratingCounts(ratingsGiven)}
            noun={plural("rating")}
            caption="How many of your ratings gave each number of stars"
            categoryHeader="Stars"
            countHeader="Ratings"
            emptyText="Rate a climb to see it here."
            barClassName="min-w-8"
          />
        </StatsSection>
      </div>
    </div>
  );
}
