"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AccessNotice from "@/components/AccessNotice";
import { ClimbBox, RecentComment } from "@/components/ClimbActivity";
import { Placeholder } from "@/components/ClimbCards";
import FollowListDialog from "@/components/FollowListDialog";
import { AVATAR_SIZE, avatarUrl } from "@/lib/avatar";
import { commentSentAt, formatDate } from "@/lib/climbs";
import { hardestSendLabel, totalSends } from "@/lib/dashboard";
import { type FollowList, type FollowRelation, isFriend, setUserFollowed } from "@/lib/follows";
import type { ProfileSection } from "@/lib/privacy";
import { displayName, fetchProfile, type Profile, profileHref } from "@/lib/profiles";
import { withReturnTo } from "@/lib/returnTo";
import { useSessionUser } from "@/lib/session";
import { settingsHref } from "@/lib/settings";

const PANEL_CLASS = "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm";
const PANEL_HEADING_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

const BAR_BUTTON_CLASS =
  "shrink-0 rounded-full border border-primary bg-white px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white";

// Above their own profile, outside of it: what only they can do with it, or a
// way back when they're seeing it as others do.
function OwnerBar({ username, asOthers }: { username: string; asOthers: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:justify-between ${
        asOthers ? "border-sky-200 bg-sky-50 text-sky-900" : "border-neutral-200 bg-white text-neutral-600"
      }`}
    >
      <p className="text-center sm:text-left">
        {asOthers ? "You're seeing your profile as everyone else sees it." : "This is your profile."}
      </p>
      <div className="flex gap-2">
        {asOthers ? (
          <Link href={profileHref(username)} replace className={BAR_BUTTON_CLASS}>
            Back to your view
          </Link>
        ) : (
          <>
            <Link href={profileHref(username, true)} replace className={BAR_BUTTON_CLASS}>
              View as others
            </Link>
            <Link href={settingsHref()} className={BAR_BUTTON_CLASS}>
              Edit profile
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

const FOLLOW_CLASS =
  "inline-flex w-full items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-wait disabled:opacity-60";
const FILLED_CLASS = `${FOLLOW_CLASS} bg-primary text-white hover:bg-primary/90`;
const OUTLINE_CLASS = `${FOLLOW_CLASS} border border-primary bg-white text-primary hover:bg-primary/5`;

// Following them, or - after checking they're sure - unfollowing them. A
// prompt to log in for visitors who aren't, and nothing on their own profile.
function FollowControl({
  profile,
  onChanged,
}: {
  profile: Profile;
  onChanged: (relation: FollowRelation) => void;
}) {
  const user = useSessionUser();
  const [status, setStatus] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const { relation, username } = profile;

  if (user === undefined) return null;
  if (user === null) {
    return (
      <Link href={withReturnTo("/login", profileHref(username))} className={FILLED_CLASS}>
        Follow
      </Link>
    );
  }
  if (!relation) return null;

  async function change(follow: boolean) {
    setStatus("busy");
    setError(null);
    try {
      onChanged((await setUserFollowed(username, follow)).relation);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setStatus(follow ? "idle" : "confirm");
    }
  }

  const friends = isFriend(relation);
  return (
    <div className="flex flex-col gap-2 text-center">
      {status === "confirm" || (status === "busy" && relation.follows) ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">
            Unfollow @{username}?{friends && " You'll stop being friends."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setStatus("idle")} disabled={status === "busy"} className={OUTLINE_CLASS}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => change(false)}
              disabled={status === "busy"}
              className={`${FOLLOW_CLASS} bg-red-600 text-white hover:bg-red-700`}
            >
              {status === "busy" ? "Unfollowing…" : "Unfollow"}
            </button>
          </div>
        </div>
      ) : relation.follows ? (
        <button
          type="button"
          onClick={() => setStatus("confirm")}
          aria-label={`${friends ? "Friends" : "Following"} - unfollow @${username}`}
          className={OUTLINE_CLASS}
        >
          {friends ? "Friends" : "Following"}
        </button>
      ) : (
        <button type="button" onClick={() => change(true)} disabled={status === "busy"} className={FILLED_CLASS}>
          {status === "busy" ? "Following…" : relation.followedBy ? "Follow back" : "Follow"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// Side by side, each taking half the width, with the number above its label
// - a dash in its place when it's hidden from the visitor. On their own
// profile, each opens a popup listing the people in it, with a badge under any
// they've hidden from others.
function FollowCounts({ profile, isOwner }: { profile: Profile; isOwner: boolean }) {
  const [open, setOpen] = useState<FollowList | null>(null);
  const { followers, following } = profile;
  const counts: { list: FollowList; label: string; value: number | undefined }[] = [
    { list: "followers", label: followers === 1 ? "Follower" : "Followers", value: followers },
    { list: "following", label: "Following", value: following },
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 text-center">
        {counts.map((count) => {
          const content = (
            <>
              <span
                className={`block text-lg font-bold tabular-nums ${count.value === undefined ? "text-neutral-400" : "text-primary"}`}
                title={count.value === undefined ? "Hidden" : undefined}
              >
                {count.value ?? "-"}
              </span>
              <span className="block text-sm text-neutral-600">{count.label}</span>
            </>
          );
          return (
            <div key={count.list}>
              <dt className="sr-only">{count.label}</dt>
              <dd>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setOpen(count.list)}
                    aria-label={`${count.value} ${count.label.toLowerCase()} - see who`}
                    className="w-full rounded-lg px-2 py-1 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    {content}
                  </button>
                ) : (
                  <span aria-hidden="true" className="block px-2 py-1">
                    {content}
                  </span>
                )}
                {!isOwner && <span className="sr-only">{count.value ?? "Hidden"}</span>}
                <span className="mt-1 flex justify-center empty:hidden">
                  <HiddenBadge profile={profile} section={count.list} />
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      {open && <FollowListDialog username={profile.username} list={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Header({
  profile,
  isOwner,
  onFollowChanged,
}: {
  profile: Profile;
  isOwner: boolean;
  onFollowChanged: (relation: FollowRelation) => void;
}) {
  return (
    <section
      aria-label="Who they are"
      className={`${PANEL_CLASS} flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-6 sm:text-left`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl(profile)}
        alt=""
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        className="h-28 w-28 shrink-0 rounded-full border-2 border-black object-cover"
      />
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-3xl font-bold text-primary sm:text-4xl">{displayName(profile)}</h1>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-neutral-500 sm:justify-start">
          @{profile.username}
          {profile.relation?.followedBy && !profile.relation.follows && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">Follows you</span>
          )}
        </p>
      </div>
      {/* On the right: the counts, with following them underneath at the same
          width. */}
      <div className="flex w-full max-w-64 shrink-0 flex-col gap-3 sm:w-64">
        <FollowCounts profile={profile} isOwner={isOwner} />
        <FollowControl profile={profile} onChanged={onFollowChanged} />
      </div>
    </section>
  );
}

// On their own profile, beside anything they've hidden from everyone else.
function HiddenBadge({ profile, section }: { profile: Profile; section: ProfileSection }) {
  const visibility = profile.privacy?.[section];
  if (!visibility || visibility === "everyone") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-neutral-500">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </svg>
      {visibility === "friends" ? "Friends only" : "Only you"}
    </span>
  );
}

type Stat = { section: ProfileSection; label: string; value: string | number; note?: string };

// Only the numbers they show - none at all when they've hidden every one.
function Stats({ profile }: { profile: Profile }) {
  const { sends, commentsPosted, hardestSend, favouriteLine } = profile.stats;
  const stats: Stat[] = [];
  if (commentsPosted !== undefined) stats.push({ section: "comments", label: "Comments", value: commentsPosted });
  if (sends) {
    const { route, boulder, combo } = sends;
    const breakdown = [
      route && `${route} route${route === 1 ? "" : "s"}`,
      boulder && `${boulder} boulder${boulder === 1 ? "" : "s"}`,
      combo && `${combo} combo${combo === 1 ? "" : "s"}`,
    ].filter(Boolean);
    stats.push({ section: "sends", label: "Sends", value: totalSends({ sends }), note: breakdown.join(" · ") });
  }
  if (hardestSend) stats.push({ section: "hardestSend", label: "Hardest send", value: hardestSendLabel({ hardestSend }) });
  if (favouriteLine !== undefined) {
    stats.push({ section: "favouriteLine", label: "Favourite line", value: favouriteLine ? `Line ${favouriteLine}` : "—" });
  }
  if (stats.length === 0) return null;

  // As many columns as fit, so a hidden number doesn't leave a gap.
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm">
          <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {stat.label}
            <HiddenBadge profile={profile} section={stat.section} />
          </dt>
          <dd className="order-first break-words text-2xl font-bold text-primary tabular-nums">{stat.value}</dd>
          {stat.note && <dd className="mt-1 text-xs text-neutral-500">{stat.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Sends({ sends }: { sends: NonNullable<Profile["recentSends"]> }) {
  if (sends.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-500">No sends yet.</p>;
  }
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {sends.map(({ comment, climb }) => {
        const sentAt = commentSentAt(comment);
        return (
          <li key={comment.commentID} className="flex flex-col gap-1.5">
            <p className="text-xs text-neutral-500">
              Sent {sentAt ? <time dateTime={sentAt}>{formatDate(sentAt)}</time> : "—"}
            </p>
            {climb && <ClimbBox climb={climb} />}
          </li>
        );
      })}
    </ol>
  );
}

function Comments({ comments }: { comments: NonNullable<Profile["recentComments"]> }) {
  if (comments.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-500">No comments yet.</p>;
  }
  return (
    <div className="mt-2 flex flex-col divide-y divide-neutral-100">
      {comments.map(({ comment, climb }) => (
        <RecentComment key={comment.commentID} comment={comment} climb={climb} />
      ))}
    </div>
  );
}

// What they've said and sent lately, side by side - or whichever of the two
// they show, across the page. When they've hidden everything, a line saying
// so instead.
function Activity({ profile }: { profile: Profile }) {
  const { recentComments, recentSends } = profile;
  if (!recentComments && !recentSends) {
    return Object.keys(profile.stats).length > 0 ? null : (
      <p className={`${PANEL_CLASS} text-center text-sm text-neutral-500`}>
        @{profile.username} keeps the rest of their profile private.
      </p>
    );
  }
  return (
    <div className={`grid grid-cols-1 gap-6 ${recentComments && recentSends ? "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
      {recentComments && (
        <section aria-labelledby="comments-heading" className={PANEL_CLASS}>
          <h2 id="comments-heading" className={`${PANEL_HEADING_CLASS} flex flex-wrap items-center gap-2`}>
            Latest comments
            <HiddenBadge profile={profile} section="recentComments" />
          </h2>
          <Comments comments={recentComments} />
        </section>
      )}
      {recentSends && (
        <section aria-labelledby="sends-heading" className={`${PANEL_CLASS} self-start`}>
          <h2 id="sends-heading" className={`${PANEL_HEADING_CLASS} flex flex-wrap items-center gap-2`}>
            Recent sends
            <HiddenBadge profile={profile} section="recentSends" />
          </h2>
          <Sends sends={recentSends} />
        </section>
      )}
    </div>
  );
}

// Anyone's profile, without what they've hidden - and to its owner all of it,
// with a bar of their own above it, unless they've asked to see it as others
// do.
export default function PublicProfile({ username, asOthers }: { username: string; asOthers: boolean }) {
  const sessionUserID = useSessionUser()?.userID;
  const [profile, setProfile] = useState<Profile | null | "error" | undefined>(undefined);

  useEffect(() => {
    fetchProfile(username, asOthers)
      .then(setProfile)
      .catch(() => setProfile("error"));
  }, [username, asOthers]);

  if (profile === null) {
    return (
      <AccessNotice
        title="No such climber"
        message={`There's nobody with the username @${username}.`}
        actionLabel="Back to the climbs"
        actionHref="/climbs"
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
        {profile === "error" ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
            This profile couldn&apos;t be loaded. Try refreshing the page.
          </p>
        ) : profile === undefined ? (
          <>
            <Placeholder className="h-40" />
            <Placeholder className="h-28" />
            <Placeholder className="h-72" />
          </>
        ) : (
          <>
            {sessionUserID === profile.userID && <OwnerBar username={profile.username} asOthers={asOthers} />}
            <Header
              profile={profile}
              isOwner={sessionUserID === profile.userID && !asOthers}
              onFollowChanged={(relation) => {
                setProfile({ ...profile, relation });
                // Counts change, and becoming (or no longer being) friends can
                // show or hide parts of it. Not fatal: the button's already right.
                fetchProfile(username, asOthers)
                  .then((fresh) => fresh && setProfile(fresh))
                  .catch(() => {});
              }}
            />
            <Stats profile={profile} />
            <Activity profile={profile} />
          </>
        )}
      </div>
    </div>
  );
}
