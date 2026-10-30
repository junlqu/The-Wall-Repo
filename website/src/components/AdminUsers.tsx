"use client";

import Link from "next/link";
import { type LiHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import { FIELD_CLASS } from "@/components/ClimbForm";
import CountChart from "@/components/CountChart";
import SlidingTabs from "@/components/SlidingTabs";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import { avatarUrl } from "@/lib/avatar";
import { localDate, parseDate, todayDate } from "@/lib/climbs";
import {
  type ActivityMetric,
  fetchUsers,
  fetchUserStats,
  type Leader,
  type ListedUser,
  SEARCH_FIELD_LABELS,
  type SearchMatch,
  USER_PAGE_SIZES,
  type UserPageSize,
  type UserStats,
  type UserSummary,
} from "@/lib/users";

// Like the Admin Dashboard, everything sits inside one card and its parts
// are set apart by a tint rather than borders of their own.
const WIDGET_CLASS = "flex flex-col rounded-lg bg-neutral-50 p-4";
const WIDGET_TITLE_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";
// How long typing has to pause before the search runs.
export const SEARCH_DELAY_MS = 300;
// Mirrors LEADERBOARD_SIZE in api/src/functions/users.ts.
const LEADERBOARD_SIZE = 10;

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

function formatJoined(createdAt: string) {
  if (!createdAt) return "—";
  return new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Avatar({ user, size }: { user: Pick<UserSummary, "userID" | "avatarUpdatedAt">; size: "sm" | "md" }) {
  const className = size === "sm" ? "h-5 w-5" : "h-10 w-10";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(user)}
      alt=""
      width={size === "sm" ? 20 : 40}
      height={size === "sm" ? 20 : 40}
      className={`${className} shrink-0 rounded-full object-cover ring-1 ring-neutral-200`}
    />
  );
}

