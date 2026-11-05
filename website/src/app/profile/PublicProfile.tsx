"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AccessNotice from "@/components/AccessNotice";
import { ClimbBox, RecentComment } from "@/components/ClimbActivity";
import { Placeholder } from "@/components/ClimbCards";
import { AVATAR_SIZE, avatarUrl } from "@/lib/avatar";
import { commentSentAt, formatDate } from "@/lib/climbs";
import { favouriteLineLabel, hardestSendLabel, totalSends } from "@/lib/dashboard";
import { displayName, fetchProfile, type Profile, profileHref } from "@/lib/profiles";
import { useSessionUser } from "@/lib/session";

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
            <Link href="/profile" className={BAR_BUTTON_CLASS}>
              Edit profile
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Header({ profile }: { profile: Profile }) {
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
        <p className="mt-1 text-neutral-500">@{profile.username}</p>
      </div>
    </section>
  );
}

function Stats({ profile }: { profile: Profile }) {
  const { metrics } = profile;
  const { route, boulder, combo } = metrics.sends;
  const breakdown = [
    route && `${route} route${route === 1 ? "" : "s"}`,
    boulder && `${boulder} boulder${boulder === 1 ? "" : "s"}`,
    combo && `${combo} combo${combo === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const stats = [
    { label: "Comments", value: metrics.commentsPosted },
    { label: "Sends", value: totalSends(metrics), note: breakdown.join(" · ") },
    { label: "Hardest send", value: hardestSendLabel(metrics) },
    { label: "Favourite line", value: favouriteLineLabel(metrics) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm">
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{stat.label}</dt>
          <dd className="order-first break-words text-2xl font-bold text-primary tabular-nums">{stat.value}</dd>
          {stat.note && <dd className="mt-1 text-xs text-neutral-500">{stat.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Sends({ profile }: { profile: Profile }) {
  if (profile.recentSends.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-500">No sends yet.</p>;
  }
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {profile.recentSends.map(({ comment, climb }) => {
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

function Comments({ profile }: { profile: Profile }) {
  if (profile.recentComments.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-500">No comments yet.</p>;
  }
  return (
    <div className="mt-2 flex flex-col divide-y divide-neutral-100">
      {profile.recentComments.map(({ comment, climb }) => (
        <RecentComment key={comment.commentID} comment={comment} climb={climb} />
      ))}
    </div>
  );
}

// Anyone's profile, as everyone sees it - and to its owner with a bar of
// their own above it, unless they've asked to see it as others do.
export default function PublicProfile({ username, asOthers }: { username: string; asOthers: boolean }) {
  const sessionUserID = useSessionUser()?.userID;
  const [profile, setProfile] = useState<Profile | null | "error" | undefined>(undefined);

  useEffect(() => {
    fetchProfile(username)
      .then(setProfile)
      .catch(() => setProfile("error"));
  }, [username]);

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
            <Header profile={profile} />
            <Stats profile={profile} />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section aria-labelledby="comments-heading" className={PANEL_CLASS}>
                <h2 id="comments-heading" className={PANEL_HEADING_CLASS}>
                  Latest comments
                </h2>
                <Comments profile={profile} />
              </section>
              <section aria-labelledby="sends-heading" className={`${PANEL_CLASS} self-start`}>
                <h2 id="sends-heading" className={PANEL_HEADING_CLASS}>
                  Recent sends
                </h2>
                <Sends profile={profile} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
