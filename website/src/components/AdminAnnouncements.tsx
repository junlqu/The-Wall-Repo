"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import AnnouncementActions from "@/components/AnnouncementActions";
import AnnouncementDetails from "@/components/AnnouncementDetails";
import { FIELD_CLASS } from "@/components/ClimbForm";
import { type AdminSection, adminSubpageHref } from "@/lib/adminSections";
import {
  type Announcement,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_TYPES,
  type AnnouncementPriority,
  type AnnouncementType,
  announcementPreview,
  fetchAnnouncements,
  formatDateTime,
  formatShortDate,
  formatTarget,
  PRIORITY_CLASS,
} from "@/lib/announcements";

const ARCHIVED_PAGE_SIZE = 20;
// setTimeout's longest delay (about 24.8 days) - a longer wait just checks
// again then.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const TYPE_ORDER = Object.keys(ANNOUNCEMENT_TYPES) as AnnouncementType[];
const PRIORITY_ORDER = Object.keys(ANNOUNCEMENT_PRIORITIES) as AnnouncementPriority[];

type TableKind = "cotw" | "single-priority" | "mixed" | "archived";

// The active announcements as the updates page will rank them. CotW always
// has its own slot, even when there isn't one up, and is kept out of the
// priority groups. Low and medium share a group since neither is pinned to the
// top.
const ACTIVE_GROUPS: {
  id: string;
  title: string;
  includes: (announcement: Announcement) => boolean;
  dot: string;
  table: TableKind;
}[] = [
  { id: "cotw", title: "Climber of the Week", includes: (item) => item.type === "cotw", dot: "bg-primary", table: "cotw" },
  {
    id: "urgent",
    title: "Urgent",
    includes: (item) => item.priority === "urgent",
    dot: "bg-red-500",
    table: "single-priority",
  },
  { id: "high", title: "High", includes: (item) => item.priority === "high", dot: "bg-amber-500", table: "single-priority" },
  {
    id: "medium-low",
    title: "Medium & Low",
    includes: (item) => (item.priority === "medium" || item.priority === "low") && item.type !== "cotw",
    dot: "bg-secondary",
    table: "mixed",
  },
];

type SortKey = "title" | "type" | "priority" | "target" | "announcedAt" | "relevantUntil" | "views" | "likes" | "author";
type SortValue = number | string;

type Column = {
  key: SortKey;
  label: string;
  value: (announcement: Announcement) => SortValue;
  cell: (announcement: Announcement) => ReactNode;
  cellClassName?: string;
};

