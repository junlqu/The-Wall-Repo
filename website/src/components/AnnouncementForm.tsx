"use client";

import AnnouncementClimbPicker, { DEFAULT_CHANGE } from "@/components/AnnouncementClimbPicker";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/ClimbForm";
import TabBar from "@/components/TabBar";
import {
  addDays,
  type Announcement,
  type AnnouncementClimb,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TYPES,
  type AnnouncementDetails,
  type AnnouncementPriority,
  type AnnouncementType,
  COTW_SECTIONS,
  endOfDay,
  formatDateTime,
  formatShortDate,
  isFriday,
  localDate,
  PRIORITY_CLASS,
  SET_KINDS,
  type SetKind,
  upcomingFriday,
} from "@/lib/announcements";
import { parseDate } from "@/lib/climbs";

// Pieces shared by the forms that post and change announcements, so they look
// and behave the same.

const HINT_CLASS = "text-xs font-normal normal-case tracking-normal text-neutral-500";
const DEFAULT_RELEVANCE_DAYS = 7;
const MAX_RELEVANCE_DAYS = 365;
const MAX_BODY_LENGTH = 4000;
// Any Friday - a date input stepping a week at a time from it only accepts
// Fridays.
const A_FRIDAY = "2020-01-03";

// How long it stays active: a number of days from `from`, or until a date.
// `keep` is the saved relevance of an announcement being edited, kept as-is
// until the admin touches the field - so editing an archived one's text
// doesn't bring it back.
export type Relevance = { mode: "days" | "date"; days: string; date: string; keep?: string };

export function defaultRelevance(from: string): Relevance {
  return { mode: "days", days: String(DEFAULT_RELEVANCE_DAYS), date: addDays(from, DEFAULT_RELEVANCE_DAYS) };
}

// Relevant through the end of a date. A CotW is relevant through its Friday,
// and anything with an end date through that - after that it's over.
function relevantThrough(date: string): Relevance {
  return { mode: "date", days: String(DEFAULT_RELEVANCE_DAYS), date };
}

// The last relevant day, or null while the days aren't a whole number.
function relevanceEndDate(relevance: Relevance, from: string) {
  if (relevance.mode === "date") return relevance.date || null;
  const days = Number(relevance.days);
  return Number.isInteger(days) && days >= 1 ? addDays(from, days) : null;
}

// The relevance as the ISO moment it ends. Throws a message for the admin
// when it can't be worked out yet.
export function relevantUntil(relevance: Relevance, from: string) {
  if (relevance.keep) return relevance.keep;
  const end = relevanceEndDate(relevance, from);
  if (!end) throw new Error("Enter how many days it stays relevant.");
  return endOfDay(end);
}

const RELEVANCE_MODES = [
  { id: "days" as const, label: "Days" },
  { id: "date" as const, label: "Until date" },
];

// Days count from `from` (YYYY-MM-DD), e.g. the announcement date. `min` is
// the earliest date allowed - restoring needs one in the future, while a new
// or edited announcement can end in the past.
export function RelevanceField({
  relevance,
  onChange,
  from,
  min,
}: {
  relevance: Relevance;
  onChange: (relevance: Relevance) => void;
  from: string;
  min?: string;
}) {
  const end = relevanceEndDate(relevance, from);
  // Switching modes carries the same end date across.
  const changeMode = (mode: Relevance["mode"]) =>
    onChange({ ...relevance, keep: undefined, mode, date: mode === "date" && end ? end : relevance.date });

  return (
    <div className={`${LABEL_CLASS} sm:col-span-2`}>
      Relevant for
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <TabBar label="Relevance as" tabs={RELEVANCE_MODES} active={relevance.mode} onChange={changeMode} />
        </div>
        {relevance.mode === "days" ? (
          <input
            type="number"
            aria-label="Days relevant"
            required
            min={1}
            max={MAX_RELEVANCE_DAYS}
            value={relevance.days}
            onChange={(event) => onChange({ ...relevance, keep: undefined, days: event.target.value })}
            className={`${FIELD_CLASS} w-28`}
          />
        ) : (
          <input
            type="date"
            aria-label="Relevant until"
            required
            min={min}
            value={relevance.date}
            onChange={(event) => onChange({ ...relevance, keep: undefined, date: event.target.value })}
            className={`${FIELD_CLASS} w-44`}
          />
        )}
      </div>
      <span className={HINT_CLASS}>
        {relevance.keep
          ? `Relevant until ${formatDateTime(relevance.keep)}.`
          : !end
            ? "How many days it stays active before it's archived."
            : end < localDate(new Date())
              ? `Ended ${formatShortDate(parseDate(end))} - it goes straight to the archive as a record.`
              : `Active until the end of ${formatShortDate(parseDate(end))}, then archived.`}
      </span>
    </div>
  );
}

