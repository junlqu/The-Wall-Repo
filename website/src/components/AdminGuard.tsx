"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AccessNotice from "@/components/AccessNotice";
import { withReturnTo } from "@/lib/returnTo";
import { canUseAdminTools, useSessionUser } from "@/lib/session";

// Hides admin pages from everyone but staff and admins. This only keeps the
// UI tidy - the site is a static export, so the API must still check the
// session's level on every admin request.
export default function AdminGuard({ children }: { children: ReactNode }) {
  const user = useSessionUser();
  const pathname = usePathname();

  // Session still loading - hold the space so the page doesn't flash.
  if (user === undefined) {
    return <div className="min-h-[calc(100vh-4rem)] bg-neutral-50" />;
  }

  if (user === null) {
    return (
      <AccessNotice
        title="Staff only"
        message="Log in with a staff or admin account to manage the wall."
        actionLabel="Log in"
        actionHref={withReturnTo("/login", pathname)}
      />
    );
  }

  if (!canUseAdminTools(user)) {
    return (
      <AccessNotice
        title="Staff only"
        message="Your account doesn't have access to the admin tools."
        actionLabel="Back to your dashboard"
        actionHref="/dashboard"
      />
    );
  }

  return children;
}
