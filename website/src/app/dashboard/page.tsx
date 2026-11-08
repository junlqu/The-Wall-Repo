"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import AccessNotice from "@/components/AccessNotice";
import AnnouncementDetails, { EyeIcon } from "@/components/AnnouncementDetails";
import { LikeButton, useToggleLike } from "@/components/AnnouncementLike";
import { ClimbBox, CommentTags, RecentSend } from "@/components/ClimbActivity";
import { Person, Placeholder } from "@/components/ClimbCards";
import ReadMore from "@/components/ReadMore";
import SlidingTabs from "@/components/SlidingTabs";
import { type Announcement, formatShortDate } from "@/lib/announcements";
import { type Climb, formatDate } from "@/lib/climbs";
import {
  type Dashboard,
  type DashboardMetrics,
  type DashboardUpdate,
  favouriteLineLabel,
  fetchUpdates,
  openDashboard,
  totalSends,
  type UpdateFilter,
} from "@/lib/dashboard";
import { withReturnTo } from "@/lib/returnTo";
import { useSessionUser } from "@/lib/session";
import DashboardStats from "./DashboardStats";

const PANEL_CLASS = "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm";
const PANEL_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

// The coloured tab down the side of an update, saying what kind it is.
const UPDATE_TABS = {
  update: { colour: "bg-red-300", label: "Update" },
  sets: { colour: "bg-green-300", label: "Route setting" },
  cotw: { colour: "bg-sky-300", label: "Climber of the Week" },
  climb: { colour: "bg-purple-300", label: "On a climb you saved" },
  // Friends' updates show the same as anyone else they follow for now - kept
  // apart so settings can treat them differently later.
  user: { colour: "bg-orange-300", label: "From someone you follow" },
  friend: { colour: "bg-orange-300", label: "From a friend" },
};

function updateTab(update: DashboardUpdate) {
  if (update.kind === "comment") return UPDATE_TABS[update.via];
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
        <ReadMore fade="from-white">
          <AnnouncementDetails announcement={announcement} />
        </ReadMore>
        <div className="flex items-center justify-between gap-4 text-xs text-neutral-500">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">Posted by</span>
            <Person person={{ userID: announcement.userID, username: announcement.author }} />
          </span>
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
      {update.comment.comment && (
        <ReadMore fade="from-white">
          <p className="whitespace-pre-line break-words text-sm text-neutral-700">{update.comment.comment}</p>
        </ReadMore>
      )}
      <CommentTags comment={update.comment} sentOn />
      {update.climb && <ClimbBox climb={update.climb} />}
    </UpdateCard>
  );
}

const UPDATE_FILTERS: { id: UpdateFilter; label: string; short: string; empty: string }[] = [
  { id: "all", label: "All", short: "All", empty: "No updates yet." },
  { id: "announcements", label: "Announcements", short: "News", empty: "No announcements right now." },
  {
    id: "following",
    label: "Following",
    short: "Following",
    empty: "Nothing from the people you follow yet. Follow climbers from their profiles.",
  },
  {
    id: "climbs",
    label: "Saved climbs",
    short: "Saved",
    empty: "Nothing on your saved climbs yet. Save climbs with the bookmark on each one.",
  },
];

// One filter's updates so far. `status` is "loading" until its first page is in.
type Feed = { updates: DashboardUpdate[]; hasMore: boolean; status: "loading" | "idle" | "more" | "error" };

// The updates, with a slider to keep to one kind. "All" starts with what came
// with the dashboard; each other kind is fetched the first time it's picked.
function UpdatesList({ dashboard }: { dashboard: Dashboard }) {
  const [filter, setFilter] = useState<UpdateFilter>("all");
  const [feeds, setFeeds] = useState<Partial<Record<UpdateFilter, Feed>>>({
    all: { updates: dashboard.updates, hasMore: dashboard.hasMoreUpdates, status: "idle" },
  });
  const feed = feeds[filter];
  const { since } = dashboard;

  const setFeed = useCallback(
    (id: UpdateFilter, change: (feed: Feed | undefined) => Feed) =>
      setFeeds((current) => ({ ...current, [id]: change(current[id]) })),
    [],
  );

  // A like shows in every feed the announcement is in.
  const replaceAnnouncement = useCallback(
    (updated: Announcement) =>
      setFeeds((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, each]) => [
            id,
            {
              ...each,
              updates: each.updates.map((update) =>
                update.kind === "announcement" && update.announcement.id === updated.id
                  ? { ...update, announcement: updated }
                  : update,
              ),
            },
          ]),
        ),
      ),
    [],
  );
  const toggleLike = useToggleLike(replaceAnnouncement);

  function pick(id: UpdateFilter) {
    setFilter(id);
    if (feeds[id]) return;
    setFeed(id, () => ({ updates: [], hasMore: false, status: "loading" }));
    fetchUpdates({ only: id, since })
      .then((page) => setFeed(id, () => ({ updates: page.updates, hasMore: page.hasMoreUpdates, status: "idle" })))
      .catch(() => setFeed(id, () => ({ updates: [], hasMore: false, status: "error" })));
  }

  function loadMore() {
    if (!feed) return;
    const id = filter;
    setFeed(id, (current) => ({ ...current!, status: "more" }));
    fetchUpdates({ before: feed.updates[feed.updates.length - 1].at, only: id, since })
      .then((page) =>
        setFeed(id, (current) => ({
          updates: [...(current?.updates ?? []), ...page.updates],
          hasMore: page.hasMoreUpdates,
          status: "idle",
        })),
      )
      .catch(() => setFeed(id, (current) => ({ ...current!, status: "error" })));
  }

  const { empty } = UPDATE_FILTERS.find((item) => item.id === filter)!;

  return (
    <div className="flex flex-col gap-3">
      <SlidingTabs label="Show updates" tabs={UPDATE_FILTERS} active={filter} onChange={pick} className="w-full max-w-md" />
      {!feed || feed.status === "loading" ? (
        <Placeholder className="h-64" />
      ) : feed.updates.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          {feed.status === "error" ? "Couldn't load these updates right now." : empty}
        </p>
      ) : (
        <UpdateFeed feed={feed} onToggleLike={toggleLike} onLoadMore={loadMore} />
      )}
    </div>
  );
}

