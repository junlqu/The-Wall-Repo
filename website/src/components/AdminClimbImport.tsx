"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ClimbColour from "@/components/ClimbColour";
import { CLIMB_TYPES, fetchClimbs, formatDate } from "@/lib/climbs";
import {
  type ClimbChange,
  ClimbImportError,
  type ImportPreview,
  type ImportResult,
  previewClimbImport,
  readWorkbookRows,
  saveClimbImport,
} from "@/lib/climbImport";

// Reading takes a moment at most, and a status that flashes for a few
// milliseconds looks like a glitch, so it stays up at least this long.
const MIN_READING_MS = 600;

type Stage =
  | { name: "choose"; error?: string }
  | { name: "reading"; fileName: string }
  | { name: "preview"; fileName: string; preview: ImportPreview; saving?: boolean; error?: string }
  | { name: "done"; fileName: string; result: ImportResult };

const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-primary bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-primary";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function FilePicker({ error, onFile }: { error?: string; onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary ${
          dragging ? "border-secondary bg-secondary/5" : "border-neutral-300 bg-white hover:border-secondary"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so picking the same file again still fires a change.
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
        <span className={PRIMARY_BUTTON_CLASS}>Choose an .xlsx file</span>
        <span className="text-sm text-neutral-500">or drop it here</span>
        <span className="max-w-md text-xs text-neutral-400">
          Expects the layout of the TPASC Climbing Wall Routes sheet - the route table, Boulder Problems beside it,
          and Defunct Routes below. Nothing is saved until you choose what to add.
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}