// Step 1 of a new announcement - one card per type.
export function TypePicker({
  type,
  onChange,
}: {
  type: AnnouncementType | null;
  onChange: (type: AnnouncementType) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Announcement type" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(Object.keys(ANNOUNCEMENT_TYPES) as AnnouncementType[]).map((option) => {
        const isChosen = option === type;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isChosen}
            onClick={() => onChange(option)}
            className={`flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
              isChosen
                ? "border-secondary bg-secondary/10"
                : "border-neutral-200 hover:border-secondary/60 hover:bg-secondary/5"
            }`}
          >
            <span className="font-bold text-primary">{ANNOUNCEMENT_TYPES[option].label}</span>
            <span className="text-sm text-neutral-600">{ANNOUNCEMENT_TYPES[option].description}</span>
          </button>
        );
      })}
    </div>
  );
}

function PriorityPicker({
  priority,
  onChange,
}: {
  priority: AnnouncementPriority;
  onChange: (priority: AnnouncementPriority) => void;
}) {
  return (
    <div className={`${LABEL_CLASS} sm:col-span-2`}>
      Priority
      <div role="radiogroup" aria-label="Priority" className="grid grid-cols-4 gap-2">
        {(Object.keys(ANNOUNCEMENT_PRIORITIES) as AnnouncementPriority[]).map((option) => {
          const isChosen = option === priority;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isChosen}
              onClick={() => onChange(option)}
              className={`rounded-md border px-2 py-2 text-sm font-semibold normal-case tracking-normal transition-colors ${
                isChosen
                  ? `border-transparent ${PRIORITY_CLASS[option]} ring-2 ring-secondary/40`
                  : "border-neutral-300 bg-white text-neutral-600 hover:border-secondary/60"
              }`}
            >
              {ANNOUNCEMENT_PRIORITIES[option].label}
            </button>
          );
        })}
      </div>
      <span className={HINT_CLASS}>{ANNOUNCEMENT_PRIORITIES[priority].description}</span>
    </div>
  );
}

// The top of a sets announcement: are climbs coming down, going up, or both?
function SetKindPicker({ kind, onChange }: { kind: SetKind | null; onChange: (kind: SetKind) => void }) {
  return (
    <div className={`${LABEL_CLASS} sm:col-span-2`}>
      What&apos;s changing
      <div role="radiogroup" aria-label="What's changing" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(SET_KINDS) as SetKind[]).map((option) => {
          const isChosen = option === kind;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isChosen}
              onClick={() => onChange(option)}
              className={`rounded-md border-2 px-3 py-2 text-sm font-semibold normal-case tracking-normal transition-colors ${
                isChosen
                  ? "border-secondary bg-secondary/10 text-primary"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-secondary/60"
              }`}
            >
              {SET_KINDS[option].label}
            </button>
          );
        })}
      </div>
      <span className={HINT_CLASS}>Replaced covers both - mark each climb as put up or taken down.</span>
    </div>
  );
}

// Everything the form holds, as the inputs want it.
export type AnnouncementDraft = {
  type: AnnouncementType | null;
  priority: AnnouncementPriority;
  title: string;
  // Scoring, rules and remarks are CotW only. Any may be "".
  content: { details: string; scoring: string; rules: string; remarks: string };
  // Sets only.
  setKind: SetKind | null;
  climbs: AnnouncementClimb[];
  // ISO, when it was posted - null until it is. It's never edited.
  announcedAt: string | null;
  // "" when it has none.
  targetDate: string;
  // "" when it's a single day.
  targetEndDate: string;
  relevance: Relevance;
};

export function newDraft(): AnnouncementDraft {
  const now = new Date();
  const today = localDate(now);
  return {
    type: null,
    priority: "medium",
    title: "",
    content: { details: "", scoring: "", rules: "", remarks: "" },
    setKind: null,
    climbs: [],
    announcedAt: null,
    targetDate: today,
    targetEndDate: "",
    relevance: defaultRelevance(today),
  };
}

export function draftFrom(announcement: Announcement): AnnouncementDraft {
  const relevantDay = localDate(new Date(announcement.relevantUntil));
  return {
    type: announcement.type,
    priority: announcement.priority,
    title: announcement.title,
    content: {
      details: announcement.content.details ?? "",
      scoring: announcement.content.scoring ?? "",
      rules: announcement.content.rules ?? "",
      remarks: announcement.content.remarks ?? "",
    },
    setKind: announcement.content.setKind ?? null,
    climbs: announcement.content.climbs ?? [],
    announcedAt: announcement.announcedAt,
    targetDate: announcement.targetDate ?? "",
    targetEndDate: announcement.targetEndDate ?? "",
    relevance: { mode: "date", days: String(DEFAULT_RELEVANCE_DAYS), date: relevantDay, keep: announcement.relevantUntil },
  };
}

