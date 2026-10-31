"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AccessNotice from "@/components/AccessNotice";
import AnnouncementDetails, { EyeIcon } from "@/components/AnnouncementDetails";
import { LikeButton, useToggleLike } from "@/components/AnnouncementLike";
import { GradeTag, Person, Placeholder } from "@/components/ClimbCards";
import ClimbColour from "@/components/ClimbColour";
import { type Announcement, formatDateTime, formatShortDate } from "@/lib/announcements";
import { type Climb, CLIMB_TYPES, climbHref, formatDate, ratingStars } from "@/lib/climbs";
import {
  type Dashboard,
  type DashboardComment,
  type DashboardMetrics,
  type DashboardUpdate,
  favouriteLineLabel,
  fetchOlderUpdates,
  hardestSendLabel,
  openDashboard,
  totalSends,
} from "@/lib/dashboard";
import { withReturnTo } from "@/lib/returnTo";
import { useSessionUser } from "@/lib/session";

const PANEL_CLASS = "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm";
const PANEL_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

// The coloured tab down the side of an update, saying what kind it is.
const UPDATE_TABS = {
  update: { colour: "bg-red-300", label: "Update" },
  sets: { colour: "bg-green-300", label: "Route setting" },
  cotw: { colour: "bg-sky-300", label: "Climber of the Week" },
  followedClimb: { colour: "bg-purple-300", label: "Comment on a climb you follow" },
  // Kept for updates from followed users, once people can follow each other.
  followedUser: { colour: "bg-orange-300", label: "From someone you follow" },
};

function updateTab(update: DashboardUpdate) {
  if (update.kind === "comment") return UPDATE_TABS.followedClimb;
  const { type } = update.announcement;
  return type === "sets" || type === "cotw" ? UPDATE_TABS[type] : UPDATE_TABS.update;
}

function UpdateCard({ update, children }: { update: DashboardUpdate; children: ReactNode }) {
  const tab = updateTab(update);
  return (
    <article
      className={`relative flex flex-col gap-2 overflow-hidden rounded-lg border py-4 pr-4 pl-5 ${
        update.isNew ? "border-sky-300 ring-1 ring-sky-100" : "border-neutral-200"
      }`}
    >
      <span aria-hidden="true" title={tab.label} className={`absolute inset-y-0 left-0 w-1.5 ${tab.colour}`} />
      <span className="sr-only">{update.isNew ? `New: ${tab.label}` : tab.label}</span>
      {children}
    </article>
  );
}

function PostedAt({ at }: { at: string }) {
  return (
    <time dateTime={at} className="shrink-0 text-xs text-neutral-500">
      {formatShortDate(new Date(at))}
    </time>
  );
}

// The climb's colour, where it is and its grade, as a small box linking to it.
function ClimbBox({ climb }: { climb: Climb }) {
  return (
    <Link
      href={climbHref(climb.id)}
      className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <ClimbColour climb={climb} />
      <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
        {climb.line === undefined ? CLIMB_TYPES[climb.type] : `Line ${climb.line}`}
        <GradeTag grade={climb.grade} />
      </span>
    </Link>
  );
}

function UpdateItem({
  update,
  onToggleLike,
}: {
  update: DashboardUpdate;
  onToggleLike: (announcement: Announcement) => void;
}) {
  if (update.kind === "announcement") {
    const { announcement } = update;
    return (
      <UpdateCard update={update}>
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-semibold text-neutral-900">{announcement.title}</h3>
          <PostedAt at={update.at} />
        </div>
        <AnnouncementDetails announcement={announcement} />
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>Posted by @{announcement.author}</span>
          <span className="flex items-center gap-4 tabular-nums">
            <LikeButton announcement={announcement} canLike onToggle={onToggleLike} />
            <span className="flex items-center gap-1" title="Views">
              <EyeIcon />
              {announcement.views}
              <span className="sr-only">views</span>
            </span>
          </span>
        </div>
      </UpdateCard>
    );
  }

  return (
    <UpdateCard update={update}>
      <div className="flex items-center justify-between gap-4 text-xs">
        <Person person={update.comment.author} />
        <PostedAt at={update.at} />
      </div>
      <p className="whitespace-pre-line break-words text-sm text-neutral-700">{update.comment.comment}</p>
      {update.climb && <ClimbBox climb={update.climb} />}
    </UpdateCard>
  );
}

