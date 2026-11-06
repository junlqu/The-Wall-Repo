"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { type AnnouncementDraft, AnnouncementFields, draftDetails, newDraft, withType } from "@/components/AnnouncementForm";
import { Dialog, DANGER_BUTTON_CLASS, SidePanel } from "@/components/ClimbActions";
import { CANCEL_BUTTON_CLASS, ErrorMessage, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import {
  type Announcement,
  ANNOUNCEMENT_TYPES,
  type AnnouncementType,
  createAnnouncement,
  fetchAnnouncements,
  formatShortDate,
} from "@/lib/announcements";
import { parseDate } from "@/lib/climbs";
import {
  type ClosureEntry,
  currentDetails,
  DAY_NAMES,
  type DayHours,
  DEFAULT_WEEK,
  type DetailID,
  type EntryBase,
  type EntryOf,
  type EntryStatus,
  entryStatus,
  formatCents,
  formatDayHours,
  formatEntryDates,
  type HoursEntry,
  hoursPeriodOn,
  lastDay,
  lessonsOf,
  linkAnnouncement,
  needsAnnouncement,
  newEntryId,
  placePeriod,
  PRICE_INFO,
  PRICE_KEYS,
  PRICE_LIST,
  type PriceKey,
  type Prices,
  pricesOn,
  type PricingEntry,
  pricingOn,
  regularHoursOn,
  removePeriod,
  replacePeriod,
  saveDetail,
  shiftDate,
  todayKey,
  unlinkAnnouncement,
  useDetails,
  weekdayOf,
  type WeekHours,
  type WeekLessons,
} from "@/lib/details";

// --- Shared pieces -------------------------------------------------------------

const CARD_CLASS = "rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-6";
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-primary bg-white px-4 py-1.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
const TEXT_BUTTON_CLASS =
  "text-sm font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50";
const SUBTLE_BUTTON_CLASS =
  "text-sm font-semibold text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50";
const HINT_CLASS = "text-xs font-normal normal-case tracking-normal text-neutral-500";

const STATUS_BADGE: Record<EntryStatus, { label: string; className: string }> = {
  past: { label: "Past", className: "bg-neutral-100 text-neutral-600" },
  current: { label: "In effect", className: "bg-green-100 text-green-700" },
  upcoming: { label: "Upcoming", className: "bg-secondary/20 text-primary" },
};

// What each detail's changes are called, and the announcement they get.
export const DETAIL_COPY: Record<
  DetailID,
  { noun: string; announcementType: AnnouncementType; announceLabel: string; subpage: string }
> = {
  pricing: { noun: "Price change", announcementType: "updates", announceLabel: "Create update announcement", subpage: "pricing" },
  hours: { noun: "Hours change", announcementType: "updates", announceLabel: "Create update announcement", subpage: "hours" },
  closures: { noun: "Closure", announcementType: "closures", announceLabel: "Create closure announcement", subpage: "closures" },
};

export function operationsHref(detailID: DetailID) {
  return `/admin/operations/${DETAIL_COPY[detailID].subpage}`;
}

function StatusBadge({ status }: { status: EntryStatus }) {
  const { label, className } = STATUS_BADGE[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className}`}>{label}</span>;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

// Saves a change to one detail's entries, made against the latest saved list.
async function updateEntries<K extends DetailID>(detailID: K, change: (entries: EntryOf<K>[]) => EntryOf<K>[]) {
  return saveDetail(detailID, change(currentDetails()[detailID].entries as EntryOf<K>[]));
}

// Every announcement, for naming the linked ones and picking one to link.
// undefined while loading, null if they couldn't be loaded.
function useAnnouncementList() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>();
  useEffect(() => {
    fetchAnnouncements()
      .then((loaded) => setAnnouncements(loaded.sort((a, b) => b.announcedAt.localeCompare(a.announcedAt))))
      .catch(() => setAnnouncements(null));
  }, []);
  const add = (announcement: Announcement) => setAnnouncements((current) => [announcement, ...(current ?? [])]);
  return { announcements, add };
}

type AnnouncementList = ReturnType<typeof useAnnouncementList>;

// Shown in place of a tool until the details are ready to change. Saving
// replaces a detail's whole list, so nothing can be changed without it.
function DetailsUnavailable({ details }: { details: unknown }) {
  if (details === undefined) {
    return (
      <div role="status" className="flex min-h-64 items-center justify-center rounded-lg border border-neutral-200 bg-white p-10">
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    );
  }
  return <ErrorMessage message="Couldn't load the saved prices, hours and closures, so they can't be changed safely. Refresh to try again." />;
}

// --- Announcements --------------------------------------------------------------

// A starting draft for an entry's announcement - the admin can change any of it.
type DraftSeed = { title: string; details: string; targetDate: string; targetEndDate?: string; relevantThrough: string };

function seededDraft(type: AnnouncementType, seed: DraftSeed): AnnouncementDraft {
  const draft = withType(newDraft(), type);
  return {
    ...draft,
    title: seed.title,
    content: { ...draft.content, details: seed.details },
    targetDate: seed.targetDate,
    targetEndDate: ANNOUNCEMENT_TYPES[type].range && seed.targetEndDate && seed.targetEndDate > seed.targetDate ? seed.targetEndDate : "",
    relevance: { mode: "date", days: "7", date: seed.relevantThrough },
  };
}

// Relevant until a week after a change starts, or a week from today if it
// already has.
function relevantAfter(startDate: string) {
  const today = todayKey();
  return shiftDate(startDate > today ? startDate : today, 7);
}

function AnnouncePanel<K extends DetailID>({
  detailID,
  entry,
  seed,
  onClose,
  onPosted,
}: {
  detailID: K;
  entry: EntryOf<K>;
  seed: DraftSeed;
  onClose: () => void;
  onPosted: (announcement: Announcement) => void;
}) {
  const [draft, setDraft] = useState(() => seededDraft(DETAIL_COPY[detailID].announcementType, seed));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    let posted: Announcement;
    try {
      posted = await createAnnouncement(draftDetails(draft));
    } catch (postError) {
      setError(messageOf(postError));
      setBusy(false);
      return;
    }
    onPosted(posted);
    try {
      await updateEntries(detailID, (entries) => linkAnnouncement(entries, [entry.id], { announcementID: posted.id }));
      onClose();
    } catch {
      setError(`"${posted.title}" was posted, but couldn't be linked. Close this and use "Link existing" to link it.`);
      setBusy(false);
    }
  };

  return (
    <SidePanel title={DETAIL_COPY[detailID].announceLabel} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-4 text-sm text-neutral-600">
            For the {DETAIL_COPY[detailID].noun.toLowerCase()} {formatEntryDates(detailID, entry).toLowerCase()}. Once
            it&apos;s posted it&apos;s linked, and the dashboard stops asking for it.
          </p>
          <AnnouncementFields draft={draft} onChange={setDraft} showType />
        </div>
        <div className="flex flex-col gap-3 border-t border-neutral-200 px-6 py-4">
          <ErrorMessage message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON_CLASS}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
              {busy ? "Posting…" : "Post and link"}
            </button>
          </div>
        </div>
      </form>
    </SidePanel>
  );
}

