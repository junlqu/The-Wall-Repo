"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import {
  AnnouncementFields,
  defaultRelevance,
  draftDetails,
  draftFrom,
  RelevanceField,
  relevantUntil,
} from "@/components/AnnouncementForm";
import { ActionsMenu, DANGER_BUTTON_CLASS, Dialog, SidePanel } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, PRIMARY_BUTTON_CLASS, useRequest } from "@/components/ClimbForm";
import {
  type Announcement,
  archiveAnnouncement,
  deleteAnnouncement,
  localDate,
  restoreAnnouncement,
  updateAnnouncement,
} from "@/lib/announcements";

// A side panel holding a form: the fields scroll, and the buttons stay pinned
// underneath so the submit is always in reach.
function PanelForm({
  title,
  busy,
  error,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  busy: boolean;
  error?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <SidePanel title={title} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6">
          {children}
          <ErrorMessage message={error} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
            {submitLabel}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

function EditPanel({
  announcement,
  onClose,
  onSaved,
}: {
  announcement: Announcement;
  onClose: () => void;
  onSaved: (announcement: Announcement) => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(announcement));
  const { busy, error, run } = useRequest();

  return (
    <PanelForm
      title={`Edit “${announcement.title}”`}
      busy={busy}
      error={error}
      submitLabel={busy ? "Saving…" : "Save changes"}
      onClose={onClose}
      onSubmit={() => run(async () => onSaved(await updateAnnouncement(announcement.id, draftDetails(draft))))}
    >
      <AnnouncementFields draft={draft} onChange={setDraft} showType />
    </PanelForm>
  );
}

// Brings an archived announcement back, relevant for a while from today.
function RestorePanel({
  announcement,
  onClose,
  onRestored,
}: {
  announcement: Announcement;
  onClose: () => void;
  onRestored: (announcement: Announcement) => void;
}) {
  const today = localDate(new Date());
  const [relevance, setRelevance] = useState(() => defaultRelevance(today));
  const { busy, error, run } = useRequest();

  return (
    <PanelForm
      title={`Restore “${announcement.title}”`}
      busy={busy}
      error={error}
      submitLabel={busy ? "Restoring…" : "Restore"}
      onClose={onClose}
      onSubmit={() =>
        run(async () => onRestored(await restoreAnnouncement(announcement.id, relevantUntil(relevance, today))))
      }
    >
      <p className="text-sm text-neutral-600">It moves back to the active announcements. Choose how long it stays there.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RelevanceField relevance={relevance} onChange={setRelevance} from={today} min={today} />
      </div>
    </PanelForm>
  );
}

function ArchiveDialog({
  announcement,
  onClose,
  onArchived,
}: {
  announcement: Announcement;
  onClose: () => void;
  onArchived: (announcement: Announcement) => void;
}) {
  const { busy, error, run } = useRequest();

  return (
    <Dialog title={`Archive “${announcement.title}”?`} busy={busy} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        Its relevance ends now and it moves to the archived announcements. You can restore it later.
      </p>
      <ErrorMessage message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => onArchived(await archiveAnnouncement(announcement.id)))}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? "Archiving…" : "Archive"}
        </button>
      </div>
    </Dialog>
  );
}

function DeleteDialog({
  announcement,
  onClose,
  onDeleted,
}: {
  announcement: Announcement;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, error, run } = useRequest();

  return (
    <Dialog title={`Delete “${announcement.title}”?`} busy={busy} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        This removes the announcement, its likes and its views for good, and can&apos;t be undone. To take it down but
        keep it in the catalogue, archive it instead.
      </p>
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
              await deleteAnnouncement(announcement.id);
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

// The "..." menu for one announcement, with the panels and dialogs it opens.
// Active ones can be archived and archived ones restored. `onChanged` gets the
// saved announcement after an edit, archive or restore; `onDeleted` fires once
// it's gone.
export default function AnnouncementActions({
  announcement,
  onChanged,
  onDeleted,
}: {
  announcement: Announcement;
  onChanged: (announcement: Announcement) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState<"edit" | "archive" | "restore" | "delete" | null>(null);
  const close = () => setOpen(null);
  const finish = (updated: Announcement) => {
    close();
    onChanged(updated);
  };

  return (
    <>
      <ActionsMenu
        label={`Actions for “${announcement.title}”`}
        items={[
          { label: "Edit", onSelect: () => setOpen("edit") },
          announcement.active
            ? { label: "Archive", onSelect: () => setOpen("archive") }
            : { label: "Restore", onSelect: () => setOpen("restore") },
          { label: "Delete", onSelect: () => setOpen("delete"), danger: true },
        ]}
      />
      {open === "edit" && <EditPanel announcement={announcement} onClose={close} onSaved={finish} />}
      {open === "archive" && <ArchiveDialog announcement={announcement} onClose={close} onArchived={finish} />}
      {open === "restore" && <RestorePanel announcement={announcement} onClose={close} onRestored={finish} />}
      {open === "delete" && (
        <DeleteDialog
          announcement={announcement}
          onClose={close}
          onDeleted={() => {
            close();
            onDeleted(announcement.id);
          }}
        />
      )}
    </>
  );
}
