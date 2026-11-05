"use client";

import { type MouseEvent, useId, useState } from "react";
import { Swatch } from "@/components/ClimbColour";
import { CLIMB_COLOURS } from "@/lib/climbs";
import { BOULDER_GRADES, NEW_GRADE, ROUTE_GRADES } from "@/lib/grades";

// Pieces shared by the forms that add and change climbs, so they look and
// behave the same.

export const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50";
export const CANCEL_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50";
export const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400";
export const LABEL_CLASS = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500";

// "New" first, for a climb that's up but not graded yet.
export const ROUTE_GRADE_OPTIONS = [NEW_GRADE, ...ROUTE_GRADES];
export const BOULDER_GRADE_OPTIONS = [NEW_GRADE, ...BOULDER_GRADES];

export function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
      {message}
    </p>
  );
}

// Runs a save, keeping the form up with the error if it fails.
export function useRequest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (request: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await request();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };
  return { busy, error, run };
}

// A dropdown limited to a fixed list (the wall's colours or grades). A value
// from an older record that isn't on the list stays as an option, so opening
// the form never changes it.
export function ListSelect({
  options,
  value,
  onChange,
  emptyLabel,
  required = false,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  // The blank option's text - a prompt when required, otherwise what blank means.
  emptyLabel: string;
  required?: boolean;
}) {
  const offList = value !== "" && !options.includes(value);
  return (
    <select required={required} value={value} onChange={(event) => onChange(event.target.value)} className={FIELD_CLASS}>
      <option value="" disabled={required}>
        {emptyLabel}
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      {offList && <option value={value}>{value} (not on the list)</option>}
    </select>
  );
}

// Tape can be any colour or pattern, not just the holds', so it can be typed
// as well as picked from the wall's colours. The list always shows every colour,
// whatever's typed. Blank means no tape.
export function TapeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const pick = (colour: string) => {
    onChange(colour);
    setOpen(false);
  };
  // Picking from the list keeps focus in the field, so leaving the field is
  // what closes it.
  const keepFocus = (event: MouseEvent) => event.preventDefault();

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="none"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(false);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown") setOpen(true);
        }}
        maxLength={128}
        placeholder="No tape"
        className={`${FIELD_CLASS} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show tape colours"
        onMouseDown={keepFocus}
        onClick={(event) => {
          (event.currentTarget.previousElementSibling as HTMLInputElement).focus();
          setOpen(!open);
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-neutral-400 hover:text-neutral-700"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 text-sm font-normal normal-case tracking-normal text-neutral-800 shadow-lg"
        >
          {["", ...CLIMB_COLOURS].map((colour) => (
            <li
              key={colour || "none"}
              role="option"
              aria-selected={colour === value}
              onMouseDown={keepFocus}
              onClick={(event) => {
                // Inside a label, the click would otherwise reach the input
                // and open the list again.
                event.preventDefault();
                pick(colour);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-secondary/10 ${
                colour === value ? "font-semibold text-primary" : ""
              }`}
            >
              {colour ? (
                <>
                  <Swatch colour={colour} tape />
                  {colour}
                </>
              ) : (
                <span className="text-neutral-500">No tape</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
