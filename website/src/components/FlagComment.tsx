"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { SidePanel } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import Link from "next/link";
import ClimbColour from "@/components/ClimbColour";
import { avatarUrl } from "@/lib/avatar";
import { type Climb, type ClimbComment, type ClimbPerson, climbHref, climbTypeLabel } from "@/lib/climbs";
import { FLAG_REASONS, type FlagReason, flagComment, MAX_FLAG_DETAILS_LENGTH } from "@/lib/flags";
import { profileHref } from "@/lib/profiles";
import { useSessionUser } from "@/lib/session";

export function FlagIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`shrink-0 ${className}`}>
      <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.39l1.66-.35a6.45 6.45 0 0 1 4.27.57 7.95 7.95 0 0 0 5.97.53l2.07-.64a.75.75 0 0 0 .53-.72v-8.5a.75.75 0 0 0-.9-.73l-2.38.5a7.25 7.25 0 0 1-4.19-.36l-.5-.2a8.75 8.75 0 0 0-5.05-.44l-1.48.31V2.75z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7">
      <path
        fillRule="evenodd"
        d="M16.7 4.15a.75.75 0 0 1 .15 1.05l-8 10.5a.75.75 0 0 1-1.13.08l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.9 7.47-9.82a.75.75 0 0 1 1.05-.15z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-sm text-neutral-700">{children}</dd>
    </div>
  );
}

const LINK_CLASS =
  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary";

// What the comment says, cut to a few lines - or what it's made of, when it
// has no text.
function Snippet({ comment }: { comment: ClimbComment }) {
  if (comment.comment) {
    return (
      <blockquote className="line-clamp-3 whitespace-pre-line break-words border-l-2 border-neutral-300 pl-3 italic">
        {comment.comment}
      </blockquote>
    );
  }
  return <span className="text-neutral-500">No text - only a send, grade or rating</span>;
}

// The climb as a small link to its page.
function ClimbLink({ climb }: { climb: Climb | null }) {
  if (!climb) return <span className="text-neutral-500">That climb is gone now</span>;
  return (
    <Link
      href={climbHref(climb.id)}
      className={`group inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-neutral-800 hover:text-primary ${LINK_CLASS}`}
    >
      <ClimbColour climb={climb} />
      <span className="text-xs text-neutral-500">
        {climb.line === undefined ? climbTypeLabel(climb) : `Line ${climb.line}`} · {climb.grade || "New"}
      </span>
      <span aria-hidden="true" className="text-neutral-400 transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

// Who wrote it, linking to their profile.
function Author({ person }: { person: ClimbPerson }) {
  return (
    <Link href={profileHref(person.username)} className={`group inline-flex min-w-0 items-center gap-2 ${LINK_CLASS}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl(person)}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
      />
      <span className="truncate font-semibold text-neutral-800 group-hover:underline">@{person.username}</span>
    </Link>
  );
}

// Picks why the comment's being flagged, with an optional note, and sends it
// - then says it's been sent.
function FlagPanel({
  comment,
  climb,
  author,
  onClose,
}: {
  comment: ClimbComment;
  climb: Climb | null;
  author: ClimbPerson;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string>();
  const busy = status === "busy";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason || busy) return;
    setStatus("busy");
    setError(undefined);
    try {
      await flagComment(comment.commentID, reason, details);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <SidePanel title="Report submitted" onClose={onClose}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="status">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
            <CheckIcon />
          </span>
          <p className="text-lg font-bold text-primary">Thanks - your report has been submitted</p>
          <p className="text-sm text-neutral-600">Staff will take a look at this comment.</p>
        </div>
        <div className="flex justify-end border-t border-neutral-200 px-6 py-4">
          <button type="button" onClick={onClose} className={PRIMARY_BUTTON_CLASS}>
            Close
          </button>
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel title="Flag comment" busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-6">
          <dl className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-4">
            <Fact label="Comment">
              <Snippet comment={comment} />
            </Fact>
            <Fact label="Climb">
              <ClimbLink climb={climb} />
            </Fact>
            <Fact label="Posted by">
              <Author person={author} />
            </Fact>
          </dl>

          <fieldset className="flex flex-col gap-2">
            <legend className={`${LABEL_CLASS} mb-2`}>Reason</legend>
            {FLAG_REASONS.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary ${
                  reason === option.id
                    ? "border-orange-300 bg-orange-50 text-orange-900"
                    : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <input
                  type="radio"
                  name="flag-reason"
                  value={option.id}
                  checked={reason === option.id}
                  onChange={() => setReason(option.id)}
                  className="accent-orange-600"
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <label className={LABEL_CLASS}>
            Details (optional)
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={MAX_FLAG_DETAILS_LENGTH}
              rows={4}
              placeholder="Quote the part you're reporting, or add a note"
              className={`${FIELD_CLASS} resize-y font-normal normal-case tracking-normal`}
            />
            <span className="self-end text-xs font-normal normal-case tracking-normal text-neutral-400 tabular-nums">
              {details.length}/{MAX_FLAG_DETAILS_LENGTH}
            </span>
          </label>

          <ErrorMessage message={error} />
        </div>

        {/* Pinned under the scrolling fields so Submit is always in reach. */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !reason} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

// A small orange flag that opens the panel to report the comment. Only for
// logged-in visitors, on other people's comments - not their own, nor one
// whose author's account is gone. `climb` is null when it's gone; the flag
// still goes through, as the API reads the climb from the comment.
export default function FlagCommentButton({ comment, climb }: { comment: ClimbComment; climb: Climb | null }) {
  const userID = useSessionUser()?.userID;
  const [open, setOpen] = useState(false);
  const author = comment.author;
  if (!userID || !author || author.userID === userID) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Flag @${author.username}'s comment`}
        title="Flag this comment"
        className="-m-1 inline-flex shrink-0 items-center justify-center rounded p-1 text-orange-500 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        <FlagIcon />
      </button>
      {open && (
        <FlagPanel comment={comment} climb={climb} author={author} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
