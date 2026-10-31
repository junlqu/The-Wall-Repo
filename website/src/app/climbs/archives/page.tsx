"use client";

import { useEffect, useMemo, useState } from "react";
import AccessNotice from "@/components/AccessNotice";
import { ClimbRows, ClimbsError, Placeholder } from "@/components/ClimbCards";
import { Masthead, SectionRule } from "@/components/Masthead";
import { type Climb, CLIMB_TYPES, type ClimbType, fetchMyArchive } from "@/lib/climbs";
import { withReturnTo } from "@/lib/returnTo";
import { useSessionUser } from "@/lib/session";

const SECTIONS: { type: ClimbType; title: string; tapeRow: boolean }[] = [
  { type: "route", title: `${CLIMB_TYPES.route}s`, tapeRow: false },
  { type: "boulder", title: `${CLIMB_TYPES.boulder}s`, tapeRow: true },
  { type: "combo", title: `${CLIMB_TYPES.combo}s`, tapeRow: false },
];

// Most recently taken down first, those with no recorded date last.
function byRemoved(a: Climb, b: Climb) {
  return (b.removedAt ?? "").localeCompare(a.removedAt ?? "");
}

export default function ArchivesPage() {
  const user = useSessionUser();
  const userID = user?.userID;
  const [climbs, setClimbs] = useState<Climb[] | null>(null);
  const [error, setError] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!userID) return;
    fetchMyArchive()
      .then((archive) => setClimbs(archive.sort(byRemoved)))
      .catch(() => setError(true));
  }, [userID]);

  if (user === undefined) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  if (user === null) {
    return (
      <AccessNotice
        title="Your archive"
        message="Log in to see the climbs you've commented on that have since come down."
        actionLabel="Log in"
        actionHref={withReturnTo("/login", "/climbs/archives")}
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Masthead title="Archives" tagline="The climbs you've commented on that have since come down." now={now} />

        {error ? (
          <ClimbsError />
        ) : !climbs ? (
          <Placeholder className="h-64" />
        ) : climbs.length === 0 ? (
          <section className="flex flex-col gap-6">
            <SectionRule title="Your archive" />
            <div className="rounded-xl border border-neutral-200 bg-white px-5 py-2 shadow-sm sm:px-6">
              <ClimbRows climbs={[]} empty="None of the climbs you've commented on have come down yet." />
            </div>
          </section>
        ) : (
          SECTIONS.map(({ type, title, tapeRow }) => {
            const section = climbs.filter((climb) => climb.type === type);
            if (section.length === 0) return null;
            return (
              <section key={type} className="flex flex-col gap-6">
                <SectionRule title={title} />
                <div className="rounded-xl border border-neutral-200 bg-white px-5 py-2 shadow-sm sm:px-6">
                  <ClimbRows climbs={section} empty="" tapeRow={tapeRow} />
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