function ChangeBadge({ kind }: { kind: ClimbChange["kind"] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        kind === "new" ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800"
      }`}
    >
      {kind === "new" ? "New" : "Edit"}
    </span>
  );
}

function SelectAllCheckbox({ selected, total, onChange }: { selected: number; total: number; onChange: (all: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all changes"
      checked={total > 0 && selected === total}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-primary"
    />
  );
}

function Preview({
  fileName,
  preview,
  saving = false,
  error,
  onAdd,
  onCancel,
}: {
  fileName: string;
  preview: ImportPreview;
  saving?: boolean;
  error?: string;
  onAdd: (changes: ClimbChange[]) => void;
  onCancel: () => void;
}) {
  const { changes, unchanged, skipped } = preview;
  // Everything starts selected - unticking is how a change gets left out.
  const [selected, setSelected] = useState(() => new Set(changes.map((change) => change.id)));

  const newChanges = changes.filter((change) => change.kind === "new");
  const editCount = changes.length - newChanges.length;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Preview of</p>
          <p className="break-all font-semibold text-primary">{fileName}</p>
        </div>
        <ul className="flex flex-wrap gap-2 text-xs font-semibold">
          <li className="rounded-full bg-green-100 px-3 py-1 text-green-800">{newChanges.length} new</li>
          <li className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">{plural(editCount, "edit")}</li>
          <li className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{unchanged} unchanged</li>
          {skipped.length > 0 && (
            <li className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{skipped.length} skipped</li>
          )}
        </ul>
      </div>

      {skipped.length > 0 && (
        <details className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer font-semibold">
            {plural(skipped.length, "row")} won&apos;t be imported
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {skipped.map((row) => (
              <li key={row.row}>
                Row {row.row}: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {changes.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-neutral-700">Nothing to change</p>
          <p className="mt-1 text-sm text-neutral-500">Every climb in this file already matches what&apos;s on record.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500 shadow-[0_1px_0_var(--color-neutral-200)]">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <SelectAllCheckbox
                      selected={selected.size}
                      total={changes.length}
                      onChange={(all) => setSelected(new Set(all ? changes.map((change) => change.id) : []))}
                    />
                  </th>
                  <th scope="col" className="px-4 py-3">Change</th>
                  <th scope="col" className="px-4 py-3">Line</th>
                  <th scope="col" className="px-4 py-3">Grade</th>
                  <th scope="col" className="px-4 py-3">Colour</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Setter</th>
                  <th scope="col" className="px-4 py-3">Set date</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {changes.map((change) => {
                  const { climb } = change;
                  const isSelected = selected.has(change.id);
                  return (
                    <tr
                      key={change.id}
                      onClick={() => toggle(change.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? "hover:bg-secondary/5" : "bg-neutral-50 text-neutral-400"}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Include row ${climb.row}`}
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggle(change.id)}
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <ChangeBadge kind={change.kind} />
                      </td>
                      <td className="px-4 py-3">{climb.line ?? <span className="text-neutral-400">—</span>}</td>
                      <td className={`px-4 py-3 font-semibold ${isSelected ? "text-primary" : ""}`}>
                        {climb.grade || <span className="font-normal text-neutral-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <ClimbColour climb={climb} />
                      </td>
                      <td className="px-4 py-3">{CLIMB_TYPES[climb.type]}</td>
                      <td className="px-4 py-3">{climb.setter || <span className="text-neutral-400">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(climb.setAt)}</td>
                      <td className="px-4 py-3">{climb.status === "active" ? "Active" : "Past"}</td>
                      <td className="px-4 py-3 text-xs">
                        <ul className="flex flex-col gap-0.5">
                          {change.kind === "edit" &&
                            change.fields.map((field) => (
                              <li key={field.label} className="whitespace-nowrap">
                                <span className="font-semibold">{field.label}:</span> {field.from || "—"} → {field.to}
                              </li>
                            ))}
                          {climb.warnings.map((warning) => (
                            <li key={warning} className="text-amber-700">
                              {warning}
                            </li>
                          ))}
                          <li className="text-neutral-400">Row {climb.row}</li>
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {saving && (
        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-secondary"
          />
          Saving climbs…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving || changes.length === 0}
          onClick={() => onAdd(changes)}
          className={PRIMARY_BUTTON_CLASS}
        >
          Add all changes ({changes.length})
        </button>
        <button
          type="button"
          disabled={saving || selected.size === 0}
          onClick={() => onAdd(changes.filter((change) => selected.has(change.id)))}
          className={SECONDARY_BUTTON_CLASS}
        >
          Add selected ({selected.size})
        </button>
        <button
          type="button"
          disabled={saving || newChanges.length === 0}
          onClick={() => onAdd(newChanges)}
          className={SECONDARY_BUTTON_CLASS}
        >
          Add new only ({newChanges.length})
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// /admin/climbs/import: pick a spreadsheet, preview what it would add or
// change against the climbs on record, then choose which changes to keep.
export default function AdminClimbImport() {
  const [stage, setStage] = useState<Stage>({ name: "choose" });

  const readFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setStage({ name: "choose", error: `${file.name} isn't an .xlsx file.` });
      return;
    }

    setStage({ name: "reading", fileName: file.name });
    try {
      const [rows, existing] = await Promise.all([
        readWorkbookRows(file),
        fetchClimbs().catch(() => null),
        new Promise((resolve) => setTimeout(resolve, MIN_READING_MS)),
      ]);
      if (!existing) {
        setStage({ name: "choose", error: "Couldn't load the climbs already on record to compare against. Try again." });
        return;
      }
      setStage({ name: "preview", fileName: file.name, preview: previewClimbImport(rows, existing) });
    } catch (error) {
      setStage({
        name: "choose",
        error:
          error instanceof ClimbImportError
            ? `${file.name}: ${error.message}`
            : `Couldn't read ${file.name}. Check that it opens in Excel and try again.`,
      });
    }
  };

  if (stage.name === "choose") {
    return <FilePicker error={stage.error} onFile={readFile} />;
  }

  if (stage.name === "reading") {
    return (
      <div
        role="status"
        className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-neutral-200 bg-white p-10 text-center"
      >
        <span
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-secondary"
        />
        <p className="break-all text-sm font-semibold text-neutral-700">Reading {stage.fileName}…</p>
        <p className="text-sm text-neutral-500">Matching its rows against the climbs already on record.</p>
      </div>
    );
  }

  if (stage.name === "preview") {
    const { fileName, preview } = stage;
    // Preview stays mounted through saving, so a failed save keeps the selection.
    const save = async (chosen: ClimbChange[]) => {
      setStage({ name: "preview", fileName, preview, saving: true });
      try {
        setStage({ name: "done", fileName, result: await saveClimbImport(chosen) });
      } catch (error) {
        setStage({
          name: "preview",
          fileName,
          preview,
          error: error instanceof Error ? error.message : "Couldn't save the import. Try again.",
        });
      }
    };

    return (
      <Preview
        fileName={fileName}
        preview={preview}
        saving={stage.saving}
        error={stage.error}
        onAdd={save}
        onCancel={() => setStage({ name: "choose" })}
      />
    );
  }

  const { added, updated, failed } = stage.result;
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-neutral-200 bg-white p-10 text-center shadow-sm">
      <div>
        <p className="break-all font-semibold text-primary">Imported {stage.fileName}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {plural(added, "climb")} added · {plural(updated, "climb")} updated
        </p>
      </div>
      {failed > 0 && (
        <p className="max-w-md rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900">
          {plural(failed, "change")} couldn&apos;t be saved. Import the file again to retry them - the climbs that did
          save will show as unchanged.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => setStage({ name: "choose" })} className={PRIMARY_BUTTON_CLASS}>
          Import another file
        </button>
        <Link href="/admin/climbs" className={SECONDARY_BUTTON_CLASS}>
          Back to climbs
        </Link>
      </div>
    </div>
  );
}
