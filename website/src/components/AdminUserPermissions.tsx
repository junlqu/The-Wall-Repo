"use client";

import { type DragEvent, type HTMLAttributes, type LiHTMLAttributes, useEffect, useState } from "react";
import { MatchBadge, SEARCH_DELAY_MS, UserCard } from "@/components/AdminUsers";
import { FIELD_CLASS } from "@/components/ClimbForm";
import ToggleSwitch from "@/components/ToggleSwitch";
import { type SessionUser, USER_LEVEL, useSessionUser } from "@/lib/session";
import {
  fetchPermissionUsers,
  fetchUsers,
  type ListedUser,
  PERMISSION_LEVELS,
  setUserLevel,
  type UserSummary,
} from "@/lib/users";

const SECTION_CLASS = "flex flex-col gap-3 rounded-xl border p-5 shadow-sm transition";
const CARD_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

// Members are the one level without a box of their own.
function levelLabel(level: number) {
  return PERMISSION_LEVELS.find((item) => item.level === level)?.label ?? "Member";
}

// Why `me` can't change `user`'s level at all, or null when they can. Only
// people below your own level can be moved. The API makes the same checks
// against the database.
function lockedReason(me: SessionUser, user: ListedUser) {
  if (user.userID === me.userID) return "You can't change your own level";
  if (user.level === me.level) return "You can't change the level of someone at your own level";
  if (user.level > me.level) return "You can't change the level of someone above you";
  return null;
}

// Why `me` can't move `user` to `to`, or null when they can.
function blockedReason(me: SessionUser, user: ListedUser, to: number) {
  return lockedReason(me, user) ?? (to >= me.level ? "You can only move people to a level below your own" : null);
}

// What the page passes down to move people, by arrow or by drag.
type Mover = {
  me: SessionUser;
  dragMode: boolean;
  busy: Set<string>;
  // Who's being dragged, and which level they're over.
  dragging: ListedUser | null;
  over: number | null;
  move: (user: ListedUser, to: number) => void;
  startDrag: (user: ListedUser) => void;
  endDrag: () => void;
  setOver: (level: number | null) => void;
};

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 ${direction === "down" ? "rotate-180" : ""}`}
    >
      <path d="M10 4.5a1 1 0 0 1 .7.3l5 5a1 1 0 0 1-1.4 1.4L10 6.9l-4.3 4.3a1 1 0 0 1-1.4-1.4l5-5a1 1 0 0 1 .7-.3z" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      {[6, 10, 14].flatMap((y) =>
        [7.5, 12.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />),
      )}
    </svg>
  );
}

// One arrow on a card. A move that isn't allowed stays visible but faded,
// saying why on hover.
function MoveButton({
  direction,
  user,
  to,
  mover,
}: {
  direction: "up" | "down";
  user: ListedUser;
  to: number;
  mover: Mover;
}) {
  const blocked = blockedReason(mover.me, user, to);
  const unavailable = blocked !== null || mover.busy.has(user.userID);
  return (
    <button
      type="button"
      aria-disabled={unavailable}
      aria-label={`Move @${user.username} ${direction} to ${levelLabel(to)}`}
      title={blocked ?? `Move ${direction} to ${levelLabel(to)}`}
      onClick={() => !unavailable && mover.move(user, to)}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        unavailable
          ? "cursor-not-allowed border-neutral-200 text-neutral-300"
          : "border-primary/30 bg-white text-primary hover:border-primary hover:bg-primary hover:text-white"
      }`}
    >
      <ArrowIcon direction={direction} />
    </button>
  );
}