function LinkDialog<K extends DetailID>({
  detailID,
  entry,
  list,
  onClose,
}: {
  detailID: K;
  entry: EntryOf<K>;
  list: AnnouncementList;
  onClose: () => void;
}) {
  const preferred = DETAIL_COPY[detailID].announcementType;
  // The kind this detail usually gets first, newest first within each.
  const options = useMemo(
    () => [...(list.announcements ?? [])].sort((a, b) => Number(b.type === preferred) - Number(a.type === preferred)),
    [list.announcements, preferred],
  );
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const link = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await updateEntries(detailID, (entries) => linkAnnouncement(entries, [entry.id], { announcementID: chosen }));
      onClose();
    } catch (linkError) {
      setError(messageOf(linkError));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Link an existing announcement" busy={busy} onClose={onClose}>
      {list.announcements === undefined ? (
        <p className="text-sm text-neutral-500">Loading announcements…</p>
      ) : list.announcements === null ? (
        <ErrorMessage message="Couldn't load the announcements. Refresh to try again." />
      ) : (
        <label className={LABEL_CLASS}>
          Announcement
          <select value={chosen} onChange={(event) => setChosen(event.target.value)} className={FIELD_CLASS}>
            <option value="">Choose one…</option>
            {options.map((announcement) => (
              <option key={announcement.id} value={announcement.id}>
                {ANNOUNCEMENT_TYPES[announcement.type].label} · {announcement.title} ·{" "}
                {formatShortDate(new Date(announcement.announcedAt))}
              </option>
            ))}
          </select>
        </label>
      )}
      <ErrorMessage message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="button" onClick={link} disabled={busy || !chosen} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "Linking…" : "Link"}
        </button>
      </div>
    </Dialog>
  );
}