const COLUMNS: Column[] = [
  {
    key: "title",
    label: "Announcement",
    value: (announcement) => announcement.title.toLowerCase(),
    // Cut to one line each, so a long announcement doesn't stretch its row.
    // Spans, since the table wraps the title in a button to open its details.
    cell: (announcement) => (
      <span className="flex min-w-0 max-w-sm flex-col">
        <span className="truncate font-semibold text-neutral-900" title={announcement.title}>
          {announcement.title}
        </span>
        <span className="truncate text-xs text-neutral-500" title={announcementPreview(announcement.content)}>
          {announcementPreview(announcement.content)}
        </span>
      </span>
    ),
  },
  {
    key: "type",
    label: "Type",
    value: (announcement) => TYPE_ORDER.indexOf(announcement.type),
    cell: (announcement) => ANNOUNCEMENT_TYPES[announcement.type].label,
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "priority",
    label: "Priority",
    value: (announcement) => PRIORITY_ORDER.indexOf(announcement.priority),
    cell: (announcement) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLASS[announcement.priority]}`}>
        {ANNOUNCEMENT_PRIORITIES[announcement.priority].label}
      </span>
    ),
  },
  {
    key: "target",
    label: "Target",
    value: (announcement) => announcement.targetDate ?? "",
    cell: formatTarget,
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "announcedAt",
    label: "Announced",
    value: (announcement) => announcement.announcedAt,
    cell: (announcement) => formatDateTime(announcement.announcedAt),
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "relevantUntil",
    label: "Relevant until",
    value: (announcement) => announcement.relevantUntil,
    cell: (announcement) => formatShortDate(new Date(announcement.relevantUntil)),
    cellClassName: "whitespace-nowrap",
  },
  {
    key: "views",
    label: "Views",
    value: (announcement) => announcement.views,
    cell: (announcement) => announcement.views,
    cellClassName: "tabular-nums",
  },
  {
    key: "likes",
    label: "Likes",
    value: (announcement) => announcement.likes,
    cell: (announcement) => announcement.likes,
    cellClassName: "tabular-nums",
  },
  {
    key: "author",
    label: "Posted by",
    value: (announcement) => announcement.author.toLowerCase(),
    cell: (announcement) => `@${announcement.author}`,
    cellClassName: "whitespace-nowrap text-neutral-500",
  },
];

// The CotW slot is pared down to its title, date and counts.
const COTW_HIDDEN: SortKey[] = ["type", "priority", "relevantUntil"];

// A priority group already says its priority, so only the mixed ones show it.
// Archived ones call their relevance date "Ended". Only the archive shows the
// one-line preview under each title - the active tables keep to a narrow
// title so their rows stay short.
function columnsFor(table: TableKind) {
  return COLUMNS.filter((column) => {
    if (table === "cotw") return !COTW_HIDDEN.includes(column.key);
    return column.key !== "priority" || table === "mixed" || table === "archived";
  }).map((column) => {
    if (table === "archived" && column.key === "relevantUntil") return { ...column, label: "Ended" };
    if (table === "cotw" && column.key === "target") return { ...column, label: "Date" };
    if (table !== "archived" && column.key === "title") {
      return {
        ...column,
        label: "Title",
        cell: (announcement: Announcement) => (
          <span className="block max-w-48 truncate font-semibold text-neutral-900" title={announcement.title}>
            {announcement.title}
          </span>
        ),
      };
    }
    return column;
  });
}

type Sort = { key: SortKey; ascending: boolean };

// Highest priority first, then newest first.
const DEFAULT_ORDER: Sort[] = [
  { key: "priority", ascending: false },
  { key: "announcedAt", ascending: false },
];

function compareValues(a: SortValue, b: SortValue, ascending: boolean) {
  if (a === b) return 0;
  const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return ascending ? order : -order;
}

// The chosen column decides first, then the default order breaks ties.
function sortAnnouncements(announcements: Announcement[], sort: Sort | null) {
  const keys = [...(sort ? [sort] : []), ...DEFAULT_ORDER.filter((item) => item.key !== sort?.key)];
  const columns = keys.map(({ key, ascending }) => ({
    value: COLUMNS.find((column) => column.key === key)!.value,
    ascending,
  }));

  return [...announcements].sort((a, b) => {
    for (const { value, ascending } of columns) {
      const order = compareValues(value(a), value(b), ascending);
      if (order !== 0) return order;
    }
    return 0;
  });
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:text-primary ${open ? "rotate-90" : ""}`}
    >
      <path d="M7.3 4.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l4.29-4.3-4.3-4.3a1 1 0 0 1 0-1.4z" />
    </svg>
  );
}

// Keeps the page's list in step with a change that's already been saved.
type AnnouncementListUpdates = {
  update: (announcement: Announcement) => void;
  remove: (id: string) => void;
};

