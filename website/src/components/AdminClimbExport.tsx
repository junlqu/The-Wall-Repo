"use client";

import { useState } from "react";
import { ErrorMessage, PRIMARY_BUTTON_CLASS } from "@/components/ClimbForm";
import { downloadClimbWorkbook } from "@/lib/climbExport";
import { fetchClimbs } from "@/lib/climbs";

// /admin/climbs/export: one button that downloads every climb as a
// spreadsheet in the same layout the import reads.
export default function AdminClimbExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const download = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await downloadClimbWorkbook(await fetchClimbs());
    } catch {
      setError("Couldn't build the spreadsheet. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm text-neutral-600">
        Every climb, active and archived, in the same layout as the import - so the file can be edited and imported
        back.
      </p>
      <button type="button" disabled={busy} onClick={download} className={PRIMARY_BUTTON_CLASS}>
        {busy ? "Preparing…" : "Download .xlsx"}
      </button>
      <ErrorMessage message={error} />
    </div>
  );
}
