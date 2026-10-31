"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SplitDot, Swatch } from "@/components/ClimbColour";
import {
  ChevronIcon,
  ClimbsError,
  ComboHandRoute,
  CommentIcon,
  CommentItem,
  Person,
  Placeholder,
  Stars,
} from "@/components/ClimbCards";
import CommentForm from "@/components/CommentForm";
import { Kicker, SectionRule } from "@/components/Masthead";
import {
  type Climb,
  type ClimbComment,
  type ClimbPerson,
  type ClimbType,
  CLIMB_TYPES,
  climbColour,
  climbHref,
  climbSetters,
  deleteMyComment,
  fetchClimb,
  fetchClimbActivity,
  fetchClimbComments,
  fetchMyComment,
  firstAscentText,
  formatDate,
  swatchFor,
} from "@/lib/climbs";
import { withReturnTo } from "@/lib/returnTo";
import { useSessionUser } from "@/lib/session";

const LEADABLE_TEXT: Record<Climb["leadable"], string> = { Yes: "Yes", Sketch: "Sketchy", No: "No", "?": "Unknown" };

// Who sent it last - null when nobody has or their account is gone.
type LastSend = ClimbPerson | null | "loading" | "error";

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M16.7 4.15a.75.75 0 0 1 .15 1.05l-8 10.5a.75.75 0 0 1-1.13.08l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.9 7.47-9.82a.75.75 0 0 1 1.05-.15z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Each type's own list, which a climb's page goes back to.
const TYPE_PAGES: Record<ClimbType, { href: string; label: string }> = {
  route: { href: "/climbs/routes", label: "Routes" },
  boulder: { href: "/climbs/boulders", label: "Boulders" },
  combo: { href: "/climbs/combos", label: "Combos" },
};

// Back to the climb's own type's list - or every climb, without one.
function BackLink({ type }: { type?: ClimbType }) {
  const { href, label } = type ? TYPE_PAGES[type] : { href: "/climbs", label: "All climbs" };
  return (
    <Link href={href} className="w-fit text-sm font-semibold text-primary hover:text-secondary">
      ← {label}
    </Link>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
      <p className="font-serif text-2xl font-bold text-primary">{title}</p>
      <div className="text-sm text-neutral-500">{children}</div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 bg-white p-4">
      <dt>
        <Kicker className="text-neutral-400">{label}</Kicker>
      </dt>
      <dd className="min-w-0 text-sm font-semibold text-neutral-800">{children}</dd>
    </div>
  );
}

// "Denzil", "Denzil and Alex", "Denzil, Alex and Thea".
function joinNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// One of the climb's headline numbers, beside its title - smaller on phones,
// where it shares the row with the title.
function Tally({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <div className="flex min-w-12 flex-col items-center gap-0.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-center sm:min-w-16 sm:rounded-lg sm:px-3 sm:py-2">
      <span className="text-secondary [&_svg]:h-3 [&_svg]:w-3 sm:[&_svg]:h-4 sm:[&_svg]:w-4">{icon}</span>
      <span className="font-serif text-base leading-none font-bold text-primary tabular-nums sm:text-xl">{count}</span>
      <span className="text-[0.6rem] font-bold tracking-[0.1em] text-neutral-400 uppercase sm:text-xs sm:tracking-[0.2em]">
        {label}
      </span>
    </div>
  );
}

// The climb's grade, under its tallies. Hidden from screen readers, as the
// heading reads it out.
function GradeBox({ grade }: { grade: string }) {
  return (
    <span
      aria-hidden="true"
      className="rounded-md bg-primary px-2 py-1 font-serif text-sm leading-none font-bold text-white tabular-nums shadow-sm sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-lg"
      title="Grade"
    >
      {grade || "New"}
    </span>
  );
}