function AnnouncementTable({
  label,
  announcements,
  emptyText,
  columns,
  pageSize,
  filterable = false,
  actions,
}: {
  label: string;
  announcements: Announcement[];
  emptyText: ReactNode;
  columns: Column[];
  // Rows shown at first and added by each "Load more". Unset shows everything.
  pageSize?: number;
  // Adds a dropdown to show one type only.
  filterable?: boolean;
  // Adds a "..." menu to each row to edit, archive, restore or delete it.
  actions?: AnnouncementListUpdates;
}) {
  const [type, setType] = useState<AnnouncementType | "">("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [limit, setLimit] = useState(pageSize ?? Infinity);
  // Announcements whose details are showing - any number can be open at once.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const tableId = useId();
  const toggleOpen = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const shown = useMemo(
    () => sortAnnouncements(type ? announcements.filter((item) => item.type === type) : announcements, sort),
    [announcements, type, sort],
  );
  // Sorting covers every announcement, not just the loaded ones - the page
  // only limits how many rows are drawn.
  const visible = shown.slice(0, limit);

  // A different type is a different list, so it starts from the first page.
  const changeType = (value: AnnouncementType | "") => {
    setType(value);
    setLimit(pageSize ?? Infinity);
  };

  // Each header cycles ascending, descending, then back to the default order.
  const toggleSort = (key: SortKey) => {
    setSort((current) => {
      if (current?.key !== key) return { key, ascending: true };
      return current.ascending ? { key, ascending: false } : null;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {(filterable || sort || announcements.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {filterable ? (
            <select
              aria-label={`${label} type`}
              value={type}
              onChange={(event) => changeType(event.target.value as AnnouncementType | "")}
              className={`${FIELD_CLASS} w-44 py-1.5`}
            >
              <option value="">All types</option>
              {TYPE_ORDER.map((option) => (
                <option key={option} value={option}>
                  {ANNOUNCEMENT_TYPES[option].label}
                </option>
              ))}
            </select>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
            {sort && (
              <button type="button" onClick={() => setSort(null)} className="font-semibold hover:text-primary">
                Reset order
              </button>
            )}
            <span>
              {visible.length < shown.length && `${visible.length} of `}
              {plural(shown.length, "announcement")}
            </span>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">
            {announcements.length === 0 ? emptyText : `No ${ANNOUNCEMENT_TYPES[type as AnnouncementType].label} announcements to show.`}
          </p>
        ) : (
          // `relative` so absolutely positioned bits in the cells (the
          // screen-reader "Actions" label) scroll with the table instead of
          // widening the page.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  {columns.map((column) => {
                    const isSorted = sort?.key === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={isSorted ? (sort.ascending ? "ascending" : "descending") : undefined}
                        className="px-4 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={`group inline-flex items-center gap-1 whitespace-nowrap py-1 uppercase tracking-wide transition-colors hover:text-primary ${
                            isSorted ? "text-primary" : ""
                          }`}
                        >
                          {column.label}
                          <span aria-hidden="true" className={isSorted ? "" : "text-neutral-300 group-hover:text-neutral-400"}>
                            {isSorted ? (sort.ascending ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  {actions && (
                    <th scope="col" className="w-12 px-2 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {visible.map((announcement) => {
                  const isOpen = open.has(announcement.id);
                  const detailsId = `${tableId}-${announcement.id}`;
                  return (
                    <Fragment key={announcement.id}>
                      <tr className={isOpen ? "bg-secondary/5" : "hover:bg-secondary/5"}>
                        {columns.map((column) => (
                          <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ""}`}>
                            {column.key === "title" ? (
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={detailsId}
                                onClick={() => toggleOpen(announcement.id)}
                                className="group flex min-w-0 items-start gap-1.5 text-left"
                              >
                                <ChevronIcon open={isOpen} />
                                <span className="min-w-0 group-hover:underline">{column.cell(announcement)}</span>
                              </button>
                            ) : (
                              column.cell(announcement)
                            )}
                          </td>
                        ))}
                        {actions && (
                          <td className="px-2 py-1 text-right">
                            <AnnouncementActions
                              announcement={announcement}
                              onChanged={actions.update}
                              onDeleted={actions.remove}
                            />
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr id={detailsId} className="bg-neutral-50">
                          <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-4 pl-10">
                            <AnnouncementDetails announcement={announcement} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pageSize && visible.length < shown.length && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + pageSize)}
          className="self-center rounded-full border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
        >
          Load more
        </button>
      )}
    </div>
  );
}

// The active announcements split into the CotW slot and then by priority,
// each group in its own table.
function ActiveGroups({
  active,
  loadingText,
  actions,
}: {
  active: Announcement[];
  loadingText: string | null;
  actions?: AnnouncementListUpdates;
}) {
  return (
    <div className="flex flex-col gap-6">
      {ACTIVE_GROUPS.map((group) => {
        const inGroup = active.filter(group.includes);
        const emptyText =
          group.id === "cotw" ? (
            <>
              No CotW is up right now.{" "}
              <Link href="/admin/announcements/new" className="font-semibold text-primary hover:text-secondary">
                Post one
              </Link>
            </>
          ) : (
            `No ${group.title.toLowerCase()} priority announcements right now.`
          );
        return (
          <section key={group.id} aria-label={group.title} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-neutral-600">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${group.dot}`} />
              {group.title}
            </h3>
            <AnnouncementTable
              label={`${group.title} announcements`}
              announcements={inGroup}
              emptyText={loadingText ?? emptyText}
              columns={columnsFor(group.table)}
              actions={actions}
            />
          </section>
        );
      })}
    </div>
  );
}

