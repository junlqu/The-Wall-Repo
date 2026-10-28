import type { Metadata } from "next";
import { Suspense } from "react";
import ClimbView from "./ClimbView";

export const metadata: Metadata = {
  title: "Climb",
};

// The climb comes from ?id=, which a static export can only read in the
// browser - hence the Suspense boundary.
export default function ClimbPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />}>
      <ClimbView />
    </Suspense>
  );
}