// A card that can be moved: up and down arrows on the right, or - in drag
// mode - a grip, and the whole card picks up. There's nowhere above Admin,
// and nowhere below Member.
function MovableCard({ user, mover, match }: { user: ListedUser; mover: Mover; match?: UserSummary["match"] }) {
  const locked = lockedReason(mover.me, user);
  const busy = mover.busy.has(user.userID);

  let itemProps: LiHTMLAttributes<HTMLLIElement> | undefined;
  if (mover.dragMode) {
    const draggable = locked === null && !busy;
    itemProps = {
      draggable,
      title: locked ?? (busy ? "Moving…" : "Drag to another level"),
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", user.userID);
        mover.startDrag(user);
      },
      onDragEnd: mover.endDrag,
      className: draggable
        ? `cursor-grab active:cursor-grabbing hover:border-secondary ${
            mover.dragging?.userID === user.userID ? "opacity-40" : ""
          }`
        : "opacity-60",
    };
  }

  return (
    <UserCard user={user} itemProps={itemProps}>
      {match && <MatchBadge match={match} />}
      {mover.dragMode ? (
        locked === null && (
          <span className="shrink-0 text-neutral-400">
            <GripIcon />
          </span>
        )
      ) : (
        <div className="flex shrink-0 flex-col gap-1">
          {user.level < USER_LEVEL.admin && (
            <MoveButton direction="up" user={user} to={user.level + 1} mover={mover} />
          )}
          {user.level > USER_LEVEL.member && (
            <MoveButton direction="down" user={user} to={user.level - 1} mover={mover} />
          )}
        </div>
      )}
    </UserCard>
  );
}

// Makes a box a place to drop someone being dragged, when they can be moved
// to its level. Highlights every box they could go to, and the one they're
// over most of all.
function dropTarget(mover: Mover, level: number): { props: HTMLAttributes<HTMLElement>; className: string } {
  const { dragging, over, me } = mover;
  const valid = mover.dragMode && dragging !== null && dragging.level !== level && level < me.level;
  if (!valid) return { props: {}, className: "" };

  return {
    props: {
      onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (over !== level) mover.setOver(level);
      },
      onDragLeave: (event) => {
        // Moving onto a card inside the box still counts as over it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) mover.setOver(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        mover.move(dragging, level);
        mover.endDrag();
      },
    },
    className:
      over === level
        ? "outline-dashed outline-2 outline-offset-2 outline-secondary bg-secondary/10!"
        : "outline-dashed outline-2 outline-offset-2 outline-secondary/40",
  };
}

