"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { FlagIcon, ReviewBadge } from "@/components/AdminModeration";
import { EditDialog } from "@/components/ClimbActions";
import { CommentItem, GradeArrow, Placeholder } from "@/components/ClimbCards";
import { SplitDot, Swatch } from "@/components/ClimbColour";
import { adminSectionHref, adminSubpageHref, getAdminSection } from "@/lib/adminSections";
import {
  type Climb,
  type ClimbComment,
  climbColour,
  climbHref,
  climbName,
  climbSetters,
  climbTypeLabel,
  fetchClimb,
  formatDate,
  swatchFor,
} from "@/lib/climbs";
import {
  fetchClimbGradeComments,
  type GradeVerdict,
  type GradeVotes,
  gradeVerdict,
  gradeVoteTotal,
  MIN_GRADE_VOTES,
  needsGradeReview,
  suggestedGrade,
  suggestedVerdicts,
} from "@/lib/moderation";

const SECTION = getAdminSection("moderation")!;
const REPORTS = SECTION.subpages.find((subpage) => subpage.slug === "grading-reports")!;

// Coloured as a commenter's proposed grade is on the climbs pages and in the
// grading reports: red under, yellow at, green over. `ring` marks the one
// the climb should be at.
const VERDICTS: {
  id: GradeVerdict;
  // Read out and shown on hover - the page itself shows VerdictSymbol.
  label: string;
  tile: string;
  ring: string;
  dot: string;
  underline: string;
  phrase: string;
}[] = [
  {
    id: "easier",
    label: "Under grade",
    tile: "bg-red-50 text-red-700",
    ring: "ring-2 ring-red-400",
    dot: "bg-red-400",
    underline: "border-red-400",
    phrase: "under its grade",
  },
  {
    id: "same",
    label: "At grade",
    tile: "bg-yellow-50 text-yellow-800",
    ring: "ring-2 ring-yellow-400",
    dot: "bg-yellow-400",
    underline: "border-yellow-400",
    phrase: "at its grade",
  },
  {
    id: "harder",
    label: "Over grade",
    tile: "bg-green-50 text-green-700",
    ring: "ring-2 ring-green-500",
    dot: "bg-green-500",
    underline: "border-green-500",
    phrase: "over its grade",
  },
];

// As on a comment's proposed grade: down for under, ~ for at, up for over.
function VerdictSymbol({ id }: { id: GradeVerdict }) {
  if (id === "same") return <span aria-hidden="true" className="font-bold leading-none">~</span>;
  return <GradeArrow direction={id === "harder" ? "up" : "down"} />;
}

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

// The hold colour as a dot - or, for a combo's two, the dot cut in half.
function ColourDot({ climb }: { climb: Climb }) {
  if (climb.secondary) return <SplitDot colour={climb.colour} secondary={climb.secondary} className="mx-1 h-11 w-11" />;
  return (
    <span
      aria-hidden="true"
      className="h-11 w-11 shrink-0 rounded-full shadow-inner ring-1 ring-black/10"
      style={{ background: swatchFor(climb.colour) }}
    />
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-neutral-50 p-3">
      <dt className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="truncate text-lg font-bold text-primary">{children}</dd>
    </div>
  );
}

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-full border border-primary bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white sm:py-1";

