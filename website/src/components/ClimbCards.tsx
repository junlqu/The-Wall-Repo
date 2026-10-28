"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import { Kicker } from "@/components/Masthead";
import { formatShortDate } from "@/lib/announcements";
import { avatarUrl } from "@/lib/avatar";
import {
  type Climb,
  type ClimbActivity,
  type ClimbComment,
  type ClimbPerson,
  climbHref,
  climbSetters,
  fetchClimbActivity,
  fetchClimbs,
  MAX_STARS,
  ratingStars,
} from "@/lib/climbs";
import { BOULDER_GRADES, compareGrades, ROUTE_GRADES } from "@/lib/grades";
import { useSessionUser } from "@/lib/session";

// The pieces the public climbs pages are built from.

// Easiest first. Ungraded climbs and grades off the scale go last.
function gradeRank(climb: Climb) {
  const scale = climb.type === "boulder" ? BOULDER_GRADES : ROUTE_GRADES;
  const index = scale.indexOf(climb.grade);
  return index === -1 ? scale.length : index;
}

function byGrade(a: Climb, b: Climb) {
  return gradeRank(a) - gradeRank(b) || a.grade.localeCompare(b.grade) || a.setAt.localeCompare(b.setAt);
}

// What's up on the wall now, easiest first - null until it's loaded.
export function useActiveClimbs() {
  const [climbs, setClimbs] = useState<Climb[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchClimbs()
      .then((all) => setClimbs(all.filter((climb) => climb.status === "active").sort(byGrade)))
      .catch(() => setError(true));
  }, []);

  return { climbs, error };
}

// The blue a visitor's own send glows in.
const MINE_GLOW = "text-sky-500 drop-shadow-[0_0_5px_rgba(14,165,233,0.85)]";

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M16.7 4.15a.75.75 0 0 1 .15 1.05l-8 10.5a.75.75 0 0 1-1.13.08l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.9 7.47-9.82a.75.75 0 0 1 1.05-.15z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CommentIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M10 2c-2.24 0-4.44.18-6.6.53C2.12 2.73 1 3.86 1 5.25v5.5c0 1.39 1.12 2.52 2.4 2.72.53.09 1.06.16 1.6.22v3.56a.75.75 0 0 0 1.28.53l3.65-3.65c.27-.27.63-.42 1-.43 1.52-.04 3.02-.17 4.47-.4C16.88 13.27 18 12.14 18 10.75v-5.5c0-1.39-1.12-2.52-2.4-2.72A42.6 42.6 0 0 0 10 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function StarIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`shrink-0 ${className}`}>
      <path d="M10.87 2.88c-.32-.77-1.42-.77-1.74 0L7.3 7.29l-4.75.38c-.83.07-1.17 1.1-.54 1.65l3.62 3.1-1.1 4.64c-.2.81.69 1.46 1.4 1.02L10 15.59l4.07 2.49c.71.44 1.6-.21 1.4-1.02l-1.1-4.64 3.62-3.1c.63-.55.3-1.58-.54-1.65l-4.75-.38-1.83-4.41z" />
    </svg>
  );
}

function StarRow({ iconClass }: { iconClass: string }) {
  return (
    <span className="flex w-max">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <StarIcon key={i} className={iconClass} />
      ))}
    </span>
  );
}

// Stands in for the stars until somebody rates the climb.
function UnratedRow({ iconClass }: { iconClass: string }) {
  return (
    <span className="flex w-max">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <svg key={i} aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`shrink-0 ${iconClass}`}>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM8.94 6.94a.75.75 0 1 1-1.06-1.06 3 3 0 1 1 2.87 5.01.75.75 0 0 0-.5.71v.4a.75.75 0 0 1-1.5 0v-.4c0-.97.63-1.82 1.53-2.13a1.5 1.5 0 1 0-1.34-2.53zM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
            clipRule="evenodd"
          />
        </svg>
      ))}
    </span>
  );
}

