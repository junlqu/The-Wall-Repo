"use client";

import { useSyncExternalStore } from "react";
import type { ListedUser } from "@/lib/users";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// The time, a second at a time, shared by every badge on the page. The
// clock only runs while one is counting down.
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// 0 while rendering on the server or before the first tick, when no badge
// shows.
function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}

// "5:03:09", or "3:09" under an hour.
function countdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// On a user's card, while they're banned or timed out - red for a ban, light
// orange for a timeout: a permanent ban says so, one with a day or more left
// says when it ends, and one ending within a day counts down to the second.
// Gone once it's over. `className` places it.
export default function RestrictionBadge({
  restriction,
  className = "",
}: {
  restriction: ListedUser["restriction"];
  className?: string;
}) {
  const time = useNow();
  if (!restriction || time === 0) return null;

  const { kind, endAt } = restriction;
  const left = endAt === null ? Infinity : Date.parse(endAt) - time;
  if (left <= 0) return null;

  const label = kind === "ban" ? "Banned" : "Timed out";
  const when =
    endAt === null
      ? "Permanent"
      : left >= ONE_DAY_MS
        ? `until ${new Date(endAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : countdown(left);

  return (
    <p
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        kind === "ban" ? "bg-red-600 text-white" : "bg-orange-200 text-orange-900"
      } ${className}`}
    >
      <span className="font-bold uppercase tracking-wide">{label}</span>
      <span className="truncate tabular-nums">
        {left < ONE_DAY_MS && <span className="sr-only">ends in </span>}
        {when}
      </span>
    </p>
  );
}