// The updates that came with the dashboard, and any more they ask for.
function UpdatesList({ dashboard }: { dashboard: Dashboard }) {
  const [updates, setUpdates] = useState(dashboard.updates);
  const [hasMore, setHasMore] = useState(dashboard.hasMoreUpdates);
  const [status, setStatus] = useState<"idle" | "more" | "error">("idle");

  const replaceAnnouncement = useCallback(
    (updated: Announcement) =>
      setUpdates((current) =>
        current.map((update) =>
          update.kind === "announcement" && update.announcement.id === updated.id
            ? { ...update, announcement: updated }
            : update,
        ),
      ),
    [],
  );
  const toggleLike = useToggleLike(replaceAnnouncement);

  function loadMore() {
    setStatus("more");
    fetchOlderUpdates(updates[updates.length - 1].at)
      .then((page) => {
        setUpdates((current) => [...current, ...page.updates]);
        setHasMore(page.hasMoreUpdates);
        setStatus("idle");
      })
      .catch(() => setStatus("error"));
  }

  if (updates.length === 0) return <p className="py-6 text-center text-sm text-neutral-500">No updates yet.</p>;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {updates.map((update) => (
        <UpdateItem
          key={update.kind === "announcement" ? update.announcement.id : update.comment.commentID}
          update={update}
          onToggleLike={toggleLike}
        />
      ))}
      {status === "error" && <p className="text-center text-sm text-neutral-500">Couldn&apos;t load more updates right now.</p>}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={status === "more"}
          className="self-center rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {status === "more" ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function ClimbingPanel({ metrics, latestSendClimb }: { metrics: DashboardMetrics; latestSendClimb: Climb | null }) {
  const counts = [
    { label: "Total sends", value: totalSends(metrics) },
    { label: "Routes", value: metrics.sends.route },
    { label: "Boulders", value: metrics.sends.boulder },
    { label: "Combos", value: metrics.sends.combo },
  ];
  const details = [
    { label: "Hardest send", value: hardestSendLabel(metrics) },
    { label: "Favourite line", value: favouriteLineLabel(metrics) },
    { label: "Comments posted", value: metrics.commentsPosted },
  ];

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {counts.map((count) => (
          <div key={count.label} className="rounded-md bg-neutral-50 px-3 py-3">
            <p className="text-2xl font-bold text-primary">{count.value}</p>
            <p className="text-xs text-neutral-500">{count.label}</p>
          </div>
        ))}
      </div>
      <dl className="mt-4 flex flex-col divide-y divide-neutral-100 text-sm">
        {details.map((detail) => (
          <div key={detail.label} className="flex items-center justify-between gap-4 px-1 py-2.5">
            <dt className="text-neutral-600">{detail.label}</dt>
            <dd className="font-semibold text-neutral-800">{detail.value}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-2 px-1 pt-2.5">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-600">Latest send</dt>
            <dd className="font-semibold text-neutral-800">
              {metrics.latestSend ? formatDate(metrics.latestSend.date) : "—"}
            </dd>
          </div>
          {latestSendClimb && (
            <dd>
              <ClimbBox climb={latestSendClimb} />
            </dd>
          )}
        </div>
      </dl>
    </>
  );
}

function RecentComment({ comment, climb }: DashboardComment) {
  return (
    <div className="flex flex-col gap-1.5 py-3 last:pb-0">
      <div className="flex items-center justify-between gap-4 text-xs text-neutral-500">
        {climb ? (
          <Link href={climbHref(climb.id)} className="flex min-w-0 items-center gap-1.5 font-medium text-neutral-700 hover:text-primary">
            <ClimbColour climb={climb} />
            {climb.line !== undefined && <span className="shrink-0">· Line {climb.line}</span>}
          </Link>
        ) : (
          <span>That climb is gone now</span>
        )}
        {/* With the time, as several in a day would otherwise look the same. */}
        <time dateTime={comment.commentedAt} className="shrink-0">
          {formatDateTime(comment.commentedAt)}
        </time>
      </div>
      <p className="whitespace-pre-line break-words text-sm text-neutral-700">{comment.comment}</p>
      {(comment.send || comment.grade || comment.rating !== undefined) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {comment.send && <span className="rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-700">Sent</span>}
          {comment.grade && (
            <span className="rounded bg-secondary/15 px-1.5 py-0.5 font-medium text-primary">Graded {comment.grade}</span>
          )}
          {comment.rating !== undefined && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600">
              ★ {ratingStars(comment.rating).toFixed(1)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const user = useSessionUser();
  const userID = user?.userID;
  // Below md (where the header switches to the hamburger) only one column
  // shows at a time, picked by the switch at the bottom of the page.
  const [showActivity, setShowActivity] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | "error" | null>(null);
  // Opening the dashboard moves their last visit on, so a second ask would find
  // nothing new - only ask once, even when Strict Mode runs the effect twice.
  const opened = useRef(false);

  useEffect(() => {
    if (!userID || opened.current) return;
    opened.current = true;
    openDashboard()
      .then(setDashboard)
      .catch(() => setDashboard("error"));
  }, [userID]);

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

  const loaded = dashboard === "error" ? null : dashboard;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-12 pb-6 sm:px-6 md:pb-12 lg:px-8">
        <div>
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">Your dashboard</h1>
          <p className="mt-2 text-neutral-600">Here&apos;s what&apos;s new on the wall and how your climbing is going.</p>
        </div>

        {dashboard === "error" ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
            Your dashboard couldn&apos;t be loaded. Try refreshing the page.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section aria-labelledby="updates-heading" className={`${PANEL_CLASS} ${showActivity ? "hidden md:block" : ""}`}>
                <h2 id="updates-heading" className={PANEL_HEADING_CLASS}>
                  Updates
                </h2>
                {loaded ? <UpdatesList dashboard={loaded} /> : <Placeholder className="mt-4 h-64" />}
              </section>

              <div className={`flex flex-col gap-6 ${showActivity ? "" : "hidden md:flex"}`}>
                <section aria-labelledby="climbing-heading" className={PANEL_CLASS}>
                  <h2 id="climbing-heading" className={PANEL_HEADING_CLASS}>
                    Your climbing
                  </h2>
                  {loaded ? (
                    <ClimbingPanel metrics={loaded.metrics} latestSendClimb={loaded.latestSendClimb} />
                  ) : (
                    <Placeholder className="mt-4 h-64" />
                  )}
                </section>

                <section aria-labelledby="comments-heading" className={PANEL_CLASS}>
                  <h2 id="comments-heading" className={PANEL_HEADING_CLASS}>
                    Recent comments
                  </h2>
                  {!loaded ? (
                    <Placeholder className="mt-4 h-40" />
                  ) : loaded.recentComments.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-500">You haven&apos;t commented on a climb yet.</p>
                  ) : (
                    <div className="mt-2 flex flex-col divide-y divide-neutral-100">
                      {loaded.recentComments.map(({ comment, climb }) => (
                        <RecentComment key={comment.commentID} comment={comment} climb={climb} />
                      ))}
                    </div>
                  )}
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
          </>
        )}
      </div>
    </div>
  );
}