// The climb as its public page has it, scaled down to sit with the rest of
// the admin pages, with a way to edit it and to see its public page.
function ClimbSummary({ climb, onSaved }: { climb: Climb; onSaved: (climb: Climb) => void }) {
  const [editing, setEditing] = useState(false);
  const setters = climbSetters(climb);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm">
      {/* The grade stays beside the title at any width. The buttons sit under it
          on wider screens, and get a row of their own across a phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3 sm:row-span-2 sm:gap-4">
          <ColourDot climb={climb} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-xs font-bold uppercase tracking-[0.2em] text-secondary">
              {climbTypeLabel(climb)}
              {climb.line !== undefined && ` · Line ${climb.line}`}
            </span>
            <h2 className="truncate text-2xl font-bold text-primary">
              {climbColour(climb)}
              <span className="sr-only"> {climb.grade || "New"}</span>
            </h2>
            {climb.tape && (
              <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                <Swatch colour={climb.tape} tape />
                {climb.tape} tape
              </span>
            )}
            <span className="text-sm text-neutral-600">
              {climb.type === "combo"
                ? `First ascent: ${climb.setter || "Unknown"}`
                : setters.length > 0
                  ? `Set by ${setters.join(", ")}`
                  : "Setter unknown"}
            </span>
          </div>
        </div>
        <span
          aria-hidden="true"
          title="Grade"
          className="self-start justify-self-end rounded-md bg-primary px-2.5 py-1 text-base font-bold leading-none text-white tabular-nums shadow-sm"
        >
          {climb.grade || "New"}
        </span>
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:col-start-2 sm:flex sm:flex-wrap sm:justify-end sm:self-end">
          <button type="button" onClick={() => setEditing(true)} className={BUTTON_CLASS}>
            Edit climb
          </button>
          <Link href={climbHref(climb.id)} className={`group ${BUTTON_CLASS}`}>
            Public page
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>

      {climb.status === "past" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This climb has come down
          {climb.removedAt ? ` - it was taken off the wall on ${formatDate(climb.removedAt)}` : ""}.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Sends">{climb.sends.toLocaleString()}</Stat>
        <Stat label="Comments">{climb.comments.toLocaleString()}</Stat>
        <Stat label="Rating">
          {climb.stars === null ? "—" : `★ ${climb.stars.toFixed(1)}`}
          <span className="ml-1 text-xs font-semibold text-neutral-500">({climb.ratings})</span>
        </Stat>
        <Stat label={climb.type === "combo" ? "First ascent" : "Set"}>{formatDate(climb.setAt)}</Stat>
      </dl>

      {editing && (
        <EditDialog
          climb={climb}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            onSaved(saved);
          }}
        />
      )}
    </section>
  );
}

// How many graders put it under, at and over its grade, with the one it
// should be at ringed - see suggestedVerdicts.
function VoteTiles({ votes, suggested }: { votes: GradeVotes; suggested: GradeVerdict[] }) {
  const total = gradeVoteTotal(votes);
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {VERDICTS.map(({ id, label, tile, ring }) => {
        const isSuggested = suggested.includes(id);
        return (
          <div
            key={id}
            className={`relative flex min-w-0 flex-col gap-1 rounded-lg p-2.5 sm:p-4 ${tile} ${isSuggested ? ring : ""}`}
          >
            <span title={label} className="flex h-5 items-center text-lg [&_svg]:h-4 [&_svg]:w-4">
              <VerdictSymbol id={id} />
              <span className="sr-only">{label}</span>
            </span>
            <span className="text-2xl font-bold tabular-nums sm:text-3xl">{votes[id]}</span>
            <span className="text-xs opacity-80">{total > 0 ? `${Math.round((votes[id] / total) * 100)}%` : "—"}</span>
            {isSuggested && (
              <span className="absolute right-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide max-sm:sr-only">
                Suggested
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The grade the comments suggest, coloured as its tile would be: red under
// its listed grade, yellow at it, green over. Grey when its listed grade
// isn't on the scale to compare with, or with too few proposed grades to go
// on - those that aren't on the scale don't count.
function SuggestedGrade({ climb, grades }: { climb: Climb; grades: string[] }) {
  const found = suggestedGrade(climb, grades);
  const suggestion = found && found.from >= MIN_GRADE_VOTES ? found : null;
  const verdict = suggestion && gradeVerdict(climb, suggestion.grade);
  const style = VERDICTS.find(({ id }) => id === verdict);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg p-3 sm:p-4 ${style?.tile ?? "bg-neutral-100 text-neutral-700"}`}
    >
      <p className="text-xs font-semibold uppercase sm:text-sm sm:tracking-wide">Suggested grade</p>
      {suggestion ? (
        <span className="flex shrink-0 items-center gap-2 text-2xl font-bold tabular-nums sm:text-3xl [&_svg]:h-5 [&_svg]:w-5">
          {verdict && <VerdictSymbol id={verdict} />}
          {suggestion.grade}
          {style && (
            <span className="sr-only">
              , {style.phrase} of {climb.grade}
            </span>
          )}
        </span>
      ) : (
        <span className="shrink-0 text-sm font-semibold text-neutral-500">
          Not enough data{" "}
          <span className="tabular-nums">
            ({found?.from ?? 0}/{MIN_GRADE_VOTES})
          </span>
        </span>
      )}
    </div>
  );
}

// Where the commenters' grades leave the climb, in a sentence.
function verdictSummary(votes: GradeVotes, suggested: GradeVerdict[]) {
  const total = gradeVoteTotal(votes);
  if (total === 0) return "Nobody has graded it yet.";
  const graders = plural(total, "comment");
  if (suggested.length > 1) return `Of ${graders}, as many put it under its grade as over it.`;
  const { phrase } = VERDICTS.find((verdict) => verdict.id === suggested[0])!;
  return `Of ${graders}, most put it ${phrase}.`;
}

// The graded comments, a tab each for those putting it under, at and over
// its grade. The tab the climb should be at has a coloured dot.
function GradedComments({
  climb,
  sorted,
  suggested,
}: {
  climb: Climb;
  sorted: Record<GradeVerdict, ClimbComment[]>;
  suggested: GradeVerdict[];
}) {
  const [active, setActive] = useState<GradeVerdict>(suggested[0] ?? "same");
  const current = VERDICTS.find((verdict) => verdict.id === active)!;
  const comments = sorted[active];

  return (
    <section aria-label="Graded comments" className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm">
      <div role="tablist" aria-label="Comments by grade" className="-mx-5 flex overflow-x-auto border-b border-neutral-200 px-5">
        {VERDICTS.map(({ id, label, tile, dot, underline }) => {
          const isActive = id === active;
          const isSuggested = suggested.includes(id);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`grades-tab-${id}`}
              aria-selected={isActive}
              aria-controls="grades-panel"
              onClick={() => setActive(id)}
              className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? `${underline} text-primary` : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {isSuggested && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />}
              {/* In the tile's colours, so each symbol reads the same as its tile above. */}
              <span
                title={label}
                className={`flex h-6 w-6 items-center justify-center rounded text-base [&_svg]:h-3.5 [&_svg]:w-3.5 ${tile}`}
              >
                <VerdictSymbol id={id} />
                <span className="sr-only">{label}</span>
              </span>
              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 tabular-nums">
                {sorted[id].length}
              </span>
              {isSuggested && <span className="sr-only">, suggested</span>}
            </button>
          );
        })}
      </div>

      <div id="grades-panel" role="tabpanel" aria-labelledby={`grades-tab-${active}`}>
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No comments put it {current.phrase}.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-xs text-neutral-600">
            {comments.map((comment) => (
              <CommentItem key={comment.commentID} comment={comment} climb={climb} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type Loaded = { climb: Climb; comments: ClimbComment[] };

function Report({ id, onName }: { id: string; onName: (name: string) => void }) {
  // undefined while loading, null when there's no such climb.
  const [loaded, setLoaded] = useState<Loaded | null | { error: string }>();

  useEffect(() => {
    let current = true;
    Promise.all([fetchClimb(id), fetchClimbGradeComments(id)])
      .then(([climb, comments]) => current && setLoaded(climb && { climb, comments }))
      .catch((error: Error) => current && setLoaded({ error: error.message }));
    return () => {
      current = false;
    };
  }, [id]);

  const climb = loaded && "climb" in loaded ? loaded.climb : null;
  useEffect(() => {
    if (climb) onName(climbName(climb));
  }, [climb, onName]);

  if (loaded === undefined) {
    return (
      <>
        <Placeholder className="h-48" />
        <Placeholder className="h-32" />
        <Placeholder className="h-64" />
      </>
    );
  }
  if (loaded === null) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
        There&apos;s no climb with that ID - it may have been deleted.
      </p>
    );
  }
  if ("error" in loaded) {
    return (
      <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
        Couldn&apos;t load the grading report: {loaded.error}
      </p>
    );
  }

  // Sorted against its grade as it is now, so an edit re-sorts them.
  const sorted: Record<GradeVerdict, ClimbComment[]> = { easier: [], same: [], harder: [] };
  let offScale = 0;
  for (const comment of loaded.comments) {
    const verdict = comment.grade ? gradeVerdict(loaded.climb, comment.grade) : null;
    if (verdict) sorted[verdict].push(comment);
    else offScale++;
  }
  const votes: GradeVotes = { easier: sorted.easier.length, same: sorted.same.length, harder: sorted.harder.length };
  const suggested = suggestedVerdicts(votes);

  return (
    <>
      <ClimbSummary climb={loaded.climb} onSaved={(saved) => setLoaded({ ...loaded, climb: saved })} />

      <section aria-labelledby="grade-votes-heading" className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="grade-votes-heading" className="text-xl font-bold text-primary">
              Proposed grades
            </h2>
            <p className="text-sm text-neutral-600">{verdictSummary(votes, suggested)}</p>
          </div>
          {needsGradeReview(votes) ? (
            <ReviewBadge />
          ) : (
            gradeVoteTotal(votes) < MIN_GRADE_VOTES && (
              <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                <FlagIcon />
                Flagged from {MIN_GRADE_VOTES}+ graded comments
              </span>
            )
          )}
        </div>
        <VoteTiles votes={votes} suggested={suggested} />
        <SuggestedGrade climb={loaded.climb} grades={loaded.comments.flatMap((comment) => comment.grade ?? [])} />
        {offScale > 0 && (
          <p className="text-xs text-neutral-500">
            {plural(offScale, "comment")} gave a grade off its scale, so {offScale === 1 ? "isn't" : "aren't"} counted.
          </p>
        )}
      </section>

      {/* Keyed so an edit that changes the grade starts on its new suggestion. */}
      <GradedComments key={loaded.climb.grade} climb={loaded.climb} sorted={sorted} suggested={suggested} />
    </>
  );
}

// /admin/moderation/grading-reports/climb?id= - one climb's grading report:
// the climb, how its comments' grades sit against its own, and those comments
// sorted into under, at and over its grade.
export default function AdminGradingClimb() {
  const id = useSearchParams().get("id");
  const [name, setName] = useState<string | null>(null);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <Link href="/admin" className="hover:text-primary">
            Admin
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={adminSectionHref(SECTION)} className="hover:text-primary">
            {SECTION.title}
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={adminSubpageHref(SECTION, REPORTS)} className="hover:text-primary">
            {REPORTS.label}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-neutral-800">{name ?? "Climb"}</span>
        </nav>

        <div>
          <h1 className="text-3xl font-bold text-primary sm:text-4xl">Grading report</h1>
          <p className="mt-2 text-neutral-600">How the comments grade this climb against its listed grade.</p>
        </div>

        {id ? (
          // Keyed so moving to another climb starts it fresh.
          <Report key={id} id={id} onName={setName} />
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
            Open a climb from the{" "}
            <Link href={adminSubpageHref(SECTION, REPORTS)} className="font-semibold text-primary underline">
              grading reports
            </Link>{" "}
            to see it here.
          </p>
        )}
      </div>
    </div>
  );
}
