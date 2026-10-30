"use client";

import { type FormEvent, useState } from "react";
import { StarIcon } from "@/components/ClimbCards";
import { Kicker } from "@/components/Masthead";
import { type Climb, type ClimbComment, commentSentAt, MAX_STARS, saveMyComment, todayDate } from "@/lib/climbs";
import { GRADE_SCALES } from "@/lib/grades";

const MAX_LENGTH = 1000;

// Half-star steps: each star is two buttons, so it picks a rating out of 10 -
// the scale comments are rated on.
function RatingPicker({ value, onChange }: { value: number | undefined; onChange: (value: number | undefined) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="Rating" className="flex" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: MAX_STARS }, (_, star) => {
          // How much of this star is filled: 0, a half, or all of it.
          const fill = Math.min(Math.max(shown - star * 2, 0), 2) / 2;
          return (
            <span key={star} className="relative block h-7 w-7">
              <span className="block text-neutral-300">
                <StarIcon className="h-7 w-7" />
              </span>
              <span className="absolute inset-y-0 left-0 block overflow-hidden text-amber-400" style={{ width: `${fill * 100}%` }}>
                <StarIcon className="h-7 w-7" />
              </span>
              {[1, 2].map((half) => {
                const rating = star * 2 + half;
                return (
                  <button
                    key={half}
                    type="button"
                    role="radio"
                    aria-checked={value === rating}
                    aria-label={`${(rating / 2).toFixed(1)} stars`}
                    onClick={() => onChange(rating)}
                    onMouseEnter={() => setHover(rating)}
                    onFocus={() => setHover(rating)}
                    onBlur={() => setHover(null)}
                    className={`absolute inset-y-0 w-1/2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                      half === 1 ? "left-0" : "right-0"
                    }`}
                  />
                );
              })}
            </span>
          );
        })}
      </div>
      <span className="text-sm text-neutral-600 tabular-nums">
        {value === undefined ? "Not rated" : `${(value / 2).toFixed(1)} / ${MAX_STARS}`}
      </span>
      {value !== undefined && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs font-semibold text-neutral-500 underline hover:text-neutral-800"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// Writes or edits the visitor's one comment on a climb. Text is optional -
// a send, grade or rating on its own is enough.
export default function CommentForm({
  climb,
  initial,
  onSaved,
  onCancel,
}: {
  climb: Climb;
  // Their comment, when this is an edit.
  initial?: ClimbComment;
  onSaved: (comment: ClimbComment) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial?.comment ?? "");
  const [send, setSend] = useState(initial?.send ?? false);
  // Today, the day the comment is posted, unless they already gave one.
  const [today] = useState(todayDate);
  const [sentAt, setSentAt] = useState((initial && commentSentAt(initial)) ?? today);
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const [rating, setRating] = useState<number | undefined>(initial?.rating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scale = GRADE_SCALES[climb.type === "boulder" ? "boulder" : "route"];
  // Keeps a grade from before the scale changed choosable.
  const grades = grade && !scale.includes(grade) ? [grade, ...scale] : scale;
  const sendDateValid = !send || (sentAt !== "" && sentAt <= today);
  const canSave = !saving && sendDateValid && (text.trim() !== "" || send || grade !== "" || rating !== undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMyComment(
        climb.id,
        { comment: text.trim(), send, sentAt: send ? sentAt : undefined, grade: grade || undefined, rating },
        Boolean(initial),
      );
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <label className="flex flex-col gap-2">
        <Kicker className="text-neutral-400">Comment</Kicker>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder="How did it go? Beta, the crux, how it felt - or leave this blank."
          className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/40"
        />
        <span className="self-end text-xs text-neutral-400 tabular-nums">
          {text.length}/{MAX_LENGTH}
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-2">
          <Kicker className="text-neutral-400">Send</Kicker>
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary ${
              send ? "border-green-300 bg-green-50 text-green-700" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <input type="checkbox" checked={send} onChange={(event) => setSend(event.target.checked)} className="sr-only" />
            <span aria-hidden="true">{send ? "✓" : "○"}</span>
            I sent it
          </label>
        </div>

        {send && (
          <label className="flex flex-col gap-2">
            <Kicker className="text-neutral-400">Sent on</Kicker>
            <input
              type="date"
              value={sentAt}
              max={today}
              required
              onChange={(event) => setSentAt(event.target.value)}
              className="rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-neutral-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/40"
            />
          </label>
        )}

        <label className="flex flex-col gap-2">
          <Kicker className="text-neutral-400">Grade</Kicker>
          <select
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            className="rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-neutral-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/40"
          >
            <option value="">No grade</option>
            {grades.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <Kicker className="text-neutral-400">Rating</Kicker>
          <RatingPicker value={rating} onChange={setRating} />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <p className="text-xs text-neutral-500">You get one comment per climb - you can edit it any time.</p>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}
