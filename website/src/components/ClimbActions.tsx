"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  archiveClimb,
  CLIMB_COLOURS,
  CLIMB_TYPES,
  type Climb,
  type ClimbDetails,
  climbName,
  deleteClimb,
  LEADABLE,
  type Leadable,
  LINES,
  restoreClimb,
  todayDate,
  updateClimb,
} from "@/lib/climbs";
import {
  CANCEL_BUTTON_CLASS,
  ErrorMessage,
  FIELD_CLASS,
  LABEL_CLASS,
  ListSelect,
  PRIMARY_BUTTON_CLASS,
  ROUTE_GRADE_OPTIONS,
  useRequest,
} from "@/components/ClimbForm";
import { BOULDER_GRADES, NEW_GRADE } from "@/lib/grades";

// Rough height of the open menu, used to open it upwards near the bottom of
// the screen instead of off the edge.
const MENU_HEIGHT_PX = 140;

export const DANGER_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

// The "..." button and its dropdown, shared with the attendance weeks list.
// The dropdown is fixed to the viewport so the table's scroll container can't
// clip it.
export function ActionsMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const menuItems = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        close();
        if (event.key === "Escape") buttonRef.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const buttons = menuItems();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
      }
    };

    menuItems()[0]?.focus();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  const toggle = () => {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current!.getBoundingClientRect();
    const right = window.innerWidth - rect.right;
    setPosition(
      rect.bottom + MENU_HEIGHT_PX > window.innerHeight
        ? { bottom: window.innerHeight - rect.top + 4, right }
        : { top: rect.bottom + 4, right },
    );
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!position}
        onClick={toggle}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {position && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={position}
          className="fixed z-50 flex min-w-36 flex-col rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setPosition(null);
                item.onSelect();
              }}
              className={`px-4 py-2 text-left font-medium transition-colors focus:outline-none ${
                item.danger
                  ? "text-red-700 hover:bg-red-50 focus:bg-red-50"
                  : "text-neutral-700 hover:bg-secondary/10 focus:bg-secondary/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

type ModalProps = {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

// A native modal <dialog> that opens as soon as it's rendered. Escape and the
// backdrop go through onClose, so the parent decides when it's gone - unless
// it's busy.
function Modal({
  titleId,
  busy = false,
  onClose,
  className,
  children,
}: Omit<ModalProps, "title"> & { titleId: string; className: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
      className={`bg-white p-0 text-left text-neutral-700 shadow-xl backdrop:bg-black/40 ${className}`}
    >
      {children}
    </dialog>
  );
}

// A small box in the middle of the screen, for confirmations.
export function Dialog({ title, children, ...props }: ModalProps) {
  const titleId = useId();
  return (
    <Modal
      {...props}
      titleId={titleId}
      className="fixed inset-0 m-auto h-fit max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-bold text-primary">
          {title}
        </h2>
        {children}
      </div>
    </Modal>
  );
}

// A full-height panel on the right, or the whole screen below `md` - the same
// point the header switches to its hamburger menu. Children fill the space
// under the title bar, so they manage their own scrolling.
function SidePanel({ title, busy = false, onClose, children }: ModalProps) {
  const titleId = useId();
  return (
    <Modal
      titleId={titleId}
      busy={busy}
      onClose={onClose}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none md:left-auto md:w-[28rem] md:border-l md:border-neutral-200"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4">
          <h2 id={titleId} className="min-w-0 text-lg font-bold text-primary">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </Modal>
  );
}

function EditDialog({ climb, onClose, onSaved }: { climb: Climb; onClose: () => void; onSaved: (climb: Climb) => void }) {
  // A climb's type is fixed once it's set, so it's shown but not editable.
  const { type } = climb;
  const [line, setLine] = useState(climb.line ?? LINES[0]);
  const [grade, setGrade] = useState(climb.grade);
  const [colour, setColour] = useState(climb.colour);
  const [secondary, setSecondary] = useState(climb.secondary ?? "");
  const [tape, setTape] = useState(climb.tape ?? "");
  const [setter, setSetter] = useState(climb.setter);
  const [setAt, setSetAt] = useState(climb.setAt);
  const [leadable, setLeadable] = useState<Leadable>(climb.leadable);
  const { busy, error, run } = useRequest();
  const gradeListId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const details: ClimbDetails = {
      type,
      colour: colour.trim(),
      secondary: type === "combo" && secondary.trim() ? secondary.trim() : undefined,
      tape: type === "boulder" && tape.trim() ? tape.trim() : undefined,
      line: type === "boulder" ? undefined : line,
      grade: grade.trim(),
      setter: setter.trim(),
      setAt,
      leadable,
    };
    run(async () => onSaved(await updateClimb(climb.id, details)));
  };

  return (
    <SidePanel title={`Edit ${climbName(climb)}`} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={LABEL_CLASS}>
              Type
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-neutral-600">
                {CLIMB_TYPES[type]}
              </p>
            </div>
            {type !== "boulder" && (
              <label className={LABEL_CLASS}>
                Line
                <select value={line} onChange={(event) => setLine(Number(event.target.value))} className={FIELD_CLASS}>
                  {LINES.map((option) => (
                    <option key={option} value={option}>
                      Line {option}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={LABEL_CLASS}>
              Grade
              {type === "boulder" ? (
                // The boulder scale doesn't match the wall's grades yet, so it's
                // only suggested.
                <>
                  <input
                    value={grade}
                    onChange={(event) => setGrade(event.target.value)}
                    list={gradeListId}
                    maxLength={128}
                    className={FIELD_CLASS}
                  />
                  <datalist id={gradeListId}>
                    {[NEW_GRADE, ...BOULDER_GRADES].map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </>
              ) : (
                <ListSelect
                  options={ROUTE_GRADE_OPTIONS}
                  required
                  value={grade}
                  onChange={setGrade}
                  emptyLabel="Choose a grade"
                />
              )}
            </label>
            <label className={LABEL_CLASS}>
              Colour
              <ListSelect options={CLIMB_COLOURS} required value={colour} onChange={setColour} emptyLabel="Choose a colour" />
            </label>
            {type === "combo" && (
              <label className={LABEL_CLASS}>
                Second colour
                <ListSelect options={CLIMB_COLOURS} required value={secondary} onChange={setSecondary} emptyLabel="Choose a colour" />
              </label>
            )}
            {type === "boulder" && (
              <label className={LABEL_CLASS}>
                Tape
                <ListSelect options={CLIMB_COLOURS} value={tape} onChange={setTape} emptyLabel="No tape" />
              </label>
            )}
            <label className={LABEL_CLASS}>
              Setter
              <input
                value={setter}
                onChange={(event) => setSetter(event.target.value)}
                maxLength={128}
                className={FIELD_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Set date
              <input
                type="date"
                value={setAt}
                onChange={(event) => setSetAt(event.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Leadable
              <select
                value={leadable}
                onChange={(event) => setLeadable(event.target.value as Leadable)}
                className={FIELD_CLASS}
              >
                {LEADABLE.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ErrorMessage message={error} />
        </div>

        {/* Pinned under the scrolling fields so Save is always in reach. */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

// Same side panel as the edit, with one optional field: when it came down.
// Left blank, the climb is archived with its retirement date unrecorded.
function ArchivePanel({
  climb,
  onClose,
  onArchived,
}: {
  climb: Climb;
  onClose: () => void;
  onArchived: (climb: Climb) => void;
}) {
  const [removedAt, setRemovedAt] = useState("");
  const { busy, error, run } = useRequest();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => onArchived(await archiveClimb(climb.id, removedAt || null)));
  };

  return (
    <SidePanel title={`Archive ${climbName(climb)}`} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6">
          <p className="text-sm text-neutral-600">It moves to archived climbs, where its history is kept.</p>
          <label className={LABEL_CLASS}>
            Retirement date (optional)
            <input
              type="date"
              value={removedAt}
              min={climb.setAt || undefined}
              max={todayDate()}
              onChange={(event) => setRemovedAt(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <div className="-mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-neutral-500">
            <span>Leave blank if you don&apos;t know when it came down.</span>
            <button
              type="button"
              onClick={() => setRemovedAt(todayDate())}
              className="font-semibold text-primary hover:text-secondary"
            >
              Use today
            </button>
          </div>
          <ErrorMessage message={error} />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-6 py-4">
          <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Archiving…" : "Archive"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

function DeleteDialog({ climb, onClose, onDeleted }: { climb: Climb; onClose: () => void; onDeleted: () => void }) {
  const { busy, error, run } = useRequest();

  return (
    <Dialog title={`Delete ${climbName(climb)}?`} busy={busy} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        {climb.status === "active"
          ? "This removes the climb for good and can't be undone. To take it off the wall but keep its history, archive it instead."
          : "This removes the climb and its history for good and can't be undone."}
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
              await deleteClimb(climb.id);
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

function RestoreDialog({
  climb,
  onClose,
  onRestored,
}: {
  climb: Climb;
  onClose: () => void;
  onRestored: (climb: Climb) => void;
}) {
  const { busy, error, run } = useRequest();

  return (
    <Dialog title={`Restore ${climbName(climb)}?`} busy={busy} onClose={onClose}>
      <p className="text-sm text-neutral-600">
        It moves back to active climbs
        {climb.removedAt ? ", and its retirement date is cleared" : ""}.
      </p>
      <ErrorMessage message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={CANCEL_BUTTON_CLASS}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => onRestored(await restoreClimb(climb.id)))}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? "Restoring…" : "Restore"}
        </button>
      </div>
    </Dialog>
  );
}

// The "..." menu for one climb, with the dialogs it opens. Active climbs can
// be archived and archived ones restored. `onChanged` gets the saved climb
// after an edit, archive or restore; `onDeleted` fires once it's gone.
export default function ClimbActions({
  climb,
  onChanged,
  onDeleted,
}: {
  climb: Climb;
  onChanged: (climb: Climb) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState<"edit" | "archive" | "restore" | "delete" | null>(null);
  const close = () => setOpen(null);
  const finish = (updated: Climb) => {
    close();
    onChanged(updated);
  };

  return (
    <>
      <ActionsMenu
        label={`Actions for ${climbName(climb)}`}
        items={[
          { label: "Edit", onSelect: () => setOpen("edit") },
          climb.status === "active"
            ? { label: "Archive", onSelect: () => setOpen("archive") }
            : { label: "Restore", onSelect: () => setOpen("restore") },
          { label: "Delete", onSelect: () => setOpen("delete"), danger: true },
        ]}
      />
      {open === "edit" && <EditDialog climb={climb} onClose={close} onSaved={finish} />}
      {open === "archive" && <ArchivePanel climb={climb} onClose={close} onArchived={finish} />}
      {open === "restore" && <RestoreDialog climb={climb} onClose={close} onRestored={finish} />}
      {open === "delete" && (
        <DeleteDialog
          climb={climb}
          onClose={close}
          onDeleted={() => {
            close();
            onDeleted(climb.id);
          }}
        />
      )}
    </>
  );
}