// Stars filled to the climb's average, to the tenth - or question marks
// until somebody rates it - then how many ratings that's from. `large` is
// for a climb's own page.
export function Stars({ climb, large = false }: { climb: Climb; large?: boolean }) {
  const { stars, ratings } = climb;
  const iconClass = large ? "h-7 w-7" : "h-3.5 w-3.5";
  const gap = large ? "gap-2" : "gap-1";
  const plural = ratings === 1 ? "" : "s";
  // Spelled out on a climb's own page; a bracketed number in the lists.
  const count = large ? (
    <span className="ml-1 rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700 tabular-nums">
      {ratings > 0 ? `from ${ratings} rating${plural}` : "No ratings yet"}
    </span>
  ) : (
    <>
      <span aria-hidden="true">({ratings})</span>
      <span className="sr-only">
        from {ratings} rating{plural}
      </span>
    </>
  );

  if (stars === null) {
    return (
      <span className={`flex items-center ${gap}`} title="No ratings yet">
        <span aria-hidden="true" className="text-neutral-300">
          <UnratedRow iconClass={iconClass} />
        </span>
        {large ? (
          count
        ) : (
          <>
            <span className="sr-only">No ratings yet</span>
            <span aria-hidden="true">({ratings})</span>
          </>
        )}
      </span>
    );
  }
  return (
    <span
      className={`flex items-center ${gap}`}
      title={`${stars.toFixed(1)} out of ${MAX_STARS} stars from ${ratings} rating${ratings === 1 ? "" : "s"}`}
    >
      <span aria-hidden="true" className="relative text-neutral-300">
        <StarRow iconClass={iconClass} />
        <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-400" style={{ width: `${(stars / MAX_STARS) * 100}%` }}>
          <StarRow iconClass={iconClass} />
        </span>
      </span>
      <span className={large ? "font-serif text-2xl font-bold text-primary" : undefined}>{stars.toFixed(1)}</span>
      <span className="sr-only">out of {MAX_STARS} stars</span>
      {count}
    </span>
  );
}

export function GradeTag({ grade }: { grade: string }) {
  return (
    <span className="shrink-0 rounded bg-secondary/20 px-1.5 py-0.5 text-xs font-bold text-primary tabular-nums">
      {grade || "—"}
    </span>
  );
}

// The send count, its tick glowing blue when the logged-in visitor is one of
// them.
export function Sends({ climb }: { climb: Climb }) {
  const userID = useSessionUser()?.userID;
  const mine = Boolean(userID && climb.senderIDs.includes(userID));
  return (
    <span className={`flex items-center gap-1 ${mine ? "font-semibold text-sky-600" : ""}`} title={mine ? "Sends - you've sent it" : "Sends"}>
      <span className={mine ? MINE_GLOW : undefined}>
        <SendIcon />
      </span>
      {climb.sends}
      <span className="sr-only">sends{mine && ", including yours"}</span>
    </span>
  );
}

export function Counts({ climb }: { climb: Climb }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-neutral-500 tabular-nums">
      <Sends climb={climb} />
      <Stars climb={climb} />
    </span>
  );
}

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Whether a climb's dropdown is open - null until it's first opened. Once
// opened it stays mounted while closed, so it isn't fetched again.
function useDropdown() {
  const [open, setOpen] = useState<boolean | null>(null);
  const id = useId();
  return {
    open: Boolean(open),
    mounted: open !== null,
    id,
    toggle: () => setOpen((current) => !current),
  };
}

export function Person({ person }: { person: ClimbPerson | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {person ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl(person)} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-neutral-200" />
      ) : (
        <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full bg-neutral-200" />
      )}
      <span className="truncate font-semibold text-neutral-800">{person ? `@${person.username}` : "Former member"}</span>
    </span>
  );
}

const GRADE_VERDICTS = {
  harder: { className: "bg-green-100 text-green-700", label: "harder than its grade" },
  easier: { className: "bg-red-100 text-red-700", label: "easier than its grade" },
  same: { className: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200", label: "about its grade" },
};

function GradeArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
      <path
        fillRule="evenodd"
        d={
          direction === "up"
            ? "M10 17a.75.75 0 0 1-.75-.75V5.61L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.16v10.64A.75.75 0 0 1 10 17z"
            : "M10 3a.75.75 0 0 1 .75.75v10.64l3.96-4.16a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.16V3.75A.75.75 0 0 1 10 3z"
        }
        clipRule="evenodd"
      />
    </svg>
  );
}