// Always ten places - those nobody has reached yet are dashes - so the board
// keeps its shape however many people there are. `status` takes the place of
// "Top 10" while loading, after a failed load, or when nobody's on it yet.
function Leaderboard({
  title,
  leaders,
  unit,
  status,
}: {
  title: string;
  leaders: Leader[];
  unit: string;
  status: string | null;
}) {
  return (
    <div className={WIDGET_CLASS}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={WIDGET_TITLE_CLASS}>{title}</h3>
        <span className="text-xs text-neutral-500">{status ?? `Top ${LEADERBOARD_SIZE}`}</span>
      </div>
      <ol className="mt-3 divide-y divide-neutral-200/70 text-sm">
        {Array.from({ length: LEADERBOARD_SIZE }, (_, i) => {
          const leader = leaders[i];
          // Tied people share the first one's place, so only that one shows
          // the number. Leaders come biggest count first, so ties sit together.
          const tied = leader !== undefined && leaders[i - 1]?.count === leader.count;
          return (
            <li key={leader?.userID ?? `empty-${i}`} className="flex items-center gap-2.5 py-1.5">
              <span className="w-4 text-xs font-semibold text-neutral-400">
                {tied ? (
                  <>
                    <span aria-hidden="true">-</span>
                    <span className="sr-only">Tied</span>
                  </>
                ) : (
                  i + 1
                )}
              </span>
              {leader ? (
                <>
                  <Avatar user={leader} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-neutral-700">@{leader.username}</span>
                  <span className="shrink-0 text-xs font-semibold text-primary">{plural(leader.count, unit)}</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full bg-neutral-200" />
                  <span className="flex-1 text-neutral-400">—</span>
                  <span className="shrink-0 text-xs text-neutral-400">—</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Total({ title, value }: { title: string; value: number | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-neutral-50 p-2.5 sm:p-4">
      <h3 className="truncate text-xs font-semibold uppercase text-neutral-500 sm:text-sm sm:tracking-wide">{title}</h3>
      <p className="truncate text-2xl font-bold text-primary sm:text-3xl">{value === undefined ? "—" : value.toLocaleString()}</p>
    </div>
  );
}

const ACTIVITY_METRICS: { id: ActivityMetric; label: string; noun: string; emptyText: string }[] = [
  { id: "users", label: "Users", noun: "new user", emptyText: "No new users" },
  { id: "comments", label: "Comments", noun: "comment", emptyText: "No comments" },
  { id: "sends", label: "Sends", noun: "send", emptyText: "No sends" },
];

type ActivityScale = "week" | "month" | "year";

const ACTIVITY_SCALES: { id: ActivityScale; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

// One bar of the activity chart: the day (YYYY-MM-DD) or, for a year, the
// month (YYYY-MM) it counts.
type Bucket = { key: string; label: string };

function addDays(date: string, days: number) {
  const day = parseDate(date);
  day.setDate(day.getDate() + days);
  return localDate(day);
}

// The past seven days ending today, every day of this month, or every month
// of this year - a year is counted by month, as 365 bars wouldn't fit.
function bucketsFor(scale: ActivityScale, today: string): Bucket[] {
  const [year, month] = today.split("-").map(Number);
  if (scale === "week") {
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(today, i - 6);
      const date = parseDate(key);
      return { key, label: `${date.toLocaleDateString(undefined, { weekday: "short" })} ${date.getDate()}` };
    });
  }
  if (scale === "month") {
    const days = new Date(year, month, 0).getDate();
    return Array.from({ length: days }, (_, i) => ({
      key: `${today.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
      label: String(i + 1),
    }));
  }
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: new Date(year, i, 1).toLocaleDateString(undefined, { month: "short" }),
  }));
}

// The day something happened in the admin's own timezone. Sends dated by
// their climber are already a day.
function dayOf(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDate(new Date(value));
}

function describeScale(scale: ActivityScale, buckets: Bucket[]) {
  const first = parseDate(buckets[0].key.length === 7 ? `${buckets[0].key}-01` : buckets[0].key);
  if (scale === "year") return `Per month · ${first.getFullYear()}`;
  if (scale === "month") return `Per day · ${first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
  const last = parseDate(buckets[buckets.length - 1].key);
  const format = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Per day · ${format(first)} – ${format(last)}`;
}

// How many users joined, comments were posted or sends happened in each day
// of the past week or this month, or each month of this year.
function ActivityChart({ activity, loadingText }: { activity?: UserStats["activity"]; loadingText: string | null }) {
  const [metric, setMetric] = useState<ActivityMetric>("users");
  const [scale, setScale] = useState<ActivityScale>("week");
  const { label, noun, emptyText } = ACTIVITY_METRICS.find((item) => item.id === metric)!;
  const buckets = bucketsFor(scale, todayDate());
  const keyLength = scale === "year" ? 7 : 10;

  const tally = new Map(buckets.map((bucket) => [bucket.key, 0]));
  for (const value of activity?.[metric] ?? []) {
    const key = dayOf(value).slice(0, keyLength);
    const count = tally.get(key);
    if (count !== undefined) tally.set(key, count + 1);
  }
  const counts = buckets.map((bucket) => ({ label: bucket.label, count: tally.get(bucket.key)! }));
  const total = counts.reduce((sum, { count }) => sum + count, 0);
  const period = scale === "week" ? "the past week" : scale === "month" ? "this month" : "this year";

  return (
    <section aria-label="Activity" className={WIDGET_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={WIDGET_TITLE_CLASS}>{label}</h3>
          <p className="text-xs text-neutral-500">
            {describeScale(scale, buckets)}
            {!loadingText && ` · ${plural(total, noun)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SlidingTabs label="Measure" tabs={ACTIVITY_METRICS} active={metric} onChange={setMetric} className="w-56" />
          <SlidingTabs label="Period" tabs={ACTIVITY_SCALES} active={scale} onChange={setScale} />
        </div>
      </div>
      <div className="mt-3">
        {loadingText ? (
          <p className="flex h-44 items-center justify-center text-sm text-neutral-500">{loadingText}</p>
        ) : (
          <CountChart
            counts={counts}
            noun={(count) => plural(count, noun)}
            caption={`${label} ${describeScale(scale, buckets).toLowerCase()}`}
            categoryHeader={scale === "year" ? "Month" : "Day"}
            countHeader={label}
            emptyText={`${emptyText} ${period}`}
            barClassName={scale === "month" ? "min-w-7" : "min-w-12"}
          />
        )}
      </div>
    </section>
  );
}

// The totals, then activity over time, then the leaderboards.
function UserDashboard() {
  // undefined while loading, null if the API couldn't be reached.
  const [stats, setStats] = useState<UserStats | null>();

  useEffect(() => {
    fetchUserStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const loadingText = stats === undefined ? "Loading…" : stats === null ? "Couldn't load the stats" : null;

  return (
    <section
      aria-labelledby="user-dashboard-heading"
      className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm"
    >
      <h2 id="user-dashboard-heading" className="text-xl font-bold text-primary">
        User Dashboard
      </h2>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Total title="Users" value={stats?.totalUsers} />
        <Total title="Comments" value={stats?.totalComments} />
        <Total title="Sends" value={stats?.totalSends} />
      </div>

      <ActivityChart activity={stats?.activity} loadingText={loadingText} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Leaderboard
          title="Most comments"
          leaders={stats?.topCommenters ?? []}
          unit="comment"
          status={loadingText ?? (stats?.topCommenters.length ? null : "No comments yet")}
        />
        <Leaderboard
          title="Most sends"
          leaders={stats?.topSenders ?? []}
          unit="send"
          status={loadingText ?? (stats?.topSenders.length ? null : "No sends yet")}
        />
      </div>
    </section>
  );
}

function Highlighted({ match }: { match: SearchMatch }) {
  const { value, start, length } = match;
  return (
    <>
      {value.slice(0, start)}
      <mark className="rounded-sm bg-secondary/40 px-0.5 text-neutral-900">{value.slice(start, start + length)}</mark>
      {value.slice(start + length)}
    </>
  );
}

// Where a search matched someone, with the matching part highlighted.
export function MatchBadge({ match }: { match: SearchMatch }) {
  return (
    <dl
      aria-label="Matched on"
      className="flex min-w-0 max-w-[50%] shrink-0 items-baseline gap-1.5 rounded-md bg-secondary/10 px-2 py-0.5 text-xs"
    >
      <dt className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {SEARCH_FIELD_LABELS[match.field]}
      </dt>
      <dd className="min-w-0 truncate text-neutral-700">
        <Highlighted match={match} />
      </dd>
    </dl>
  );
}

// One person: their picture, username, name and when they joined, with
// `children` - a search match, buttons - on the right. `itemProps` go on the
// card itself, to make it draggable; their className is added to the card's.
export function UserCard({
  user,
  children,
  itemProps,
}: {
  user: ListedUser;
  children?: ReactNode;
  itemProps?: LiHTMLAttributes<HTMLLIElement>;
}) {
  return (
    <li
      {...itemProps}
      className={`flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm ${
        itemProps?.className ?? ""
      }`}
    >
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-800">@{user.username}</p>
        <p className="truncate text-sm text-neutral-600">
          {user.fname} {user.lname}
        </p>
        <p className="text-xs text-neutral-500">Joined {formatJoined(user.createdAt)}</p>
      </div>
      {children}
    </li>
  );
}

// Users loaded so far for one search and batch size (`list`), and how many
// batches that took.
type LoadedUsers = { list: string; batches: number; users: UserSummary[]; total: number; error?: string };

// A user who signs up between batches pushes everyone down one, so the next
// batch can repeat someone already shown.
function appendUsers(users: UserSummary[], more: UserSummary[]) {
  const shown = new Set(users.map((user) => user.userID));
  return [...users, ...more.filter((user) => !shown.has(user.userID))];
}

// Every user, newest first, in one long list that grows a batch at a time,
// with a search across username, first and last name, email and phone. Each
// card shows where the search matched it. Also the body of /admin/users/all.
export function AdminUserList() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [batchSize, setBatchSize] = useState<UserPageSize>(USER_PAGE_SIZES[0]);
  const [data, setData] = useState<LoadedUsers>();
  const [loadingMore, setLoadingMore] = useState(false);
  const list = JSON.stringify([search, batchSize]);
  // A new search or batch size starts the list over; the old one stays up,
  // dimmed, until the first batch arrives.
  const loading = data?.list !== list;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    let current = true;
    fetchUsers(search, 1, batchSize)
      .then(({ users, total }) => current && setData({ list, batches: 1, users, total }))
      .catch(
        (error: Error) => current && setData({ list, batches: 0, users: [], total: 0, error: error.message }),
      );
    return () => {
      current = false;
    };
  }, [list, search, batchSize]);

  const loadMore = () => {
    if (!data || loading) return;
    setLoadingMore(true);
    // Each update checks the list is still the one asked about, in case the
    // search changed while this batch was on its way.
    fetchUsers(search, data.batches + 1, batchSize)
      .then(({ users, total }) =>
        setData((last) =>
          last?.list === list
            ? { list, batches: last.batches + 1, users: appendUsers(last.users, users), total }
            : last,
        ),
      )
      .catch((error: Error) =>
        setData((last) => (last?.list === list ? { ...last, error: error.message } : last)),
      )
      .finally(() => setLoadingMore(false));
  };

  const hasMore = !loading && data !== undefined && data.batches > 0 && data.users.length < data.total;

  return (
    <section aria-label="All users" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-64">
          <span className="sr-only">Search users</span>
          <input
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search by username, name, email or phone"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Load
          <select
            value={batchSize}
            onChange={(event) => setBatchSize(Number(event.target.value) as UserPageSize)}
            className={`${FIELD_CLASS} w-auto`}
          >
            {USER_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-neutral-500" aria-live="polite">
        {!data
          ? "Loading users…"
          : data.batches === 0
            ? ""
            : data.total === 0
              ? "No users found"
              : `Showing ${data.users.length.toLocaleString()} of ${plural(data.total, "user")}${
                  search ? ` matching “${search}”` : ""
                }`}
      </p>

      {data?.error && !loading && (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          Couldn&apos;t load users: {data.error}
        </p>
      )}

      {data && data.users.length > 0 && (
        <ul className={`grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
          {data.users.map((user) => (
            <UserCard key={user.userID} user={user}>
              {user.match && <MatchBadge match={user.match} />}
            </UserCard>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center rounded-full border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-white disabled:hover:text-primary"
        >
          {loadingMore ? "Loading…" : "Load more users"}
        </button>
      )}
    </section>
  );
}

// Slugs of the user center subpages that get a button above the dashboard.
const ACTIONS = [
  { slug: "all", label: "See all users" },
  { slug: "permissions", label: "User permissions" },
];

// Body of /admin/users: shortcuts to the user tools, the User Dashboard, then
// every user.
export default function AdminUsers({ section }: { section: AdminSection }) {
  const subpageHref = (slug: string) => {
    const subpage = section.subpages.find((item) => item.slug === slug);
    return subpage ? adminSubpageHref(section, subpage) : `/admin/${section.slug}`;
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {ACTIONS.map((action, index) => (
          <Link
            key={action.slug}
            href={subpageHref(action.slug)}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors ${
              index === 0
                ? "bg-secondary hover:bg-secondary/80"
                : "border border-primary bg-white hover:bg-primary hover:text-white"
            }`}
          >
            {action.label}
          </Link>
        ))}
      </div>

      <UserDashboard />
      <AdminUserList />
    </>
  );
}
