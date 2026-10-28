"use client";

import Link from "next/link";
import { CLIMBS_LINKS, EXTRAS_LINKS, type NavLink } from "@/lib/navLinks";
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

      <div className="border-t border-secondary/20">
        <p className="px-4 py-5 text-center text-xs text-white/60 sm:px-6 lg:px-8">
          &copy; {new Date().getFullYear()} TPASC Climbing Wall Community. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
