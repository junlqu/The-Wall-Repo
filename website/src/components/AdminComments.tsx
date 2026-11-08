"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AdminUserPanel from "@/components/AdminUserPanel";
import { SEARCH_DELAY_MS } from "@/components/AdminUsers";
import { ActionsMenu, DANGER_BUTTON_CLASS, Dialog } from "@/components/ClimbActions";
import { ClimbBox, CommentTags } from "@/components/ClimbActivity";
import {
  CANCEL_BUTTON_CLASS,
  ErrorMessage,
  FIELD_CLASS,
  PRIMARY_BUTTON_CLASS,
  useRequest,
} from "@/components/ClimbForm";
import { FlagIcon } from "@/components/FlagComment";
import ReadMore from "@/components/ReadMore";
import { formatDateTime } from "@/lib/announcements";
import { avatarUrl } from "@/lib/avatar";
import { CLIMB_COLOURS, type ClimbComment, LINES } from "@/lib/climbs";
import { FLAG_REASONS } from "@/lib/flags";
import { BOULDER_GRADES, ROUTE_GRADES } from "@/lib/grades";
import {
  type CommentFilters,
  type CommentFlag,
  deleteModerationComment,
  dismissCommentFlags,
  editModerationComment,
  fetchModerationComments,
  MODERATION_PAGE_SIZES,
  type ModerationComment,
  type ModerationPageSize,
} from "@/lib/moderation";
import type { UserDetails } from "@/lib/users";

// Mirrors MAX_COMMENT_LENGTH in api/src/commentFields.ts.
const MAX_COMMENT_LENGTH = 1000;

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

// "send", "send and grade", "send, grade and rating".
function joinWords(words: string[]) {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// The author, as a button that opens their account in the side panel.
function Author({ item, onOpen }: { item: ModerationComment; onOpen: () => void }) {
  const author = item.comment.author;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={author ? `View @${author.username}` : "View their account"}
      className="group flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      {author ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl(author)}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
        />
      ) : (
        <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full bg-neutral-200" />
      )}
      <span className="truncate text-sm font-semibold text-neutral-800 group-hover:text-primary group-hover:underline">
        {author ? `@${author.username}` : "Former member"}
      </span>
    </button>
  );
}

function EditCommentDialog({
  item,
  onClose,
  onSaved,
}: {
  item: ModerationComment;
  onClose: () => void;
  onSaved: (comment: ClimbComment) => void;
}) {
  const [text, setText] = useState(item.comment.comment);
  const { busy, error, run } = useRequest();
  const { comment } = item;
  // With nothing else in it, clearing the text would leave an empty comment.
  const canClear = Boolean(comment.send || comment.grade || comment.rating !== undefined);
  const unchanged = text.trim() === comment.comment;
  const flagged = item.flags.length > 0;

  return (
    <Dialog title={flagged ? "Edit flagged comment" : "Edit comment"} busy={busy} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => onSaved(await editModerationComment(comment.commentID, text)));
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-2">
          <span className="sr-only">Comment</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            rows={5}
            className={`${FIELD_CLASS} resize-y`}
          />
          <span className="self-end text-xs text-neutral-400 tabular-nums">
            {text.length}/{MAX_COMMENT_LENGTH}
          </span>
        </label>
        <p className="text-xs text-neutral-500">
          It shows as edited. Its send, grade and rating stay as they are.
          {flagged && ` Once it's saved, its ${item.flags.length === 1 ? "flag is" : "flags are"} marked as edited.`}
          {!canClear && " It has nothing else in it, so delete it rather than clearing it."}
        </p>
        <ErrorMessage message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || unchanged || (!text.trim() && !canClear)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteCommentDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: ModerationComment;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, error, run } = useRequest();
  const { comment } = item;
  const extras = [comment.send && "send", comment.grade && "grade", comment.rating !== undefined && "rating"].filter(
    Boolean,
  ) as string[];

  return (
    <Dialog title="Delete this comment?" busy={busy} onClose={onClose}>
      <div className="flex flex-col gap-2 text-sm text-neutral-600">
        <p className="font-semibold text-neutral-800">This can&apos;t be undone.</p>
        <p>
          {comment.author ? `@${comment.author.username}'s` : "Their"} comment comes off the climb
          {extras.length > 0 && `, with the ${joinWords(extras)} that came with it`}
          , and their numbers update to match.
        </p>
        {item.flags.length > 0 && <p>Its {item.flags.length === 1 ? "flag is" : "flags are"} marked as deleted.</p>}
        {extras.length > 0 && <p>To keep those, edit the comment instead and clear its text.</p>}
      </div>
      <ErrorMessage message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await deleteModerationComment(comment.commentID);
              onDeleted();
            })
          }
          className={DANGER_BUTTON_CLASS}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Dialog>
  );
}

