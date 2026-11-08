import { ClimbBox, CommentTags } from "@/components/ClimbActivity";
import ReadMore from "@/components/ReadMore";
import { formatDateTime } from "@/lib/announcements";
import type { DashboardComment } from "@/lib/dashboard";

// One comment someone left, with what it said, sent, graded and rated, and
// the climb it's on - for their dashboard and the admin user panel.
export default function CommentCard({ comment, climb }: DashboardComment) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <CommentTags comment={comment} sentOn />
        {/* With the time, as several in a day would otherwise look the same. */}
        <time dateTime={comment.commentedAt} className="ml-auto shrink-0 text-xs text-neutral-500">
          {formatDateTime(comment.commentedAt)}
        </time>
      </div>
      {comment.comment && (
        <ReadMore fade="from-white">
          <p className="whitespace-pre-line break-words text-sm text-neutral-700">{comment.comment}</p>
        </ReadMore>
      )}
      {climb ? <ClimbBox climb={climb} /> : <p className="text-xs text-neutral-500">That climb is gone now</p>}
    </article>
  );
}
