import Link from "next/link";
import type { ReactNode } from "react";
import { profileHref } from "@/lib/profiles";

// Someone's username - or `children` - linking to their profile. Not
// draggable itself, so dragging a card it sits in still drags the card.
export default function ProfileLink({
  username,
  className = "",
  children,
}: {
  username: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={profileHref(username)}
      draggable={false}
      className={`hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${className}`}
    >
      {children ?? `@${username}`}
    </Link>
  );
}