const REASON_LABELS = Object.fromEntries(FLAG_REASONS.map(({ id, label }) => [id, label])) as Record<
  CommentFlag["reason"],
  string
>;

const FLAG_ACTION_CLASS =
  "inline-flex items-center justify-center rounded-full border bg-white px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 sm:py-1";

// Why it's been flagged - each reason and how many times, with when it was
// last flagged in the corner - then who reported it and what they wrote, and
// along the bottom what to do about it: dismiss the flags, or edit or delete
// the comment, which closes them as edited or deleted.
function FlagBox({
  flags,
  dismissing,
  error,
  onDismiss,
  onEdit,
  onDelete,
}: {
  flags: CommentFlag[];
  dismissing: boolean;
  error?: string;
  onDismiss: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const counts = new Map<CommentFlag["reason"], number>();
  for (const flag of flags) counts.set(flag.reason, (counts.get(flag.reason) ?? 0) + 1);
  // Newest first, so this is when it was last flagged.
  const latest = flags[0].flaggedAt;

  return (
    <section aria-label="Flags" className="flex flex-col gap-2.5 rounded-md border border-orange-200 bg-orange-50 p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 font-semibold text-orange-800">
            <FlagIcon />
            Flagged {flags.length === 1 ? "once" : `${flags.length} times`}
          </span>
          {[...counts].map(([reason, count]) => (
            <span key={reason} className="rounded bg-orange-100 px-1.5 py-0.5 font-semibold text-orange-800">
              {REASON_LABELS[reason]}
              {count > 1 && ` ×${count}`}
            </span>
          ))}
        </div>
        <time
          dateTime={latest}
          title={flags.length > 1 ? "Last flagged" : "Flagged"}
          className="shrink-0 whitespace-nowrap pt-0.5 text-neutral-500"
        >
          {formatDateTime(latest)}
        </time>
      </div>

      {/* Who reported it and what they wrote. With one report, its reason and
          date are already in the line above. */}
      <ul className="flex flex-col gap-2">
        {flags.map((flag) => (
          <li key={flag.flagID} className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-1.5 text-neutral-600">
              <span>
                Reported by{" "}
                <span className="font-semibold text-neutral-800">
                  {flag.flagger ? `@${flag.flagger.username}` : "a former member"}
                </span>
              </span>
              {flags.length > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-orange-800">{REASON_LABELS[flag.reason]}</span>
                  <time dateTime={flag.flaggedAt} className="ml-auto text-neutral-500">
                    {formatDateTime(flag.flaggedAt)}
                  </time>
                </>
              )}
            </span>
            {flag.details && (
              <blockquote className="whitespace-pre-line break-words border-l-2 border-orange-300 pl-2.5 text-sm text-neutral-700">
                {flag.details}
              </blockquote>
            )}
          </li>
        ))}
      </ul>

      {/* Equal thirds across a phone; together on the right on wider screens. */}
      <div className="grid grid-cols-3 gap-1.5 border-t border-orange-200 pt-2.5 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className={`${FLAG_ACTION_CLASS} border-neutral-300 text-neutral-700 hover:bg-neutral-100`}
        >
          {dismissing ? "Dismissing…" : "Dismiss"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={dismissing}
          className={`${FLAG_ACTION_CLASS} border-primary text-primary hover:bg-primary hover:text-white`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={dismissing}
          className={`${FLAG_ACTION_CLASS} border-red-300 text-red-700 hover:bg-red-50`}
        >
          Delete
        </button>
      </div>
      <ErrorMessage message={error} />
    </section>
  );
}

// One comment: who wrote it (opening their account), when, a "..." menu to
// edit or delete it, what it said, sent, graded and rated, its climb, and any
// open flags on it, with their own buttons to dismiss them or edit or delete
// it. Editing or deleting it closes its flags too. Shared with the
// Moderation Dashboard's flagged comments.
export function ModerationCommentCard({
  item,
  onOpenUser,
  onSaved,
  onDeleted,
  onDismissed,
}: {
  item: ModerationComment;
  onOpenUser: () => void;
  onSaved: (comment: ClimbComment) => void;
  onDeleted: () => void;
  onDismissed: () => void;
}) {
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const dismiss = useRequest();
  const { comment, climb, flags } = item;
  const flagged = flags.length > 0;

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border bg-white p-4 shadow-sm ${
        flagged ? "border-orange-300 ring-1 ring-orange-100" : "border-neutral-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <Author item={item} onOpen={onOpenUser} />
        <time
          dateTime={comment.commentedAt}
          title={comment.editedAt ? `Edited ${formatDateTime(comment.editedAt)}` : undefined}
          className="ml-auto shrink-0 text-xs text-neutral-500"
        >
          {formatDateTime(comment.commentedAt)}
          {comment.editedAt && " (edited)"}
        </time>
        <div className="-my-1 -mr-2 shrink-0">
          <ActionsMenu
            label="Comment actions"
            items={[
              { label: "Edit", onSelect: () => setOpen("edit") },
              { label: "Delete", onSelect: () => setOpen("delete"), danger: true },
            ]}
          />
        </div>
      </div>
      <CommentTags comment={comment} sentOn />
      {comment.comment && (
        <ReadMore fade="from-white">
          <p className="whitespace-pre-line break-words text-sm text-neutral-700">{comment.comment}</p>
        </ReadMore>
      )}
      {climb ? <ClimbBox climb={climb} /> : <p className="text-xs text-neutral-500">That climb is gone now</p>}
      {flagged && (
        <FlagBox
          flags={flags}
          dismissing={dismiss.busy}
          error={dismiss.error}
          onDismiss={() =>
            dismiss.run(async () => {
              await dismissCommentFlags(comment.commentID);
              onDismissed();
            })
          }
          onEdit={() => setOpen("edit")}
          onDelete={() => setOpen("delete")}
        />
      )}
      {open === "edit" && (
        <EditCommentDialog
          item={item}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setOpen(null);
            onSaved(saved);
          }}
        />
      )}
      {open === "delete" && (
        <DeleteCommentDialog
          item={item}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            onDeleted();
          }}
        />
      )}
    </li>
  );
}

