"use client";

import { useState } from "react";
import { NEW_GRADE, ROUTE_GRADES } from "@/lib/grades";

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
