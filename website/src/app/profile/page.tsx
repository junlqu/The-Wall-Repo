"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AccountSettings from "./AccountSettings";
import PublicProfile from "./PublicProfile";

// ?username= shows that person's profile; without it, the visitor's own
// settings. &view=public shows someone their own profile as others see it.
function ProfileRoute() {
  const params = useSearchParams();
  const username = params.get("username")?.trim();
  return username ? (
    <PublicProfile key={username} username={username} asOthers={params.get("view") === "public"} />
  ) : (
    <AccountSettings />
  );
}

// The username comes from ?username=, which a static export can only read in
// the browser - hence the Suspense boundary.
export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />}>
      <ProfileRoute />
    </Suspense>
  );
}