function UpdateFeed({
  feed,
  onToggleLike,
  onLoadMore,
}: {
  feed: Feed;
  onToggleLike: (announcement: Announcement) => void;
  onLoadMore: () => void;
}) {
  const { updates, hasMore, status } = feed;
  return (
    <div role="tabpanel" className="flex flex-col gap-3">
      {updates.map((update) => (
        <UpdateItem
          key={update.kind === "announcement" ? update.announcement.id : update.comment.commentID}
          update={update}
          onToggleLike={onToggleLike}
        />
      ))}
      {status === "error" && <p className="text-center text-sm text-neutral-500">Couldn&apos;t load more updates right now.</p>}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={status === "more"}
          className="self-center rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {status === "more" ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

const COLUMN_TABS = [
  { id: "updates", label: "Updates" },
  { id: "stats", label: "Stats" },
] as const;
type ColumnTab = (typeof COLUMN_TABS)[number]["id"];

// Tabs along the top of the column like a browser's, the open one joined to
// the panel under it.
function ColumnTabs({ active, onChange }: { active: ColumnTab; onChange: (tab: ColumnTab) => void }) {
  return (
    <div role="tablist" aria-label="Dashboard" className="flex items-end gap-1">
      {COLUMN_TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${tab.id}-panel`}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px min-w-28 rounded-t-lg border px-5 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
              selected
                ? "z-10 border-neutral-200 border-b-white bg-white py-2.5 text-primary"
                : "border-transparent border-b-neutral-200 bg-neutral-200/60 py-2 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

const HARDEST_SEND_TYPES = [
  { type: "route", label: "Route" },
  { type: "boulder", label: "Boulder" },
  { type: "combo", label: "Combo" },
] as const;

function ClimbingPanel({ metrics, latestSendClimb }: { metrics: DashboardMetrics; latestSendClimb: Climb | null }) {
  const counts = [
    { label: "Total sends", value: totalSends(metrics) },
    { label: "Routes", value: metrics.sends.route },
    { label: "Boulders", value: metrics.sends.boulder },
    { label: "Combos", value: metrics.sends.combo },
  ];
  const details = [
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
        <div className="flex flex-col gap-2 px-1 py-2.5">
          <dt className="text-neutral-600">Hardest send</dt>
          <dd className="grid grid-cols-3 gap-2">
            {HARDEST_SEND_TYPES.map(({ type, label }) => (
              <div key={type} className="rounded-md bg-neutral-50 px-2.5 py-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="font-semibold text-neutral-800">{metrics.hardestSend[type] ?? "—"}</p>
              </div>
            ))}
          </dd>
        </div>
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

export default function DashboardPage() {
  const user = useSessionUser();
  const userID = user?.userID;
  // Below md (where the header switches to the hamburger) only one column
  // shows at a time, picked by the switch at the bottom of the page.
  const [showActivity, setShowActivity] = useState(false);
  const [columnTab, setColumnTab] = useState<ColumnTab>("updates");
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
        message="Log in to see updates, your climbing stats, and your recent sends."
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
              <div className={`min-w-0 ${showActivity ? "hidden md:block" : ""}`}>
                <ColumnTabs active={columnTab} onChange={setColumnTab} />
                {/* Both stay mounted, so the updates keep their place and filter. */}
                <section
                  id="updates-panel"
                  role="tabpanel"
                  aria-labelledby="updates-tab"
                  hidden={columnTab !== "updates"}
                  className={`${PANEL_CLASS} rounded-tl-none`}
                >
                  {loaded ? <UpdatesList dashboard={loaded} /> : <Placeholder className="h-64" />}
                </section>
                <section
                  id="stats-panel"
                  role="tabpanel"
                  aria-labelledby="stats-tab"
                  hidden={columnTab !== "stats"}
                  className={`${PANEL_CLASS} rounded-tl-none`}
                >
                  {loaded ? <DashboardStats metrics={loaded.metrics} /> : <Placeholder className="h-64" />}
                </section>
              </div>

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

                <section aria-labelledby="sends-heading" className={PANEL_CLASS}>
                  <h2 id="sends-heading" className={PANEL_HEADING_CLASS}>
                    Recent sends
                  </h2>
                  {!loaded ? (
                    <Placeholder className="mt-4 h-40" />
                  ) : loaded.recentSends.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-500">You haven&apos;t logged a send yet.</p>
                  ) : (
                    <div className="mt-2 flex flex-col divide-y divide-neutral-100">
                      {loaded.recentSends.map(({ comment, climb }) => (
                        <RecentSend key={comment.commentID} comment={comment} climb={climb} />
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
                  aria-label="Show your climbing and sends"
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