// Finds members to promote - every account starts as one, so they aren't
// laid out in a box like the other levels. In drag mode it's also where to
// drop someone to make them a member again.
function PromoteMember({ mover, promoted }: { mover: Mover; promoted: Set<string> }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  // The search the results are for, so stale ones aren't shown as current.
  const [results, setResults] = useState<{ search: string; users?: UserSummary[]; error?: string }>();
  const drop = dropTarget(mover, USER_LEVEL.member);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!search) return;
    let current = true;
    fetchUsers(search, 1, 10, USER_LEVEL.member)
      .then(({ users }) => current && setResults({ search, users }))
      .catch((error: Error) => current && setResults({ search, error: error.message }));
    return () => {
      current = false;
    };
  }, [search]);

  const shown = search && results?.search === search ? results : undefined;
  const users = shown?.users?.filter((user) => !promoted.has(user.userID)) ?? [];

  return (
    <section
      aria-labelledby="promote-heading"
      {...drop.props}
      className={`${SECTION_CLASS} border-primary/10 bg-white ${drop.className}`}
    >
      <div>
        <h2 id="promote-heading" className="text-lg font-bold text-primary">
          Promote a member
        </h2>
        <p className="text-sm text-neutral-600">
          {drop.className
            ? `Drop @${mover.dragging?.username} here to make them a member again.`
            : mover.dragMode
              ? "Find someone who's still a member, then drag them into a level."
              : "Find someone who's still a member to move them up to Executive."}
        </p>
      </div>
      <label>
        <span className="sr-only">Search members</span>
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search members by username, name, email or phone"
          className={FIELD_CLASS}
        />
      </label>
      {search && (
        <p className="text-xs text-neutral-500" aria-live="polite">
          {!shown
            ? "Searching…"
            : shown.error
              ? `Couldn't search: ${shown.error}`
              : users.length === 0
                ? "No members found"
                : `${users.length} member${users.length === 1 ? "" : "s"} found${
                    shown.users!.length === 10 ? " - showing the newest 10, so narrow the search to find others" : ""
                  }`}
        </p>
      )}
      {users.length > 0 && (
        <ul className={CARD_GRID_CLASS}>
          {users.map((user) => (
            <MovableCard key={user.userID} user={user} mover={mover} match={user.match} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Who can change the people at `level` - anyone above it. Admins have nobody
// above them.
function whoCanChange(level: number) {
  return level < USER_LEVEL.admin
    ? `Only ${levelLabel(level + 1)}s and above can change this level`
    : "Admins can only be changed in the database";
}

// One level's box. Greyed out, cards and all, when it's at or above the
// admin's own level - they can't move anyone in or out of it.
function LevelSection({
  level,
  label,
  users,
  loadingText,
  mover,
}: {
  level: number;
  label: string;
  users: ListedUser[];
  loadingText: string | null;
  mover: Mover;
}) {
  const locked = level >= mover.me.level;
  const drop = dropTarget(mover, level);
  return (
    <section
      aria-labelledby={`level-${level}-heading`}
      {...drop.props}
      className={`${SECTION_CLASS} ${
        locked ? "border-neutral-200 bg-neutral-100 opacity-60 grayscale" : "border-primary/10 bg-white"
      } ${drop.className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`level-${level}-heading`} className="text-lg font-bold text-primary">
          {label} <span className="text-sm font-semibold text-neutral-400">· Level {level}</span>
        </h2>
        <span className="text-xs text-neutral-500">
          {locked ? whoCanChange(level) : `${users.length} ${users.length === 1 ? "person" : "people"}`}
        </span>
      </div>
      {loadingText || users.length === 0 ? (
        <p className="py-4 text-center text-sm text-neutral-500">
          {loadingText ?? (drop.className ? "Drop here" : "Nobody at this level")}
        </p>
      ) : (
        <ul className={CARD_GRID_CLASS}>
          {users.map((user) => (
            <MovableCard key={user.userID} user={user} mover={mover} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Body of /admin/users/permissions: a box per level from Admin down to
// Executive, and a search to promote members. People are moved one level at a
// time with the arrows on their card or, with drag and drop switched on, by
// dragging their card into another level.
export default function AdminUserPermissions() {
  const me = useSessionUser();
  // undefined while loading, null if the API couldn't be reached.
  const [users, setUsers] = useState<ListedUser[] | null>();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [dragMode, setDragMode] = useState(false);
  const [dragging, setDragging] = useState<ListedUser | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useEffect(() => {
    fetchPermissionUsers()
      .then(setUsers)
      .catch(() => setUsers(null));
  }, []);

  // AdminGuard only shows this page once the session has loaded.
  if (!me) return null;

  const move = (user: ListedUser, to: number) => {
    setError(undefined);
    setBusy((current) => new Set(current).add(user.userID));
    setUserLevel(user.userID, to, user.level)
      .then((updated) => {
        setUsers((current) => {
          const others = (current ?? []).filter((item) => item.userID !== updated.userID);
          return updated.level > USER_LEVEL.member ? [updated, ...others] : others;
        });
        // Dropped from the member search once promoted; back in it if moved
        // down to member again.
        setPromoted((current) => {
          const next = new Set(current);
          if (updated.level > USER_LEVEL.member) next.add(updated.userID);
          else next.delete(updated.userID);
          return next;
        });
      })
      .catch((reason: Error) => setError(`Couldn't move @${user.username}: ${reason.message}`))
      .finally(() =>
        setBusy((current) => {
          const next = new Set(current);
          next.delete(user.userID);
          return next;
        }),
      );
  };

  const mover: Mover = {
    me,
    dragMode,
    busy,
    dragging,
    over,
    move,
    startDrag: setDragging,
    endDrag: () => {
      setDragging(null);
      setOver(null);
    },
    setOver,
  };

  const loadingText =
    users === undefined ? "Loading…" : users === null ? "Couldn't load user levels. Refresh to try again." : null;
  // Newest first within each level, as they were loaded - someone just moved
  // goes to the top of their new level so it's clear where they went.
  const byLevel = (level: number) => (users ?? []).filter((user) => user.level === level);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          You&apos;re <span className="font-semibold text-primary">{levelLabel(me.level)}</span> (level {me.level}).
          You can move anyone below your level to any other level below yours.
        </p>
        <ToggleSwitch off="Arrows" on="Drag & drop" checked={dragMode} onChange={setDragMode} label="Drag and drop" />
      </div>

      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      {PERMISSION_LEVELS.map(({ level, label }) => (
        <LevelSection
          key={level}
          level={level}
          label={label}
          users={byLevel(level)}
          loadingText={loadingText}
          mover={mover}
        />
      ))}

      <PromoteMember mover={mover} promoted={promoted} />
    </>
  );
}