// Relevance days count from the day it was posted - today, for a new one.
function relevanceFrom(draft: AnnouncementDraft) {
  return localDate(draft.announcedAt ? new Date(draft.announcedAt) : new Date());
}

// Changes the type, resetting the priority to the new type's default and
// dropping an end date the new type can't have. A new announcement's target
// date starts as today, or blank where the type doesn't need one. Switching
// to CotW also moves it to the next Friday, relevant through that Friday.
export function withType(draft: AnnouncementDraft, type: AnnouncementType): AnnouncementDraft {
  if (type === draft.type) return draft;
  const config = ANNOUNCEMENT_TYPES[type];
  const today = localDate(new Date());
  let { targetDate } = draft;
  if (!draft.announcedAt) targetDate = config.targetOptional ? "" : today;
  else if (!targetDate && !config.targetOptional) targetDate = today;
  const changed = {
    ...draft,
    type,
    priority: config.defaultPriority,
    targetDate,
    targetEndDate: config.range ? draft.targetEndDate : "",
  };
  if (type !== "cotw") return changed;
  const friday = upcomingFriday(targetDate || today);
  return { ...changed, targetDate: friday, relevance: relevantThrough(friday) };
}

const SET_KIND_TITLES: string[] = Object.values(SET_KINDS).map((kind) => kind.label);

// Picks what a sets announcement is about. The title follows it while it's
// blank or still another kind's default, and replaced climbs start as put up.
function withSetKind(draft: AnnouncementDraft, setKind: SetKind): AnnouncementDraft {
  const title = draft.title.trim();
  return {
    ...draft,
    setKind,
    title: !title || SET_KIND_TITLES.includes(title) ? SET_KINDS[setKind].label : draft.title,
    climbs:
      setKind === "replaced" ? draft.climbs.map((climb) => ({ ...climb, change: climb.change ?? DEFAULT_CHANGE })) : draft.climbs,
  };
}

// The draft as the API takes it. Throws a message for the admin when
// something doesn't add up.
export function draftDetails(draft: AnnouncementDraft): AnnouncementDetails {
  if (!draft.type) throw new Error("Choose what kind of announcement this is.");
  const config = ANNOUNCEMENT_TYPES[draft.type];
  const isCotw = draft.type === "cotw";
  const isSets = draft.type === "sets";
  if (!draft.targetDate && !config.targetOptional) throw new Error("Choose a target date.");
  if (isCotw && !isFriday(draft.targetDate)) throw new Error("CotW is always on a Friday.");
  // Only some types can be a range, and only from a target date.
  const targetEndDate = (config.range && draft.targetDate && draft.targetEndDate) || undefined;
  if (targetEndDate && targetEndDate <= draft.targetDate) throw new Error("The end date has to be after the start date.");
  if (isSets && !draft.setKind) throw new Error("Choose whether climbs are coming down, going up, or being replaced.");
  if (isSets && draft.climbs.length === 0) throw new Error("Pick at least one climb.");
  const details = draft.content.details.trim();
  if (!details && !isSets) throw new Error("Write the announcement.");
  // A relevance date that's already passed is fine - it's a backlogged
  // announcement, recorded straight into the archive.
  const until = relevantUntil(draft.relevance, relevanceFrom(draft));
  return {
    type: draft.type,
    priority: isCotw ? "low" : draft.priority,
    title: draft.title.trim(),
    // Parts left over from switching away from CotW or sets are dropped.
    content: {
      details: details || undefined,
      scoring: (isCotw && draft.content.scoring.trim()) || undefined,
      rules: (isCotw && draft.content.rules.trim()) || undefined,
      remarks: (isCotw && draft.content.remarks.trim()) || undefined,
      setKind: isSets ? draft.setKind! : undefined,
      climbs: isSets
        ? draft.climbs.map(({ change, ...climb }) => ({
            ...climb,
            change: draft.setKind === "replaced" ? (change ?? DEFAULT_CHANGE) : undefined,
          }))
        : undefined,
    },
    targetDate: draft.targetDate || undefined,
    targetEndDate,
    relevantUntil: until,
  };
}