// Whether an entry has its announcement, and the ways to give it one.
function AnnouncementRow<K extends DetailID>({
  detailID,
  entry,
  list,
  seed,
}: {
  detailID: K;
  entry: EntryOf<K>;
  list: AnnouncementList;
  seed: () => DraftSeed;
}) {
  const [open, setOpen] = useState<"announce" | "link" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const missing = needsAnnouncement(detailID, entry);

  const change = async (update: (entries: EntryOf<K>[]) => EntryOf<K>[]) => {
    setBusy(true);
    setError(undefined);
    try {
      await updateEntries(detailID, update);
    } catch (changeError) {
      setError(messageOf(changeError));
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (entry.announcementID) {
    const linked = list.announcements?.find((item) => item.id === entry.announcementID);
    body = (
      <>
        <span className="text-neutral-600">
          Announced:{" "}
          {linked ? (
            <Link
              href={linked.active ? "/admin/announcements/active" : "/admin/announcements/archived"}
              className="font-semibold text-primary hover:underline"
            >
              {linked.title}
            </Link>
          ) : (
            <span className="font-semibold">{list.announcements === undefined ? "…" : "an announcement that's since been deleted"}</span>
          )}
        </span>
        <button type="button" disabled={busy} onClick={() => change((entries) => unlinkAnnouncement(entries, entry.id))} className={SUBTLE_BUTTON_CLASS}>
          Unlink
        </button>
      </>
    );
  } else if (entry.noAnnouncement) {
    body = (
      <>
        <span className="text-neutral-600">Marked as not needing an announcement.</span>
        <button type="button" disabled={busy} onClick={() => change((entries) => unlinkAnnouncement(entries, entry.id))} className={SUBTLE_BUTTON_CLASS}>
          Undo
        </button>
      </>
    );
  } else {
    body = (
      <>
        <span className={missing ? "font-semibold text-amber-800" : "text-neutral-500"}>
          {missing ? "No announcement linked yet." : "No announcement was linked."}
        </span>
        {missing && (
          <button type="button" disabled={busy} onClick={() => setOpen("announce")} className={SECONDARY_BUTTON_CLASS}>
            {DETAIL_COPY[detailID].announceLabel}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => setOpen("link")} className={TEXT_BUTTON_CLASS}>
          Link existing
        </button>
        {missing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => change((entries) => linkAnnouncement(entries, [entry.id], { noAnnouncement: true }))}
            className={SUBTLE_BUTTON_CLASS}
          >
            Doesn&apos;t need one
          </button>
        )}
      </>
    );
  }

  return (
    <div
      className={`flex flex-col gap-2 border-t px-4 py-3 text-sm sm:px-5 ${missing ? "border-amber-200 bg-amber-50" : "border-neutral-100 bg-neutral-50"}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{body}</div>
      <ErrorMessage message={error} />
      {open === "announce" && (
        <AnnouncePanel detailID={detailID} entry={entry} seed={seed()} onClose={() => setOpen(null)} onPosted={list.add} />
      )}
      {open === "link" && <LinkDialog detailID={detailID} entry={entry} list={list} onClose={() => setOpen(null)} />}
    </div>
  );
}

// --- Entry cards -------------------------------------------------------------------

function EntryCard<K extends DetailID>({
  detailID,
  entry,
  list,
  seed,
  title,
  onEdit,
  onDelete,
  children,
}: {
  detailID: K;
  entry: EntryOf<K>;
  list: AnnouncementList;
  seed: () => DraftSeed;
  title?: string;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-primary">{formatEntryDates(detailID, entry)}</h3>
          <StatusBadge status={entryStatus(detailID, entry)} />
          {title && <span className="text-sm text-neutral-600">· {title}</span>}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onEdit} className={TEXT_BUTTON_CLASS}>
            Edit
          </button>
          <button type="button" onClick={onDelete} className={SUBTLE_BUTTON_CLASS}>
            Delete
          </button>
        </div>
      </div>
      <div className="px-4 py-3 sm:px-5">{children}</div>
      <AnnouncementRow detailID={detailID} entry={entry} list={list} seed={seed} />
    </article>
  );
}

// Upcoming and current first (soonest at the top), past ones tucked away.
function EntryList<K extends DetailID>({
  detailID,
  entries,
  emptyText,
  renderEntry,
}: {
  detailID: K;
  entries: EntryOf<K>[];
  emptyText: string;
  renderEntry: (entry: EntryOf<K>) => ReactNode;
}) {
  const [showPast, setShowPast] = useState(false);
  const today = todayKey();
  const live = entries
    .filter((entry) => entryStatus(detailID, entry, today) !== "past")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = entries
    .filter((entry) => entryStatus(detailID, entry, today) === "past")
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="flex flex-col gap-3">
      {live.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">{emptyText}</p>}
      {live.map(renderEntry)}
      {past.length > 0 && (
        <>
          <button type="button" onClick={() => setShowPast(!showPast)} className={`${TEXT_BUTTON_CLASS} self-start`}>
            {showPast ? "Hide" : "Show"} {past.length} past {past.length === 1 ? "entry" : "entries"}
          </button>
          {showPast && past.map(renderEntry)}
        </>
      )}
    </div>
  );
}

function DeleteDialog({
  what,
  note,
  onConfirm,
  onClose,
}: {
  what: string;
  note?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      onClose();
    } catch (deleteError) {
      setError(messageOf(deleteError));
      setBusy(false);
    }
  };
  return (
    <Dialog title={`Delete ${what}?`} busy={busy} onClose={onClose}>
      {note && <p className="text-sm text-neutral-600">{note}</p>}
      <ErrorMessage message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={busy} className={DANGER_BUTTON_CLASS}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Dialog>
  );
}

// Right after a save: the change's announcement, a click away.
function SavedBanner<K extends DetailID>({
  detailID,
  entryId,
  list,
  seed,
  onDismiss,
}: {
  detailID: K;
  entryId: string;
  list: AnnouncementList;
  seed: (entry: EntryOf<K>) => DraftSeed;
  onDismiss: () => void;
}) {
  const details = useDetails();
  const entry = (details?.[detailID].entries as EntryOf<K>[] | undefined)?.find((item) => item.id === entryId);
  if (!entry) return null;
  const missing = needsAnnouncement(detailID, entry);
  return (
    <div role="status" className="flex flex-col gap-1 overflow-hidden rounded-lg border border-green-200 bg-green-50">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-sm sm:px-5">
        <p className="font-semibold text-green-800">
          Saved the {DETAIL_COPY[detailID].noun.toLowerCase()} {formatEntryDates(detailID, entry).toLowerCase()}.
          {missing ? " Let everyone know:" : ""}
        </p>
        <button type="button" onClick={onDismiss} className={SUBTLE_BUTTON_CLASS}>
          Dismiss
        </button>
      </div>
      {missing ? (
        <AnnouncementRow detailID={detailID} entry={entry} list={list} seed={() => seed(entry)} />
      ) : (
        <div className="pb-3" />
      )}
    </div>
  );
}

// --- Period tools (pricing and hours) ------------------------------------------------

type PeriodID = "pricing" | "hours";

function DateFields({
  startDate,
  endDate,
  onChange,
  endHint,
}: {
  startDate: string;
  endDate: string;
  onChange: (dates: { startDate: string; endDate: string }) => void;
  endHint: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className={LABEL_CLASS}>
        Starts
        <input
          type="date"
          required
          value={startDate}
          onChange={(event) => onChange({ startDate: event.target.value, endDate })}
          className={FIELD_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        <span>
          Ends <span className={HINT_CLASS}>- {endHint}</span>
        </span>
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => onChange({ startDate, endDate: event.target.value })}
          className={FIELD_CLASS}
        />
      </label>
    </div>
  );
}

type PeriodToolConfig<K extends PeriodID, V> = {
  detailID: K;
  // The values in effect on a date, to start a new change from.
  valuesOn: (date: string) => V;
  valuesOf: (entry: EntryOf<K>) => V;
  // The values as saved, or what's wrong with them.
  readValues: (values: V) => { error: string } | { values: Omit<EntryOf<K>, keyof EntryBase> };
  ValuesEditor: (props: { values: V; onChange: (values: V) => void }) => ReactNode;
  // What a period says, set against the one before it.
  Summary: (props: { entry: EntryOf<K>; previous: EntryOf<K> | undefined }) => ReactNode;
  seed: (entry: EntryOf<K>) => DraftSeed;
  emptyText: string;
  addLabel: string;
};

type PeriodDraft<V> = { id: string | null; startDate: string; endDate: string; values: V };

function PeriodForm<K extends PeriodID, V>({
  config,
  draft,
  onChange,
  onCancel,
  onSaved,
}: {
  config: PeriodToolConfig<K, V>;
  draft: PeriodDraft<V>;
  onChange: (draft: PeriodDraft<V>) => void;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const { detailID, ValuesEditor } = config;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const entries = currentDetails()[detailID].entries as EntryOf<K>[];

  // What saving would do to the periods around it.
  const preview = useMemo(() => {
    if (!draft.startDate || (draft.endDate && draft.endDate < draft.startDate)) return null;
    const read = config.readValues(draft.values);
    if ("error" in read) return null;
    const original = entries.find((entry) => entry.id === draft.id);
    const period = {
      ...original,
      ...read.values,
      id: draft.id ?? newEntryId(),
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
    } as EntryOf<K>;
    const next = (draft.id ? replacePeriod(entries, period) : placePeriod(entries, period)) as EntryOf<K>[];
    const replaced = entries.filter((entry) => entry.id !== draft.id && !next.some((item) => item.id === entry.id));
    return { period, next, replaced };
  }, [config, draft, entries]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const read = config.readValues(draft.values);
    if ("error" in read) return setError(read.error);
    if (!preview) return setError("The end date can't be before the start date.");
    setBusy(true);
    setError(undefined);
    try {
      await saveDetail(detailID, preview.next);
      onSaved(preview.period.id);
    } catch (saveError) {
      setError(messageOf(saveError));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${CARD_CLASS} flex flex-col gap-5`}>
      <h2 className="text-lg font-bold text-primary">{draft.id ? "Edit period" : config.addLabel}</h2>
      <DateFields
        startDate={draft.startDate}
        endDate={draft.endDate}
        onChange={(dates) => onChange({ ...draft, ...dates })}
        endHint="leave empty if it's the new normal"
      />
      <ValuesEditor values={draft.values} onChange={(values) => onChange({ ...draft, values })} />
      {preview && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-neutral-600">
          {draft.endDate ? (
            <li>
              Applies {formatEntryDates(detailID, preview.period).toLowerCase()}, then whatever was in effect before picks up
              again.
            </li>
          ) : (
            <li>Applies from {formatShortDate(parseDate(draft.startDate))} on, with no end date.</li>
          )}
          {preview.replaced.map((entry) => (
            <li key={entry.id} className="text-amber-800">
              Replaces the {entryStatus(detailID, entry)} period {formatEntryDates(detailID, entry).toLowerCase()}
              {entry.announcementID ? " (its announcement link goes with it)" : ""}.
            </li>
          ))}
        </ul>
      )}
      <ErrorMessage message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function PeriodTool<K extends PeriodID, V>({ config }: { config: PeriodToolConfig<K, V> }) {
  const { detailID, Summary } = config;
  const details = useDetails();
  const list = useAnnouncementList();
  const [draft, setDraft] = useState<PeriodDraft<V> | null>(null);
  const [deleting, setDeleting] = useState<EntryOf<K> | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  if (!details) return <DetailsUnavailable details={details} />;
  const entries = details[detailID].entries as EntryOf<K>[];
  const previousOf = (entry: EntryOf<K>) => entries.filter((item) => item.startDate < entry.startDate).at(-1);

  const startNew = () => {
    const today = todayKey();
    setSavedId(null);
    setDraft({ id: null, startDate: today, endDate: "", values: config.valuesOn(today) });
  };

  return (
    <div className="flex flex-col gap-4">
      {savedId && !draft && (
        <SavedBanner detailID={detailID} entryId={savedId} list={list} seed={config.seed} onDismiss={() => setSavedId(null)} />
      )}

      {draft ? (
        <PeriodForm
          config={config}
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={(id) => {
            setDraft(null);
            setSavedId(id);
          }}
        />
      ) : (
        <div>
          <button type="button" onClick={startNew} className={PRIMARY_BUTTON_CLASS}>
            {config.addLabel}
          </button>
        </div>
      )}

      <EntryList
        detailID={detailID}
        entries={entries}
        emptyText={config.emptyText}
        renderEntry={(entry) => (
          <EntryCard
            key={entry.id}
            detailID={detailID}
            entry={entry}
            list={list}
            seed={() => config.seed(entry)}
            onEdit={() => {
              setSavedId(null);
              setDraft({ id: entry.id, startDate: entry.startDate, endDate: entry.endDate ?? "", values: config.valuesOf(entry) });
            }}
            onDelete={() => setDeleting(entry)}
          >
            <Summary entry={entry} previous={previousOf(entry)} />
          </EntryCard>
        )}
      />

      {deleting && (
        <DeleteDialog
          what={`the period ${formatEntryDates(detailID, deleting).toLowerCase()}`}
          note="If the period before it ran right up to it, that one carries on over its dates. Otherwise those dates go back to the built-in defaults."
          onConfirm={async () => {
            await updateEntries(detailID, (current) => removePeriod(current, deleting.id) as EntryOf<K>[]);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// --- Pricing -------------------------------------------------------------------------

type PriceValues = Record<PriceKey, string>;

function dollarsOf(cents: number) {
  return (cents / 100).toFixed(2);
}

function priceValues(prices: Prices): PriceValues {
  return Object.fromEntries(PRICE_KEYS.map((key) => [key, dollarsOf(prices[key])])) as PriceValues;
}

const PRICE_GROUPS = [...new Set(PRICE_KEYS.map((key) => PRICE_INFO[key].group))];

function PriceEditor({ values, onChange }: { values: PriceValues; onChange: (values: PriceValues) => void }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {PRICE_GROUPS.map((group) => (
        <fieldset key={group} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold text-primary">{group}</legend>
          {PRICE_KEYS.filter((key) => PRICE_INFO[key].group === group).map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm text-neutral-700">
              {PRICE_INFO[key].label}
              <span className="flex items-center gap-1 text-neutral-500">
                $
                <input
                  inputMode="decimal"
                  required
                  value={values[key]}
                  onChange={(event) => onChange({ ...values, [key]: event.target.value })}
                  onFocus={(event) => event.target.select()}
                  className={`${FIELD_CLASS} w-24 py-1.5 text-right tabular-nums`}
                />
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function PriceSummary({ entry, previous }: { entry: PricingEntry; previous: PricingEntry | undefined }) {
  const before = previous?.prices ?? pricesOn(shiftDate(entry.startDate, -1));
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
      {PRICE_KEYS.map((key) => {
        const changed = before[key] !== entry.prices[key];
        return (
          <div key={key} className="flex items-baseline justify-between gap-3 border-b border-neutral-100 py-1">
            <dt className="text-neutral-600">
              <span className="text-neutral-400">{PRICE_INFO[key].group} · </span>
              {PRICE_INFO[key].label}
            </dt>
            <dd className={`tabular-nums ${changed ? "font-bold text-primary" : "text-neutral-700"}`}>
              {changed && <span className="mr-1.5 text-xs font-normal text-neutral-400 line-through">{formatCents(before[key])}</span>}
              {formatCents(entry.prices[key])}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function untilText(entry: EntryBase) {
  return entry.endDate ? ` until ${formatShortDate(parseDate(entry.endDate))}` : "";
}

const PRICING_CONFIG: PeriodToolConfig<"pricing", PriceValues> = {
  detailID: "pricing",
  valuesOn: (date) => priceValues(pricesOn(date)),
  valuesOf: (entry) => priceValues(entry.prices),
  readValues: (values) => {
    const prices = {} as Prices;
    for (const key of PRICE_KEYS) {
      const text = values[key].trim().replace(/^\$/, "");
      if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: `"${PRICE_INFO[key].label}" for ${PRICE_INFO[key].group} isn't a price.` };
      prices[key] = Math.round(Number(text) * 100);
    }
    return { values: { prices } };
  },
  ValuesEditor: PriceEditor,
  Summary: PriceSummary,
  seed: (entry) => {
    const before = pricesOn(shiftDate(entry.startDate, -1));
    const changes = PRICE_KEYS.filter((key) => before[key] !== entry.prices[key]).map(
      (key) => `${PRICE_INFO[key].group}, ${PRICE_INFO[key].label}: ${formatCents(before[key])} → ${formatCents(entry.prices[key])}`,
    );
    const when = formatShortDate(parseDate(entry.startDate));
    return {
      title: `New prices from ${when}`,
      details: `From ${when}${untilText(entry)}, prices at the wall are changing:\n\n${
        changes.length > 0 ? changes.join("\n") : "(No prices differ from before.)"
      }\n\nSee the schedule page for the full price list.`,
      targetDate: entry.startDate,
      relevantThrough: relevantAfter(entry.startDate),
    };
  },
  emptyText: "No price changes saved - the schedule page shows the built-in prices.",
  addLabel: "Set new prices",
};

// /admin/operations/pricing
export function AdminPricing() {
  return <PeriodTool config={PRICING_CONFIG} />;
}

// --- Hours ---------------------------------------------------------------------------

type SessionValues = { from: string; to: string };
type HoursValues = { open: boolean; from: string; to: string; lessons: SessionValues[] }[];

function hoursValues(week: WeekHours, lessons: WeekLessons): HoursValues {
  return week.map((day, index) => ({
    open: !!day,
    from: day?.open ?? "16:00",
    to: day?.close ?? "22:00",
    lessons: lessons[index].map((session) => ({ from: session.open, to: session.close })),
  }));
}

// "4:00 PM – 5:30 PM, 6:00 PM – 7:30 PM", or "None".
export function formatLessons(lessons: DayHours[]) {
  return lessons.length > 0 ? lessons.map((session) => formatDayHours(session)).join(", ") : "None";
}

// "HH:mm" a number of minutes later, held to the day.
function laterTime(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hours * 60 + mins + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// How long a new lesson starts out - the length of today's lessons.
const LESSON_MINUTES = 90;

const TIME_CLASS = `${FIELD_CLASS} w-32 py-1.5`;
const SMALL_TIME_CLASS = `${FIELD_CLASS} w-28 py-1 text-xs`;

function TimeRange({
  label,
  from,
  to,
  onChange,
  className,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className: string;
}) {
  return (
    <span className="flex items-center gap-2 text-neutral-500">
      <input
        type="time"
        required
        step={900}
        aria-label={`${label} starts`}
        value={from}
        onChange={(event) => onChange({ from: event.target.value, to })}
        className={className}
      />
      to
      <input
        type="time"
        required
        step={900}
        aria-label={`${label} ends`}
        value={to}
        onChange={(event) => onChange({ from, to: event.target.value })}
        className={className}
      />
    </span>
  );
}

function HoursEditor({ values, onChange }: { values: HoursValues; onChange: (values: HoursValues) => void }) {
  const set = (index: number, change: Partial<HoursValues[number]>) =>
    onChange(values.map((day, at) => (at === index ? { ...day, ...change } : day)));
  const setLessons = (index: number, lessons: SessionValues[]) => set(index, { lessons });

  return (
    <div className="flex flex-col divide-y divide-neutral-100 rounded-md border border-neutral-200">
      {values.map((day, index) => {
        const name = DAY_NAMES[index];
        // A new lesson starts after the last one, or when the wall opens.
        const nextStart = day.lessons.at(-1)?.to ?? day.from;
        return (
          <div key={name} className="flex flex-col gap-2 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 font-semibold text-neutral-700">{name}</span>
              <label className="inline-flex cursor-pointer items-center gap-2 text-neutral-600">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(event) => set(index, { open: event.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Open
              </label>
              {day.open ? (
                <TimeRange label={`${name} drop-ins`} from={day.from} to={day.to} onChange={(range) => set(index, range)} className={TIME_CLASS} />
              ) : (
                <span className="text-neutral-400">Closed{day.lessons.length > 0 ? " - its lessons won't be saved" : ""}</span>
              )}
            </div>
            {day.open && (
              <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-[6.75rem]">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lessons</span>
                {day.lessons.length === 0 && <span className="text-xs text-neutral-400">None</span>}
                {day.lessons.map((session, at) => (
                  <span key={at} className="inline-flex items-center gap-1 rounded-full bg-secondary/10 py-0.5 pl-2 pr-1">
                    <TimeRange
                      label={`${name} lesson ${at + 1}`}
                      from={session.from}
                      to={session.to}
                      onChange={(range) => setLessons(index, day.lessons.map((item, i) => (i === at ? range : item)))}
                      className={SMALL_TIME_CLASS}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${name} lesson ${at + 1}`}
                      onClick={() => setLessons(index, day.lessons.filter((_, i) => i !== at))}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setLessons(index, [...day.lessons, { from: nextStart, to: laterTime(nextStart, LESSON_MINUTES) }])}
                  className={`${TEXT_BUTTON_CLASS} text-xs`}
                >
                  + Add lesson
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HoursSummary({ entry, previous }: { entry: HoursEntry; previous: HoursEntry | undefined }) {
  const before = shiftDate(entry.startDate, -1);
  const lessons = lessonsOf(entry);
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
      {entry.week.map((day, index) => {
        const was = previous ? previous.week[index] : regularHoursOnWeekday(before, index);
        const wasLessons = previous ? lessonsOf(previous)[index] : regularLessonsOnWeekday(before, index);
        const changed = JSON.stringify(was) !== JSON.stringify(day);
        const lessonsChanged = JSON.stringify(wasLessons) !== JSON.stringify(lessons[index]);
        return (
          <div key={DAY_NAMES[index]} className="flex flex-col border-b border-neutral-100 py-1">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-600">{DAY_NAMES[index]}</dt>
              <dd className={`tabular-nums ${changed ? "font-bold text-primary" : "text-neutral-700"}`}>
                {changed && <span className="mr-1.5 text-xs font-normal text-neutral-400 line-through">{formatDayHours(was)}</span>}
                {formatDayHours(day)}
              </dd>
            </div>
            {(lessons[index].length > 0 || lessonsChanged) && (
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="text-neutral-500">Lessons</dt>
                <dd className={`text-right tabular-nums ${lessonsChanged ? "font-bold text-primary" : "text-neutral-600"}`}>
                  {lessonsChanged && (
                    <span className="mr-1.5 font-normal text-neutral-400 line-through">{formatLessons(wasLessons)}</span>
                  )}
                  {formatLessons(lessons[index])}
                </dd>
              </div>
            )}
          </div>
        );
      })}
    </dl>
  );
}

// The date of a weekday in the week holding `date`.
function weekdayDate(date: string, weekday: number) {
  const monday = shiftDate(date, -((parseDate(date).getDay() + 6) % 7));
  return shiftDate(monday, weekday);
}

// A weekday's regular hours in the week holding `date`.
function regularHoursOnWeekday(date: string, weekday: number): DayHours | null {
  return regularHoursOn(weekdayDate(date, weekday));
}

// A weekday's regular lessons in the week holding `date`, closures aside.
function regularLessonsOnWeekday(date: string, weekday: number): DayHours[] {
  return lessonsOf(hoursPeriodOn(weekdayDate(date, weekday)))[weekday];
}

function weekOn(date: string): WeekHours {
  return DAY_NAMES.map((_, weekday) => regularHoursOnWeekday(date, weekday));
}

function lessonsWeekOn(date: string): WeekLessons {
  return DAY_NAMES.map((_, weekday) => regularLessonsOnWeekday(date, weekday));
}

const TIME_PATTERN = /^\d{2}:\d{2}$/;

const HOURS_CONFIG: PeriodToolConfig<"hours", HoursValues> = {
  detailID: "hours",
  valuesOn: (date) => hoursValues(weekOn(date), lessonsWeekOn(date)),
  valuesOf: (entry) => hoursValues(entry.week, lessonsOf(entry)),
  readValues: (values) => {
    const week: WeekHours = [];
    const lessons: WeekLessons = [];
    for (const [index, day] of values.entries()) {
      const name = DAY_NAMES[index];
      // A closed day's lessons are dropped along with it.
      if (!day.open) {
        week.push(null);
        lessons.push([]);
        continue;
      }
      if (!TIME_PATTERN.test(day.from) || !TIME_PATTERN.test(day.to) || day.from >= day.to) {
        return { error: `${name} has to close after it opens.` };
      }
      const sessions: DayHours[] = [];
      for (const session of day.lessons) {
        if (!TIME_PATTERN.test(session.from) || !TIME_PATTERN.test(session.to) || session.from >= session.to) {
          return { error: `A ${name} lesson has to end after it starts.` };
        }
        if (session.from < day.from || session.to > day.to) {
          return { error: `${name}'s lessons have to fit inside its hours (${formatDayHours({ open: day.from, close: day.to })}).` };
        }
        sessions.push({ open: session.from, close: session.to });
      }
      week.push({ open: day.from, close: day.to });
      lessons.push(sessions.sort((a, b) => a.open.localeCompare(b.open)));
    }
    return { values: { week, lessons } };
  },
  ValuesEditor: HoursEditor,
  Summary: HoursSummary,
  seed: (entry) => {
    const when = formatShortDate(parseDate(entry.startDate));
    const lessons = lessonsOf(entry);
    const hourLines = entry.week.map((day, index) => `${DAY_NAMES[index]}: ${formatDayHours(day)}`);
    const lessonLines = lessons.flatMap((sessions, index) =>
      sessions.length > 0 ? [`${DAY_NAMES[index]}: ${formatLessons(sessions)}`] : [],
    );
    return {
      title: `New hours from ${when}`,
      details: `From ${when}${untilText(entry)}, the wall's drop-in hours are:\n\n${hourLines.join("\n")}\n\n${
        lessonLines.length > 0 ? `Learn-to-Climb lessons:\n\n${lessonLines.join("\n")}` : "There are no Learn-to-Climb lessons."
      }${entry.endDate ? "\n\nAfter that, the regular hours are back." : ""}`,
      targetDate: entry.startDate,
      relevantThrough: relevantAfter(entry.startDate),
    };
  },
  emptyText: "No hours changes saved - everything goes by the built-in regular hours and lessons.",
  addLabel: "Set new hours",
};

// /admin/operations/hours
export function AdminHours() {
  return <PeriodTool config={HOURS_CONFIG} />;
}

// --- Closures ------------------------------------------------------------------------

type ClosureDraft = { id: string | null; startDate: string; endDate: string; reason: string };

const MAX_REASON_LENGTH = 200;

function closureSeed(entry: ClosureEntry): DraftSeed {
  const dates = formatEntryDates("closures", entry);
  const single = !entry.endDate || entry.endDate === entry.startDate;
  return {
    title: `Wall closed ${single ? "on" : ""} ${dates}`.replace(/\s+/g, " "),
    details: `The climbing wall is closed ${single ? "on " : ""}${dates}: ${entry.reason}.`.replace(/\.\.$/, "."),
    targetDate: entry.startDate,
    targetEndDate: entry.endDate,
    relevantThrough: lastDay("closures", entry)!,
  };
}

function ClosureForm({
  draft,
  onChange,
  onCancel,
  onSaved,
}: {
  draft: ClosureDraft;
  onChange: (draft: ClosureDraft) => void;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const reason = draft.reason.trim();
    if (!reason) return setError("Say why it's closed.");
    if (draft.endDate && draft.endDate < draft.startDate) return setError("The end date can't be before the start date.");
    setBusy(true);
    setError(undefined);
    const id = draft.id ?? newEntryId();
    try {
      await updateEntries("closures", (entries) => {
        const original = entries.find((entry) => entry.id === id);
        const closure: ClosureEntry = {
          ...original,
          id,
          startDate: draft.startDate,
          // A one-day closure has no end date.
          endDate: draft.endDate && draft.endDate !== draft.startDate ? draft.endDate : undefined,
          reason,
        };
        return [...entries.filter((entry) => entry.id !== id), closure];
      });
      onSaved(id);
    } catch (saveError) {
      setError(messageOf(saveError));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${CARD_CLASS} flex flex-col gap-5`}>
      <h2 className="text-lg font-bold text-primary">{draft.id ? "Edit closure" : "Add a closure"}</h2>
      <DateFields
        startDate={draft.startDate}
        endDate={draft.endDate}
        onChange={(dates) => onChange({ ...draft, ...dates })}
        endHint="leave empty for a single day"
      />
      <label className={LABEL_CLASS}>
        Reason
        <input
          required
          maxLength={MAX_REASON_LENGTH}
          value={draft.reason}
          placeholder="Statutory holiday, maintenance, an event…"
          onChange={(event) => onChange({ ...draft, reason: event.target.value })}
          className={FIELD_CLASS}
        />
      </label>
      <p className="text-sm text-neutral-600">
        The schedule page shows these days as closed, the booking slots for them are hidden, and the attendance form starts
        them ticked closed.
      </p>
      <ErrorMessage message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// /admin/operations/closures
export function AdminClosures() {
  const details = useDetails();
  const list = useAnnouncementList();
  const [draft, setDraft] = useState<ClosureDraft | null>(null);
  const [deleting, setDeleting] = useState<ClosureEntry | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  if (!details) return <DetailsUnavailable details={details} />;

  return (
    <div className="flex flex-col gap-4">
      {savedId && !draft && (
        <SavedBanner detailID="closures" entryId={savedId} list={list} seed={closureSeed} onDismiss={() => setSavedId(null)} />
      )}

      {draft ? (
        <ClosureForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={(id) => {
            setDraft(null);
            setSavedId(id);
          }}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setSavedId(null);
              setDraft({ id: null, startDate: todayKey(), endDate: "", reason: "" });
            }}
            className={PRIMARY_BUTTON_CLASS}
          >
            Add a closure
          </button>
        </div>
      )}

      <EntryList
        detailID="closures"
        entries={details.closures.entries}
        emptyText="No closures coming up."
        renderEntry={(entry) => (
          <EntryCard
            key={entry.id}
            detailID="closures"
            entry={entry}
            list={list}
            seed={() => closureSeed(entry)}
            title={entry.reason}
            onEdit={() => {
              setSavedId(null);
              setDraft({ id: entry.id, startDate: entry.startDate, endDate: entry.endDate ?? "", reason: entry.reason });
            }}
            onDelete={() => setDeleting(entry)}
          >
            <p className="text-sm text-neutral-600">Closed all day{entry.endDate ? ", every day of the range" : ""}.</p>
          </EntryCard>
        )}
      />

      {deleting && (
        <DeleteDialog
          what={`the closure ${formatEntryDates("closures", deleting).toLowerCase()}`}
          note="Those days go back to their regular hours. Any announcement about it stays posted."
          onConfirm={async () => {
            await updateEntries("closures", (entries) => entries.filter((entry) => entry.id !== deleting.id));
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

// --- Overview --------------------------------------------------------------------------

// Every current or upcoming entry with no announcement, soonest first.
export function unannouncedEntries(details: ReturnType<typeof currentDetails>) {
  const today = todayKey();
  return (["closures", "hours", "pricing"] as const).flatMap((detailID) =>
    (details[detailID].entries as EntryBase[])
      .filter((entry) => needsAnnouncement(detailID, entry, today))
      .map((entry) => ({ detailID, entry })),
  );
}

// How many closures the overview lists.
const PREVIEW_CLOSURES = 5;

// Everything sits inside the one Operations Dashboard card, so its parts are
// set apart by a tint rather than borders of their own - like the Admin and
// Attendance dashboards' widgets.
const WIDGET_CLASS = "flex flex-col rounded-lg bg-neutral-50 p-4";
const WIDGET_TITLE_CLASS = "text-sm font-semibold uppercase tracking-wide text-neutral-500";
const ROW_DIVIDER_CLASS = "divide-y divide-neutral-200/70";

// One preview on the dashboard: what's in effect, and a footer for what's coming.
function Widget({
  title,
  subtitle,
  footer,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${WIDGET_CLASS} ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={WIDGET_TITLE_CLASS}>{title}</h3>
        <span className="text-xs text-neutral-500">{subtitle}</span>
      </div>
      <div className="mt-3 flex-1">{children}</div>
      {footer && <div className="mt-3 border-t border-neutral-200/70 pt-3 text-sm text-neutral-600">{footer}</div>}
    </div>
  );
}

// What's in effect, said for a card's subtitle.
function sinceText(detailID: PeriodID, entry: EntryBase | undefined, fallback: string) {
  return entry ? `In effect ${formatEntryDates(detailID, entry).toLowerCase()}` : fallback;
}

// The prices in effect today, laid out as the schedule page shows them.
function PricePreview({ prices }: { prices: Prices }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {PRICE_LIST.map((group) => (
        <div key={group.audience} className="flex flex-col">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.audience}</h3>
          <dl className={`flex flex-col ${ROW_DIVIDER_CLASS} text-sm`}>
            {group.items.map((item) => (
              <div key={item.label} className="flex flex-col py-1">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-neutral-700">{item.label}</dt>
                  {item.key && <dd className="font-semibold tabular-nums text-primary">{formatCents(prices[item.key])}</dd>}
                </div>
                {item.tiers?.map((tier) => (
                  <div key={tier.key} className="flex items-baseline justify-between gap-3 pl-3 text-neutral-600">
                    <dt>{tier.label}</dt>
                    <dd className="font-semibold tabular-nums text-primary">{formatCents(prices[tier.key])}</dd>
                  </div>
                ))}
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

// The regular week in effect today - drop-in hours and lessons - with today
// picked out.
function HoursPreview({ week, lessons, today }: { week: WeekHours; lessons: WeekLessons; today: number }) {
  return (
    <dl className={`flex flex-col ${ROW_DIVIDER_CLASS} text-sm`}>
      {week.map((hours, index) => {
        const isToday = index === today;
        return (
          <div key={DAY_NAMES[index]} className={`flex flex-col gap-0.5 px-2 py-1.5 ${isToday ? "rounded-md bg-secondary/10 text-primary" : ""}`}>
            <div className={`flex items-baseline justify-between gap-3 ${isToday ? "font-semibold" : ""}`}>
              <dt className={isToday ? "" : "text-neutral-700"}>
                {DAY_NAMES[index]}
                {isToday && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider">Today</span>}
              </dt>
              <dd className={`tabular-nums ${hours ? (isToday ? "" : "text-primary") : "text-neutral-400"}`}>{formatDayHours(hours)}</dd>
            </div>
            {lessons[index].length > 0 && (
              <div className="flex items-baseline justify-between gap-3 text-xs text-neutral-500">
                <dt>Learn-to-Climb</dt>
                <dd className="flex flex-col items-end tabular-nums">
                  {lessons[index].map((session) => (
                    <span key={session.open}>{formatDayHours(session)}</span>
                  ))}
                </dd>
              </div>
            )}
          </div>
        );
      })}
    </dl>
  );
}

// The next scheduled change to prices or hours, and what it changes.
function NextChange({ dates, changes }: { dates: string; changes: string }) {
  return (
    <p>
      <span className="font-semibold text-primary">Next change {dates.replace(/^From /, "from ")}</span> · {changes}
    </p>
  );
}

// Body of /admin/operations: the prices and hours in effect, the closures
// coming up, and which changes still need announcing.
export default function AdminOperations({ section }: { section: AdminSection }) {
  const details = useDetails();
  if (!details) return <DetailsUnavailable details={details} />;

  const today = todayKey();
  const missing = unannouncedEntries(details);
  const upcoming = <K extends PeriodID>(detailID: K) =>
    (details[detailID].entries as EntryOf<K>[]).find((entry) => entryStatus(detailID, entry, today) === "upcoming");

  const currentPricing = pricingOn(today, details);
  const prices = pricesOn(today, details);
  const nextPricing = upcoming("pricing");
  const changedPrices = nextPricing ? PRICE_KEYS.filter((key) => nextPricing.prices[key] !== prices[key]).length : 0;

  const currentHours = hoursPeriodOn(today, details);
  const week = currentHours?.week ?? DEFAULT_WEEK;
  const lessons = lessonsOf(currentHours);
  const nextHours = upcoming("hours");
  const dayOf = (hours: WeekHours, sessions: WeekLessons, index: number) => JSON.stringify([hours[index], sessions[index]]);
  const changedDays = nextHours
    ? DAY_NAMES.filter((_, index) => dayOf(nextHours.week, lessonsOf(nextHours), index) !== dayOf(week, lessons, index)).map((name) =>
        name.slice(0, 3),
      )
    : [];

  const liveClosures = details.closures.entries
    .filter((entry) => entryStatus("closures", entry, today) !== "past")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const nextClosures = liveClosures.slice(0, PREVIEW_CLOSURES);

  return (
    <>
      {/* The three tools, up front - the first is the one used most. */}
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
        {section.subpages.map((subpage, index) => (
          <Link
            key={subpage.slug}
            href={adminSubpageHref(section, subpage)}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors ${
              index === 0 ? "bg-secondary hover:bg-secondary/80" : "border border-primary bg-white hover:bg-primary hover:text-white"
            }`}
          >
            {subpage.label}
          </Link>
        ))}
      </div>

      <section
        aria-labelledby="operations-dashboard-heading"
        className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white p-5 shadow-sm"
      >
        <h2 id="operations-dashboard-heading" className="text-xl font-bold text-primary">
          Operations Dashboard
        </h2>

        <div className={WIDGET_CLASS}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={WIDGET_TITLE_CLASS}>Needs an announcement</h3>
            <span className="text-xs text-neutral-500">
              {missing.length} change{missing.length === 1 ? "" : "s"}
            </span>
          </div>
          {missing.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {missing.map(({ detailID, entry }) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  {DETAIL_COPY[detailID].noun} {formatEntryDates(detailID, entry).toLowerCase()}
                  {"reason" in entry ? ` (${(entry as ClosureEntry).reason})` : ""} has no announcement linked.
                  <Link href={operationsHref(detailID)} className="font-semibold underline hover:no-underline">
                    Announce it
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Every change in effect or coming up has been announced.</p>
          )}
        </div>

        <Widget
          title="Upcoming closures"
          subtitle={liveClosures.length > PREVIEW_CLOSURES ? `The next ${PREVIEW_CLOSURES} of ${liveClosures.length}` : "In effect or coming up"}
        >
          {nextClosures.length > 0 ? (
            <ul className={`flex flex-col ${ROW_DIVIDER_CLASS}`}>
              {nextClosures.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-44 shrink-0 font-semibold text-primary">{formatEntryDates("closures", entry)}</span>
                  <span className="min-w-0 flex-1 text-neutral-700">{entry.reason}</span>
                  <span className="flex items-center gap-2">
                    {needsAnnouncement("closures", entry, today) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">No announcement</span>
                    )}
                    <StatusBadge status={entryStatus("closures", entry, today)} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No closures coming up.</p>
          )}
        </Widget>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <Widget
            title="Operational hours"
            subtitle={sinceText("hours", currentHours, "Built-in regular hours - no changes saved")}
            footer={
              nextHours ? (
                <NextChange
                  dates={formatEntryDates("hours", nextHours)}
                  changes={changedDays.length === 0 ? "same hours and lessons" : `changes on ${changedDays.join(", ")}`}
                />
              ) : (
                "No hours changes scheduled."
              )
            }
          >
            <HoursPreview week={week} lessons={lessons} today={weekdayOf(today)} />
          </Widget>

          <Widget
            title="Pricing"
            subtitle={sinceText("pricing", currentPricing, "Built-in prices - no changes saved")}
            footer={
              nextPricing ? (
                <NextChange
                  dates={formatEntryDates("pricing", nextPricing)}
                  changes={changedPrices === 0 ? "same prices" : `${changedPrices} price${changedPrices === 1 ? "" : "s"} change`}
                />
              ) : (
                "No price changes scheduled."
              )
            }
          >
            <PricePreview prices={prices} />
          </Widget>
        </div>
      </section>
    </>
  );
}
