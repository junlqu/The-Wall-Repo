"use client";

import { timeoutOf, useSessionUser } from "@/lib/session";

// Says the visitor is timed out, until when and why, where they'd otherwise
// comment or add a combo. Nothing when they aren't.
export default function TimedOutNotice({ className = "" }: { className?: string }) {
  const timeout = timeoutOf(useSessionUser());
  if (!timeout) return null;
  const until = new Date(timeout.endAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div
      role="status"
      className={`flex flex-col gap-1 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-5 py-4 text-sm text-amber-950 ${className}`}
    >
      <p className="font-semibold">You&apos;re timed out until {until}</p>
      <p>Until then you can&apos;t post or edit comments, like updates or add combos.</p>
      {timeout.reason && <p className="whitespace-pre-wrap break-words text-amber-900/80">Reason: {timeout.reason}</p>}
    </div>
  );
}