// Every field but the type cards, which the new announcement page shows as
// its own step. `showType` adds a dropdown for it instead, for the edit panel.
// CotW has no priority to pick - it's always low, with its own slot instead.
export function AnnouncementFields({
  draft,
  onChange,
  showType = false,
}: {
  draft: AnnouncementDraft;
  onChange: (draft: AnnouncementDraft) => void;
  showType?: boolean;
}) {
  const set = <K extends keyof AnnouncementDraft>(key: K, value: AnnouncementDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const config = draft.type ? ANNOUNCEMENT_TYPES[draft.type] : null;
  const isClosure = draft.type === "closures";
  const isCotw = draft.type === "cotw";
  const isSets = draft.type === "sets";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {showType && (
        <label className={`${LABEL_CLASS} sm:col-span-2`}>
          Type
          <select
            required
            value={draft.type ?? ""}
            onChange={(event) => onChange(withType(draft, event.target.value as AnnouncementType))}
            className={FIELD_CLASS}
          >
            {(Object.keys(ANNOUNCEMENT_TYPES) as AnnouncementType[]).map((option) => (
              <option key={option} value={option}>
                {ANNOUNCEMENT_TYPES[option].label}
              </option>
            ))}
          </select>
        </label>
      )}
      {isSets && <SetKindPicker kind={draft.setKind} onChange={(setKind) => onChange(withSetKind(draft, setKind))} />}
      {!isCotw && <PriorityPicker priority={draft.priority} onChange={(priority) => set("priority", priority)} />}
      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Title
        <input
          required
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          maxLength={128}
          className={FIELD_CLASS}
        />
      </label>
      {isCotw ? (
        COTW_SECTIONS.map((section) => (
          <label key={section.key} className={`${LABEL_CLASS} sm:col-span-2`}>
            {section.required ? section.label : `${section.label} (optional)`}
            <textarea
              required={section.required}
              rows={section.key === "remarks" ? 2 : 4}
              value={draft.content[section.key]}
              onChange={(event) => set("content", { ...draft.content, [section.key]: event.target.value })}
              maxLength={MAX_BODY_LENGTH}
              className={`${FIELD_CLASS} resize-y`}
            />
          </label>
        ))
      ) : (
        <label className={`${LABEL_CLASS} sm:col-span-2`}>
          {isSets ? "Announcement (optional)" : "Announcement"}
          <textarea
            required={!isSets}
            rows={isSets ? 3 : 6}
            value={draft.content.details}
            onChange={(event) => set("content", { ...draft.content, details: event.target.value })}
            maxLength={MAX_BODY_LENGTH}
            className={`${FIELD_CLASS} resize-y`}
          />
        </label>
      )}
      {isSets && (
        <AnnouncementClimbPicker kind={draft.setKind} climbs={draft.climbs} onChange={(climbs) => set("climbs", climbs)} />
      )}
      {isCotw ? (
        // One Friday, never a range. Moving it moves the relevance with it.
        <label className={LABEL_CLASS}>
          Friday
          <input
            type="date"
            required
            min={A_FRIDAY}
            step={7}
            value={draft.targetDate}
            onChange={(event) =>
              onChange({ ...draft, targetDate: event.target.value, relevance: relevantThrough(event.target.value) })
            }
            className={FIELD_CLASS}
          />
          <span className={HINT_CLASS}>CotW always runs on a Friday.</span>
        </label>
      ) : (
        <>
          <label className={LABEL_CLASS}>
            {isClosure ? "Closed on" : config?.targetOptional ? "Target date (optional)" : "Target date"}
            <input
              type="date"
              required={!config?.targetOptional}
              value={draft.targetDate}
              onChange={(event) => set("targetDate", event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          {config?.range && (
            <label className={LABEL_CLASS}>
              {isClosure ? "Closed through (optional)" : "End date (optional)"}
              <input
                type="date"
                value={draft.targetEndDate}
                disabled={!draft.targetDate}
                min={draft.targetDate ? addDays(draft.targetDate, 1) : undefined}
                // Picking an end date makes it relevant through that day.
                // Clearing it leaves the relevance as it was.
                onChange={(event) =>
                  onChange({
                    ...draft,
                    targetEndDate: event.target.value,
                    relevance: event.target.value ? relevantThrough(event.target.value) : draft.relevance,
                  })
                }
                className={FIELD_CLASS}
              />
              <span className={HINT_CLASS}>
                Makes it a range, like a multi-day event or a long closure. It stays relevant through the end date.
              </span>
            </label>
          )}
        </>
      )}
      <RelevanceField
        relevance={draft.relevance}
        onChange={(relevance) => set("relevance", relevance)}
        from={relevanceFrom(draft)}
      />
      {draft.announcedAt && (
        <p className={`${HINT_CLASS} sm:col-span-2`}>Announced {formatDateTime(draft.announcedAt)}.</p>
      )}
    </div>
  );
}
