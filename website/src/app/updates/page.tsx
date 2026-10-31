"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AnnouncementDetails, { EyeIcon } from "@/components/AnnouncementDetails";
import Carousel from "@/components/Carousel";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import {
  type Announcement,
  ANNOUNCEMENT_TYPES,
  fetchAnnouncements,
  formatDateTime,
  formatShortDate,
  formatTarget,
  localDate,
  setAnnouncementLiked,
  upcomingFriday,
  viewAnnouncement,
} from "@/lib/announcements";
import { avatarUrl } from "@/lib/avatar";
import { parseDate } from "@/lib/climbs";
import { useSessionUser } from "@/lib/session";

// Low and medium announcements are a feed of the newest few. Urgent and high
// ones are all shown, since there are only ever a handful.
const FEED_SIZE = 10;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });

// "5 min. ago", "3 hr. ago", "yesterday" - or the date, once it's over a week.
function timeAgo(iso: string, now: Date) {
  const elapsed = now.getTime() - Date.parse(iso);
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return relativeTime.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return relativeTime.format(-Math.floor(elapsed / HOUR_MS), "hour");
  if (elapsed < WEEK_MS) return relativeTime.format(-Math.floor(elapsed / DAY_MS), "day");
  return formatShortDate(new Date(iso));
}

function newestFirst(a: Announcement, b: Announcement) {
  return b.announcedAt.localeCompare(a.announcedAt);
}

// What goes where. Everything here is still relevant - the archive isn't
// shown. CotW only ever has its own slot, for the coming Friday's challenge.
function arrange(announcements: Announcement[], now: Date) {
  const active = announcements.filter((item) => item.active).sort(newestFirst);
  const friday = upcomingFriday(localDate(now));
  return {
    friday,
    cotw: active.find((item) => item.type === "cotw" && item.targetDate === friday),
    urgent: active.filter((item) => item.priority === "urgent"),
    high: active.filter((item) => item.priority === "high"),
    feed: active
      .filter((item) => (item.priority === "medium" || item.priority === "low") && item.type !== "cotw")
      .slice(0, FEED_SIZE),
  };
}

// What every post can do: count itself as seen, and be liked by a member.
// `canLike` is false for guests, and while the login is still being checked.
const PostContext = createContext<{
  canLike: boolean;
  countView: (id: string) => void;
  toggleLike: (announcement: Announcement) => void;
}>({ canLike: false, countView: () => {}, toggleLike: () => {} });

// Counts a post as seen once part of it reaches the middle of the window, so
// a tall post still counts. A carousel slide that isn't showing is clipped to
// nothing, so it waits for its turn.
function useCountView<T extends HTMLElement>(id: string | undefined) {
  const { countView } = useContext(PostContext);
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !id) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRect.width === 0) return;
        countView(id);
        observer.disconnect();
      },
      { rootMargin: "-20% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, countView]);

  return ref;
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Members can like a post; guests just see the count.
function LikeButton({ announcement, light }: { announcement: Announcement; light: boolean }) {
  const { canLike, toggleLike } = useContext(PostContext);
  const { liked } = announcement;
  const likedClass = light ? "bg-white/20 text-white" : "bg-secondary/20 text-primary";
  const hoverClass = light ? "hover:bg-white/10" : "hover:bg-neutral-100";

  return (
    <button
      type="button"
      onClick={() => toggleLike(announcement)}
      disabled={!canLike}
      aria-pressed={canLike ? liked : undefined}
      title={canLike ? (liked ? "Take back your like" : "Like") : "Log in to like"}
      className={`-mx-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors disabled:cursor-default ${
        liked ? likedClass : canLike ? hoverClass : ""
      }`}
    >
      <span aria-hidden="true" className={`text-sm leading-none ${liked ? "" : "opacity-70 grayscale"}`}>
        👌
      </span>
      {announcement.likes}
      <span className="sr-only">likes</span>
    </button>
  );
}

function Counts({
  announcement,
  className = "",
  light = false,
}: {
  announcement: Announcement;
  className?: string;
  light?: boolean;
}) {
  return (
    <span className={`flex items-center gap-4 text-xs tabular-nums ${className}`}>
      <LikeButton announcement={announcement} light={light} />
      <span className="flex items-center gap-1" title="Views">
        <EyeIcon />
        {announcement.views}
        <span className="sr-only">views</span>
      </span>
    </span>
  );
}

function Byline({ announcement, now, light = false }: { announcement: Announcement; now: Date; light?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl(announcement)}
        alt=""
        width={36}
        height={36}
        className={`h-9 w-9 shrink-0 rounded-full object-cover ${light ? "ring-2 ring-white/30" : "ring-1 ring-neutral-200"}`}
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate text-sm font-semibold ${light ? "text-white" : "text-neutral-900"}`}>
          @{announcement.author}
        </span>
        <time
          dateTime={announcement.announcedAt}
          title={formatDateTime(announcement.announcedAt)}
          className={`text-xs ${light ? "text-white/70" : "text-neutral-500"}`}
        >
          {timeAgo(announcement.announcedAt, now)}
        </time>
      </span>
    </div>
  );
}

function TargetChip({ announcement, light = false }: { announcement: Announcement; light?: boolean }) {
  if (!announcement.targetDate) return null;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        light ? "bg-white/15 text-white" : "bg-secondary/15 text-primary"
      }`}
    >
      <CalendarIcon />
      {formatTarget(announcement)}
    </span>
  );
}

