"use client";

import { useState } from "react";
import Link from "next/link";
import AccessNotice from "@/components/AccessNotice";
import { withReturnTo } from "@/lib/returnTo";
import { USER_LEVEL, useSessionUser } from "@/lib/session";

type DashboardUpdate = {
  id: string;
  title: string;
  body: string;
  author: string;
  postedAt: string;
  likes: number;
};

// Placeholder - replace with announcements from the API.
const UPDATES: DashboardUpdate[] = [
  {
    id: "1",
    title: "New routes on lines 3 and 4",
    body: "Four fresh routes went up this week, ranging from 5.8 to 5.11a. Come give them a try and let us know what you think of the grades.",
    author: "Jun",
    postedAt: "2026-10-22",
    likes: 12,
  },
  {
    id: "2",
    title: "Holiday hours",
    body: "The wall will be closed on Monday for the holiday. Regular hours resume on Wednesday.",
    author: "Jun",
    postedAt: "2026-10-18",
    likes: 5,
  },
  {
    id: "3",
    title: "Combo climbs are here",
    body: "You can now log sends on combos - two routes linked into one. Check the Combos page to see what's been set so far.",
    author: "Jun",
    postedAt: "2026-10-10",
    likes: 21,
  },
];

// Placeholder - replace with the user's real counts once the API exposes them.
const CLIMB_COUNTS = [
  { label: "Total sends", value: 42 },
  { label: "Routes", value: 28 },
  { label: "Boulders", value: 9 },
  { label: "Combos", value: 5 },
];

const CLIMB_DETAILS = [
  { label: "Hardest send", value: "5.11b" },
  { label: "Favourite line", value: "Line 3" },
  { label: "Comments posted", value: "17" },
  { label: "Last climbed", value: "Oct 22, 2026" },
];

type DashboardComment = {
  id: string;
  routeColour: string;
  swatch: string;
  line: number;
  comment: string;
  grade?: string;
  rating?: number;
  commentedAt: string;
};

// Placeholder - replace with the user's comments from the API.
const RECENT_COMMENTS: DashboardComment[] = [
  {
    id: "1",
    routeColour: "Blue",
    swatch: "#3b82f6",
    line: 3,
    comment: "Crux at the third bolt is tricky - feels more like 5.10c to me.",
    grade: "5.10c",
    rating: 8,
    commentedAt: "2026-10-22",
  },
  {
    id: "2",
    routeColour: "Orange",
    swatch: "#f97316",
    line: 1,
    comment: "Great warm-up, really fun movement on the top half.",
    rating: 7,
    commentedAt: "2026-10-20",
  },
  {
    id: "3",
    routeColour: "Green",
    swatch: "#22c55e",
    line: 5,
    comment: "Finally sent it!",
    grade: "5.11b",
    commentedAt: "2026-10-15",
  },
];

function formatDate(date: string) {
  // Parse as a local date so "2026-10-22" doesn't shift a day in UTC-minus zones.
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M9.65 16.9a.75.75 0 0 0 .7 0C11.9 16.06 17 12.94 17 8.25 17 6 15.2 4 13 4c-1.33 0-2.4.67-3 1.6C9.4 4.67 8.33 4 7 4 4.8 4 3 6 3 8.25c0 4.69 5.1 7.81 6.65 8.65z" />
    </svg>
  );
}

const PANEL_CLASS = "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm";
const PANEL_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

export default function DashboardPage() {
  const user = useSessionUser();
  // Below md (where the header switches to the hamburger) only one column
  // shows at a time, picked by the switch at the bottom of the page.
  const [showActivity, setShowActivity] = useState(false);

  if (user === undefined) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  if (user === null) {
    return (
      <AccessNotice
        title="Your dashboard"
        message="Log in to see updates, your climbing stats, and your recent comments."
        actionLabel="Log in"
        actionHref={withReturnTo("/login", "/dashboard")}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-12 pb-6 sm:px-6 md:pb-12 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary sm:text-4xl">Welcome back, {user.fname}</h1>
            <p className="mt-2 text-neutral-600">Here&apos;s what&apos;s new on the wall and how your climbing is going.</p>
          </div>
          {user.level === USER_LEVEL.admin && (
            <Link
              href="/admin"
              className="rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Admin dashboard →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="updates-heading" className={`${PANEL_CLASS} ${showActivity ? "hidden md:block" : ""}`}>
            <h2 id="updates-heading" className={PANEL_HEADING_CLASS}>
              Updates
            </h2>
            <div className="mt-2 flex flex-col divide-y divide-neutral-100">
              {UPDATES.map((update) => (
                <article key={update.id} className="flex flex-col gap-2 py-4 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-semibold text-neutral-900">{update.title}</h3>
                    <span className="shrink-0 text-xs text-neutral-500">{formatDate(update.postedAt)}</span>
                  </div>
                  <p className="text-sm text-neutral-700">{update.body}</p>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Posted by {update.author}</span>
                    <span className="flex items-center gap-1">
                      <HeartIcon />
                      {update.likes}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className={`flex flex-col gap-6 ${showActivity ? "" : "hidden md:flex"}`}>
            <section aria-labelledby="climbing-heading" className={PANEL_CLASS}>
              <h2 id="climbing-heading" className={PANEL_HEADING_CLASS}>
                Your climbing
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {CLIMB_COUNTS.map((count) => (
                  <div key={count.label} className="rounded-md bg-neutral-50 px-3 py-3">
                    <p className="text-2xl font-bold text-primary">{count.value}</p>
                    <p className="text-xs text-neutral-500">{count.label}</p>
                  </div>
                ))}
              </div>
              <dl className="mt-4 flex flex-col divide-y divide-neutral-100 text-sm">
                {CLIMB_DETAILS.map((detail) => (
                  <div key={detail.label} className="flex items-center justify-between gap-4 px-1 py-2.5">
                    <dt className="text-neutral-600">{detail.label}</dt>
                    <dd className="font-semibold text-neutral-800">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="comments-heading" className={PANEL_CLASS}>
              <h2 id="comments-heading" className={PANEL_HEADING_CLASS}>
                Recent comments
              </h2>
              <div className="mt-2 flex flex-col divide-y divide-neutral-100">
                {RECENT_COMMENTS.map((comment) => (
                  <div key={comment.id} className="flex flex-col gap-1.5 py-3 last:pb-0">
                    <div className="flex items-center justify-between gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-2 font-medium text-neutral-700">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: comment.swatch }}
                        />
                        {comment.routeColour} · Line {comment.line}
                      </span>
                      <span>{formatDate(comment.commentedAt)}</span>
                    </div>
                    <p className="text-sm text-neutral-700">{comment.comment}</p>
                    {(comment.grade || comment.rating !== undefined) && (
                      <div className="flex gap-2 text-xs">
                        {comment.grade && (
                          <span className="rounded bg-secondary/15 px-1.5 py-0.5 font-medium text-primary">
                            Graded {comment.grade}
                          </span>
                        )}
                        {comment.rating !== undefined && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600">
                            Rated {comment.rating}/10
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="sticky bottom-4 z-30 flex justify-center md:hidden">
          <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => setShowActivity(false)}
              className={showActivity ? "text-neutral-500" : "text-primary"}
            >
              Updates
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={showActivity}
              aria-label="Show your climbing and comments"
              onClick={() => setShowActivity((show) => !show)}
              className="relative h-6 w-11 shrink-0 rounded-full bg-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  showActivity ? "translate-x-5" : ""
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setShowActivity(true)}
              className={showActivity ? "text-primary" : "text-neutral-500"}
            >
              My activity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