// The hold colour as a big dot - or, for a combo's two, the dot cut in half.
function ColourCircle({ climb }: { climb: Climb }) {
  const size = "h-16 w-16 sm:h-20 sm:w-20";
  // The margin keeps its offset halves in line with the rest of the card.
  if (climb.secondary) return <SplitDot colour={climb.colour} secondary={climb.secondary} className={`mx-2 sm:mx-2.5 ${size}`} />;
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded-full shadow-inner ring-1 ring-black/10 ${size}`}
      style={{ background: swatchFor(climb.colour) }}
    />
  );
}

// The climb as one big post, by whoever set it - or, for a combo, whoever made
// its first ascent.
function PostCard({ climb, lastSend }: { climb: Climb; lastSend: LastSend }) {
  const setters = climbSetters(climb);
  const type = CLIMB_TYPES[climb.type];
  const initials = setters.length > 0 ? setters.map((name) => name[0]).join("").slice(0, 2).toUpperCase() : "?";

  let lastSender: ReactNode;
  if (climb.sends === 0) lastSender = <span className="text-neutral-500">Nobody yet</span>;
  else if (lastSend === "loading") lastSender = "…";
  else if (lastSend === "error") lastSender = "—";
  else lastSender = <Person person={lastSend} />;

  return (
    <article className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-secondary to-primary" />

      <div className="flex flex-col gap-6 p-6 pt-8 sm:p-10">
        <div className="flex min-w-0 flex-col gap-6">
          <Kicker className="text-secondary">
            {type}
            {climb.line !== undefined && ` · Line ${climb.line}`}
          </Kicker>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center gap-4 pr-12 sm:gap-5 sm:pr-16">
              <ColourCircle climb={climb} />
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="font-serif text-4xl leading-tight font-black tracking-tight text-primary sm:text-6xl">
                  {climbColour(climb)}
                  <span className="sr-only"> {climb.grade || "New"}</span>
                </h1>
                {climb.tape && (
                  <span className="flex items-center gap-1.5 text-sm text-neutral-500">
                    <Swatch colour={climb.tape} tape />
                    {climb.tape} tape
                  </span>
                )}
              </div>
            </div>
            <Stars climb={climb} large />
            {climb.type === "combo" ? (
              <p className="text-sm font-semibold text-neutral-900">First ascent: {firstAscentText(climb)}</p>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-base font-bold text-white ring-2 ring-secondary/40"
                >
                  {initials}
                </span>
                <span className="truncate text-sm font-semibold text-neutral-900">
                  {setters.length > 0 ? `Set by ${joinNames(setters)}` : "Setter unknown"}
                </span>
              </div>
            )}
          </div>
        </div>

        {climb.status === "past" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This climb has come down
            {climb.removedAt ? ` - it was taken off the wall on ${formatDate(climb.removedAt)}` : ""}.
          </p>
        )}

        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-2">
          {climb.hands && (
            <>
              <Fact label="Left hand">
                <ComboHandRoute hand={climb.hands.left} />
              </Fact>
              <Fact label="Right hand">
                <ComboHandRoute hand={climb.hands.right} />
              </Fact>
            </>
          )}
          <Fact label="Most recent send">{lastSender}</Fact>
          <Fact label="Leadable">{climb.type === "boulder" ? "Boulders aren't led" : LEADABLE_TEXT[climb.leadable]}</Fact>
        </dl>
      </div>

      {/* Tucked into the corner rather than given a column, so the title keeps
          its width - it only needs to clear the grade box. */}
      <div className="absolute top-4 right-3 flex flex-col items-end gap-2 sm:top-5 sm:right-5 sm:gap-3">
        <div className="flex gap-1.5 sm:gap-2">
          <Tally icon={<SendIcon />} count={climb.sends} label={climb.sends === 1 ? "Send" : "Sends"} />
          <Tally icon={<CommentIcon className="h-4 w-4" />} count={climb.comments} label={climb.comments === 1 ? "Comment" : "Comments"} />
        </div>
        <GradeBox grade={climb.grade} />
      </div>
    </article>
  );
}

function CommentsClosed() {
  return (
    <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
      This climb has come down, so it isn&apos;t taking new comments.
    </p>
  );
}

// The visitor's own comment: a prompt to log in, the form to write their one
// comment, or - once they have - that comment in a dropdown they can edit or
// delete it from. A climb that's come down takes no new ones.
function MyComment({ climb, onChanged }: { climb: Climb; onChanged: () => void }) {
  const user = useSessionUser();
  const userID = user?.userID;
  const [mine, setMine] = useState<ClimbComment | null | "loading" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<"confirm" | "busy" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!userID) return;
    fetchMyComment(climb.id)
      .then(setMine)
      .catch(() => setMine("error"));
  }, [climb.id, userID]);

  function saved(comment: ClimbComment) {
    setMine(comment);
    setEditing(false);
    setOpen(true);
    onChanged();
  }

  async function remove() {
    setDeleting("busy");
    setDeleteError(null);
    try {
      await deleteMyComment(climb.id);
      setMine(null);
      setOpen(false);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
    setDeleting(null);
  }

  if (user === undefined) return <Placeholder className="h-24" />;
  if (user === null) {
    if (climb.status === "past") return <CommentsClosed />;
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
        <p>Only logged-in users can comment.</p>
        <Link href={withReturnTo("/login", climbHref(climb.id))} className="font-semibold text-primary underline hover:text-secondary">
          Click here to log in
        </Link>
      </div>
    );
  }
  if (mine === "loading") return <Placeholder className="h-24" />;
  if (mine === "error") {
    return <p className="text-center text-sm text-neutral-500">Couldn&apos;t check for your comment right now.</p>;
  }
  if (mine === null) return climb.status === "past" ? <CommentsClosed /> : <CommentForm climb={climb} onSaved={saved} />;
  if (editing) return <CommentForm climb={climb} initial={mine} onSaved={saved} onCancel={() => setEditing(false)} />;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="my-comment"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary sm:px-6"
      >
        <span className="flex items-center gap-2">
          <ChevronIcon open={open} />
          <span className="text-sm font-semibold text-neutral-800">You&apos;ve commented on this climb</span>
        </span>
        <span className="text-xs text-neutral-500">{open ? "Hide" : "Show"}</span>
      </button>
      <div id="my-comment" hidden={!open} className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
        <ul className="text-xs text-neutral-600">
          <CommentItem comment={mine} climb={climb} />
        </ul>
        {deleteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
        {deleting ? (
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="text-neutral-600">Delete your comment, with its send, grade and rating?</span>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={deleting === "busy"}
              className="rounded-full border border-neutral-300 px-4 py-1.5 font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting === "busy"}
              className="rounded-full bg-red-600 px-4 py-1.5 font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
            >
              {deleting === "busy" ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting("confirm")}
              className="rounded-full border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Every comment with text - the visitor's own too - newest first, ten at a
// time.
function AllComments({ climb }: { climb: Climb }) {
  const [comments, setComments] = useState<ClimbComment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "more" | "idle" | "error">("loading");

  const addPage = useCallback((page: { comments: ClimbComment[]; hasMore: boolean }) => {
    // A comment posted since the last page shifts the rest along, so one may
    // turn up twice.
    setComments((current) => {
      const seen = new Set(current.map((comment) => comment.commentID));
      return [...current, ...page.comments.filter((comment) => !seen.has(comment.commentID))];
    });
    setHasMore(page.hasMore);
    setStatus("idle");
  }, []);

  useEffect(() => {
    fetchClimbComments(climb.id, 0)
      .then(addPage)
      .catch(() => setStatus("error"));
  }, [climb.id, addPage]);

  function loadMore() {
    setStatus("more");
    fetchClimbComments(climb.id, comments.length)
      .then(addPage)
      .catch(() => setStatus("error"));
  }

  if (status === "loading") return <Placeholder className="h-32" />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {comments.length > 0 ? (
        <ul className="flex flex-col gap-3 text-xs text-neutral-600">
          {comments.map((comment) => (
            <CommentItem key={comment.commentID} comment={comment} climb={climb} />
          ))}
        </ul>
      ) : (
        status !== "error" && <p className="py-4 text-center text-sm text-neutral-500">No comments yet.</p>
      )}
      {status === "error" && (
        <p className="text-center text-sm text-neutral-500">Couldn&apos;t load the comments right now.</p>
      )}
      {hasMore && status !== "error" && (
        <button
          type="button"
          onClick={loadMore}
          disabled={status === "more"}
          className="self-center rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {status === "more" ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function ClimbDetails({ id }: { id: string }) {
  const [climb, setClimb] = useState<Climb | null | "loading" | "error">("loading");
  const [lastSend, setLastSend] = useState<LastSend>("loading");
  // Bumped when the visitor's comment changes, to load the list afresh.
  const [commentsVersion, setCommentsVersion] = useState(0);

  // Also run after the visitor saves their comment, so the counts catch up.
  // It doesn't go back to "loading", so the page doesn't flicker.
  const load = useCallback(() => {
    fetchClimb(id)
      .then(setClimb)
      .catch(() => setClimb("error"));
    fetchClimbActivity(id)
      .then((activity) => setLastSend(activity.lastSend))
      .catch(() => setLastSend("error"));
  }, [id]);

  useEffect(load, [load]);

  if (climb === "loading") {
    return (
      <>
        <Placeholder className="h-5 w-24" />
        <Placeholder className="h-96" />
      </>
    );
  }
  if (climb === "error") {
    return (
      <>
        <BackLink />
        <ClimbsError />
      </>
    );
  }
  if (climb === null) {
    return (
      <>
        <BackLink />
        <Notice title="Climb not found">There&apos;s no climb with that ID - it may have been deleted.</Notice>
      </>
    );
  }

  return (
    <>
      <BackLink type={climb.type} />
      <PostCard climb={climb} lastSend={lastSend} />

      <section className="flex flex-col gap-6">
        <SectionRule title="Your comment" />
        <MyComment
          climb={climb}
          onChanged={() => {
            load();
            setCommentsVersion((version) => version + 1);
          }}
        />
      </section>

      <section className="flex flex-col gap-6">
        <SectionRule title="Comments" />
        <AllComments key={commentsVersion} climb={climb} />
      </section>
    </>
  );
}

export default function ClimbView() {
  const id = useSearchParams().get("id");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        {id ? (
          // Keyed so moving to another climb starts it fresh.
          <ClimbDetails key={id} id={id} />
        ) : (
          <>
            <BackLink />
            <Notice title="No climb picked">Open a climb from the climbs list to see it here.</Notice>
          </>
        )}
      </div>
    </div>
  );
}
