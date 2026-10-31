// What the logged-in visitor's dashboard shows.

import { type Announcement, type ApiAnnouncement, toAnnouncement } from "@/lib/announcements";
import { apiUrl } from "@/lib/api";
import { type ApiRoute, type Climb, type ClimbComment, type ClimbType, toClimb } from "@/lib/climbs";

// Mirrors UserMetrics in api/src/models/User.ts.
export type DashboardMetrics = {
  sends: Record<ClimbType, number>;
  hardestSend: { route?: string; boulder?: string };
  lineSends: Record<string, number>;
  commentsPosted: number;
  latestSend: { routeID: string; date: string } | null;
};

// A comment and the climb it's on - null once the climb is gone.
export type DashboardComment = { comment: ClimbComment; climb: Climb | null };

// `isNew` when it came after their last visit.
export type DashboardUpdate = { at: string; isNew: boolean } & (
  | { kind: "announcement"; announcement: Announcement }
  | ({ kind: "comment" } & DashboardComment)
);

export type Dashboard = {
  // Newest first.
  updates: DashboardUpdate[];
  hasMoreUpdates: boolean;
  metrics: DashboardMetrics;
  // Null when they haven't sent anything, or the climb is gone.
  latestSendClimb: Climb | null;
  // Their own, newest first.
  recentComments: DashboardComment[];
};

// Mirrors openDashboard in api/src/functions/dashboard.ts.
type ApiComment = { comment: ClimbComment; climb: ApiRoute | null };
type ApiUpdate = { at: string; isNew: boolean } & (
  | { kind: "announcement"; announcement: ApiAnnouncement }
  | ({ kind: "comment" } & ApiComment)
);
type ApiDashboard = {
  updates: ApiUpdate[];
  hasMoreUpdates: boolean;
  metrics: DashboardMetrics;
  latestSendClimb: ApiRoute | null;
  recentComments: ApiComment[];
};

function toDashboardComment({ comment, climb }: ApiComment): DashboardComment {
  return { comment, climb: climb && toClimb(climb) };
}

function toUpdate(update: ApiUpdate): DashboardUpdate {
  const { at, isNew } = update;
  return update.kind === "announcement"
    ? { at, isNew, kind: "announcement", announcement: toAnnouncement(update.announcement) }
    : { at, isNew, kind: "comment", ...toDashboardComment(update) };
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
    metrics: body.metrics,
    latestSendClimb: body.latestSendClimb && toClimb(body.latestSendClimb),
    recentComments: body.recentComments.map(toDashboardComment),
  };
}

// The next page of updates from before the moment `before` (ISO), for "Load
// more". Doesn't count as a visit.
export async function fetchOlderUpdates(
  before: string,
): Promise<Pick<Dashboard, "updates" | "hasMoreUpdates">> {
  const res = await fetch(apiUrl(`/dashboard/updates?before=${encodeURIComponent(before)}`), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load more updates (${res.status})`);
  const body = (await res.json()) as Pick<ApiDashboard, "updates" | "hasMoreUpdates">;
  return { updates: body.updates.map(toUpdate), hasMoreUpdates: body.hasMoreUpdates };
}

export function totalSends({ sends }: DashboardMetrics) {
  return sends.route + sends.boulder + sends.combo;
}

// "5.11b · V4-5" - routes and boulders are on different scales.
export function hardestSendLabel({ hardestSend }: DashboardMetrics) {
  return [hardestSend.route, hardestSend.boulder].filter(Boolean).join(" · ") || "—";
}

// The line they've sent the most on, the lower line on a tie.
export function favouriteLineLabel({ lineSends }: DashboardMetrics) {
  const lines = Object.entries(lineSends).sort(([a, sendsA], [b, sendsB]) => sendsB - sendsA || Number(a) - Number(b));
  return lines.length > 0 ? `Line ${lines[0][0]}` : "—";
}
