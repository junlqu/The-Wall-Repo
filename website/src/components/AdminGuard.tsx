"use client";

import type { ReactNode } from "react";
import AccessNotice from "@/components/AccessNotice";
import { USER_LEVEL, useSessionUser } from "@/lib/session";

// Hides admin pages from everyone but admins. This only keeps the UI tidy -
// the site is a static export, so the API must still check the session's
// level on every admin request.
export default function AdminGuard({ children }: { children: ReactNode }) {
  const user = useSessionUser();

  // Session still loading - hold the space so the page doesn't flash.
  if (user === undefined) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  if (user === null) {
    return (
      <AccessNotice
        title="Admins only"
        message="Log in with an admin account to manage the wall."
        actionLabel="Log in"
        actionHref="/login"
      />
    );
  }

  if (user.level !== USER_LEVEL.admin) {
    return (
      <AccessNotice
        title="Admins only"
        message="Your account doesn't have access to the admin tools."
        actionLabel="Back to your dashboard"
        actionHref="/dashboard"
      />
    );
  }

  return children;
}