// The front page story - one urgent announcement across the full width.
function UrgentSlide({ announcement, now }: { announcement: Announcement; now: Date }) {
  const ref = useCountView<HTMLElement>(announcement.id);
  return (
    <article ref={ref} className="flex h-full flex-col gap-5 border-t-4 border-red-500 bg-primary p-6 text-white sm:p-10">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-bold uppercase tracking-wider">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
          Urgent
        </span>
        <Kicker className="text-white/70">{ANNOUNCEMENT_TYPES[announcement.type].label}</Kicker>
      </div>
      <h3 className="max-w-3xl font-serif text-3xl leading-tight font-bold sm:text-5xl">{announcement.title}</h3>
      <TargetChip announcement={announcement} light />
      <AnnouncementDetails announcement={announcement} onDark />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-5">
        <Byline announcement={announcement} now={now} light />
        <Counts announcement={announcement} className="text-white/70" light />
      </div>
    </article>
  );
}

// The coming Friday's challenge - or a note that it isn't up yet.
function CotwCard({ cotw, friday, now }: { cotw: Announcement | undefined; friday: string; now: Date }) {
  const ref = useCountView<HTMLElement>(cotw?.id);
  const day = parseDate(friday).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <article ref={ref} className="relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Kicker className="text-secondary">Climber of the Week</Kicker>
        <span className="text-sm font-semibold text-neutral-500">{day}</span>
      </div>

      {cotw ? (
        <>
          <h2 className="font-serif text-2xl leading-tight font-bold text-primary sm:text-3xl">{cotw.title}</h2>
          <AnnouncementDetails announcement={cotw} />
          <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 pt-4">
            <Byline announcement={cotw} now={now} />
            <Counts announcement={cotw} className="text-neutral-500" />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <p className="font-serif text-2xl font-bold text-primary">Challenge coming soon</p>
          <p className="max-w-sm text-sm text-neutral-500">
            This Friday&apos;s challenge hasn&apos;t been posted yet. Check back closer to the day.
          </p>
        </div>
      )}
    </article>
  );
}

function HighSlide({ announcement, now }: { announcement: Announcement; now: Date }) {
  const ref = useCountView<HTMLElement>(announcement.id);
  return (
    <article ref={ref} className="flex h-full flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-2">
        <Kicker className="text-amber-700">High priority</Kicker>
        <span className="text-xs font-semibold text-amber-800/70">{ANNOUNCEMENT_TYPES[announcement.type].label}</span>
      </div>
      <h3 className="font-serif text-3xl leading-tight font-bold text-neutral-900 sm:text-4xl">{announcement.title}</h3>
      <TargetChip announcement={announcement} />
      <AnnouncementDetails announcement={announcement} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-amber-200/70 pt-4">
        <Byline announcement={announcement} now={now} />
        <Counts announcement={announcement} className="text-amber-800/70" />
      </div>
    </article>
  );
}

