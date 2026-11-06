"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { settingsHref } from "@/lib/settings";
import PublicProfile from "./PublicProfile";

const BLANK = <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;

// Settings used to live at /profile without a username - send old links on.
function ToSettings() {
  const router = useRouter();
  useEffect(() => router.replace(settingsHref()), [router]);
  return BLANK;
}

// ?username= shows that person's profile. &view=public shows someone their
// own profile as others see it.
function ProfileRoute() {
  const params = useSearchParams();
  const username = params.get("username")?.trim();
  const asOthers = params.get("view") === "public";
  // Keyed on the view too: the two are fetched separately, so switching
  // starts afresh rather than showing the other one until it loads.
  return username ? (
    <PublicProfile key={`${username}:${asOthers}`} username={username} asOthers={asOthers} />
  ) : (
    <ToSettings />
  );
}

// The username comes from ?username=, which a static export can only read in
// the browser - hence the Suspense boundary.
export default function ProfilePage() {
  return (
    <Suspense fallback={BLANK}>
      <ProfileRoute />
    </Suspense>
  );
}
