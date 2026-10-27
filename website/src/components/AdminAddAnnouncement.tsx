"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { AnnouncementFields, draftDetails, newDraft, TypePicker, withType } from "@/components/AnnouncementForm";
import { ErrorMessage, PRIMARY_BUTTON_CLASS, useRequest } from "@/components/ClimbForm";
import { type Announcement, ANNOUNCEMENT_TYPES, createAnnouncement } from "@/lib/announcements";

const CARD_CLASS = "rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-6";
const STEP_CLASS = "text-xs font-semibold uppercase tracking-wide text-neutral-500";

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className={STEP_CLASS}>
        Step {number} · {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Mounted fresh for each new announcement, so nothing carries over.
function NewAnnouncementForm({ onPosted }: { onPosted: (announcement: Announcement) => void }) {
  const [draft, setDraft] = useState(newDraft);
  const { busy, error, run } = useRequest();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => onPosted(await createAnnouncement(draftDetails(draft))));
  };

  return (
    <div className="flex flex-col gap-4">
      <Step number={1} title="What kind of announcement?">
        <TypePicker type={draft.type} onChange={(type) => setDraft(withType(draft, type))} />
      </Step>

      {draft.type && (
        <Step number={2} title={`${ANNOUNCEMENT_TYPES[draft.type].label} details`}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <AnnouncementFields draft={draft} onChange={setDraft} />
            <ErrorMessage message={error} />
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
                {busy ? "Posting…" : "Post announcement"}
              </button>
            </div>
          </form>
        </Step>
      )}
    </div>
  );
}

// /admin/announcements/new: pick what kind of announcement, then write it.
export default function AdminAddAnnouncement() {
  const [posted, setPosted] = useState<Announcement | null>(null);

  if (posted) {
    const { active } = posted;
    return (
      <div className={`${CARD_CLASS} flex flex-col items-center gap-4 text-center`}>
        <div>
          <p className="font-semibold text-primary">Posted &ldquo;{posted.title}&rdquo;</p>
          <p className="mt-1 text-sm text-neutral-600">
            {active ? "It's now in the active announcements." : "Its relevance has already passed, so it went straight to the archive."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => setPosted(null)} className={PRIMARY_BUTTON_CLASS}>
            Make another
          </button>
          <Link
            href={active ? "/admin/announcements/active" : "/admin/announcements/archived"}
            className="inline-flex items-center justify-center rounded-full border border-primary bg-white px-5 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
          >
            {active ? "See active announcements" : "See archived announcements"}
          </Link>
        </div>
      </div>
    );
  }

  return <NewAnnouncementForm onPosted={setPosted} />;
}