// Every announcement from the API, split by whether it's still relevant, plus
// the message to show in place of them while loading or after a failed load
// (null once they've loaded).
function useAnnouncements() {
  // undefined while loading, null if the API couldn't be reached.
  const [announcements, setAnnouncements] = useState<Announcement[] | null>();

  useEffect(() => {
    fetchAnnouncements()
      .then(setAnnouncements)
      .catch(() => setAnnouncements(null));
  }, []);

  // The API says what's active when the page loads. While it stays open, each
  // announcement moves to the archive the moment its relevance runs out.
  useEffect(() => {
    const ends = (announcements ?? []).filter((item) => item.active).map((item) => Date.parse(item.relevantUntil));
    if (ends.length === 0) return;
    const delay = Math.min(Math.max(Math.min(...ends) - Date.now(), 0), MAX_TIMEOUT_MS);
    const timer = setTimeout(() => {
      const now = Date.now();
      setAnnouncements((current) =>
        current?.map((item) => (item.active && Date.parse(item.relevantUntil) <= now ? { ...item, active: false } : item)),
      );
    }, delay);
    return () => clearTimeout(timer);
  }, [announcements]);

  const updates: AnnouncementListUpdates = {
    update: (announcement) =>
      setAnnouncements((current) => current?.map((item) => (item.id === announcement.id ? announcement : item))),
    remove: (id) => setAnnouncements((current) => current?.filter((item) => item.id !== id)),
  };

  return {
    active: announcements?.filter((item) => item.active) ?? [],
    archived: announcements?.filter((item) => !item.active) ?? [],
    loadingText:
      announcements === undefined
        ? "Loading announcements…"
        : announcements === null
          ? "Couldn't load announcements. Refresh to try again."
          : null,
    updates,
  };
}

function SectionHeading({ title, href }: { title: string; href: string }) {
  return (
    <Link href={href} className="group flex w-fit items-center gap-2">
      <h2 className="text-xl font-bold text-primary transition-colors group-hover:text-secondary">{title}</h2>
      <span
        aria-hidden="true"
        className="text-lg text-neutral-400 transition-all group-hover:translate-x-1 group-hover:text-secondary"
      >
        →
      </span>
    </Link>
  );
}

const ARCHIVED_EMPTY_TEXT = "No announcements have been archived yet.";

// Body of /admin/announcements: a shortcut to post one, then every
// announcement split into what's active - by priority - and what's archived.
export default function AdminAnnouncements({ section }: { section: AdminSection }) {
  const { active, archived, loadingText } = useAnnouncements();
  const subpageHref = (slug: string) => {
    const subpage = section.subpages.find((item) => item.slug === slug);
    return subpage ? adminSubpageHref(section, subpage) : `/admin/${section.slug}`;
  };

  return (
    <>
      <div>
        <Link
          href={subpageHref("new")}
          className="inline-flex items-center justify-center rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80"
        >
          Make announcement
        </Link>
      </div>

      <section aria-label="Active announcements" className="flex flex-col gap-3">
        <SectionHeading title="Active announcements" href={subpageHref("active")} />
        <ActiveGroups active={active} loadingText={loadingText} />
      </section>

      <section aria-label="Archived announcements" className="flex flex-col gap-3">
        <SectionHeading title="Archived announcements" href={subpageHref("archived")} />
        <AnnouncementTable
          label="Archived announcements"
          announcements={archived}
          emptyText={loadingText ?? ARCHIVED_EMPTY_TEXT}
          columns={columnsFor("archived")}
          pageSize={ARCHIVED_PAGE_SIZE}
          filterable
        />
      </section>
    </>
  );
}

// /admin/announcements/active: the active announcements by priority, with a
// menu on each row to edit, archive or delete.
export function AdminActiveAnnouncements() {
  const { active, loadingText, updates } = useAnnouncements();
  return <ActiveGroups active={active} loadingText={loadingText} actions={updates} />;
}

// /admin/announcements/archived: the catalogue of past announcements, with a
// menu on each row to edit, restore or delete.
export function AdminArchivedAnnouncements() {
  const { archived, loadingText, updates } = useAnnouncements();
  return (
    <AnnouncementTable
      label="Archived announcements"
      announcements={archived}
      emptyText={loadingText ?? ARCHIVED_EMPTY_TEXT}
      columns={columnsFor("archived")}
      pageSize={ARCHIVED_PAGE_SIZE}
      filterable
      actions={updates}
    />
  );
}
