// What the logged-in visitor's dashboard shows.

import { type Announcement, type ApiAnnouncement, toAnnouncement } from "@/lib/announcements";
import { apiUrl } from "@/lib/api";
import { type ApiRoute, type Climb, type ClimbComment, type ClimbType, toClimb } from "@/lib/climbs";

// Mirrors UserMetrics in api/src/models/User.ts.
export type DashboardMetrics = {
  sends: Record<ClimbType, number>;
  // By type of climb - combos apart from routes, though on the same scale.
  hardestSend: Partial<Record<ClimbType, string>>;
  lineSends: Record<string, number>;
  // By the climb's grade - route and boulder grades together.
  gradeSends: Record<string, number>;
  // How many comments gave each rating, by the rating (0-10).
  ratingsGiven: Record<string, number>;
  commentsPosted: number;
  latestSend: { routeID: string; date: string } | null;
};

// A comment and the climb it's on - null once the climb is gone.
export type DashboardComment = { comment: ClimbComment; climb: Climb | null };

// Why a comment or send is in their updates: it's on a climb they've saved,
// or by someone they follow - or by a friend, someone they follow who follows
// them back. Mirrors FollowedVia in api/src/functions/dashboard.ts.
export type FollowedVia = "climb" | "user" | "friend";

// `isNew` when it came after their last visit.
export type DashboardUpdate = { at: string; isNew: boolean } & (
  | { kind: "announcement"; announcement: Announcement }
  | ({ kind: "comment"; via: FollowedVia } & DashboardComment)
);

export type Dashboard = {
  // Newest first.
  updates: DashboardUpdate[];
  hasMoreUpdates: boolean;
  metrics: DashboardMetrics;
  // Null when they haven't sent anything, or the climb is gone.
  latestSendClimb: Climb | null;
  // Their own sends, most recently sent first.
  recentSends: DashboardComment[];
  // Their visit before this one - updates from then on are new.
  since: string;
};

// Which updates to show. Mirrors UPDATE_FILTERS in
// api/src/functions/dashboard.ts.
export type UpdateFilter = "all" | "announcements" | "following" | "climbs";

// Mirrors openDashboard in api/src/functions/dashboard.ts.
// A comment as the API sends it, with its climb not yet turned into a Climb.
export type ApiComment = { comment: ClimbComment; climb: ApiRoute | null };
type ApiUpdate = { at: string; isNew: boolean } & (
  | { kind: "announcement"; announcement: ApiAnnouncement }
  | ({ kind: "comment"; via: FollowedVia } & ApiComment)
);
// The charts' numbers and recent sends are missing from an API from before
// they were added.
type NewerMetrics = "gradeSends" | "ratingsGiven";
type ApiDashboard = {
  updates: ApiUpdate[];
  hasMoreUpdates: boolean;
  metrics: Omit<DashboardMetrics, NewerMetrics> & Partial<Pick<DashboardMetrics, NewerMetrics>>;
  latestSendClimb: ApiRoute | null;
  recentSends?: ApiComment[];
  since: string;
};

export function toDashboardComment({ comment, climb }: ApiComment): DashboardComment {
  return { comment, climb: climb && toClimb(climb) };
}

function toUpdate(update: ApiUpdate): DashboardUpdate {
  const { at, isNew } = update;
  return update.kind === "announcement"
    ? { at, isNew, kind: "announcement", announcement: toAnnouncement(update.announcement) }
    : { at, isNew, kind: "comment", via: update.via, ...toDashboardComment(update) };
}

// Loads the dashboard and marks them as having been on it now, so ask once per
// visit - a second ask finds nothing new.
export async function openDashboard(): Promise<Dashboard> {
  const res = await fetch(apiUrl("/dashboard"), { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load your dashboard (${res.status})`);
  const body = (await res.json()) as ApiDashboard;
  return {
    updates: body.updates.map(toUpdate),
    hasMoreUpdates: body.hasMoreUpdates,
    metrics: { ...body.metrics, gradeSends: body.metrics.gradeSends ?? {}, ratingsGiven: body.metrics.ratingsGiven ?? {} },
    latestSendClimb: body.latestSendClimb && toClimb(body.latestSendClimb),
    recentSends: (body.recentSends ?? []).map(toDashboardComment),
    since: body.since,
  };
}

// A page of updates of the kind `only` picks, from before the moment `before`
// (ISO) - or the newest, without one. Those from `since` on are new. Doesn't
// count as a visit.
export async function fetchUpdates({
  before,
  only,
  since,
}: {
  before?: string;
  only: UpdateFilter;
  since: string;
}): Promise<Pick<Dashboard, "updates" | "hasMoreUpdates">> {
  const query = new URLSearchParams({ only, since });
  if (before) query.set("before", before);
  const res = await fetch(apiUrl(`/dashboard/updates?${query}`), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load more updates (${res.status})`);
  const body = (await res.json()) as Pick<ApiDashboard, "updates" | "hasMoreUpdates">;
  return { updates: body.updates.map(toUpdate), hasMoreUpdates: body.hasMoreUpdates };
}

// Which of their own comments to show. Mirrors MY_COMMENT_FILTERS in
// api/src/functions/dashboard.ts.
export type MyCommentFilter = "all" | "sends";

// A page of everything they've commented, newest first, starting `offset` in.
export async function fetchMyComments({
  offset,
  only,
}: {
  offset: number;
  only: MyCommentFilter;
}): Promise<{ comments: DashboardComment[]; hasMore: boolean; total: number }> {
  const query = new URLSearchParams({ offset: String(offset), only });
  const res = await fetch(apiUrl(`/dashboard/comments?${query}`), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load your comments (${res.status})`);
  const body = (await res.json()) as { comments: ApiComment[]; hasMore: boolean; total: number };
  return { comments: body.comments.map(toDashboardComment), hasMore: body.hasMore, total: body.total };
}

export function totalSends({ sends }: Pick<DashboardMetrics, "sends">) {
  return sends.route + sends.boulder + sends.combo;
}

// The line they've sent the most on, the lower line on a tie.
export function favouriteLineLabel({ lineSends }: DashboardMetrics) {
  const lines = Object.entries(lineSends).sort(([a, sendsA], [b, sendsB]) => sendsB - sendsA || Number(a) - Number(b));
  return lines.length > 0 ? `Line ${lines[0][0]}` : "—";
}
