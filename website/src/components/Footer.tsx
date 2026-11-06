"use client";

import Link from "next/link";
import { CLIMBS_LINKS, EXTRAS_LINKS, type NavLink, PRIVACY_POLICY_HREF } from "@/lib/navLinks";
import { canUseAdminTools, useSessionUser } from "@/lib/session";
import logo from "@/static/logo.svg";

function FooterColumn({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">{title}</h2>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-white/85 transition-colors hover:text-secondary">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const user = useSessionUser();
  const isAdmin = canUseAdminTools(user);

  // Mirrors the header's top-level tabs, including the login-dependent ones.
  const siteLinks: NavLink[] = [
    ...(user ? [{ label: "Dashboard", href: "/dashboard" }] : []),
    { label: "Schedule", href: "/schedule" },
    { label: "Updates", href: "/updates" },
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
    ...(user === null
      ? [
          { label: "Login", href: "/login" },
          { label: "Register", href: "/signup" },
        ]
      : []),
  ];

  return (
    <footer className="mt-auto w-full bg-primary text-white">
      <div className="flex w-full flex-col items-center gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="The Wall Archives" width={logo.width} height={logo.height} className="h-18 w-auto" />
        </Link>

        <nav className="flex flex-wrap justify-center gap-x-16 gap-y-10 text-center">
          <FooterColumn title="Explore" links={siteLinks} />
          <FooterColumn title="Climbs" links={CLIMBS_LINKS} />
          <FooterColumn title="Extras" links={EXTRAS_LINKS} />
        </nav>
      </div>

      {/* The version sits under the copyright on a phone, and in the bottom
          right corner from sm up. */}
      <div className="relative flex flex-col items-center gap-1 border-t border-secondary/20 px-4 py-5 text-xs sm:px-6 lg:px-8">
        <p className="text-center text-white/60">
          &copy; {new Date().getFullYear()} TPASC Climbing Wall Community. All rights reserved.
        </p>
        <Link href={PRIVACY_POLICY_HREF} className="text-white/60 transition-colors hover:text-secondary">
          Privacy Policy
        </Link>
        <p className="text-white/40 tabular-nums sm:absolute sm:right-6 sm:bottom-5 lg:right-8">
          v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </div>
    </footer>
  );
}