// A commenter's proposed grade, against the grade the climb is set at - up
// in green if they think it's harder, down in red if easier, ~ otherwise.
function ProposedGrade({ grade, climb }: { grade: string; climb: Climb }) {
  const kind = climb.type === "boulder" ? "boulder" : "route";
  const comparison = compareGrades(kind, grade, climb.grade);
  const verdict = comparison === 1 ? "harder" : comparison === -1 ? "easier" : "same";
  const { className, label } = GRADE_VERDICTS[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${className}`}
      title={`Graded ${grade}${comparison === null ? "" : ` - ${label}`}`}
    >
      {verdict === "harder" ? (
        <GradeArrow direction="up" />
      ) : verdict === "easier" ? (
        <GradeArrow direction="down" />
      ) : (
        <span aria-hidden="true">~</span>
      )}
      {grade}
      {comparison !== null && <span className="sr-only">, {label}</span>}
    </span>
  );
}

export function CommentItem({ comment, climb }: { comment: ClimbComment; climb: Climb }) {
  const userID = useSessionUser()?.userID;
  const mine = Boolean(userID && comment.author?.userID === userID);
  return (
    <li
      className={`flex flex-col gap-1 rounded-lg border bg-white p-2.5 ${
        mine ? "border-sky-200 ring-1 ring-sky-100" : "border-neutral-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Person person={comment.author} />
          {mine && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700">You</span>}
        </span>
        <time
          dateTime={comment.commentedAt}
          title={comment.editedAt ? `Edited ${formatShortDate(new Date(comment.editedAt))}` : undefined}
          className="text-neutral-500"
        >
          {formatShortDate(new Date(comment.commentedAt))}
          {comment.editedAt && " (edited)"}
        </time>
      </div>
      {comment.comment && <p className="whitespace-pre-line break-words text-sm text-neutral-700">{comment.comment}</p>}
      {(comment.send || comment.grade || comment.rating !== undefined) && (
        <div className="flex flex-wrap gap-1.5">
          {comment.send && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-700">Sent</span>
          )}
          {comment.grade && (
            <ProposedGrade grade={comment.grade} climb={climb} />
          )}
          {comment.rating !== undefined && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
              ★ {ratingStars(comment.rating).toFixed(1)}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// Who set the climb, who sent it last and what people have said about it.
// The last two are fetched when it's first opened.
function ClimbActivityPanel({ climb }: { climb: Climb }) {
  const [activity, setActivity] = useState<ClimbActivity | "loading" | "error">("loading");
  const setters = climbSetters(climb);

  useEffect(() => {
    fetchClimbActivity(climb.id)
      .then(setActivity)
      .catch(() => setActivity("error"));
  }, [climb.id]);

  let lastSend: ReactNode;
  if (climb.sends === 0) lastSend = "Nobody yet";
  else if (activity === "loading") lastSend = "…";
  else if (activity === "error") lastSend = "—";
  else lastSend = <Person person={activity.lastSend} />;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
      <div className="flex items-start justify-between gap-3">
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div className="flex flex-col gap-1">
            <dt>
              <Kicker className="text-neutral-400">Setter</Kicker>
            </dt>
            <dd className="font-semibold text-neutral-800">{setters.length > 0 ? setters.join(", ") : "Unknown"}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt>
              <Kicker className="text-neutral-400">Most recent send</Kicker>
            </dt>
            <dd className="font-semibold text-neutral-800">{lastSend}</dd>
          </div>
        </dl>
        <Link
          href={climbHref(climb.id)}
          className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-primary px-2.5 py-1 font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Open climb
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Kicker className="text-neutral-400">Recent comments</Kicker>
          <span className="font-semibold text-neutral-500 tabular-nums">
            {climb.comments} total
          </span>
        </div>
        {activity === "loading" ? (
          <p>Loading comments…</p>
        ) : activity === "error" ? (
          <p>Couldn&apos;t load the comments right now.</p>
        ) : activity.comments.length === 0 ? (
          <p>No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activity.comments.map((comment) => (
              <CommentItem key={comment.commentID} comment={comment} climb={climb} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ROW_CLASS =
  "-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary";
const CARD_CLASS =
  "flex min-h-24 flex-col gap-3 rounded-lg p-4 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary";

function RowContent({ climb, open }: { climb: Climb; open?: boolean }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-800">
        {open !== undefined && <ChevronIcon open={open} />}
        <ClimbColour climb={climb} />
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <GradeTag grade={climb.grade} />
        <Counts climb={climb} />
      </span>
    </>
  );
}

function CardContent({ climb, open }: { climb: Climb; open?: boolean }) {
  return (
    <>
      <span className="flex w-full items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1.5 font-medium text-neutral-800">
          {open !== undefined && <ChevronIcon open={open} />}
          <ClimbColour climb={climb} stacked />
        </span>
        <GradeTag grade={climb.grade} />
      </span>
      <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-neutral-500 tabular-nums">
        <Sends climb={climb} />
        <Stars climb={climb} />
      </span>
    </>
  );
}

// One climb as a row of a list. Clicking it opens its dropdown - or, when
// `linked`, goes to the climb's own page.
export function ClimbRow({ climb, linked = false }: { climb: Climb; linked?: boolean }) {
  const dropdown = useDropdown();
  if (linked) {
    return (
      <li className="py-1">
        <Link href={climbHref(climb.id)} className={ROW_CLASS}>
          <RowContent climb={climb} />
        </Link>
      </li>
    );
  }
  return (
    <li className="py-1">
      <button
        type="button"
        onClick={dropdown.toggle}
        aria-expanded={dropdown.open}
        aria-controls={dropdown.id}
        className={ROW_CLASS}
      >
        <RowContent climb={climb} open={dropdown.open} />
      </button>
      {dropdown.mounted && (
        <div id={dropdown.id} hidden={!dropdown.open} className="pt-1 pb-2">
          <ClimbActivityPanel climb={climb} />
        </div>
      )}
    </li>
  );
}

// The rows of `climbs`, or `empty` when there are none.
export function ClimbRows({ climbs, empty, linked = false }: { climbs: Climb[]; empty: string; linked?: boolean }) {
  if (climbs.length === 0) return <p className="py-6 text-center text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-neutral-100">
      {climbs.map((climb) => (
        <ClimbRow key={climb.id} climb={climb} linked={linked} />
      ))}
    </ul>
  );
}

// One climb as a card. Clicking it opens its dropdown below - or, when
// `linked`, goes to the climb's own page.
export function ClimbCard({ climb, linked = false }: { climb: Climb; linked?: boolean }) {
  const dropdown = useDropdown();
  if (linked) {
    return (
      <Link
        href={climbHref(climb.id)}
        className={`${CARD_CLASS} h-full border border-neutral-200 bg-neutral-50 text-sm`}
      >
        <CardContent climb={climb} />
      </Link>
    );
  }
  return (
    <article className="flex flex-col rounded-lg border border-neutral-200 bg-neutral-50 text-sm">
      <button
        type="button"
        onClick={dropdown.toggle}
        aria-expanded={dropdown.open}
        aria-controls={dropdown.id}
        className={CARD_CLASS}
      >
        <CardContent climb={climb} open={dropdown.open} />
      </button>
      {dropdown.mounted && (
        <div id={dropdown.id} hidden={!dropdown.open} className="px-2 pb-2">
          <ClimbActivityPanel climb={climb} />
        </div>
      )}
    </article>
  );
}

// One large container of climb cards, or `empty` when there are none.
export function ClimbCardGrid({ climbs, empty, linked = false }: { climbs: Climb[]; empty: string; linked?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      {climbs.length > 0 ? (
        // An open dropdown only grows its own card, not the rest of its row.
        <div
          className={`grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 ${linked ? "" : "items-start"}`}
        >
          {climbs.map((climb) => (
            <ClimbCard key={climb.id} climb={climb} linked={linked} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-neutral-500">{empty}</p>
      )}
    </div>
  );
}

export function ClimbsError() {
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
      The climbs couldn&apos;t be loaded. Try refreshing the page.
    </p>
  );
}

export function Placeholder({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200/70 ${className}`} />;
}
