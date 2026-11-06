"use client";

import { Suspense } from "react";
import AccountSettings from "./AccountSettings";

// The open tab comes from ?tab=, which a static export can only read in the
// browser - hence the Suspense boundary.
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />}>
      <AccountSettings />
    </Suspense>
  );
}