const NO_FILTERS: CommentFilters = { user: "", line: null, colour: "", grade: "", flagged: false };

// Comments loaded so far for one set of filters and batch size (`list`), and
// how many batches that took.
type LoadedComments = { list: string; batches: number; comments: ModerationComment[]; total: number; error?: string };

// A comment posted between batches pushes everything down one, so the next
// batch can repeat one already shown.
function appendComments(comments: ModerationComment[], more: ModerationComment[]) {
  const shown = new Set(comments.map((item) => item.comment.commentID));
  return [...comments, ...more.filter((item) => !shown.has(item.comment.commentID))];
}

// Every comment with text, newest first, in one list that grows a batch at a
// time, narrowed by who wrote it, which climbs it's on and whether it's
// flagged. Each can be edited or deleted, its flags dismissed, and its author
// opened. ?flagged=1 starts on the flagged ones.
function CommentList() {
  const startFlagged = useSearchParams().get("flagged") === "1";
  const [userInput, setUserInput] = useState("");
  const [filters, setFilters] = useState<CommentFilters>({ ...NO_FILTERS, flagged: startFlagged });
  const [batchSize, setBatchSize] = useState<ModerationPageSize>(MODERATION_PAGE_SIZES[0]);
  const [data, setData] = useState<LoadedComments>();
  const [loadingMore, setLoadingMore] = useState(false);
  // Whose account is open in the side panel.
  const [viewing, setViewing] = useState<string | null>(null);

  const list = JSON.stringify([filters, batchSize]);
  // New filters or a new batch size start the list over; the old one stays
  // up, dimmed, until the first batch arrives.
  const loading = data?.list !== list;
  const filtered =
    filters.user !== "" || filters.line !== null || filters.colour !== "" || filters.grade !== "" || filters.flagged;

  // The username search waits for typing to pause.
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((current) => (current.user === userInput.trim() ? current : { ...current, user: userInput.trim() })),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [userInput]);

  useEffect(() => {
    let current = true;
    fetchModerationComments(filters, 1, batchSize)
      .then(({ comments, total }) => current && setData({ list, batches: 1, comments, total }))
      .catch(
        (error: Error) => current && setData({ list, batches: 0, comments: [], total: 0, error: error.message }),
      );
    return () => {
      current = false;
    };
  }, [list, filters, batchSize]);

  const loadMore = () => {
    if (!data || loading) return;
    setLoadingMore(true);
    // Each update checks the list is still the one asked about, in case the
    // filters changed while this batch was on its way.
    fetchModerationComments(filters, data.batches + 1, batchSize)
      .then(({ comments, total }) =>
        setData((last) =>
          last?.list === list
            ? { list, batches: last.batches + 1, comments: appendComments(last.comments, comments), total }
            : last,
        ),
      )
      .catch((error: Error) => setData((last) => (last?.list === list ? { ...last, error: error.message } : last)))
      .finally(() => setLoadingMore(false));
  };

  // A saved edit shows on its card straight away, and closes its flags, as
  // dismissing them does. A comment leaves the list once it's deleted, has
  // its text cleared, or - when only flagged ones are showing - has no flags
  // left.
  const replace = (commentID: string, change: { comment?: ClimbComment } | null) =>
    setData((last) => {
      if (!last) return last;
      const item = last.comments.find((each) => each.comment.commentID === commentID);
      if (!item) return last;
      const next = change && { ...item, comment: change.comment ?? item.comment, flags: [] };
      const stays = next !== null && next.comment.comment !== "" && !filters.flagged;
      return {
        ...last,
        total: stays ? last.total : last.total - 1,
        comments: stays
          ? last.comments.map((each) => (each === item ? next : each))
          : last.comments.filter((each) => each !== item),
      };
    });

  // An account edited in the side panel shows its new name and picture on
  // their comments.
  const showSaved = (saved: UserDetails) =>
    setData(
      (last) =>
        last && {
          ...last,
          comments: last.comments.map((item) =>
            item.userID === saved.userID && item.comment.author
              ? {
                  ...item,
                  comment: {
                    ...item.comment,
                    author: { ...item.comment.author, username: saved.username, avatarUpdatedAt: saved.avatarUpdatedAt },
                  },
                }
              : item,
          ),
        },
    );

  const setFilter = <K extends keyof CommentFilters>(key: K, value: CommentFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const hasMore = !loading && data !== undefined && data.batches > 0 && data.comments.length < data.total;

  return (
    <section aria-label="All comments" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-64">
          <span className="sr-only">Search by username</span>
          <input
            type="search"
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            placeholder="Search by username"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Load
          <select
            value={batchSize}
            onChange={(event) => setBatchSize(Number(event.target.value) as ModerationPageSize)}
            className={`${FIELD_CLASS} w-auto`}
          >
            {MODERATION_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The climb a comment is on. */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <label>
          <span className="sr-only">Line</span>
          <select
            value={filters.line ?? ""}
            onChange={(event) => setFilter("line", event.target.value ? Number(event.target.value) : null)}
            className={`${FIELD_CLASS} sm:w-auto`}
          >
            <option value="">Any line</option>
            {LINES.map((line) => (
              <option key={line} value={line}>
                Line {line}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Colour</span>
          <select
            value={filters.colour}
            onChange={(event) => setFilter("colour", event.target.value)}
            className={`${FIELD_CLASS} sm:w-auto`}
          >
            <option value="">Any colour</option>
            {CLIMB_COLOURS.map((colour) => (
              <option key={colour} value={colour}>
                {colour}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Grade</span>
          <select
            value={filters.grade}
            onChange={(event) => setFilter("grade", event.target.value)}
            className={`${FIELD_CLASS} sm:w-auto`}
          >
            <option value="">Any grade</option>
            <optgroup label="Routes and combos">
              {ROUTE_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </optgroup>
            <optgroup label="Boulders">
              {BOULDER_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={filters.flagged}
          onClick={() => setFilter("flagged", !filters.flagged)}
          className="inline-flex items-center gap-2 justify-self-start text-xs font-semibold text-neutral-600 hover:text-primary"
        >
          <span
            aria-hidden="true"
            className={`relative h-5 w-9 rounded-full transition-colors ${filters.flagged ? "bg-orange-500" : "bg-neutral-300"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                filters.flagged ? "left-[1.125rem]" : "left-0.5"
              }`}
            />
          </span>
          Flagged only
        </button>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setUserInput("");
              setFilters(NO_FILTERS);
            }}
            className="justify-self-start text-xs font-semibold text-neutral-500 hover:text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="text-xs text-neutral-500" aria-live="polite">
        {!data
          ? "Loading comments…"
          : data.batches === 0
            ? ""
            : data.total === 0
              ? filters.flagged && !filters.user && filters.line === null && !filters.colour && !filters.grade
                ? "No flagged comments"
                : filtered
                  ? "No comments match"
                  : "No comments yet"
              : `Showing ${data.comments.length.toLocaleString()} of ${plural(data.total, "comment")}`}
      </p>

      {data?.error && !loading && (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          Couldn&apos;t load comments: {data.error}
        </p>
      )}

      {data && data.comments.length > 0 && (
        <ul className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {data.comments.map((item) => (
            <ModerationCommentCard
              key={item.comment.commentID}
              item={item}
              onOpenUser={() => setViewing(item.userID)}
              onSaved={(saved) => replace(item.comment.commentID, { comment: saved })}
              onDeleted={() => replace(item.comment.commentID, null)}
              onDismissed={() => replace(item.comment.commentID, {})}
            />
          ))}
        </ul>
      )}

      {viewing && <AdminUserPanel userID={viewing} onClose={() => setViewing(null)} onSaved={showSaved} />}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center rounded-full border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-white disabled:hover:text-primary"
        >
          {loadingMore ? "Loading…" : "Load more comments"}
        </button>
      )}
    </section>
  );
}

// /admin/moderation/comments. ?flagged= can only be read in the browser in a
// static export, hence the Suspense boundary.
export default function AdminComments() {
  return (
    <Suspense fallback={<p className="text-xs text-neutral-500">Loading comments…</p>}>
      <CommentList />
    </Suspense>
  );
}