// One post in the feed.
function FeedCard({ announcement, now }: { announcement: Announcement; now: Date }) {
  const ref = useCountView<HTMLElement>(announcement.id);
  return (
    <article ref={ref} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Byline announcement={announcement} now={now} />
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
          {ANNOUNCEMENT_TYPES[announcement.type].label}
        </span>
      </div>
      <h3 className="text-lg font-bold text-neutral-900">{announcement.title}</h3>
      <TargetChip announcement={announcement} />
      <AnnouncementDetails announcement={announcement} />
      <div className="border-t border-neutral-100 pt-3">
        <Counts announcement={announcement} className="text-neutral-500" />
      </div>
    </article>
  );
}

function Placeholder({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200/70 ${className}`} />;
}

export default function UpdatesPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState(false);
  const now = useMemo(() => new Date(), []);
  const user = useSessionUser();
  // Posts already counted on this visit, and likes still being saved.
  const counted = useRef(new Set<string>());
  const liking = useRef(new Set<string>());

  useEffect(() => {
    fetchAnnouncements()
      .then(setAnnouncements)
      .catch(() => setError(true));
  }, []);

  const arranged = useMemo(() => (announcements ? arrange(announcements, now) : null), [announcements, now]);

  const replace = useCallback(
    (updated: Announcement) =>
      setAnnouncements((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null),
    [],
  );

  // Once per post per visit - the fresh counts come back with it.
  const countView = useCallback(
    (id: string) => {
      if (counted.current.has(id)) return;
      counted.current.add(id);
      viewAnnouncement(id)
        .then(replace)
        .catch(() => {});
    },
    [replace],
  );

  // Shows the change straight away and puts it back if it doesn't save. One
  // at a time per post, so quick clicks can't arrive out of order.
  const toggleLike = useCallback(
    (announcement: Announcement) => {
      if (liking.current.has(announcement.id)) return;
      liking.current.add(announcement.id);
      const liked = !announcement.liked;
      replace({ ...announcement, liked, likes: announcement.likes + (liked ? 1 : -1) });
      setAnnouncementLiked(announcement.id, liked)
        .then(replace)
        .catch(() => replace(announcement))
        .finally(() => liking.current.delete(announcement.id));
    },
    [replace],
  );

  const post = useMemo(() => ({ canLike: Boolean(user), countView, toggleLike }), [user, countView, toggleLike]);

  return (
    <PostContext.Provider value={post}>
      <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
          <Masthead
            title="The Wall Updates"
            tagline="Route setting, challenges, closures, and everything else happening on the wall."
            now={now}
          />

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
              The updates couldn&apos;t be loaded. Try refreshing the page.
            </p>
          ) : !arranged ? (
            <>
              <Placeholder className="h-72" />
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Placeholder className="h-80" />
                <Placeholder className="h-80" />
              </div>
            </>
          ) : (
            <>
              {arranged.urgent.length > 0 && (
                <Carousel
                  label="Urgent announcements"
                  items={arranged.urgent}
                  getKey={(item) => item.id}
                  renderItem={(item) => <UrgentSlide announcement={item} now={now} />}
                />
              )}

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <CotwCard cotw={arranged.cotw} friday={arranged.friday} now={now} />
                {arranged.high.length > 0 ? (
                  <Carousel
                    label="High priority announcements"
                    items={arranged.high}
                    getKey={(item) => item.id}
                    renderItem={(item) => <HighSlide announcement={item} now={now} />}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 p-8 text-center">
                    <Kicker className="text-neutral-400">High priority</Kicker>
                    <p className="text-sm text-neutral-500">Nothing pressing right now.</p>
                  </div>
                )}
              </div>

              <section className="flex flex-col gap-6">
                <SectionRule title="Latest news" />
                {arranged.feed.length > 0 ? (
                  <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
                    {arranged.feed.map((item) => (
                      <FeedCard key={item.id} announcement={item} now={now} />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-neutral-500">No other news at the moment.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </PostContext.Provider>
  );
}
