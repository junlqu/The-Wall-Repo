import type { Metadata } from "next";
import { Suspense } from "react";
import AdminGradingClimb from "@/components/AdminGradingClimb";

export const metadata: Metadata = {
  title: "Grading report",
};

// The climb comes from ?id=, which a static export can only read in the
// browser - hence the Suspense boundary.
export default function GradingClimbPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />}>
      <AdminGradingClimb />
    </Suspense>
  );
}
