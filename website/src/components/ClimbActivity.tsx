"use client";

import Link from "next/link";
import { GradeTag } from "@/components/ClimbCards";
import ClimbColour from "@/components/ClimbColour";
import { formatDateTime } from "@/lib/announcements";
import {
  type Climb,
  type ClimbComment,
  climbHref,
  climbTypeLabel,
  commentSentAt,
  formatDate,
  ratingStars,
} from "@/lib/climbs";
import type { DashboardComment } from "@/lib/dashboard";

// What someone has said and sent, for the dashboard and profiles.

// The climb's colour, where it is and its grade, as a small box linking to it.
export function ClimbBox({ climb }: { climb: Climb }) {
  return (
    <Link
      href={climbHref(climb.id)}
      className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <ClimbColour climb={climb} />
      <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
        {climb.line === undefined ? climbTypeLabel(climb) : `Line ${climb.line}`}
        <GradeTag grade={climb.grade} />
      </span>
    </Link>
  );
}

export function RecentComment({ comment, climb }: DashboardComment) {
  return (
    <div className="flex flex-col gap-1.5 py-3 last:pb-0">
      <div className="flex items-center justify-between gap-4 text-xs text-neutral-500">
        {climb ? (
          <Link href={climbHref(climb.id)} className="flex min-w-0 items-center gap-1.5 font-medium text-neutral-700 hover:text-primary">
            <ClimbColour climb={climb} />
            {climb.line !== undefined && <span className="shrink-0">· Line {climb.line}</span>}
          </Link>
        ) : (
          <span>That climb is gone now</span>
        )}
        {/* With the time, as several in a day would otherwise look the same. */}
        <time dateTime={comment.commentedAt} className="shrink-0">
          {formatDateTime(comment.commentedAt)}
        </time>
      </div>
      <p className="whitespace-pre-line break-words text-sm text-neutral-700">{comment.comment}</p>
      <CommentTags comment={comment} />
    </div>
  );
}

const EXCERPT_LENGTH = 80;

// The start of a comment on one line, cut at a word where there's one near
// the end.
function excerpt(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= EXCERPT_LENGTH) return flat;
  const cut = flat.slice(0, EXCERPT_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > EXCERPT_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// One of their sends: the climb, when they sent it, and the start of what they
// said about it - all of it a link to the climb.
export function RecentSend({ comment, climb }: DashboardComment) {
  const sentAt = commentSentAt(comment);
  const content = (
    <>
      <div className="flex items-center justify-between gap-3 text-xs">
        {climb ? (
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-neutral-800">
            <ClimbColour climb={climb} />
          </span>
        ) : (
          <span className="text-neutral-500">That climb is gone now</span>
        )}
        {climb && (
          <span className="flex shrink-0 items-center gap-2 text-neutral-500">
            {climb.line === undefined ? climbTypeLabel(climb) : `Line ${climb.line}`}
            <GradeTag grade={climb.grade} />
          </span>
        )}
      </div>
      {comment.comment && <p className="line-clamp-2 break-words text-sm text-neutral-600">{excerpt(comment.comment)}</p>}
      <div className="flex items-center gap-3 text-xs text-neutral-500">
        {sentAt && (
          <span>
            Sent <time dateTime={sentAt}>{formatDate(sentAt)}</time>
          </span>
        )}
        {comment.rating !== undefined && <span>★ {ratingStars(comment.rating).toFixed(1)}</span>}
      </div>
    </>
  );

  const className = "-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-3";
  return climb ? (
    <Link
      href={climbHref(climb.id)}
      className={`${className} transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

// Whether they sent the climb, and the grade and rating they gave it - nothing
// when they did none of those.
export function CommentTags({ comment, sentOn = false }: { comment: ClimbComment; sentOn?: boolean }) {
  if (!comment.send && !comment.grade && comment.rating === undefined) return null;
  const sentAt = commentSentAt(comment);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {comment.send && <span className="rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-700">Sent</span>}
      {comment.send && sentOn && sentAt && (
        <span className="-ml-1 text-neutral-500">
          on <time dateTime={sentAt}>{formatDate(sentAt)}</time>
        </span>
      )}
      {comment.grade && (
        <span className="rounded bg-secondary/15 px-1.5 py-0.5 font-medium text-primary">Graded {comment.grade}</span>
      )}
      {comment.rating !== undefined && (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600">
          ★ {ratingStars(comment.rating).toFixed(1)}
        </span>
      )}
    </div>
  );
}
