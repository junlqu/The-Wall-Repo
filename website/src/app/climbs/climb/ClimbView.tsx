"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import { ClimbsError, CommentItem, Person, Placeholder, Stars } from "@/components/ClimbCards";
import { Kicker, Masthead, SectionRule } from "@/components/Masthead";
import {
  type Climb,
  type ClimbActivity,
  CLIMB_TYPES,
  climbColour,
  climbSetters,
  fetchClimb,
  fetchClimbActivity,
  formatDate,
} from "@/lib/climbs";

// The most the API sends - enough for any one climb so far.
const COMMENT_LIMIT = 50;

const LEADABLE_TEXT: Record<Climb["leadable"], string> = { Yes: "Yes", Sketch: "Sketchy", No: "No", "?": "Unknown" };

function BackLink() {
  return (
    <Link href="/climbs" className="w-fit text-sm font-semibold text-primary hover:text-secondary">
      ← All climbs
    </Link>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <Kicker className="text-neutral-400">{label}</Kicker>
      <div className="min-w-0 text-neutral-900">{children}</div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-semibold text-neutral-800">{children}</dd>
    </div>
  );
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
      <p className="font-serif text-2xl font-bold text-primary">{title}</p>
      <p className="text-sm text-neutral-500">{message}</p>
    </div>
  );
}

function ClimbDetails({ id }: { id: string }) {
  const [climb, setClimb] = useState<Climb | null | "loading" | "error">("loading");
  const [activity, setActivity] = useState<ClimbActivity | "loading" | "error">("loading");
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    fetchClimb(id)
      .then(setClimb)
      .catch(() => setClimb("error"));
    fetchClimbActivity(id, COMMENT_LIMIT)
      .then(setActivity)
      .catch(() => setActivity("error"));
  }, [id]);

  if (climb === "loading") {
    return (
      <>
        <Placeholder className="h-40" />
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Placeholder key={i} className="h-28" />
          ))}
        </div>
      </>
    );
  }
  if (climb === "error") return <ClimbsError />;
  if (climb === null) {
    return <Notice title="Climb not found" message="There's no climb with that ID - it may have been deleted." />;
  }

  const type = CLIMB_TYPES[climb.type];
  const setters = climbSetters(climb);
  const where = climb.line === undefined ? type : `${type} on line ${climb.line}`;
  const set = climb.setAt ? `, set ${formatDate(climb.setAt)}` : "";

  let lastSend: ReactNode;
  if (climb.sends === 0) lastSend = <span className="text-neutral-500">Nobody yet</span>;
  else if (activity === "loading") lastSend = "…";
  else if (activity === "error") lastSend = "—";
  else lastSend = <Person person={activity.lastSend} />;

  return (
    <>
      <Masthead title={`${climbColour(climb)} ${climb.grade || "New"}`} tagline={`${where}${set}.`} now={now} />

      {climb.status === "past" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
          This climb has come down
          {climb.removedAt ? ` - it was taken off the wall on ${formatDate(climb.removedAt)}` : ""}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Grade">
          <span className="font-serif text-3xl font-bold text-primary">{climb.grade || "New"}</span>
        </Stat>
        <Stat label="Sends">
          <span className="font-serif text-3xl font-bold text-primary tabular-nums">{climb.sends}</span>
        </Stat>
        <Stat label="Rating">
          <span className="text-sm text-neutral-600 tabular-nums">
            <Stars climb={climb} />
          </span>
        </Stat>
        <Stat label="Most recent send">
          <span className="text-sm">{lastSend}</span>
        </Stat>
      </div>

      <section className="flex flex-col gap-6">
        <SectionRule title="The climb" />
        <dl className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white px-5 shadow-sm sm:px-6">
          <Detail label="Colour">
            <span className="flex justify-end">
              <ClimbColour climb={climb} />
            </span>
          </Detail>
          <Detail label="Type">{type}</Detail>
          {climb.line !== undefined && <Detail label="Line">{climb.line}</Detail>}
          <Detail label={setters.length > 1 ? "Setters" : "Setter"}>
            {setters.length > 0 ? setters.join(", ") : "Unknown"}
          </Detail>
          <Detail label="Set">{formatDate(climb.setAt)}</Detail>
          {climb.status === "past" && <Detail label="Taken down">{formatDate(climb.removedAt ?? "")}</Detail>}
          {climb.type !== "boulder" && <Detail label="Leadable">{LEADABLE_TEXT[climb.leadable]}</Detail>}
        </dl>
      </section>

      <section className="flex flex-col gap-6">
        <SectionRule title={`Comments (${climb.comments})`} />
        {activity === "loading" ? (
          <Placeholder className="h-32" />
        ) : activity === "error" ? (
          <p className="text-center text-sm text-neutral-500">Couldn&apos;t load the comments right now.</p>
        ) : activity.comments.length === 0 ? (
          <p className="text-center text-sm text-neutral-500">No comments yet.</p>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 text-xs text-neutral-600">
            <ul className="flex flex-col gap-3">
              {activity.comments.map((comment) => (
                <CommentItem key={comment.commentID} comment={comment} climb={climb} />
              ))}
            </ul>
            {climb.comments > activity.comments.length && (
              <p className="text-center text-neutral-500">Showing the newest {activity.comments.length}.</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export default function ClimbView() {
  const id = useSearchParams().get("id");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <BackLink />
        {id ? (
          // Keyed so moving to another climb starts it fresh.
          <ClimbDetails key={id} id={id} />
        ) : (
          <Notice title="No climb picked" message="Open a climb from the climbs list to see it here." />
        )}
      </div>
    </div>
  );
}
